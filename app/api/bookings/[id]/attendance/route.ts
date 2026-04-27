import { NextRequest, NextResponse } from "next/server";
import type { BookingRecord, PaymentRecord, WorkerProfileRecord } from "@/lib/models";
import { getBookingEndDateTime, getBookingStartDateTime } from "@/lib/bookings";
import { getRouteActor } from "@/lib/route-access";
import { tryAutomaticWorkerPayoutTransfer } from "@/lib/stripe-connect";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getPaymentStatus(payment: PaymentRecord | null | undefined) {
  if (!payment) {
    return null;
  }

  const row = payment as PaymentRecord & { payment_status?: string | null };
  return row.payment_status ?? payment.status ?? null;
}

type AttendanceAction =
  | "check_in"
  | "check_out"
  | "confirm_shift"
  | "flag_issue"
  | "no_show";

function buildScheduledAttendanceSnapshot(booking: BookingRecord) {
  return {
    start: getBookingStartDateTime(booking).toISOString(),
    end: getBookingEndDateTime(booking).toISOString(),
  };
}

async function refreshBookingSnapshot(bookingId: string) {
  const supabaseAdmin = getSupabaseAdminClient();

  const [bookingResult, paymentResult] = await Promise.all([
    supabaseAdmin.from("bookings").select("*").eq("id", bookingId).maybeSingle<BookingRecord>(),
    supabaseAdmin.from("payments").select("*").eq("booking_id", bookingId).maybeSingle<PaymentRecord>(),
  ]);

  return {
    booking: bookingResult.data ?? null,
    payment: paymentResult.data ?? null,
  };
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await getRouteActor(request);

  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        action?: AttendanceAction;
        managerName?: string;
        reason?: string;
      }
    | null;
  const action = body?.action;

  if (!action) {
    return NextResponse.json({ error: "Choose an attendance action." }, { status: 400 });
  }

  const { id } = await context.params;
  const supabaseAdmin = getSupabaseAdminClient();
  const { data: booking } = await supabaseAdmin
    .from("bookings")
    .select("*")
    .eq("id", id)
    .maybeSingle<BookingRecord>();

  if (!booking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  const { data: payment } = await supabaseAdmin
    .from("payments")
    .select("*")
    .eq("booking_id", booking.id)
    .maybeSingle<PaymentRecord>();

  const actorId = actor.authUser.id;
  const nowIso = new Date().toISOString();

  if (actor.appUser.role === "worker") {
    if (booking.worker_id !== actorId) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }

    if (booking.status !== "accepted") {
      return NextResponse.json(
        { error: "Only accepted bookings can be updated here." },
        { status: 409 },
      );
    }

    if (action === "check_in") {
      if (booking.worker_checked_in_at) {
        return NextResponse.json(
          { error: "This shift has already been started." },
          { status: 409 },
        );
      }

      await supabaseAdmin
        .from("bookings")
        .update({
          worker_checked_in_at: nowIso,
        })
        .eq("id", booking.id);
    } else if (action === "check_out") {
      if (!booking.worker_checked_in_at) {
        return NextResponse.json(
          { error: "Start the shift first before checking out." },
          { status: 409 },
        );
      }

      if (booking.worker_checked_out_at) {
        return NextResponse.json(
          { error: "This shift has already been finished." },
          { status: 409 },
        );
      }

      await supabaseAdmin
        .from("bookings")
        .update({
          worker_checked_out_at: nowIso,
        })
        .eq("id", booking.id);
    } else {
      return NextResponse.json(
        { error: "Workers can only start or finish shifts here." },
        { status: 403 },
      );
    }

    const refreshed = await refreshBookingSnapshot(booking.id);
    return NextResponse.json(refreshed);
  }

  if (actor.appUser.role !== "business") {
    return NextResponse.json({ error: "Only workers or businesses can do that." }, { status: 403 });
  }

  if (booking.business_id !== actorId) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  if (action === "flag_issue") {
    if (!payment) {
      return NextResponse.json({ error: "No payment record found for this booking." }, { status: 404 });
    }

    await supabaseAdmin
      .from("payments")
      .update({
        payout_status: "on_hold",
        dispute_reason: body?.reason?.trim() || "Issue flagged by business.",
        disputed_at: nowIso,
      })
      .eq("id", payment.id);

    const refreshed = await refreshBookingSnapshot(booking.id);
    return NextResponse.json(refreshed);
  }

  if (action === "no_show") {
    if (booking.status !== "accepted") {
      return NextResponse.json(
        { error: "Only accepted bookings can be marked as no-show." },
        { status: 409 },
      );
    }

    await supabaseAdmin.from("bookings").update({ status: "no_show" }).eq("id", booking.id);
    await supabaseAdmin.rpc("record_worker_reliability_event", {
      target_worker_id: booking.worker_id,
      target_booking_id: booking.id,
      target_event_type: "no_show",
      strike_delta: 2,
      event_metadata: { recorded_by: actorId, source: "business" },
    });

    if (payment) {
      await supabaseAdmin
        .from("payments")
        .update({
          payout_status: "on_hold",
          dispute_reason: body?.reason?.trim() || "Worker marked as no-show by business.",
          disputed_at: nowIso,
          failure_reason: "Payout paused while this no-show is reviewed.",
        })
        .eq("id", payment.id);
    }

    const refreshed = await refreshBookingSnapshot(booking.id);
    return NextResponse.json(refreshed);
  }

  if (action !== "confirm_shift") {
    return NextResponse.json({ error: "That attendance action is not supported." }, { status: 409 });
  }

  if (booking.status !== "accepted") {
    return NextResponse.json(
      { error: "Only accepted bookings can be confirmed." },
      { status: 409 },
    );
  }

  if (!payment || getPaymentStatus(payment) !== "paid") {
    return NextResponse.json(
      { error: "Fund this booking before confirming the shift." },
      { status: 409 },
    );
  }

  const scheduledTimes = buildScheduledAttendanceSnapshot(booking);
  const confirmedStart = booking.worker_checked_in_at ?? scheduledTimes.start;
  const confirmedEnd = booking.worker_checked_out_at ?? scheduledTimes.end;

  await supabaseAdmin
    .from("bookings")
    .update({
      status: "completed",
      business_confirmed_start_at: confirmedStart,
      business_confirmed_end_at: confirmedEnd,
      business_confirmed_at: nowIso,
      business_confirmed_by: actorId,
      manager_confirmation_name: body?.managerName?.trim() || null,
    })
    .eq("id", booking.id);

  await supabaseAdmin.rpc("record_worker_reliability_event", {
    target_worker_id: booking.worker_id,
    target_booking_id: booking.id,
    target_event_type: "completed",
    strike_delta: 0,
    event_metadata: {
      recorded_by: actorId,
      source: "business",
      manager_confirmation_name: body?.managerName?.trim() || null,
      worker_checked_in_at: booking.worker_checked_in_at,
      worker_checked_out_at: booking.worker_checked_out_at,
      business_confirmed_start_at: confirmedStart,
      business_confirmed_end_at: confirmedEnd,
    },
  });

  await supabaseAdmin
    .from("payments")
    .update({
      payout_status: "pending",
      shift_completed_at: nowIso,
      shift_completion_confirmed_by: actorId,
      payout_approved_at: nowIso,
      payout_approved_by: actorId,
      dispute_reason: null,
      disputed_at: null,
      failure_reason: null,
    })
    .eq("id", payment.id);

  const { data: workerProfile } = await supabaseAdmin
    .from("worker_profiles")
    .select("*")
    .eq("user_id", booking.worker_id)
    .maybeSingle<WorkerProfileRecord>();

  if (!workerProfile) {
    await supabaseAdmin
      .from("payments")
      .update({
        payout_status: "on_hold",
        failure_reason:
          "Worker profile could not be found, so Stripe payout cannot be sent yet.",
      })
      .eq("id", payment.id);
  } else {
    try {
      await tryAutomaticWorkerPayoutTransfer({
        payment: {
          ...payment,
          payout_status: "pending",
          shift_completed_at: nowIso,
          shift_completion_confirmed_by: actorId,
          payout_approved_at: nowIso,
          payout_approved_by: actorId,
          dispute_reason: null,
          disputed_at: null,
          failure_reason: null,
        },
        workerProfile,
      });
    } catch {
      await supabaseAdmin
        .from("payments")
        .update({
          payout_status: "on_hold",
          failure_reason:
            "Automatic Stripe payout could not be completed yet. Review the worker payout account and retry.",
        })
        .eq("id", payment.id);
    }
  }

  const refreshed = await refreshBookingSnapshot(booking.id);
  return NextResponse.json(refreshed);
}
