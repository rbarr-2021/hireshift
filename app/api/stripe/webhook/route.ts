import { NextRequest } from "next/server";
import { handleStripeWebhookGet, handleStripeWebhookPost } from "@/lib/stripe-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return handleStripeWebhookPost(request);
}

export async function GET() {
  return handleStripeWebhookGet();
}
