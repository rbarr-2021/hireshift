import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import type {
  PaymentRecord,
  WorkerProfileRecord,
} from "@/lib/models";
import { getStripeClient, getStripeWebhookSecret } from "@/lib/stripe";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

type WebhookOutcome = {
  bookingId: string | null;
  paymentId: string | null;
  matched: boolean;
  note?: string;
};

type PaymentLookupIdentifiers = {
  bookingId?: string | null;
  paymentId?: string | null;
  paymentIntentId?: string | null;
  checkoutSessionId?: string | null;
  transferId?: string | null;
};

function getPaymentStatus(payment: PaymentRecord) {
  const row = payment as PaymentRecord & { payment_status?: string | null };
  return row.payment_status ?? payment.status ?? null;
}

function buildBaseEventMetadata(event: Stripe.Event) {
  return {
    stripe_event_id: event.id,
    livemode: event.livemode,
    object_type: event.data.object.object,
    object_id: "id" in event.data.object ? event.data.object.id : null,
    created_unix: event.created,
  };
}

function withOutcomeMetadata(base: Record<string, unknown>, outcome: WebhookOutcome) {
  return {
    ...base,
    matched: outcome.matched,
    booking_id: outcome.bookingId,
    payment_id: outcome.paymentId,
    note: outcome.note ?? null,
  };
}

async function findPaymentByIdentifiers(identifiers: PaymentLookupIdentifiers) {
  const supabaseAdmin = getSupabaseAdminClient();

  if (identifiers.paymentId) {
    const { data } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("id", identifiers.paymentId)
      .maybeSingle<PaymentRecord>();

    if (data) {
      return data;
    }
  }

  if (identifiers.bookingId) {
    const { data } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("booking_id", identifiers.bookingId)
      .maybeSingle<PaymentRecord>();

    if (data) {
      return data;
    }
  }

  if (identifiers.paymentIntentId) {
    const { data } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("stripe_payment_intent_id", identifiers.paymentIntentId)
      .maybeSingle<PaymentRecord>();

    if (data) {
      return data;
    }
  }

  if (identifiers.checkoutSessionId) {
    const { data } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("stripe_checkout_session_id", identifiers.checkoutSessionId)
      .maybeSingle<PaymentRecord>();

    if (data) {
      return data;
    }
  }

  if (identifiers.transferId) {
    const { data } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("stripe_transfer_id", identifiers.transferId)
      .maybeSingle<PaymentRecord>();

    if (data) {
      return data;
    }
  }

  return null;
}

async function createPaymentEventLog(input: {
  stripeEventId: string;
  eventType: string;
  metadata: Record<string, unknown>;
}) {
  const supabaseAdmin = getSupabaseAdminClient();
  const { error } = await supabaseAdmin.from("payment_events").insert({
    event_type: input.eventType,
    source: "stripe",
    stripe_event_id: input.stripeEventId,
    metadata: input.metadata,
  });

  if (!error) {
    return { duplicate: false as const };
  }

  if (error.code === "23505") {
    return { duplicate: true as const };
  }

  throw error;
}

async function updatePaymentEventLog(input: {
  stripeEventId: string;
  bookingId: string | null;
  paymentId: string | null;
  metadata: Record<string, unknown>;
}) {
  const supabaseAdmin = getSupabaseAdminClient();

  await supabaseAdmin
    .from("payment_events")
    .update({
      booking_id: input.bookingId,
      payment_id: input.paymentId,
      metadata: input.metadata,
    })
    .eq("stripe_event_id", input.stripeEventId);
}

async function updatePaymentSucceededByBooking(
  bookingId: string,
  sessionId?: string | null,
  paymentIntent?: string | null,
) {
  const supabaseAdmin = getSupabaseAdminClient();

  const { data } = await supabaseAdmin
    .from("payments")
    .update({
      payment_status: "paid",
      payout_status: "pending",
      stripe_checkout_session_id: sessionId ?? undefined,
      stripe_checkout_url: null,
      stripe_payment_intent_id: paymentIntent ?? undefined,
      failure_reason: null,
      transfer_failed_at: null,
    })
    .eq("booking_id", bookingId)
    .select("*")
    .maybeSingle<PaymentRecord>();

  return data ?? null;
}

