import { NextRequest, NextResponse } from "next/server";
import type { WorkerProfileRecord } from "@/lib/models";
import { getRouteActor } from "@/lib/route-access";
import {
  createWorkerStripeLoginLink,
  syncWorkerStripeConnectAccount,
} from "@/lib/stripe-connect";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const actor = await getRouteActor(request);

    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (actor.appUser.role !== "worker") {
      return NextResponse.json(
        { error: "Only workers can manage payout details." },
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
      return NextResponse.json(
        { error: "Connect Stripe payouts first." },
        { status: 409 },
      );
    }

    await syncWorkerStripeConnectAccount({
      workerId: actor.authUser.id,
      accountId: workerProfile.stripe_connect_account_id,
    });

    const loginLink = await createWorkerStripeLoginLink(
      workerProfile.stripe_connect_account_id,
    );

    return NextResponse.json({ url: loginLink.url });
  } catch (error) {
    console.error("[worker-payout-dashboard]", error);
    const message = error instanceof Error ? error.message : "Stripe dashboard access failed.";

    return NextResponse.json(
      {
        error: message.includes("STRIPE_SECRET_KEY")
          ? "Stripe is not configured yet. Add STRIPE_SECRET_KEY in Vercel and redeploy."
          : "Stripe dashboard could not be opened right now.",
      },
      { status: 500 },
    );
  }
}
