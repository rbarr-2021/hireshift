import { NextRequest, NextResponse } from "next/server";
import { buildAdminBookingSummaries } from "@/lib/admin-bookings";
import type {
  AdminPaymentActionType,
  BookingRecord,
  BusinessProfileRecord,
  MarketplaceUserRecord,
  PaymentEventRecord,
  PaymentRecord,
  PaymentStatus,
  PayoutStatus,
  WorkerProfileRecord,
} from "@/lib/models";
import { getRouteActor, isAdminUser } from "@/lib/route-access";
import { getStripeClient } from "@/lib/stripe";
import { tryAutomaticWorkerPayoutTransfer } from "@/lib/stripe-connect";
import {
  getPlatformPaymentControls,
  guardPayoutByControls,
  guardRefundByControls,
  withDefaultPlatformPaymentControls,
} from "@/lib/platform-payment-controls";
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

async function getAdminSummary(bookingId: string) {
  const supabaseAdmin = getSupabaseAdminClient();
  const { data: booking } = await supabaseAdmin
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .maybeSingle<BookingRecord>();

  if (!booking) {
    return null;
  }

  const [paymentResult, paymentEventsResult, workerUserResult, workerProfileResult, businessUserResult, businessProfileResult] =
    await Promise.all([
      supabaseAdmin.from("payments").select("*").eq("booking_id", booking.id).maybeSingle<PaymentRecord>(),
      supabaseAdmin
        .from("payment_events")
        .select("*")
        .eq("booking_id", booking.id)
        .order("created_at", { ascending: false })
        .returns<PaymentEventRecord[]>(),
      supabaseAdmin.from("marketplace_users").select("*").eq("id", booking.worker_id).maybeSingle<MarketplaceUserRecord>(),
      supabaseAdmin.from("worker_profiles").select("*").eq("user_id", booking.worker_id).maybeSingle<WorkerProfileRecord>(),
      supabaseAdmin.from("marketplace_users").select("*").eq("id", booking.business_id).maybeSingle<MarketplaceUserRecord>(),
      supabaseAdmin.from("business_profiles").select("*").eq("user_id", booking.business_id).maybeSingle<BusinessProfileRecord>(),
    ]);

  return buildAdminBookingSummaries({
    bookings: [booking],
    payments: paymentResult.data ? [paymentResult.data] : [],
    paymentEvents: (paymentEventsResult.data as PaymentEventRecord[] | null) ?? [],
    workerUsers: workerUserResult.data ? [workerUserResult.data] : [],
    workerProfiles: workerProfileResult.data ? [workerProfileResult.data] : [],
    businessUsers: businessUserResult.data ? [businessUserResult.data] : [],
    businessProfiles: businessProfileResult.data ? [businessProfileResult.data] : [],
  })[0];
}

function isWorkerPayoutReady(workerProfile: WorkerProfileRecord | null) {
  return Boolean(
    workerProfile?.stripe_connect_account_id &&
      workerProfile.stripe_connect_charges_enabled &&
      workerProfile.stripe_connect_payouts_enabled,
  );
}

