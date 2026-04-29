import type { PlatformPaymentControlsRecord } from "@/lib/models";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

type GuardResult = { ok: true } | { ok: false; reason: string };

const DEFAULT_CONTROLS: Omit<
  PlatformPaymentControlsRecord,
  "id" | "created_at" | "updated_at" | "updated_by"
> = {
  payouts_enabled: true,
  refunds_enabled: true,
  admin_manual_release_required: true,
  max_single_payout_gbp: null,
  max_single_refund_gbp: null,
  emergency_hold_enabled: false,
  emergency_hold_reason: null,
  test_mode_banner_enabled: true,
};

export async function getPlatformPaymentControls() {
  const supabaseAdmin = getSupabaseAdminClient();
  const { data } = await supabaseAdmin
    .from("platform_payment_controls")
    .select("*")
    .limit(1)
    .maybeSingle<PlatformPaymentControlsRecord>();

  if (!data) {
    return null;
  }

  return data;
}

export function withDefaultPlatformPaymentControls(
  controls: PlatformPaymentControlsRecord | null,
) {
  if (!controls) {
    return DEFAULT_CONTROLS;
  }

  return {
    ...DEFAULT_CONTROLS,
    ...controls,
  };
}

export function validatePositiveOrNull(input: unknown) {
  if (input === null || input === undefined || input === "") {
    return { ok: true as const, value: null };
  }

  if (typeof input !== "number" || Number.isNaN(input) || input <= 0) {
    return { ok: false as const, error: "Amount limits must be positive numbers or empty." };
  }

  return { ok: true as const, value: Number(input.toFixed(2)) };
}

export function guardPayoutByControls(input: {
  controls: ReturnType<typeof withDefaultPlatformPaymentControls>;
  payoutAmountGbp: number;
}) : GuardResult {
  const controls = input.controls;

  if (!controls.payouts_enabled) {
    return { ok: false, reason: "Payouts are currently disabled by admin." };
  }

  if (controls.emergency_hold_enabled) {
    return {
      ok: false,
      reason: controls.emergency_hold_reason?.trim()
        ? `Emergency hold is active. ${controls.emergency_hold_reason.trim()}`
        : "Emergency hold is active.",
    };
  }

  if (
    typeof controls.max_single_payout_gbp === "number" &&
    input.payoutAmountGbp > controls.max_single_payout_gbp
  ) {
    return { ok: false, reason: "This payout exceeds the configured single payout limit." };
  }

  return { ok: true };
}

export function guardRefundByControls(input: {
  controls: ReturnType<typeof withDefaultPlatformPaymentControls>;
  refundAmountGbp: number;
}) : GuardResult {
  const controls = input.controls;

  if (!controls.refunds_enabled) {
    return { ok: false, reason: "Refunds are currently disabled by admin." };
  }

  if (controls.emergency_hold_enabled) {
    return {
      ok: false,
      reason: controls.emergency_hold_reason?.trim()
        ? `Emergency hold is active. ${controls.emergency_hold_reason.trim()}`
        : "Emergency hold is active.",
    };
  }

  if (
    typeof controls.max_single_refund_gbp === "number" &&
    input.refundAmountGbp > controls.max_single_refund_gbp
  ) {
    return { ok: false, reason: "This refund exceeds the configured single refund limit." };
  }

  return { ok: true };
}
