import { NextRequest, NextResponse } from "next/server";
import type { PlatformPaymentControlsRecord } from "@/lib/models";
import {
  getPlatformPaymentControls,
  validatePositiveOrNull,
  withDefaultPlatformPaymentControls,
} from "@/lib/platform-payment-controls";
import { getRouteActor, isAdminUser } from "@/lib/route-access";
import { getStripeModeDiagnostics } from "@/lib/stripe-config";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const actor = await getRouteActor(request);

  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await isAdminUser(actor.authUser.id))) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const controls = withDefaultPlatformPaymentControls(await getPlatformPaymentControls());
  const stripeMode = getStripeModeDiagnostics();

  return NextResponse.json({
    controls,
    stripe_mode: {
      secret: stripeMode.stripeSecretMode,
      publishable: stripeMode.stripePublishableMode,
      test_mode_active:
        stripeMode.stripeSecretMode === "test" || stripeMode.stripePublishableMode === "test",
    },
  });
}

export async function PATCH(request: NextRequest) {
  const actor = await getRouteActor(request);

  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await isAdminUser(actor.authUser.id))) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        payouts_enabled?: boolean;
        refunds_enabled?: boolean;
        admin_manual_release_required?: boolean;
        emergency_hold_enabled?: boolean;
        emergency_hold_reason?: string | null;
        max_single_payout_gbp?: number | null;
        max_single_refund_gbp?: number | null;
        test_mode_banner_enabled?: boolean;
        reason?: string | null;
      }
    | null;

  if (!body) {
    return NextResponse.json({ error: "Invalid controls payload." }, { status: 400 });
  }

  const payoutLimitValidation = validatePositiveOrNull(body.max_single_payout_gbp);
  if (!payoutLimitValidation.ok) {
    return NextResponse.json({ error: payoutLimitValidation.error }, { status: 400 });
  }

  const refundLimitValidation = validatePositiveOrNull(body.max_single_refund_gbp);
  if (!refundLimitValidation.ok) {
    return NextResponse.json({ error: refundLimitValidation.error }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdminClient();
  const { data: previous } = await supabaseAdmin
    .from("platform_payment_controls")
    .select("*")
    .limit(1)
    .maybeSingle<PlatformPaymentControlsRecord>();

  if (!previous) {
    return NextResponse.json({ error: "Platform controls row not found." }, { status: 500 });
  }

  const emergencyHoldEnabled =
    typeof body.emergency_hold_enabled === "boolean"
      ? body.emergency_hold_enabled
      : previous.emergency_hold_enabled;
  const emergencyHoldReason = body.emergency_hold_reason?.trim() || null;

  if (emergencyHoldEnabled && !emergencyHoldReason) {
    return NextResponse.json(
      { error: "Emergency hold reason is required when emergency hold is enabled." },
      { status: 400 },
    );
  }

  const nextValues = {
    payouts_enabled:
      typeof body.payouts_enabled === "boolean"
        ? body.payouts_enabled
        : previous.payouts_enabled,
    refunds_enabled:
      typeof body.refunds_enabled === "boolean"
        ? body.refunds_enabled
        : previous.refunds_enabled,
    admin_manual_release_required:
      typeof body.admin_manual_release_required === "boolean"
        ? body.admin_manual_release_required
        : previous.admin_manual_release_required,
    emergency_hold_enabled:
      typeof body.emergency_hold_enabled === "boolean"
        ? body.emergency_hold_enabled
        : previous.emergency_hold_enabled,
    emergency_hold_reason:
      (typeof body.emergency_hold_enabled === "boolean"
        ? body.emergency_hold_enabled
        : previous.emergency_hold_enabled)
        ? emergencyHoldReason
        : null,
    max_single_payout_gbp: payoutLimitValidation.value,
    max_single_refund_gbp: refundLimitValidation.value,
    test_mode_banner_enabled:
      typeof body.test_mode_banner_enabled === "boolean"
        ? body.test_mode_banner_enabled
        : previous.test_mode_banner_enabled,
    updated_at: new Date().toISOString(),
    updated_by: actor.authUser.id,
  };

  const { data: updated } = await supabaseAdmin
    .from("platform_payment_controls")
    .update(nextValues)
    .eq("id", previous.id)
    .select("*")
    .maybeSingle<PlatformPaymentControlsRecord>();

  await supabaseAdmin.from("payment_events").insert({
    booking_id: null,
    payment_id: null,
    event_type: "platform_payment_controls_updated",
    source: "admin",
    metadata: {
      admin_user_id: actor.authUser.id,
      reason: body.reason?.trim() || null,
      previous,
      next: updated ?? nextValues,
    },
  });

  return NextResponse.json({
    controls: updated ?? nextValues,
  });
}