async function logAdminPaymentAction(input: {
  actionType: AdminPaymentActionType;
  bookingId: string;
  paymentId: string;
  adminUserId: string;
  reason?: string | null;
  previousPaymentStatus: PaymentStatus | null;
  previousPayoutStatus: PayoutStatus | null;
  newPaymentStatus: PaymentStatus | null;
  newPayoutStatus: PayoutStatus | null;
  metadata?: Record<string, unknown>;
}) {
  const supabaseAdmin = getSupabaseAdminClient();
  const eventType = `admin.${input.actionType}`;
  const metadata = input.metadata ?? {};

  await Promise.all([
    supabaseAdmin.from("admin_payment_actions").insert({
      booking_id: input.bookingId,
      payment_id: input.paymentId,
      admin_user_id: input.adminUserId,
      action_type: input.actionType,
      reason: input.reason ?? null,
      previous_payment_status: input.previousPaymentStatus,
      previous_payout_status: input.previousPayoutStatus,
      new_payment_status: input.newPaymentStatus,
      new_payout_status: input.newPayoutStatus,
      metadata,
    }),
    supabaseAdmin.from("payment_events").insert({
      booking_id: input.bookingId,
      payment_id: input.paymentId,
      event_type: eventType,
      source: "admin",
      metadata: {
        admin_user_id: input.adminUserId,
        reason: input.reason ?? null,
        ...metadata,
      },
    }),
  ]);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await getRouteActor(request);

  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await isAdminUser(actor.authUser.id))) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { id } = await context.params;
  const summary = await getAdminSummary(id);

  if (!summary) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  return NextResponse.json({ item: summary });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await getRouteActor(request);

  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await isAdminUser(actor.authUser.id))) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | { status?: string; payoutAction?: string; reason?: string; refundAmountGbp?: number | null }
    | null;
  const nextStatus = body?.status;
  const payoutAction = body?.payoutAction;
  const actionReason = body?.reason?.trim() || null;
  const refundAmountGbp = typeof body?.refundAmountGbp === "number" ? body.refundAmountGbp : null;

  if (!nextStatus && !payoutAction) {
    return NextResponse.json({ error: "Choose an admin action." }, { status: 400 });
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

  const { data: workerProfile } = await supabaseAdmin
    .from("worker_profiles")
    .select("*")
    .eq("user_id", booking.worker_id)
    .maybeSingle<WorkerProfileRecord>();

  const previousPaymentStatus = payment ? (getPaymentStatus(payment) as PaymentStatus | null) : null;
  const previousPayoutStatus = payment?.payout_status ?? null;

  if (getPaymentStatus(payment) === "paid" && nextStatus === "cancelled") {
    return NextResponse.json(
      { error: "Paid bookings cannot be cancelled here until refund handling is added." },
      { status: 409 },
    );
  }

  if (nextStatus === "completed" || nextStatus === "no_show") {
    if (booking.status !== "accepted") {
      return NextResponse.json(
        { error: "Only accepted bookings can be marked completed or no-show." },
        { status: 409 },
      );
    }

    await supabaseAdmin.from("bookings").update({ status: nextStatus }).eq("id", booking.id);
    await supabaseAdmin.rpc("record_worker_reliability_event", {
      target_worker_id: booking.worker_id,
      target_booking_id: booking.id,
      target_event_type: nextStatus === "completed" ? "completed" : "no_show",
      strike_delta: nextStatus === "completed" ? 0 : 2,
      event_metadata: { recorded_by: actor.authUser.id, source: "admin" },
    });
  } else if (
    nextStatus &&
    (nextStatus === "declined" && booking.status === "pending") ||
    (nextStatus === "cancelled" && (booking.status === "pending" || booking.status === "accepted")) ||
    (nextStatus === "accepted" && booking.status === "pending")
  ) {
    await supabaseAdmin.from("bookings").update({ status: nextStatus }).eq("id", booking.id);
  } else if (nextStatus) {
    return NextResponse.json(
      { error: "That admin status change is not supported for this booking yet." },
      { status: 409 },
    );
  }

  if (payoutAction) {
    if (!payment) {
      return NextResponse.json({ error: "No payment record found for this booking." }, { status: 404 });
    }

    const platformControls = withDefaultPlatformPaymentControls(
      await getPlatformPaymentControls(),
    );

    if (payoutAction === "approve_payout") {
      if (getPaymentStatus(payment) !== "paid") {
        return NextResponse.json({ error: "Business payment must be marked paid first." }, { status: 409 });
      }

      if (!(payment.payout_status === "pending" || payment.payout_status === "not_started")) {
        return NextResponse.json(
          { error: "Payout can only be released from pending or not started." },
          { status: 409 },
        );
      }

      if (!(booking.attendance_status === "approved" || booking.attendance_status === "adjusted")) {
        return NextResponse.json(
          { error: "Attendance must be approved before releasing payout." },
          { status: 409 },
        );
      }

      if (!booking.business_hours_approved || booking.business_hours_approved <= 0) {
        return NextResponse.json(
          { error: "Approved business hours are required before payout release." },
          { status: 409 },
        );
      }

      if (!isWorkerPayoutReady(workerProfile ?? null)) {
        return NextResponse.json(
          { error: "Worker payout setup is incomplete." },
          { status: 409 },
        );
      }

      const payoutControlCheck = guardPayoutByControls({
        controls: platformControls,
        payoutAmountGbp: payment.worker_payout_gbp,
      });

      if (!payoutControlCheck.ok) {
        return NextResponse.json({ error: payoutControlCheck.reason }, { status: 409 });
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

      await logAdminPaymentAction({
        actionType: "release_payout",
        bookingId: booking.id,
        paymentId: payment.id,
        adminUserId: actor.authUser.id,
        reason: actionReason,
        previousPaymentStatus,
        previousPayoutStatus,
        newPaymentStatus: "paid",
        newPayoutStatus: "in_progress",
        metadata: {
          attendance_status: booking.attendance_status,
          business_hours_approved: booking.business_hours_approved,
        },
      });
    } else if (payoutAction === "retry_payout") {
      if (payment.payout_status !== "failed") {
        return NextResponse.json({ error: "Retry is only available for failed payouts." }, { status: 409 });
      }

      if (!workerProfile || !isWorkerPayoutReady(workerProfile)) {
        return NextResponse.json({ error: "Worker payout setup is incomplete." }, { status: 409 });
      }

      const payoutControlCheck = guardPayoutByControls({
        controls: platformControls,
        payoutAmountGbp: payment.worker_payout_gbp,
      });

      if (!payoutControlCheck.ok) {
        return NextResponse.json({ error: payoutControlCheck.reason }, { status: 409 });
      }

      try {
        await tryAutomaticWorkerPayoutTransfer({
          payment,
          workerProfile,
        });
      } catch {
        return NextResponse.json(
          { error: "Retry could not start. Review Stripe setup and try again." },
          { status: 409 },
        );
      }

      await logAdminPaymentAction({
        actionType: "retry_payout",
        bookingId: booking.id,
        paymentId: payment.id,
        adminUserId: actor.authUser.id,
        reason: actionReason,
        previousPaymentStatus,
        previousPayoutStatus,
        newPaymentStatus: previousPaymentStatus,
        newPayoutStatus: "in_progress",
      });
    } else if (payoutAction === "refund") {
      if (!actionReason) {
        return NextResponse.json(
          { error: "Refund reason is required." },
          { status: 400 },
        );
      }

      const requestedRefundAmount =
        refundAmountGbp && refundAmountGbp > 0 ? refundAmountGbp : payment.gross_amount_gbp;
      const refundControlCheck = guardRefundByControls({
        controls: platformControls,
        refundAmountGbp: requestedRefundAmount,
      });

      if (!refundControlCheck.ok) {
        return NextResponse.json({ error: refundControlCheck.reason }, { status: 409 });
      }

      if (payment.payout_status === "in_progress" || payment.payout_status === "completed" || Boolean(payment.stripe_transfer_id)) {
        return NextResponse.json(
          {
            error:
              "This payment has already been transferred. Handle transfer reversal/refund carefully in Stripe or Phase E.",
          },
          { status: 409 },
        );
      }

      if (!payment.stripe_payment_intent_id) {
        return NextResponse.json(
          { error: "No Stripe payment intent found for this booking." },
          { status: 409 },
        );
      }

      const stripe = getStripeClient();
      const refundParams: Parameters<typeof stripe.refunds.create>[0] = {
        payment_intent: payment.stripe_payment_intent_id,
        metadata: {
          booking_id: booking.id,
          payment_id: payment.id,
          reason: actionReason,
          source: "admin_phase_c",
        },
      };

      if (refundAmountGbp && refundAmountGbp > 0) {
        refundParams.amount = Math.round(refundAmountGbp * 100);
      }

      await stripe.refunds.create(refundParams);

      await supabaseAdmin
        .from("payments")
        .update({
          payout_status: "on_hold",
          failure_reason: "Refund requested by admin. Awaiting Stripe confirmation.",
        })
        .eq("id", payment.id);

      await logAdminPaymentAction({
        actionType: "refund_payment",
        bookingId: booking.id,
        paymentId: payment.id,
        adminUserId: actor.authUser.id,
        reason: actionReason,
        previousPaymentStatus,
        previousPayoutStatus,
        newPaymentStatus: previousPaymentStatus,
        newPayoutStatus: "on_hold",
        metadata: {
          refund_amount_gbp: refundAmountGbp,
        },
      });
    } else if (payoutAction === "mark_paid") {
      if (!payment.stripe_transfer_id) {
        return NextResponse.json(
          {
            error:
              "This payout has not been sent through Stripe yet. Ask the worker to connect payout details, then approve payout again.",
          },
          { status: 409 },
        );
      }

      await supabaseAdmin
        .from("payments")
        .update({
          payout_status: "completed",
          payout_sent_at: new Date().toISOString(),
          payment_status: getPaymentStatus(payment) === "paid" ? "paid" : getPaymentStatus(payment),
          dispute_reason: null,
          disputed_at: null,
          failure_reason: null,
        })
        .eq("id", payment.id);

      await logAdminPaymentAction({
        actionType: "release_payout",
        bookingId: booking.id,
        paymentId: payment.id,
        adminUserId: actor.authUser.id,
        reason: "Marked paid from admin panel.",
        previousPaymentStatus,
        previousPayoutStatus,
        newPaymentStatus: getPaymentStatus(payment) as PaymentStatus | null,
        newPayoutStatus: "completed",
      });
    } else if (payoutAction === "flag_issue" || payoutAction === "dispute") {
      if (!actionReason) {
        return NextResponse.json(
          { error: "Issue reason is required." },
          { status: 400 },
        );
      }

      await supabaseAdmin
        .from("payments")
        .update({
          payment_status: payoutAction === "dispute" ? "disputed" : getPaymentStatus(payment),
          payout_status: "on_hold",
          dispute_reason: actionReason,
          disputed_at: new Date().toISOString(),
        })
        .eq("id", payment.id);

      await logAdminPaymentAction({
        actionType: "flag_issue",
        bookingId: booking.id,
        paymentId: payment.id,
        adminUserId: actor.authUser.id,
        reason: actionReason,
        previousPaymentStatus,
        previousPayoutStatus,
        newPaymentStatus:
          payoutAction === "dispute"
            ? "disputed"
            : (getPaymentStatus(payment) as PaymentStatus | null),
        newPayoutStatus: "on_hold",
      });
    } else if (payoutAction === "hold") {
      if (!actionReason) {
        return NextResponse.json(
          { error: "Hold reason is required." },
          { status: 400 },
        );
      }

      await supabaseAdmin
        .from("payments")
        .update({
          payout_status: "on_hold",
          failure_reason: actionReason,
        })
        .eq("id", payment.id);

      await logAdminPaymentAction({
        actionType: "hold_payout",
        bookingId: booking.id,
        paymentId: payment.id,
        adminUserId: actor.authUser.id,
        reason: actionReason,
        previousPaymentStatus,
        previousPayoutStatus,
        newPaymentStatus: previousPaymentStatus,
        newPayoutStatus: "on_hold",
      });
    } else {
      return NextResponse.json(
        { error: "That payout action is not supported." },
        { status: 409 },
      );
    }
  }

  const summary = await getAdminSummary(booking.id);
  return NextResponse.json({ item: summary });
}
