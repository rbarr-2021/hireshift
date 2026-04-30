import { NextRequest, NextResponse } from "next/server";
import type { BookingRecord, PaymentRecord, WorkerProfileRecord } from "@/lib/models";
import { isWorkerPayoutReady } from "@/lib/payout-readiness";
import { getRouteActor } from "@/lib/route-access";
import { shouldBlockLivePayoutActions } from "@/lib/stripe-config";
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

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await getRouteActor(request);

  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (actor.appUser.role !== "business") {
    return NextResponse.json({ error: "Only businesses can manage payout actions." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | { action?: "mark_complete" | "approve_payout" | "flag_issue"; reason?: string }
    | null;
  const action = body?.action;

  if (!action) {
    return NextResponse.json({ error: "Choose a payout action." }, { status: 400 });
  }

  const { id } = await context.params;
  const supabaseAdmin = getSupabaseAdminClient();
  const { data: booking } = await supabaseAdmin
    .from("bookings")
    .select("*")
    .eq("id", id)
    .maybeSingle<BookingRecord>();

  if (!booking || booking.business_id !== actor.authUser.id) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  const { data: payment } = await supabaseAdmin
    .from("payments")
    .select("*")
    .eq("booking_id", booking.id)
    .maybeSingle<PaymentRecord>();

  if (action === "mark_complete") {
    if (booking.status !== "accepted") {
      return NextResponse.json(
        { error: "Only accepted bookings can be marked complete." },
        { status: 409 },
      );
    }

    await supabaseAdmin
      .from("bookings")
      .update({
        status: "completed",
        attendance_status: booking.worker_checked_out_at ? "pending_approval" : booking.attendance_status,
      })
      .eq("id", booking.id);
    await supabaseAdmin.rpc("record_worker_reliability_event", {
      target_worker_id: booking.worker_id,
      target_booking_id: booking.id,
      target_event_type: "completed",
      strike_delta: 0,
      event_metadata: { recorded_by: actor.authUser.id, source: "business" },
    });

    if (payment) {
      await supabaseAdmin
        .from("payments")
        .update({
          payout_status: "pending",
          shift_completed_at: new Date().toISOString(),
          shift_completion_confirmed_by: actor.authUser.id,
          dispute_reason: null,
          disputed_at: null,
          failure_reason: null,
        })
        .eq("id", payment.id);
    }
  }

  if (action === "approve_payout") {
    if (shouldBlockLivePayoutActions()) {
      return NextResponse.json(
        {
          error:
            "Live Stripe mode detected. Payout actions are blocked until STRIPE_ALLOW_LIVE_PAYOUTS=true is set server-side.",
        },
        { status: 409 },
      );
    }

    if (!payment) {
      return NextResponse.json({ error: "No payment record found for this booking." }, { status: 404 });
    }

    if (getPaymentStatus(payment) !== "paid") {
      return NextResponse.json(
        { error: "The booking must be paid before payout can be approved." },
        { status: 409 },
      );
    }

    if (booking.status !== "completed") {
      return NextResponse.json(
        { error: "Mark the shift complete before approving payout." },
        { status: 409 },
      );
    }

    if (booking.attendance_status === "disputed") {
      return NextResponse.json(
        { error: "This shift has an unresolved attendance dispute." },
        { status: 409 },
      );
    }

    if (!(booking.attendance_status === "approved" || booking.attendance_status === "adjusted")) {
      return NextResponse.json(
        { error: "Approve attendance hours before releasing payout." },
        { status: 409 },
      );
    }

    if (!booking.business_hours_approved || booking.business_hours_approved <= 0) {
      return NextResponse.json(
        { error: "Approved attendance hours are required before payout release." },
        { status: 409 },
      );
    }

    if (payment.settlement_status === "top_up_required" || (payment.top_up_due_gbp ?? 0) > 0) {
      return NextResponse.json(
        {
          error:
            "Approved hours are higher than estimated. Extra payment is required before payout release.",
        },
        { status: 409 },
      );
    }

    if (payment.status === "refunded" || payment.status === "disputed" || payment.payout_status === "on_hold") {
      return NextResponse.json(
        { error: "Payout is blocked while this payment is under review." },
        { status: 409 },
      );
    }

    if (!(payment.payout_status === "pending" || payment.payout_status === "not_started")) {
      return NextResponse.json(
        { error: "Payout can only be released from a pending state." },
        { status: 409 },
      );
    }

    await supabaseAdmin
      .from("payments")
      .update({
        payout_status: "pending",
        payout_approved_at: new Date().toISOString(),
        payout_approved_by: actor.authUser.id,
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
      if (!isWorkerPayoutReady(workerProfile)) {
        await supabaseAdmin
          .from("payments")
          .update({
            payout_status: "on_hold",
            failure_reason:
              "Worker payout account setup is incomplete. Ask the worker to finish Stripe onboarding.",
          })
          .eq("id", payment.id);

        return NextResponse.json(
          { error: "Worker payout setup is incomplete." },
          { status: 409 },
        );
      }

      try {
        await tryAutomaticWorkerPayoutTransfer({
          payment: {
            ...payment,
            payout_status: "pending",
            payout_approved_at: new Date().toISOString(),
            payout_approved_by: actor.authUser.id,
            failure_reason: null,
            dispute_reason: null,
            disputed_at: null,
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

  if (action === "flag_issue") {
    if (!payment) {
      return NextResponse.json({ error: "No payment record found for this booking." }, { status: 404 });
    }

    await supabaseAdmin
      .from("payments")
      .update({
        payout_status: "on_hold",
        dispute_reason: body?.reason?.trim() || "Issue flagged by business.",
        disputed_at: new Date().toISOString(),
      })
      .eq("id", payment.id);
  }

  const [refreshedBookingResult, refreshedPaymentResult] = await Promise.all([
    supabaseAdmin.from("bookings").select("*").eq("id", booking.id).maybeSingle<BookingRecord>(),
    supabaseAdmin.from("payments").select("*").eq("booking_id", booking.id).maybeSingle<PaymentRecord>(),
  ]);

  return NextResponse.json({
    booking: refreshedBookingResult.data,
    payment: refreshedPaymentResult.data,
  });
}
