import type Stripe from "stripe";
import type { BusinessProfileRecord } from "@/lib/models";
import { getStripeClient } from "@/lib/stripe";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export type BusinessPaymentMethodStatus = {
  customerId: string | null;
  paymentMethodId: string | null;
  paymentMethodReady: boolean;
  paymentMethodBrand: string | null;
  paymentMethodLast4: string | null;
};

function buildBusinessName(profile: BusinessProfileRecord | null, fallbackEmail: string | null) {
  return (
    profile?.business_name?.trim() ||
    profile?.contact_name?.trim() ||
    fallbackEmail?.trim() ||
    "NexHyr business"
  );
}

export async function ensureBusinessStripeCustomer(input: {
  businessUserId: string;
  businessEmail: string | null;
  profile: BusinessProfileRecord | null;
}) {
  const stripe = getStripeClient();

  if (input.profile?.stripe_customer_id) {
    try {
      const existing = await stripe.customers.retrieve(input.profile.stripe_customer_id);
      if (!("deleted" in existing)) {
        return existing;
      }
    } catch {
      // fall through to create a replacement customer in the current Stripe mode.
    }
  }

  const customer = await stripe.customers.create({
    email: input.businessEmail ?? undefined,
    name: buildBusinessName(input.profile, input.businessEmail),
    metadata: {
      business_user_id: input.businessUserId,
    },
  });

  const supabaseAdmin = getSupabaseAdminClient();
  await supabaseAdmin
    .from("business_profiles")
    .update({
      stripe_customer_id: customer.id,
      stripe_payment_method_last_synced_at: new Date().toISOString(),
    })
    .eq("user_id", input.businessUserId);

  return customer;
}

function readCardSummary(paymentMethod: Stripe.PaymentMethod | null) {
  return {
    paymentMethodBrand: paymentMethod?.card?.brand ?? null,
    paymentMethodLast4: paymentMethod?.card?.last4 ?? null,
  };
}

export async function getBusinessPaymentMethodStatus(input: {
  profile: BusinessProfileRecord | null;
}): Promise<BusinessPaymentMethodStatus> {
  const stripe = getStripeClient();
  const customerId = input.profile?.stripe_customer_id ?? null;
  const configuredPaymentMethodId = input.profile?.stripe_default_payment_method_id ?? null;

  if (!customerId) {
    return {
      customerId: null,
      paymentMethodId: null,
      paymentMethodReady: false,
      paymentMethodBrand: null,
      paymentMethodLast4: null,
    };
  }

  let paymentMethod: Stripe.PaymentMethod | null = null;

  if (configuredPaymentMethodId) {
    try {
      const retrieved = await stripe.paymentMethods.retrieve(configuredPaymentMethodId);
      paymentMethod = retrieved;
    } catch {
      paymentMethod = null;
    }
  }

  if (!paymentMethod) {
    const methods = await stripe.paymentMethods.list({
      customer: customerId,
      type: "card",
      limit: 1,
    });
    paymentMethod = methods.data[0] ?? null;
  }

  const summary = readCardSummary(paymentMethod);

  return {
    customerId,
    paymentMethodId: paymentMethod?.id ?? null,
    paymentMethodReady: Boolean(paymentMethod?.id),
    paymentMethodBrand: summary.paymentMethodBrand,
    paymentMethodLast4: summary.paymentMethodLast4,
  };
}
