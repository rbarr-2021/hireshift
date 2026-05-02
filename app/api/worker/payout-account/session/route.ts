import { NextRequest, NextResponse } from "next/server";
import type { WorkerProfileRecord } from "@/lib/models";
import { getRouteActor } from "@/lib/route-access";
import { getSiteUrl, getStripeClient } from "@/lib/stripe";
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
    const body = (await request.json().catch(() => ({}))) as {
      returnTo?: string;
      shiftId?: string;
    };
    const actor = await getRouteActor(request);

    if (!actor) {
      return NextResponse.json({ error: "Please log in again." }, { status: 401 });
    }

    if (actor.appUser.role !== "worker") {
      return NextResponse.json({ error: "Only workers can set up payouts." }, { status: 403 });
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

    const stripe = getStripeClient();
    let clientSecret: string | null = null;
    try {
      const accountSession = await stripe.accountSessions.create({
        account: account.id,
        components: {
          account_onboarding: { enabled: true },
          payouts: { enabled: true },
          payout_details: { enabled: true },
        },
      });
      clientSecret = accountSession.client_secret ?? null;
    } catch {
      clientSecret = null;
    }

    const siteUrl = getSiteUrl();
    const returnTarget =
      typeof body.returnTo === "string" && body.returnTo.startsWith("/")
        ? body.returnTo
        : typeof body.shiftId === "string" && body.shiftId.trim()
          ? `/shifts/${body.shiftId.trim()}?intent=take`
          : "/shifts";
    const returnUrl = `${siteUrl}/dashboard/worker/payments?stripe=connected&redirect=${encodeURIComponent(returnTarget)}`;
    const fallbackOnboardingLink = await createWorkerStripeOnboardingLink({
      accountId: account.id,
      returnUrl,
      refreshUrl: returnUrl,
    });

    return NextResponse.json({
      mode: clientSecret ? "embedded" : "redirect",
      clientSecret,
      fallbackUrl: fallbackOnboardingLink.url,
      status:
        account.payouts_enabled && account.charges_enabled
          ? "payout_ready"
          : account.details_submitted
            ? "payout_pending_verification"
            : "payout_setup_required",
    });
  } catch (error) {
    console.error("[worker-payout-session]", error);
    return NextResponse.json(
      { error: "Payout setup is temporarily unavailable. Please contact support." },
      { status: 500 },
    );
  }
}
