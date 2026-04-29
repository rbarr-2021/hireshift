import type Stripe from "stripe";
import type { BookingRecord, PaymentRecord } from "@/lib/models";
import { getStripeClient } from "@/lib/stripe";

export type ReconciliationStatus =
  | "matched"
  | "needs_review"
  | "payment_mismatch"
  | "payout_mismatch"
  | "amount_mismatch"
  | "refund_detected"
  | "dispute_detected"
  | "missing_stripe_reference"
  | "stripe_lookup_failed";

export type ReconciliationResult = {
  status: ReconciliationStatus;
  issue: string | null;
  stripePaymentStatus: string | null;
  stripeTransferStatus: string | null;
  stripeGrossMinor: number | null;
  nexhyrGrossMinor: number | null;
  stripeTransferMinor: number | null;
  nexhyrWorkerPayoutMinor: number | null;
  referencesUsed: string[];
  metadata: Record<string, unknown>;
};

function toMinorUnits(amountGbp: number | null | undefined) {
  if (typeof amountGbp !== "number") {
    return null;
  }

  return Math.round(amountGbp * 100);
}

function mapStripePaymentStatus(input: {
  paymentIntent: Stripe.PaymentIntent | null;
  checkoutSession: Stripe.Checkout.Session | null;
}) {
  const intent = input.paymentIntent;

  if (intent?.status === "succeeded") {
    return "paid";
  }

  if (intent?.status === "canceled") {
    return "failed";
  }

  if (intent?.status === "requires_payment_method") {
    return "failed";
  }

  if (input.checkoutSession?.payment_status === "paid") {
    return "paid";
  }

  if (input.checkoutSession?.payment_status === "unpaid") {
    return "pending";
  }

  return null;
}

function mapStripeTransferStatus(
  transfer: Stripe.Transfer | null,
  transferReversed: boolean,
) {
  if (!transfer) {
    return null;
  }

  if (transferReversed) {
    return "reversed";
  }

  return "created";
}

