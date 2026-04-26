import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { sendPaymentReceivedWorkerEmail } from "@/lib/notifications/email";
import type {
  BookingRecord,
  BusinessProfileRecord,
  PaymentRecord,
  UserRecord,
  WorkerProfileRecord,
} from "@/lib/models";
import { getStripeClient, getStripeWebhookSecret } from "@/lib/stripe";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

async function updatePaymentSucceededByBooking(bookingId: string, sessionId?: string | null, paymentIntent?: string | null) {
  const supabaseAdmin = getSupabaseAdminClient();

  await supabaseAdmin
    .from("payments")
    .update({
      status: "captured",
      payout_status: "awaiting_shift_completion",
      stripe_checkout_session_id: sessionId ?? undefined,
      stripe_checkout_url: null,
      stripe_payment_intent_id: paymentIntent ?? undefined,
    })
    .eq("booking_id", bookingId);
}

async function updatePaymentSucceeded(event: Stripe.CheckoutSessionCompletedEvent) {
  const session = event.data.object;
  const bookingId = session.metadata?.booking_id;

  if (!bookingId) {
    return;
  }

  await updatePaymentSucceededByBooking(
    bookingId,
    session.id,
    typeof session.payment_intent === "string" ? session.payment_intent : null,
  );
}

async function updatePaymentIntentSucceeded(event: Stripe.PaymentIntentSucceededEvent) {
  const paymentIntent = event.data.object;
  const bookingId = paymentIntent.metadata?.booking_id;

  if (!bookingId) {
    return;
  }

  await updatePaymentSucceededByBooking(bookingId, null, paymentIntent.id);
}

async function sendPaymentReceivedForBooking(bookingId: string) {
  const supabaseAdmin = getSupabaseAdminClient();
  const [{ data: payment }, { data: booking }] = await Promise.all([
    supabaseAdmin
      .from("payments")
      .select("*")
      .eq("booking_id", bookingId)
      .maybeSingle<PaymentRecord>(),
    supabaseAdmin
      .from("bookings")
      .select("*")
      .eq("id", bookingId)
      .maybeSingle<BookingRecord>(),
  ]);

  if (!payment || !booking || payment.payout_status !== "paid") {
    return;
  }

  const [{ data: workerUser }, { data: businessProfile }] = await Promise.all([
    supabaseAdmin
      .from("users")
      .select("*")
      .eq("id", payment.worker_id)
      .maybeSingle<UserRecord>(),
    supabaseAdmin
      .from("business_profiles")
      .select("*")
      .eq("user_id", payment.business_id)
      .maybeSingle<BusinessProfileRecord>(),
  ]);

  await sendPaymentReceivedWorkerEmail({
    bookingId: booking.id,
    workerUserId: payment.worker_id,
    workerEmail: workerUser?.email ?? null,
    workerName: workerUser?.display_name ?? null,
    businessName: businessProfile?.business_name ?? "NexHyr business",
    shiftDate: booking.shift_date,
    payoutAmountGbp: payment.worker_payout_gbp,
  });
}

async function handleTransferCreated(event: Stripe.TransferCreatedEvent) {
  const transfer = event.data.object;
  const bookingId = transfer.metadata?.booking_id;

  if (!bookingId) {
    return;
  }

  await sendPaymentReceivedForBooking(bookingId);
}

async function updatePaymentFailed(
  event: Stripe.PaymentIntentPaymentFailedEvent | Stripe.CheckoutSessionAsyncPaymentFailedEvent,
) {
  const object = event.data.object;
  const bookingId = object.metadata?.booking_id;

  if (!bookingId) {
    return;
  }

  const supabaseAdmin = getSupabaseAdminClient();
  const paymentIntentId =
    object.object === "payment_intent"
      ? object.id
      : typeof object.payment_intent === "string"
        ? object.payment_intent
        : null;

  await supabaseAdmin
    .from("payments")
    .update({
      status: "failed",
      payout_status: "on_hold",
      payout_hold_reason: "Payment could not be completed.",
      stripe_payment_intent_id: paymentIntentId,
    })
    .eq("booking_id", bookingId);
}

async function syncWorkerConnectSnapshot(event: Stripe.AccountUpdatedEvent) {
  const account = event.data.object;
  const supabaseAdmin = getSupabaseAdminClient();

  const update: Partial<WorkerProfileRecord> = {
    stripe_connect_details_submitted: Boolean(account.details_submitted),
    stripe_connect_payouts_enabled: Boolean(account.payouts_enabled),
    stripe_connect_charges_enabled: Boolean(account.charges_enabled),
    stripe_connect_last_synced_at: new Date().toISOString(),
    stripe_connect_onboarding_completed_at:
      account.details_submitted && account.payouts_enabled ? new Date().toISOString() : null,
  };

  await supabaseAdmin
    .from("worker_profiles")
    .update(update)
    .eq("stripe_connect_account_id", account.id);
}

async function handlePayoutPaid(_event: Stripe.PayoutPaidEvent) {
  // Kept intentionally lightweight for MVP. Platform payout events are acknowledged
  // to keep webhook history complete without mutating booking state.
}

export async function handleStripeWebhookPost(request: NextRequest) {
  const stripeWebhookSecret = getStripeWebhookSecret();

  if (!stripeWebhookSecret) {
    return NextResponse.json({ error: "Missing webhook secret." }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  const rawBody = await request.text();
  const stripe = getStripeClient();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, stripeWebhookSecret);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Webhook signature verification failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  console.info("[stripe-webhook] received event", {
    type: event.type,
    eventId: event.id,
  });

  switch (event.type) {
    case "checkout.session.completed":
      await updatePaymentSucceeded(event);
      break;
    case "payment_intent.succeeded":
      await updatePaymentIntentSucceeded(event);
      break;
    case "payment_intent.payment_failed":
      await updatePaymentFailed(event);
      break;
    case "checkout.session.async_payment_failed":
      await updatePaymentFailed(event);
      break;
    case "account.updated":
      await syncWorkerConnectSnapshot(event);
      break;
    case "transfer.created":
      await handleTransferCreated(event);
      break;
    case "payout.paid":
      await handlePayoutPaid(event);
      break;
    default:
      break;
  }

  return NextResponse.json({ received: true });
}

export function handleStripeWebhookGet() {
  return NextResponse.json({
    ok: true,
    route: "stripe webhook",
  });
}
