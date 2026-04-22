import { NextRequest, NextResponse } from "next/server";
import type { WorkerProfileRecord } from "@/lib/models";
import { getRouteActor } from "@/lib/route-access";
import { syncWorkerStripeConnectAccount } from "@/lib/stripe-connect";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const actor = await getRouteActor(request);

  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (actor.appUser.role !== "worker") {
    return NextResponse.json(
      { error: "Only workers can refresh payout status." },
      { status: 403 },
    );
  }

  const supabaseAdmin = getSupabaseAdminClient();
  const { data: workerProfile } = await supabaseAdmin
    .from("worker_profiles")
    .select("*")
    .eq("user_id", actor.authUser.id)
    .maybeSingle<WorkerProfileRecord>();

  if (!workerProfile?.stripe_connect_account_id) {
    return NextResponse.json({
      connected: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
    });
  }

  const { snapshot } = await syncWorkerStripeConnectAccount({
    workerId: actor.authUser.id,
    accountId: workerProfile.stripe_connect_account_id,
  });

  return NextResponse.json({
    connected: true,
    payoutsEnabled: snapshot.stripe_connect_payouts_enabled,
    detailsSubmitted: snapshot.stripe_connect_details_submitted,
    chargesEnabled: snapshot.stripe_connect_charges_enabled,
  });
}
