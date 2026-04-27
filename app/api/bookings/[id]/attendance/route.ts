import { NextRequest, NextResponse } from "next/server";
import type { BookingRecord, PaymentRecord, WorkerProfileRecord } from "@/lib/models";
import {
  calculateHoursBetweenTimestamps,
  getBookingEndDateTime,
  getBookingStartDateTime,
  getCheckInWindow,
} from "@/lib/bookings";
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
  | "approve_hours"
  | "adjust_hours"
  | "dispute_hours"
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
        notes?: string;
        adjustedHours?: number | string | null;
        latitude?: number | null;
        longitude?: number | null;
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
  const now = new Date(nowIso);

  const normalizeCoordinate = (value: number | null | undefined) =>
    typeof value === "number" && Number.isFinite(value) ? value : null;

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

      const { opensAt, closesAt } = getCheckInWindow(booking);
      if (now < opensAt || now > closesAt) {
        return NextResponse.json(
          {
            error:
              "Check-in opens 15 minutes before your shift starts. Check-in closes 30 minutes after start.",
          },
          { status: 409 },
        );
      }

      await supabaseAdmin
        .from("bookings")
        .update({
          worker_checked_in_at: nowIso,
          check_in_lat: normalizeCoordinate(body?.latitude),
          check_in_lng: normalizeCoordinate(body?.longitude),
          attendance_status: "checked_in",
          attendance_notes: body?.notes?.trim() || booking.attendance_notes || null,
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

      const claimedHours = calculateHoursBetweenTimestamps(
        booking.worker_checked_in_at,
        nowIso,
      );

      if (!claimedHours || claimedHours <= 0) {
        return NextResponse.json(
          { error: "Shift hours could not be calculated. Please try again." },
          { status: 409 },
        );
      }

      await supabaseAdmin
        .from("bookings")
        .update({
          worker_checked_out_at: nowIso,
          check_out_lat: normalizeCoordinate(body?.latitude),
          check_out_lng: normalizeCoordinate(body?.longitude),
          worker_hours_claimed: claimedHours,
          attendance_status: "pending_approval",
          attendance_notes: body?.notes?.trim() || booking.attendance_notes || null,
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
    if (!body?.reason?.trim()) {
      return NextResponse.json(
        { error: "Add a reason before disputing attendance." },
        { status: 400 },
      );
    }

    await supabaseAdmin
      .from("bookings")
      .update({
        attendance_status: "disputed",
        business_adjustment_reason: body.reason.trim(),
      })
      .eq("id", booking.id);

    if (payment) {
      await supabaseAdmin
        .from("payments")
        .update({
          payout_status: "on_hold",
          dispute_reason: body.reason.trim(),
          disputed_at: nowIso,
        })
        .eq("id", payment.id);
    }

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

    await supabaseAdmin
      .from("bookings")
      .update({
        status: "no_show",
        attendance_status: "disputed",
        business_adjustment_reason: body?.reason?.trim() || "Worker marked as no-show by business.",
      })
      .eq("id", booking.id);
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

  let mappedAction: "approve_hours" | "adjust_hours" | "dispute_hours" | null = null;
  if (action === "confirm_shift" || action === "approve_hours") {
    mappedAction = "approve_hours";
  } else if (action === "adjust_hours") {
    mappedAction = "adjust_hours";
  } else if (action === "dispute_hours") {
    mappedAction = "dispute_hours";
  }

  if (!mappedAction) {
    return NextResponse.json({ error: "That attendance action is not supported." }, { status: 409 });
  }

  if (!(booking.status === "accepted" || booking.status === "completed")) {
    return NextResponse.json(
      { error: "Only accepted or completed bookings can be updated." },
      { status: 409 },
    );
  }

  if (mappedAction === "dispute_hours") {
    if (!body?.reason?.trim()) {
      return NextResponse.json(
        { error: "Add a reason before disputing attendance." },
        { status: 400 },
      );
    }

    await supabaseAdmin
      .from("bookings")
      .update({
        attendance_status: "disputed",
        business_adjustment_reason: body.reason.trim(),
      })
      .eq("id", booking.id);

    if (payment) {
      await supabaseAdmin
        .from("payments")
        .update({
          payout_status: "on_hold",
          dispute_reason: body.reason.trim(),
          disputed_at: nowIso,
          failure_reason: "This shift has an unresolved attendance dispute.",
        })
        .eq("id", payment.id);
    }

    const refreshed = await refreshBookingSnapshot(booking.id);
    return NextResponse.json(refreshed);
  }

  if (!booking.worker_checked_in_at || !booking.worker_checked_out_at) {
    return NextResponse.json(
      { error: "Worker must check in and check out before attendance can be approved." },
      { status: 409 },
    );
  }

  const claimedHours =
    booking.worker_hours_claimed ??
    calculateHoursBetweenTimestamps(booking.worker_checked_in_at, booking.worker_checked_out_at);

  if (!claimedHours || claimedHours <= 0) {
    return NextResponse.json(
      { error: "Worker claimed hours are not available yet." },
      { status: 409 },
    );
  }

  const parsedAdjustedHours =
    typeof body?.adjustedHours === "string"
      ? Number.parseFloat(body.adjustedHours)
      : body?.adjustedHours;

  if (mappedAction === "adjust_hours" && (!Number.isFinite(parsedAdjustedHours ?? NaN) || (parsedAdjustedHours ?? 0) <= 0)) {
    return NextResponse.json(
      { error: "Enter the adjusted hours before saving." },
      { status: 400 },
    );
  }

  if (mappedAction === "adjust_hours" && !body?.reason?.trim()) {
    return NextResponse.json(
      { error: "Add a reason when adjusting worker hours." },
      { status: 400 },
    );
  }

  const approvedHours =
    mappedAction === "adjust_hours" ? Number((parsedAdjustedHours ?? 0).toFixed(2)) : claimedHours;

  const scheduledTimes = buildScheduledAttendanceSnapshot(booking);
  const confirmedStart = booking.worker_checked_in_at ?? scheduledTimes.start;
  const confirmedEnd = booking.worker_checked_out_at ?? scheduledTimes.end;

  await supabaseAdmin
    .from("bookings")
    .update({
      status: "completed",
      worker_hours_claimed: claimedHours,
      business_hours_approved: approvedHours,
      attendance_status: mappedAction === "adjust_hours" ? "adjusted" : "approved",
      business_adjustment_reason: mappedAction === "adjust_hours" ? body?.reason?.trim() || null : null,
      approved_by_business_at: nowIso,
      approved_by_business_id: actorId,
      attendance_notes: body?.notes?.trim() || booking.attendance_notes || null,
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
      attendance_status: mappedAction === "adjust_hours" ? "adjusted" : "approved",
      worker_hours_claimed: claimedHours,
      business_hours_approved: approvedHours,
      business_adjustment_reason: mappedAction === "adjust_hours" ? body?.reason?.trim() || null : null,
      manager_confirmation_name: body?.managerName?.trim() || null,
      worker_checked_in_at: booking.worker_checked_in_at,
      worker_checked_out_at: booking.worker_checked_out_at,
      business_confirmed_start_at: confirmedStart,
      business_confirmed_end_at: confirmedEnd,
    },
  });

  if (payment) {
    const paymentStatus = getPaymentStatus(payment);
    const nextPayoutStatus = paymentStatus === "paid" ? "pending" : payment.payout_status;

    await supabaseAdmin
      .from("payments")
      .update({
        payout_status: nextPayoutStatus,
        shift_completed_at: nowIso,
        shift_completion_confirmed_by: actorId,
        payout_approved_at: nowIso,
        payout_approved_by: actorId,
        dispute_reason: null,
        disputed_at: null,
        failure_reason: null,
      })
      .eq("id", payment.id);

    if (paymentStatus === "paid") {
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
    }
  }

  const refreshed = await refreshBookingSnapshot(booking.id);
  return NextResponse.json(refreshed);
}
