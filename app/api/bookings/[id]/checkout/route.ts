import { NextRequest, NextResponse } from "next/server";
import { calculateBookingDurationHours } from "@/lib/bookings";
import { getBusinessPaymentMethodStatus } from "@/lib/business-payment-method";
import type { BookingRecord, PaymentRecord, WorkerProfileRecord } from "@/lib/models";
import { buildBookingPricingSnapshot } from "@/lib/pricing";
import { getRouteActor } from "@/lib/route-access";
import { calculateSettlement, getEstimatedHours } from "@/lib/settlement";
import { getSiteUrl, getStripeClient } from "@/lib/stripe";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

function getPaymentStatus(payment: PaymentRecord | null | undefined) {
  if (!payment) {
    return null;
  }

  const row = payment as PaymentRecord & { payment_status?: string | null };
  return row.payment_status ?? payment.status ?? null;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getRouteActor(request);

    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (actor.appUser.role !== "business") {
      return NextResponse.json({ error: "Only businesses can pay for bookings." }, { status: 403 });
    }

    const { id: bookingId } = await context.params;
    const supabaseAdmin = getSupabaseAdminClient();
    const { data: booking } = await supabaseAdmin
      .from("bookings")
      .select("*")
      .eq("id", bookingId)
      .maybeSingle<BookingRecord>();

    if (!booking || booking.business_id !== actor.appUser.id) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }

    if (booking.status !== "accepted" && booking.status !== "completed") {
      return NextResponse.json(
        { error: "This booking is not ready for payment." },
        { status: 409 },
      );
    }

    const { data: existingPayment } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("booking_id", booking.id)
      .maybeSingle<PaymentRecord>();

    const existingPaymentStatus = getPaymentStatus(existingPayment);
    const needsTopUpPayment =
      existingPaymentStatus === "paid" &&
      Number(existingPayment?.top_up_due_gbp ?? 0) > 0;
    if (existingPaymentStatus === "paid") {
      if (needsTopUpPayment) {
        // Continue to create a top-up checkout session.
      } else {
      return NextResponse.json(
        { error: "This booking has already been paid." },
        { status: 409 },
      );
      }
    }

    if (!needsTopUpPayment) {
      const { data: businessProfile } = await supabaseAdmin
        .from("business_profiles")
        .select("*")
        .eq("user_id", actor.appUser.id)
        .maybeSingle();
      const paymentMethodStatus = await getBusinessPaymentMethodStatus({
        profile: businessProfile,
      });
      if (!paymentMethodStatus.paymentMethodReady) {
        return NextResponse.json(
          {
            error:
              "Payment method required before securing this shift. Add a payment method first.",
          },
          { status: 409 },
        );
      }
    }

    const { data: workerProfile } = await supabaseAdmin
      .from("worker_profiles")
      .select("*")
      .eq("user_id", booking.worker_id)
      .maybeSingle<WorkerProfileRecord>();

    const durationHours =
      booking.shift_duration_hours ||
      calculateBookingDurationHours(
        booking.start_time,
        booking.end_time,
        booking.shift_date,
        booking.shift_end_date,
      );
    const workerSubtotal = Number((durationHours * booking.hourly_rate_gbp).toFixed(2));
    const pricing = buildBookingPricingSnapshot(workerSubtotal);
    const requestedRole = booking.requested_role_label || workerProfile?.job_role || "Hospitality shift";

    if (
      booking.shift_duration_hours !== durationHours ||
      booking.platform_fee_gbp !== pricing.platformFeeGbp ||
      booking.total_amount_gbp !== pricing.businessTotalGbp ||
      booking.requested_role_label !== requestedRole
    ) {
      const { data: refreshedBooking } = await supabaseAdmin
        .from("bookings")
        .update({
          shift_duration_hours: durationHours,
          platform_fee_gbp: pricing.platformFeeGbp,
          total_amount_gbp: pricing.businessTotalGbp,
          requested_role_label: requestedRole,
        })
        .eq("id", booking.id)
        .select("*")
        .maybeSingle<BookingRecord>();

      if (refreshedBooking) {
        Object.assign(booking, refreshedBooking);
      }
    }

    const stripe = getStripeClient();

    if (
      existingPayment?.stripe_checkout_session_id &&
      existingPaymentStatus === "pending"
    ) {
      try {
        const existingSession = await stripe.checkout.sessions.retrieve(
          existingPayment.stripe_checkout_session_id,
        );

        if (existingSession.status === "open" && existingSession.url) {
          return NextResponse.json({ url: existingSession.url });
        }
      } catch {
        // fall through and create a fresh session
      }
    }

    const siteUrl = getSiteUrl();
    const checkoutAmountGbp = needsTopUpPayment
      ? Number(existingPayment?.top_up_due_gbp ?? 0)
      : pricing.businessTotalGbp;
    const paymentMode = needsTopUpPayment ? "top_up" : "estimated";
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      client_reference_id: booking.id,
      customer_email: actor.authUser.email ?? undefined,
      success_url: `${siteUrl}/dashboard/business/bookings/payment/success?booking=${booking.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/dashboard/business/bookings/payment/cancel?booking=${booking.id}`,
      metadata: {
        booking_id: booking.id,
        business_id: booking.business_id,
        worker_id: booking.worker_id,
        payment_mode: paymentMode,
      },
      payment_intent_data: {
        metadata: {
          booking_id: booking.id,
          business_id: booking.business_id,
          worker_id: booking.worker_id,
          payment_mode: paymentMode,
        },
        receipt_email: actor.authUser.email ?? undefined,
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "gbp",
            unit_amount: Math.round(checkoutAmountGbp * 100),
            product_data: {
              name: needsTopUpPayment ? `${requestedRole} shift top-up` : `${requestedRole} shift`,
              description: needsTopUpPayment
                ? `Top-up for approved hours on ${booking.shift_date}`
                : `${booking.shift_date} ${booking.start_time.slice(0, 5)}-${booking.end_time.slice(0, 5)}`,
            },
          },
        },
      ],
    });

    const estimatedHours = getEstimatedHours(booking);
    const approvedHoursForSettlement = booking.business_hours_approved ?? estimatedHours;
    const settlement = calculateSettlement({
      booking,
      payment: existingPayment ?? null,
      approvedHours: approvedHoursForSettlement,
    });

    await supabaseAdmin.from("payments").upsert(
      {
        booking_id: booking.id,
        business_id: booking.business_id,
        worker_id: booking.worker_id,
        currency: "GBP",
        gross_amount_gbp: needsTopUpPayment
          ? Number((existingPayment?.gross_amount_gbp ?? 0).toFixed(2))
          : pricing.businessTotalGbp,
        platform_fee_gbp: pricing.platformFeeGbp,
        worker_payout_gbp: pricing.workerPayGbp,
        payment_status: needsTopUpPayment ? "paid" : "pending",
        payout_status: needsTopUpPayment
          ? existingPayment?.payout_status ?? "not_started"
          : "not_started",
        shift_completed_at: null,
        shift_completion_confirmed_by: null,
        payout_approved_at: null,
        payout_approved_by: null,
        payout_sent_at: null,
        dispute_reason: null,
        disputed_at: null,
        failure_reason: null,
        settlement_status: settlement.settlementStatus,
        settlement_difference_gbp: settlement.settlementDifferenceGbp,
        refund_due_gbp: settlement.refundDueGbp,
        top_up_due_gbp: settlement.topUpDueGbp,
        final_gross_amount_gbp: settlement.finalGrossAmountGbp,
        final_platform_fee_gbp: settlement.finalPlatformFeeGbp,
        final_worker_payout_gbp: settlement.finalWorkerPayoutGbp,
        settlement_calculated_at: new Date().toISOString(),
        settlement_issue: settlement.reason,
        stripe_checkout_session_id: checkoutSession.id,
        stripe_checkout_url: checkoutSession.url,
        stripe_checkout_expires_at: checkoutSession.expires_at
          ? new Date(checkoutSession.expires_at * 1000).toISOString()
          : null,
      },
      { onConflict: "booking_id" },
    );

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to start Stripe checkout.";
    console.error("[booking-checkout] failed", { error });

    return NextResponse.json(
      {
        error:
          message.includes("STRIPE_SECRET_KEY") ||
          message.includes("Supabase admin environment")
            ? "Payment setup is not configured for this environment yet."
            : message,
      },
      { status: 500 },
    );
  }
}
