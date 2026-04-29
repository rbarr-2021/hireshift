import { NextRequest, NextResponse } from "next/server";
import type { BookingRecord, PaymentRecord } from "@/lib/models";
import { getRouteActor, isAdminUser } from "@/lib/route-access";
import { reconcilePaymentWithStripe } from "@/lib/stripe-reconciliation";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
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

  if (!payment) {
    return NextResponse.json({ error: "Payment not found for this booking." }, { status: 404 });
  }

  const previousReconciliationStatus = payment.reconciliation_status ?? "needs_review";
  const result = await reconcilePaymentWithStripe({
    booking,
    payment,
  });

  const nowIso = new Date().toISOString();

  await Promise.all([
    supabaseAdmin
      .from("payments")
      .update({
        stripe_last_synced_at: nowIso,
        stripe_payment_status: result.stripePaymentStatus,
        stripe_transfer_status: result.stripeTransferStatus,
        reconciliation_status: result.status,
        reconciliation_issue: result.issue,
        reconciliation_checked_at: nowIso,
      })
      .eq("id", payment.id),
    supabaseAdmin.from("payment_events").insert({
      booking_id: booking.id,
      payment_id: payment.id,
      event_type: "stripe_reconciliation_check",
      source: "admin",
      metadata: {
        admin_user_id: actor.authUser.id,
        previous_reconciliation_status: previousReconciliationStatus,
        new_reconciliation_status: result.status,
        issue_summary: result.issue,
        stripe_reference_used: result.referencesUsed,
        ...result.metadata,
      },
    }),
  ]);

  return NextResponse.json({
    reconciliation_status: result.status,
    reconciliation_issue: result.issue,
    stripe_payment_status: result.stripePaymentStatus,
    stripe_transfer_status: result.stripeTransferStatus,
    stripe_last_synced_at: nowIso,
  });
}
