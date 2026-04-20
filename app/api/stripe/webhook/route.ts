import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripeClient, getStripeWebhookSecret } from "@/lib/stripe";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function updatePaymentSucceeded(event: Stripe.CheckoutSessionCompletedEvent) {
  const session = event.data.object;
  const bookingId = session.metadata?.booking_id;

  if (!bookingId) {
    return;
  }

  const supabaseAdmin = getSupabaseAdminClient();

  await supabaseAdmin
    .from("payments")
    .update({
      status: "captured",
      stripe_checkout_session_id: session.id,
      stripe_checkout_url: null,
      stripe_checkout_expires_at: session.expires_at
        ? new Date(session.expires_at * 1000).toISOString()
        : null,
      stripe_payment_intent_id:
        typeof session.payment_intent === "string" ? session.payment_intent : null,
    })
    .eq("booking_id", bookingId);
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
      stripe_payment_intent_id: paymentIntentId,
    })
    .eq("booking_id", bookingId);
}

export async function POST(request: NextRequest) {
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

  switch (event.type) {
    case "checkout.session.completed":
      await updatePaymentSucceeded(event);
      break;
    case "payment_intent.payment_failed":
      await updatePaymentFailed(event);
      break;
    case "checkout.session.async_payment_failed":
      await updatePaymentFailed(event);
      break;
    default:
      break;
  }

  return NextResponse.json({ received: true });
}