async function updatePaymentSucceeded(event: Stripe.CheckoutSessionCompletedEvent): Promise<WebhookOutcome> {
  const session = event.data.object;
  const bookingId = session.metadata?.booking_id;

  if (!bookingId) {
    return {
      bookingId: null,
      paymentId: null,
      matched: false,
      note: "checkout.session.completed missing booking metadata.",
    };
  }

  const payment = await updatePaymentSucceededByBooking(
    bookingId,
    session.id,
    typeof session.payment_intent === "string" ? session.payment_intent : null,
  );

  return {
    bookingId,
    paymentId: payment?.id ?? null,
    matched: Boolean(payment),
    note: payment ? undefined : "No payment row matched booking_id for checkout completion.",
  };
}

async function updatePaymentIntentSucceeded(
  event: Stripe.PaymentIntentSucceededEvent,
): Promise<WebhookOutcome> {
  const paymentIntent = event.data.object;
  const bookingId = paymentIntent.metadata?.booking_id;

  if (!bookingId) {
    const payment = await findPaymentByIdentifiers({
      paymentIntentId: paymentIntent.id,
    });

    if (!payment) {
      return {
        bookingId: null,
        paymentId: null,
        matched: false,
        note: "payment_intent.succeeded could not map to payment row.",
      };
    }

    await updatePaymentSucceededByBooking(payment.booking_id, null, paymentIntent.id);

    return {
      bookingId: payment.booking_id,
      paymentId: payment.id,
      matched: true,
      note: "Matched by stripe_payment_intent_id.",
    };
  }

  const payment = await updatePaymentSucceededByBooking(bookingId, null, paymentIntent.id);
  return {
    bookingId,
    paymentId: payment?.id ?? null,
    matched: Boolean(payment),
    note: payment ? undefined : "No payment row matched booking_id for payment intent success.",
  };
}

async function updatePaymentFailed(
  event: Stripe.PaymentIntentPaymentFailedEvent | Stripe.CheckoutSessionAsyncPaymentFailedEvent,
): Promise<WebhookOutcome> {
  const object = event.data.object;
  const bookingId = object.metadata?.booking_id ?? null;

  const paymentIntentId =
    object.object === "payment_intent"
      ? object.id
      : typeof object.payment_intent === "string"
        ? object.payment_intent
        : null;

  const payment = await findPaymentByIdentifiers({
    bookingId,
    paymentIntentId,
    checkoutSessionId: object.object === "checkout.session" ? object.id : null,
  });

  if (!payment) {
    return {
      bookingId,
      paymentId: null,
      matched: false,
      note: "Payment failure event could not map to an existing payment row.",
    };
  }

  const supabaseAdmin = getSupabaseAdminClient();

  await supabaseAdmin.from("payments").update({
    payment_status: "failed",
    payout_status: "on_hold",
    failure_reason: "Payment could not be completed.",
    stripe_payment_intent_id: paymentIntentId ?? payment.stripe_payment_intent_id,
  }).eq("id", payment.id);

  return {
    bookingId: payment.booking_id,
    paymentId: payment.id,
    matched: true,
  };
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
      account.charges_enabled && account.payouts_enabled ? new Date().toISOString() : null,
  };

  await supabaseAdmin
    .from("worker_profiles")
    .update(update)
    .eq("stripe_connect_account_id", account.id);
}

async function handleTransferCreated(event: Stripe.TransferCreatedEvent): Promise<WebhookOutcome> {
  const transfer = event.data.object;
  const payment = await findPaymentByIdentifiers({
    bookingId: transfer.metadata?.booking_id ?? null,
    paymentId: transfer.metadata?.payment_id ?? null,
    transferId: transfer.id,
  });

  if (!payment) {
    return {
      bookingId: transfer.metadata?.booking_id ?? null,
      paymentId: null,
      matched: false,
      note: "transfer.created did not match an existing payment row.",
    };
  }

  if (!payment.stripe_transfer_id) {
    const supabaseAdmin = getSupabaseAdminClient();
    await supabaseAdmin
      .from("payments")
      .update({
        stripe_transfer_id: transfer.id,
        payout_status: "in_progress",
        transfer_started_at: new Date().toISOString(),
        transfer_failed_at: null,
        failure_reason: null,
      })
      .eq("id", payment.id);
  }

  return {
    bookingId: payment.booking_id,
    paymentId: payment.id,
    matched: true,
  };
}

