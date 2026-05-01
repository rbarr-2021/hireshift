import { NextRequest, NextResponse } from "next/server";
import type { WorkerProfileRecord } from "@/lib/models";
import { getRouteActor } from "@/lib/route-access";
import { getSiteUrl } from "@/lib/stripe";
import {
  createWorkerStripeOnboardingLink,
  ensureWorkerStripeConnectAccount,
  syncWorkerStripeConnectAccount,
} from "@/lib/stripe-connect";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    await request.json().catch(() => ({}));
    const actor = await getRouteActor(request);

    if (!actor) {
      return NextResponse.json(
        { error: "Please log in again." },
        { status: 401 },
      );
    }

    if (actor.appUser.role !== "worker") {
      return NextResponse.json(
        { error: "Only workers can set up payouts." },
        { status: 403 },
      );
    }

    const supabaseAdmin = getSupabaseAdminClient();
    const { data: workerProfile } = await supabaseAdmin
      .from("worker_profiles")
      .select("*")
      .eq("user_id", actor.authUser.id)
      .maybeSingle<WorkerProfileRecord>();

    if (!workerProfile) {
      return NextResponse.json(
        { error: "Please complete your worker profile before setting up payouts." },
        { status: 400 },
      );
    }

    const { account } = await ensureWorkerStripeConnectAccount({
      workerId: actor.authUser.id,
      email: actor.authUser.email,
      currentAccountId: workerProfile.stripe_connect_account_id,
    });

    await supabaseAdmin
      .from("worker_profiles")
      .update({
        stripe_connect_account_id: account.id,
        stripe_connect_last_synced_at: new Date().toISOString(),
      })
      .eq("user_id", actor.authUser.id);

    await syncWorkerStripeConnectAccount({
      workerId: actor.authUser.id,
      accountId: account.id,
    });

    const siteUrl = getSiteUrl();
    const workerPaymentsUrl = `${siteUrl}/dashboard/worker/payments`;
    const onboardingLink = await createWorkerStripeOnboardingLink({
      accountId: account.id,
      returnUrl: workerPaymentsUrl,
      refreshUrl: workerPaymentsUrl,
    });

    return NextResponse.json({ url: onboardingLink.url });
  } catch (error) {
    console.error("[worker-payout-onboard]", error);

    return NextResponse.json(
      {
        error: "Payout setup is temporarily unavailable. Please contact support.",
      },
      { status: 500 },
    );
  }
}
