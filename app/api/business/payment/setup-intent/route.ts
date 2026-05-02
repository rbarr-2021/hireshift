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
        { error: "Only businesses can add payment methods." },
        { status: 403 },
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
    const setupIntent = await stripe.setupIntents.create({
      customer: customer.id,
      usage: "off_session",
      payment_method_types: ["card"],
      metadata: {
        business_user_id: actor.authUser.id,
      },
    });

    return NextResponse.json({
      clientSecret: setupIntent.client_secret,
      customerId: customer.id,
    });
  } catch (error) {
    console.error("[business-payment-setup-intent]", error);
    return NextResponse.json(
      { error: "Payment setup is temporarily unavailable. Please contact support." },
      { status: 500 },
    );
  }
}
