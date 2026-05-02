import { NextRequest, NextResponse } from "next/server";
import type { BusinessProfileRecord } from "@/lib/models";
import { ensureBusinessStripeCustomer } from "@/lib/business-payment-method";
import { getRouteActor } from "@/lib/route-access";
import { getStripeClient } from "@/lib/stripe";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const actor = await getRouteActor(request);

    if (!actor) {
      return NextResponse.json({ error: "Please log in again." }, { status: 401 });
    }

    if (actor.appUser.role !== "business") {
      return NextResponse.json(
        { error: "Only businesses can confirm payment methods." },
        { status: 403 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      setupIntentId?: string;
      paymentMethodId?: string;
    };

    const setupIntentId = body.setupIntentId?.trim();
    const manualPaymentMethodId = body.paymentMethodId?.trim() ?? null;

    if (!setupIntentId && !manualPaymentMethodId) {
      return NextResponse.json(
        { error: "Missing payment method confirmation details." },
        { status: 400 },
      );
    }

    const supabaseAdmin = getSupabaseAdminClient();
    const { data: businessProfile } = await supabaseAdmin
      .from("business_profiles")
      .select("*")
      .eq("user_id", actor.authUser.id)
      .maybeSingle<BusinessProfileRecord>();

    if (!businessProfile) {
      return NextResponse.json(
        { error: "Please complete your business profile before adding payment details." },
        { status: 400 },
      );
    }

    const customer = await ensureBusinessStripeCustomer({
      businessUserId: actor.authUser.id,
      businessEmail: actor.authUser.email,
      profile: businessProfile,
    });

    const stripe = getStripeClient();
    let paymentMethodId = manualPaymentMethodId;

    if (!paymentMethodId && setupIntentId) {
      const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
      if (setupIntent.status !== "succeeded") {
        return NextResponse.json(
          { error: "Payment setup is still pending. Please complete the card form first." },
          { status: 409 },
        );
      }
      paymentMethodId =
        typeof setupIntent.payment_method === "string"
          ? setupIntent.payment_method
          : setupIntent.payment_method?.id ?? null;
    }

    if (!paymentMethodId) {
      return NextResponse.json(
        { error: "Payment method could not be confirmed." },
        { status: 400 },
      );
    }

    await stripe.customers.update(customer.id, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    await supabaseAdmin
      .from("business_profiles")
      .update({
        stripe_customer_id: customer.id,
        stripe_default_payment_method_id: paymentMethodId,
        stripe_payment_method_ready_at: new Date().toISOString(),
        stripe_payment_method_last_error: null,
        stripe_payment_method_last_synced_at: new Date().toISOString(),
      })
      .eq("user_id", actor.authUser.id);

    return NextResponse.json({
      paymentMethodReady: true,
      paymentMethodId,
      status: "payment_method_ready",
    });
  } catch (error) {
    console.error("[business-payment-confirm-method]", error);
    return NextResponse.json(
      { error: "Payment setup is temporarily unavailable. Please contact support." },
      { status: 500 },
    );
  }
}
