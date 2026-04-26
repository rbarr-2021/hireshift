import { NextRequest, NextResponse } from "next/server";
import { getStripeModeDiagnostics } from "@/lib/stripe-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hasDebugAccess(request: NextRequest) {
  const token = process.env.STRIPE_MODE_DEBUG_TOKEN?.trim();

  if (!token) {
    return process.env.NODE_ENV !== "production";
  }

  const providedToken =
    request.headers.get("x-debug-token")?.trim() ||
    request.nextUrl.searchParams.get("token")?.trim();

  return providedToken === token;
}

export async function GET(request: NextRequest) {
  if (!hasDebugAccess(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const diagnostics = getStripeModeDiagnostics();

  return NextResponse.json(
    {
      stripeSecretMode: diagnostics.stripeSecretMode,
      stripePublishableMode: diagnostics.stripePublishableMode,
      stripeSecretEnv: diagnostics.stripeSecretEnv,
      stripePublishableEnv: diagnostics.stripePublishableEnv,
      alternateEnvNamesPresent: diagnostics.alternateEnvNamesPresent,
      message: `Stripe secret mode: ${diagnostics.stripeSecretMode}. Stripe publishable mode: ${diagnostics.stripePublishableMode}.`,
    },
    { status: 200 },
  );
}

