import { NextRequest, NextResponse } from "next/server";
import type { WorkerProfileRecord } from "@/lib/models";
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

    if (actor.appUser.role !== "worker") {
      return NextResponse.json({ error: "Only workers can view payout status." }, { status: 403 });
    }

    const supabaseAdmin = getSupabaseAdminClient();
    const { data: workerProfile } = await supabaseAdmin
      .from("worker_profiles")
      .select("*")
      .eq("user_id", actor.authUser.id)
      .maybeSingle<WorkerProfileRecord>();

    if (!workerProfile) {
      return NextResponse.json(
        { error: "Please complete your worker profile first." },
        { status: 400 },
      );
    }

    const payoutReady =
      Boolean(workerProfile.stripe_connect_charges_enabled) &&
      Boolean(workerProfile.stripe_connect_payouts_enabled);
    const payoutPendingVerification =
      !payoutReady && Boolean(workerProfile.stripe_connect_details_submitted);

    return NextResponse.json({
      status: payoutReady
        ? "payout_ready"
        : payoutPendingVerification
          ? "payout_pending_verification"
          : "payout_setup_required",
      payoutReady,
      payoutPendingVerification,
      payoutRestricted:
        Boolean(workerProfile.stripe_connect_account_id) && !workerProfile.stripe_connect_charges_enabled,
    });
  } catch (error) {
    console.error("[worker-payout-status]", error);
    return NextResponse.json(
      { error: "Payout status is temporarily unavailable." },
      { status: 500 },
    );
  }
}
