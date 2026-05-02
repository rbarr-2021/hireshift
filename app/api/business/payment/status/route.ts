import { NextRequest, NextResponse } from "next/server";
import type { BusinessProfileRecord } from "@/lib/models";
import { getBusinessPaymentMethodStatus } from "@/lib/business-payment-method";
import { getRouteActor } from "@/lib/route-access";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const actor = await getRouteActor(request);

    if (!actor) {
      return NextResponse.json({ error: "Please log in again." }, { status: 401 });
    }

    if (actor.appUser.role !== "business") {
      return NextResponse.json(
        { error: "Only businesses can view payment setup status." },
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
        { error: "Please complete your business profile first." },
        { status: 400 },
      );
    }

    const status = await getBusinessPaymentMethodStatus({
      profile: businessProfile,
    });

    if (
      status.paymentMethodReady &&
      businessProfile.stripe_default_payment_method_id !== status.paymentMethodId
    ) {
      await supabaseAdmin
        .from("business_profiles")
        .update({
          stripe_default_payment_method_id: status.paymentMethodId,
          stripe_payment_method_ready_at: new Date().toISOString(),
          stripe_payment_method_last_error: null,
          stripe_payment_method_last_synced_at: new Date().toISOString(),
        })
        .eq("user_id", actor.authUser.id);
    }

    return NextResponse.json({
      status: status.paymentMethodReady
        ? "payment_method_ready"
        : "payment_method_required",
      paymentMethodReady: status.paymentMethodReady,
      paymentMethodBrand: status.paymentMethodBrand,
      paymentMethodLast4: status.paymentMethodLast4,
    });
  } catch (error) {
    console.error("[business-payment-status]", error);
    return NextResponse.json(
      { error: "Payment status is temporarily unavailable. Please try again." },
      { status: 500 },
    );
  }
}