export async function reconcilePaymentWithStripe(input: {
  booking: BookingRecord;
  payment: PaymentRecord;
}): Promise<ReconciliationResult> {
  const stripe = getStripeClient();
  const referencesUsed: string[] = [];

  let paymentIntent: Stripe.PaymentIntent | null = null;
  let checkoutSession: Stripe.Checkout.Session | null = null;
  let transfer: Stripe.Transfer | null = null;
  let refundDetected = false;
  let disputeDetected = false;
  let transferReversed = false;

  try {
    if (input.payment.stripe_payment_intent_id) {
      referencesUsed.push("stripe_payment_intent_id");
      paymentIntent = await stripe.paymentIntents.retrieve(input.payment.stripe_payment_intent_id, {
        expand: ["latest_charge"],
      });

      const latestCharge =
        typeof paymentIntent.latest_charge === "string"
          ? null
          : paymentIntent.latest_charge;

      if (latestCharge) {
        const refundedAmount = latestCharge.amount_refunded ?? 0;
        refundDetected = refundedAmount > 0 || latestCharge.refunded === true;
        disputeDetected = Boolean((latestCharge as Stripe.Charge & { dispute?: string | null }).dispute);
      }
    }

    if (input.payment.stripe_checkout_session_id) {
      referencesUsed.push("stripe_checkout_session_id");
      checkoutSession = await stripe.checkout.sessions.retrieve(input.payment.stripe_checkout_session_id);
    }

    if (input.payment.stripe_transfer_id) {
      referencesUsed.push("stripe_transfer_id");
      transfer = await stripe.transfers.retrieve(input.payment.stripe_transfer_id, {
        expand: ["reversals"],
      });
      transferReversed = (transfer.amount_reversed ?? 0) > 0;
    }
  } catch (error) {
    return {
      status: "stripe_lookup_failed",
      issue: error instanceof Error ? error.message : "Stripe lookup failed.",
      stripePaymentStatus: null,
      stripeTransferStatus: null,
      stripeGrossMinor: null,
      nexhyrGrossMinor: toMinorUnits(input.payment.gross_amount_gbp),
      stripeTransferMinor: null,
      nexhyrWorkerPayoutMinor: toMinorUnits(input.payment.worker_payout_gbp),
      referencesUsed,
      metadata: {
        booking_id: input.booking.id,
        payment_id: input.payment.id,
      },
    };
  }

  if (referencesUsed.length === 0) {
    return {
      status: "missing_stripe_reference",
      issue: "No Stripe payment or transfer reference is stored on this payment.",
      stripePaymentStatus: null,
      stripeTransferStatus: null,
      stripeGrossMinor: null,
      nexhyrGrossMinor: toMinorUnits(input.payment.gross_amount_gbp),
      stripeTransferMinor: null,
      nexhyrWorkerPayoutMinor: toMinorUnits(input.payment.worker_payout_gbp),
      referencesUsed,
      metadata: {
        booking_id: input.booking.id,
        payment_id: input.payment.id,
      },
    };
  }

  const stripePaymentStatus = mapStripePaymentStatus({ paymentIntent, checkoutSession });
  const stripeTransferStatus = mapStripeTransferStatus(transfer, transferReversed);
  const nexhyrPaymentStatus = input.payment.payment_status ?? input.payment.status;
  const nexhyrPayoutStatus = input.payment.payout_status;

  const stripeGrossMinor =
    paymentIntent?.amount_received ??
    checkoutSession?.amount_total ??
    null;
  const nexhyrGrossMinor = toMinorUnits(input.payment.gross_amount_gbp);
  const stripeTransferMinor = transfer?.amount ?? null;
  const nexhyrWorkerPayoutMinor = toMinorUnits(input.payment.worker_payout_gbp);

  let status: ReconciliationStatus = "matched";
  let issue: string | null = null;

  if (disputeDetected) {
    status = "dispute_detected";
    issue = "Stripe shows a dispute on this payment.";
  } else if (refundDetected) {
    status = "refund_detected";
    issue = "Stripe shows this payment has been refunded.";
  } else if (stripePaymentStatus === "paid" && nexhyrPaymentStatus !== "paid") {
    status = "payment_mismatch";
    issue = "Stripe payment succeeded but NexHyr payment status is not paid.";
  } else if (nexhyrPaymentStatus === "paid" && stripePaymentStatus && stripePaymentStatus !== "paid") {
    status = "payment_mismatch";
    issue = "NexHyr shows paid but Stripe does not confirm successful payment.";
  } else if (
    typeof stripeGrossMinor === "number" &&
    typeof nexhyrGrossMinor === "number" &&
    stripeGrossMinor !== nexhyrGrossMinor
  ) {
    status = "amount_mismatch";
    issue = "Gross amount differs between Stripe and NexHyr.";
  } else if (
    typeof stripeTransferMinor === "number" &&
    typeof nexhyrWorkerPayoutMinor === "number" &&
    stripeTransferMinor !== nexhyrWorkerPayoutMinor
  ) {
    status = "amount_mismatch";
    issue = "Worker payout amount differs between Stripe transfer and NexHyr.";
  } else if (
    stripeTransferStatus === "created" &&
    !(nexhyrPayoutStatus === "in_progress" || nexhyrPayoutStatus === "completed")
  ) {
    status = "payout_mismatch";
    issue = "Stripe transfer exists but NexHyr payout status is not in progress/completed.";
  } else if (
    nexhyrPayoutStatus === "completed" &&
    stripeTransferStatus !== "created"
  ) {
    status = "payout_mismatch";
    issue = "NexHyr shows payout completed but Stripe transfer is not confirmed.";
  }

  return {
    status,
    issue,
    stripePaymentStatus,
    stripeTransferStatus,
    stripeGrossMinor,
    nexhyrGrossMinor,
    stripeTransferMinor,
    nexhyrWorkerPayoutMinor,
    referencesUsed,
    metadata: {
      booking_id: input.booking.id,
      payment_id: input.payment.id,
      stripe_payment_intent_id: input.payment.stripe_payment_intent_id,
      stripe_checkout_session_id: input.payment.stripe_checkout_session_id,
      stripe_transfer_id: input.payment.stripe_transfer_id,
      nexhyr_payment_status: nexhyrPaymentStatus,
      nexhyr_payout_status: nexhyrPayoutStatus,
      stripe_payment_status: stripePaymentStatus,
      stripe_transfer_status: stripeTransferStatus,
      stripe_gross_minor: stripeGrossMinor,
      nexhyr_gross_minor: nexhyrGrossMinor,
      stripe_transfer_minor: stripeTransferMinor,
      nexhyr_worker_payout_minor: nexhyrWorkerPayoutMinor,
    },
  };
}
