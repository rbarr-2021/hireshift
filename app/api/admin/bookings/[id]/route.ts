import { NextRequest, NextResponse } from "next/server";
import { buildAdminBookingSummaries } from "@/lib/admin-bookings";
import type {
  BookingRecord,
  BusinessProfileRecord,
  MarketplaceUserRecord,
  PaymentRecord,
  WorkerProfileRecord,
} from "@/lib/models";
import { getRouteActor, isAdminUser } from "@/lib/route-access";
import { tryAutomaticWorkerPayoutTransfer } from "@/lib/stripe-connect";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const [paymentResult, workerUserResult, workerProfileResult, businessUserResult, businessProfileResult] =
    await Promise.all([
      supabaseAdmin.from("payments").select("*").eq("booking_id", booking.id).maybeSingle<PaymentRecord>(),
      supabaseAdmin.from("marketplace_users").select("*").eq("id", booking.worker_id).maybeSingle<MarketplaceUserRecord>(),
      supabaseAdmin.from("worker_profiles").select("*").eq("user_id", booking.worker_id).maybeSingle<WorkerProfileRecord>(),
      supabaseAdmin.from("marketplace_users").select("*").eq("id", booking.business_id).maybeSingle<MarketplaceUserRecord>(),
      supabaseAdmin.from("business_profiles").select("*").eq("user_id", booking.business_id).maybeSingle<BusinessProfileRecord>(),
    ]);

  return buildAdminBookingSummaries({
    bookings: [booking],
    payments: paymentResult.data ? [paymentResult.data] : [],
    workerUsers: workerUserResult.data ? [workerUserResult.data] : [],
    workerProfiles: workerProfileResult.data ? [workerProfileResult.data] : [],
    businessUsers: businessUserResult.data ? [businessUserResult.data] : [],
    businessProfiles: businessProfileResult.data ? [businessProfileResult.data] : [],
  })[0];
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

  const body = (await request.json().catch(() => null)) as { status?: string } | null;
  const nextStatus = body?.status;
  const payoutAction = (body as { payoutAction?: string; reason?: string } | null)?.payoutAction;
  const actionReason = (body as { payoutAction?: string; reason?: string } | null)?.reason?.trim() || null;

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

  if (
    (payment?.status === "captured" || payment?.status === "released") &&
    nextStatus === "cancelled"
  ) {
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

    if (payoutAction === "approve_payout") {
      await supabaseAdmin
        .from("payments")
        .update({
          payout_status: "approved_for_payout",
          payout_approved_at: new Date().toISOString(),
          payout_approved_by: actor.authUser.id,
          dispute_reason: null,
          disputed_at: null,
          payout_hold_reason: null,
        })
        .eq("id", payment.id);

      const { data: workerProfile } = await supabaseAdmin
        .from("worker_profiles")
        .select("*")
        .eq("user_id", booking.worker_id)
        .maybeSingle<WorkerProfileRecord>();

      if (workerProfile) {
        try {
          await tryAutomaticWorkerPayoutTransfer({
            payment: {
              ...payment,
              payout_status: "approved_for_payout",
              payout_approved_at: new Date().toISOString(),
              payout_approved_by: actor.authUser.id,
              payout_hold_reason: null,
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
              payout_hold_reason:
                "Automatic Stripe payout could not be completed yet. Review the worker payout account and retry.",
            })
            .eq("id", payment.id);
        }
      }
    } else if (payoutAction === "mark_paid") {
      await supabaseAdmin
        .from("payments")
        .update({
          payout_status: "paid",
          payout_sent_at: new Date().toISOString(),
          status: payment.status === "captured" ? "released" : payment.status,
          dispute_reason: null,
          disputed_at: null,
          payout_hold_reason: null,
        })
        .eq("id", payment.id);
    } else if (payoutAction === "dispute") {
      await supabaseAdmin
        .from("payments")
        .update({
          payout_status: "disputed",
          dispute_reason: actionReason || "Issue flagged by admin.",
          disputed_at: new Date().toISOString(),
        })
        .eq("id", payment.id);
    } else if (payoutAction === "hold") {
      await supabaseAdmin
        .from("payments")
        .update({
          payout_status: "on_hold",
          payout_hold_reason: actionReason || "Payout placed on hold by admin.",
        })
        .eq("id", payment.id);
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
