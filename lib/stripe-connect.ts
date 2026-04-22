import type Stripe from "stripe";
import type { PaymentRecord, WorkerProfileRecord } from "@/lib/models";
import { getStripeClient } from "@/lib/stripe";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

type WorkerStripeConnectSnapshot = Pick<
  WorkerProfileRecord,
  | "stripe_connect_account_id"
  | "stripe_connect_details_submitted"
  | "stripe_connect_payouts_enabled"
  | "stripe_connect_charges_enabled"
  | "stripe_connect_onboarding_completed_at"
  | "stripe_connect_last_synced_at"
>;

function buildWorkerStripeConnectSnapshot(
  account: Stripe.Account,
): WorkerStripeConnectSnapshot {
  return {
    stripe_connect_account_id: account.id,
    stripe_connect_details_submitted: Boolean(account.details_submitted),
    stripe_connect_payouts_enabled: Boolean(account.payouts_enabled),
    stripe_connect_charges_enabled: Boolean(account.charges_enabled),
    stripe_connect_onboarding_completed_at:
      account.details_submitted && account.payouts_enabled
        ? new Date().toISOString()
        : null,
    stripe_connect_last_synced_at: new Date().toISOString(),
  };
}

export async function ensureWorkerStripeConnectAccount(input: {
  workerId: string;
  email: string | null;
  currentAccountId: string | null;
}) {
  const stripe = getStripeClient();

  if (input.currentAccountId) {
    const account = await stripe.accounts.retrieve(input.currentAccountId);
    return { account, isNew: false };
  }

  const account = await stripe.accounts.create({
    type: "express",
    country: "GB",
    email: input.email ?? undefined,
    capabilities: {
      transfers: {
        requested: true,
      },
    },
    business_type: "individual",
    metadata: {
      worker_user_id: input.workerId,
    },
  });

  return { account, isNew: true };
}

export async function syncWorkerStripeConnectAccount(input: {
  workerId: string;
  accountId: string;
}) {
  const stripe = getStripeClient();
  const supabaseAdmin = getSupabaseAdminClient();
  const account = await stripe.accounts.retrieve(input.accountId);
  const snapshot = buildWorkerStripeConnectSnapshot(account);

  await supabaseAdmin
    .from("worker_profiles")
    .update(snapshot)
    .eq("user_id", input.workerId);

  return { account, snapshot };
}

export async function createWorkerStripeOnboardingLink(input: {
  accountId: string;
  returnUrl: string;
  refreshUrl: string;
}) {
  const stripe = getStripeClient();
  return stripe.accountLinks.create({
    account: input.accountId,
    refresh_url: input.refreshUrl,
    return_url: input.returnUrl,
    type: "account_onboarding",
  });
}

export async function createWorkerStripeLoginLink(accountId: string) {
  const stripe = getStripeClient();
  return stripe.accounts.createLoginLink(accountId);
}

async function getTransferSourceTransaction(paymentIntentId: string) {
  const stripe = getStripeClient();
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ["latest_charge"],
  });

  if (typeof paymentIntent.latest_charge === "string") {
    return paymentIntent.latest_charge;
  }

  return paymentIntent.latest_charge?.id ?? null;
}

export async function tryAutomaticWorkerPayoutTransfer(input: {
  payment: PaymentRecord;
  workerProfile: WorkerProfileRecord;
}) {
  const supabaseAdmin = getSupabaseAdminClient();

  if (input.payment.stripe_transfer_id) {
    return {
      success: true as const,
      state: "already_paid" as const,
      message: "Worker payout has already been transferred.",
    };
  }

  const accountId = input.workerProfile.stripe_connect_account_id;

  if (!accountId) {
    await supabaseAdmin
      .from("payments")
      .update({
        payout_status: "on_hold",
        payout_hold_reason: "Worker payout details still need to be connected in Stripe.",
      })
      .eq("id", input.payment.id);

    return {
      success: false as const,
      state: "missing_account" as const,
      message: "Worker payout details still need to be connected in Stripe.",
    };
  }

  const { account, snapshot } = await syncWorkerStripeConnectAccount({
    workerId: input.workerProfile.user_id,
    accountId,
  });

  if (!snapshot.stripe_connect_details_submitted || !snapshot.stripe_connect_payouts_enabled) {
    await supabaseAdmin
      .from("payments")
      .update({
        payout_status: "on_hold",
        payout_hold_reason:
          "Worker payout account setup is incomplete. Ask the worker to finish Stripe onboarding.",
      })
      .eq("id", input.payment.id);

    return {
      success: false as const,
      state: "account_incomplete" as const,
      message:
        account.requirements?.currently_due?.length
          ? "Worker payout account setup is still incomplete in Stripe."
          : "Worker payout account setup is incomplete. Ask the worker to finish Stripe onboarding.",
    };
  }

  if (!input.payment.stripe_payment_intent_id) {
    await supabaseAdmin
      .from("payments")
      .update({
        payout_status: "on_hold",
        payout_hold_reason: "Missing Stripe payment reference for this payout.",
      })
      .eq("id", input.payment.id);

    return {
      success: false as const,
      state: "missing_payment_intent" as const,
      message: "Missing Stripe payment reference for this payout.",
    };
  }

  const sourceTransaction = await getTransferSourceTransaction(
    input.payment.stripe_payment_intent_id,
  );

  if (!sourceTransaction) {
    await supabaseAdmin
      .from("payments")
      .update({
        payout_status: "on_hold",
        payout_hold_reason: "Stripe charge is not ready for transfer yet.",
      })
      .eq("id", input.payment.id);

    return {
      success: false as const,
      state: "source_not_ready" as const,
      message: "Stripe charge is not ready for transfer yet.",
    };
  }

  const stripe = getStripeClient();
  const transfer = await stripe.transfers.create({
    amount: Math.round(input.payment.worker_payout_gbp * 100),
    currency: input.payment.currency.toLowerCase(),
    destination: account.id,
    source_transaction: sourceTransaction,
    transfer_group: `booking:${input.payment.booking_id}`,
    metadata: {
      booking_id: input.payment.booking_id,
      payment_id: input.payment.id,
      worker_id: input.payment.worker_id,
      business_id: input.payment.business_id,
    },
  });

  await supabaseAdmin
    .from("payments")
    .update({
      stripe_transfer_id: transfer.id,
      payout_status: "paid",
      payout_sent_at: new Date().toISOString(),
      payout_hold_reason: null,
      dispute_reason: null,
      disputed_at: null,
      status: input.payment.status === "captured" ? "released" : input.payment.status,
    })
    .eq("id", input.payment.id);

  return {
    success: true as const,
    state: "paid" as const,
    message: "Worker payout sent through Stripe.",
    transferId: transfer.id,
  };
}