async function handlePayoutPaid(event: Stripe.PayoutPaidEvent): Promise<WebhookOutcome> {
  const payout = event.data.object;
  const payoutMetadata = payout.metadata ?? {};

  // Stripe payout events are account-level settlements and are not reliably mappable
  // to a single booking in the current model. We log only; no payout completion mutation.
  const payment = await findPaymentByIdentifiers({
    bookingId: payoutMetadata.booking_id ?? null,
    paymentId: payoutMetadata.payment_id ?? null,
    transferId: payoutMetadata.transfer_id ?? null,
  });

  return {
    bookingId: payment?.booking_id ?? (payoutMetadata.booking_id ?? null),
    paymentId: payment?.id ?? null,
    matched: Boolean(payment),
    note:
      "payout.paid logged only. No automatic completion update applied because account-level payout mapping is not guaranteed.",
  };
}

async function handleChargeRefunded(event: Stripe.Event): Promise<WebhookOutcome> {
  const charge = event.data.object as Stripe.Charge;

  const payment = await findPaymentByIdentifiers({
    paymentIntentId:
      typeof charge.payment_intent === "string" ? charge.payment_intent : null,
    bookingId: charge.metadata?.booking_id ?? null,
    paymentId: charge.metadata?.payment_id ?? null,
  });

  if (!payment) {
    return {
      bookingId: charge.metadata?.booking_id ?? null,
      paymentId: null,
      matched: false,
      note: "charge.refunded unmatched; logged for admin review.",
    };
  }

  const supabaseAdmin = getSupabaseAdminClient();
  await supabaseAdmin
    .from("payments")
    .update({
      payment_status: "refunded",
      payout_status: "on_hold",
      failure_reason: "Charge refunded in Stripe.",
    })
    .eq("id", payment.id);

  return {
    bookingId: payment.booking_id,
    paymentId: payment.id,
    matched: true,
  };
}

async function handleRefundUpdated(event: Stripe.Event): Promise<WebhookOutcome> {
  const refund = event.data.object as Stripe.Refund;

  const paymentIntentId =
    "payment_intent" in refund && typeof refund.payment_intent === "string"
      ? refund.payment_intent
      : null;

  const payment = await findPaymentByIdentifiers({
    paymentIntentId,
    bookingId: refund.metadata?.booking_id ?? null,
    paymentId: refund.metadata?.payment_id ?? null,
  });

  if (!payment) {
    return {
      bookingId: refund.metadata?.booking_id ?? null,
      paymentId: null,
      matched: false,
      note: "refund.updated unmatched; logged for admin review.",
    };
  }

  const supabaseAdmin = getSupabaseAdminClient();
  await supabaseAdmin
    .from("payments")
    .update({
      payment_status:
        refund.status === "succeeded" ? "refunded" : getPaymentStatus(payment) ?? "pending",
      payout_status: "on_hold",
      failure_reason:
        refund.status === "failed"
          ? "Refund attempt failed in Stripe."
          : "Refund update received from Stripe.",
    })
    .eq("id", payment.id);

  return {
    bookingId: payment.booking_id,
    paymentId: payment.id,
    matched: true,
  };
}

async function handleDisputeEvent(event: Stripe.Event): Promise<WebhookOutcome> {
  const dispute = event.data.object as Stripe.Dispute;
  const paymentIntentId =
    "payment_intent" in dispute && typeof dispute.payment_intent === "string"
      ? dispute.payment_intent
      : null;

  const payment = await findPaymentByIdentifiers({
    paymentIntentId,
    bookingId: dispute.metadata?.booking_id ?? null,
    paymentId: dispute.metadata?.payment_id ?? null,
  });

  if (!payment) {
    return {
      bookingId: dispute.metadata?.booking_id ?? null,
      paymentId: null,
      matched: false,
      note: `${event.type} unmatched; logged for admin review.`,
    };
  }

  const reason = dispute.reason || "Payment dispute opened in Stripe.";
  const supabaseAdmin = getSupabaseAdminClient();
  await supabaseAdmin
    .from("payments")
    .update({
      payment_status: "disputed",
      payout_status: "on_hold",
      dispute_reason: `Stripe dispute (${event.type}): ${reason}`,
      disputed_at: new Date().toISOString(),
      failure_reason: "Payout paused while this Stripe dispute is reviewed.",
    })
    .eq("id", payment.id);

  return {
    bookingId: payment.booking_id,
    paymentId: payment.id,
    matched: true,
  };
}

