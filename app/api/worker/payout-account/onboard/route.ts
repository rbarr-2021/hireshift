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

function formatStripeConnectSetupError(error: unknown) {
  const message = error instanceof Error ? error.message : "Stripe payout setup failed.";
  const stripeError =
    error && typeof error === "object"
      ? (error as { code?: string; type?: string; message?: string })
      : null;

  if (message.includes("STRIPE_SECRET_KEY")) {
    return "Stripe is not configured yet. Add STRIPE_SECRET_KEY in Vercel and redeploy.";
  }

  if (
    stripeError?.code === "resource_missing" ||
    message.toLowerCase().includes("no such account")
  ) {
    return "Stripe had an old payout account saved. Try Connect with Stripe again to create a fresh test payout account.";
  }

  if (message.toLowerCase().includes("connect")) {
    return "Stripe Connect may not be enabled for this Stripe account yet. Enable Connect in Stripe, then try again.";
  }

  if (message.toLowerCase().includes("invalid api key")) {
    return "Stripe rejected the secret key. Check STRIPE_SECRET_KEY in Vercel, then redeploy.";
  }

  return message || "Stripe payout setup could not be opened right now.";
}

export async function POST(request: NextRequest) {
  try {
    await request.json().catch(() => ({}));
    const actor = await getRouteActor(request);

    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (actor.appUser.role !== "worker") {
      return NextResponse.json(
        { error: "Only workers can connect payout details." },
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
        { error: "Complete your worker profile before connecting payouts." },
        { status: 409 },
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
        error: formatStripeConnectSetupError(error),
      },
      { status: 500 },
    );
  }
}
