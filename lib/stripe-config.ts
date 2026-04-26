export type StripeKeyMode = "test" | "live" | "missing" | "unknown";

const STRIPE_SECRET_ENV = "STRIPE_SECRET_KEY";
const STRIPE_PUBLISHABLE_ENV = "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY";
const STRIPE_ALT_ENV_NAMES = [
  "STRIPE_API_KEY",
  "STRIPE_PRIVATE_KEY",
  "STRIPE_CONNECT_CLIENT_ID",
  "NEXT_PUBLIC_STRIPE_KEY",
] as const;

function resolveStripeKeyMode(value: string | null | undefined): StripeKeyMode {
  const normalized = value?.trim();

  if (!normalized) {
    return "missing";
  }

  if (normalized.startsWith("sk_test_") || normalized.startsWith("pk_test_")) {
    return "test";
  }

  if (normalized.startsWith("sk_live_") || normalized.startsWith("pk_live_")) {
    return "live";
  }

  return "unknown";
}

export function getStripeSecretKeyFromEnv() {
  return process.env[STRIPE_SECRET_ENV]?.trim() || null;
}

export function getStripePublishableKeyFromEnv() {
  return process.env[STRIPE_PUBLISHABLE_ENV]?.trim() || null;
}

export function getStripeModeDiagnostics() {
  const secretKey = getStripeSecretKeyFromEnv();
  const publishableKey = getStripePublishableKeyFromEnv();

  const alternateEnvNamesPresent = STRIPE_ALT_ENV_NAMES.filter((name) =>
    Boolean(process.env[name]?.trim()),
  );

  return {
    stripeSecretEnv: STRIPE_SECRET_ENV,
    stripePublishableEnv: STRIPE_PUBLISHABLE_ENV,
    stripeSecretMode: resolveStripeKeyMode(secretKey),
    stripePublishableMode: resolveStripeKeyMode(publishableKey),
    alternateEnvNamesPresent,
  };
}