async function handleTransferFailed(event: Stripe.Event): Promise<WebhookOutcome> {
  const transfer = event.data.object as unknown as Stripe.Transfer;
  const payment = await findPaymentByIdentifiers({
    bookingId: transfer.metadata?.booking_id ?? null,
    paymentId: transfer.metadata?.payment_id ?? null,
    transferId: transfer.id,
  });

  if (!payment) {
    return {
      bookingId: transfer.metadata?.booking_id ?? null,
      paymentId: null,
      matched: false,
      note: "transfer.failed unmatched; logged for admin review.",
    };
  }

  const supabaseAdmin = getSupabaseAdminClient();
  await supabaseAdmin
    .from("payments")
    .update({
      payout_status: "failed",
      transfer_failed_at: new Date().toISOString(),
      failure_reason: "Stripe reported transfer.failed.",
    })
    .eq("id", payment.id);

  return {
    bookingId: payment.booking_id,
    paymentId: payment.id,
    matched: true,
  };
}

async function handleTransferReversed(event: Stripe.Event): Promise<WebhookOutcome> {
  const reversal = event.data.object as unknown as Stripe.TransferReversal;
  const transferId = typeof reversal.transfer === "string" ? reversal.transfer : null;
  const payment = await findPaymentByIdentifiers({
    bookingId: reversal.metadata?.booking_id ?? null,
    paymentId: reversal.metadata?.payment_id ?? null,
    transferId,
  });

  if (!payment) {
    return {
      bookingId: reversal.metadata?.booking_id ?? null,
      paymentId: null,
      matched: false,
      note: "transfer.reversed unmatched; logged for admin review.",
    };
  }

  const supabaseAdmin = getSupabaseAdminClient();
  await supabaseAdmin
    .from("payments")
    .update({
      payout_status: "on_hold",
      transfer_failed_at: new Date().toISOString(),
      failure_reason: "Stripe reported transfer.reversed.",
    })
    .eq("id", payment.id);

  return {
    bookingId: payment.booking_id,
    paymentId: payment.id,
    matched: true,
  };
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

  const baseMetadata = buildBaseEventMetadata(event);
  const eventLog = await createPaymentEventLog({
    stripeEventId: event.id,
    eventType: event.type,
    metadata: baseMetadata,
  });

  if (eventLog.duplicate) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  let outcome: WebhookOutcome = {
    bookingId: null,
    paymentId: null,
    matched: false,
    note: "Event logged with no payment mutation required.",
  };

  const eventType = event.type as string;

  switch (eventType) {
    case "checkout.session.completed":
      outcome = await updatePaymentSucceeded(event as Stripe.CheckoutSessionCompletedEvent);
      break;
    case "payment_intent.succeeded":
      outcome = await updatePaymentIntentSucceeded(event as Stripe.PaymentIntentSucceededEvent);
      break;
    case "payment_intent.payment_failed":
      outcome = await updatePaymentFailed(event as Stripe.PaymentIntentPaymentFailedEvent);
      break;
    case "checkout.session.async_payment_failed":
      outcome = await updatePaymentFailed(event as Stripe.CheckoutSessionAsyncPaymentFailedEvent);
      break;
    case "account.updated":
      await syncWorkerConnectSnapshot(event as Stripe.AccountUpdatedEvent);
      outcome = {
        bookingId: null,
        paymentId: null,
        matched: false,
        note: "Worker Stripe Connect snapshot synced.",
      };
      break;
    case "transfer.created":
      outcome = await handleTransferCreated(event as Stripe.TransferCreatedEvent);
      break;
    case "transfer.failed":
      outcome = await handleTransferFailed(event);
      break;
    case "transfer.reversed":
      outcome = await handleTransferReversed(event);
      break;
    case "payout.paid":
      outcome = await handlePayoutPaid(event as Stripe.PayoutPaidEvent);
      break;
    case "charge.refunded":
      outcome = await handleChargeRefunded(event);
      break;
    case "refund.updated":
      outcome = await handleRefundUpdated(event);
      break;
    case "charge.dispute.created":
    case "charge.dispute.updated":
    case "charge.dispute.closed":
      outcome = await handleDisputeEvent(event);
      break;
    default:
      break;
  }

  await updatePaymentEventLog({
    stripeEventId: event.id,
    bookingId: outcome.bookingId,
    paymentId: outcome.paymentId,
    metadata: withOutcomeMetadata(baseMetadata, outcome),
  });

  return NextResponse.json({ received: true });
}

export function handleStripeWebhookGet() {
  return NextResponse.json({
    ok: true,
    route: "stripe webhook",
  });
}
