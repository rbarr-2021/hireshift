import Stripe from "stripe";
import { getStripeSecretKeyFromEnv } from "@/lib/stripe-config";

declare global {
  var __kruviiStripeClient: Stripe | undefined;
}

export function getStripeClient() {
  const secretKey = getStripeSecretKeyFromEnv();

  if (!secretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY.");
  }

  return (
    globalThis.__kruviiStripeClient ??
    (globalThis.__kruviiStripeClient = new Stripe(secretKey))
  );
}

export function getStripeWebhookSecret() {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
}

export function getSiteUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  return explicit ? explicit.replace(/\/+$/, "") : "http://localhost:3000";
}
