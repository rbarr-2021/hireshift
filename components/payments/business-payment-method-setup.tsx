"use client";

import { useEffect, useRef, useState } from "react";
import { fetchWithSession } from "@/lib/route-client";

type StripeJs = {
  elements: (options: { clientSecret: string; appearance?: Record<string, unknown> }) => {
    create: (type: string) => {
      mount: (selector: string) => void;
      unmount: () => void;
    };
  };
  confirmSetup: (options: {
    elements: unknown;
    confirmParams: { return_url: string };
    redirect?: "if_required";
  }) => Promise<{ error?: { message?: string }; setupIntent?: { id: string; status: string } }>;
};

declare global {
  interface Window {
    Stripe?: (publishableKey: string) => StripeJs;
  }
}

type Props = {
  onReadyChange?: (ready: boolean) => void;
};

function readJsonSafely<T>(text: string, fallback: T): T {
  if (!text) {
    return fallback;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

async function ensureStripeJsLoaded() {
  if (typeof window === "undefined") {
    return;
  }
  if (window.Stripe) {
    return;
  }

  const existing = document.querySelector<HTMLScriptElement>(
    'script[src="https://js.stripe.com/v3/"]',
  );
  if (existing) {
    await new Promise<void>((resolve) => {
      if (window.Stripe) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
    });
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://js.stripe.com/v3/";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Unable to load Stripe.js"));
    document.head.appendChild(script);
  });
}

export function BusinessPaymentMethodSetup({ onReadyChange }: Props) {
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ?? "";
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [paymentReady, setPaymentReady] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const stripeRef = useRef<StripeJs | null>(null);
  const elementsRef = useRef<ReturnType<StripeJs["elements"]> | null>(null);
  const paymentElementRef = useRef<{ unmount: () => void } | null>(null);

  useEffect(() => {
    let active = true;

    const loadStatus = async () => {
      try {
        const response = await fetchWithSession("/api/business/payment/status", {
          method: "GET",
        });
        const payload = readJsonSafely<{
          paymentMethodReady?: boolean;
          paymentMethodBrand?: string | null;
          paymentMethodLast4?: string | null;
        }>(await response.text(), {});
        if (!response.ok) {
          throw new Error("Payment status is temporarily unavailable.");
        }
        if (!active) {
          return;
        }
        const ready = Boolean(payload.paymentMethodReady);
        setPaymentReady(ready);
        onReadyChange?.(ready);
        if (payload.paymentMethodBrand && payload.paymentMethodLast4) {
          setSummary(`${payload.paymentMethodBrand.toUpperCase()} •••• ${payload.paymentMethodLast4}`);
        } else if (ready) {
          setSummary("Saved card on file");
        } else {
          setSummary(null);
        }
      } catch (nextError) {
        if (!active) {
          return;
        }
        setError(nextError instanceof Error ? nextError.message : "Unable to load payment status.");
      } finally {
        if (active) {
          setLoadingStatus(false);
        }
      }
    };

    void loadStatus();
    return () => {
      active = false;
    };
  }, [onReadyChange]);

  useEffect(() => {
    if (!showForm || !clientSecret || !publishableKey) {
      return;
    }

    let cancelled = false;

    const mountPaymentElement = async () => {
      try {
        await ensureStripeJsLoaded();
        if (cancelled || !window.Stripe) {
          return;
        }

        const stripe = window.Stripe(publishableKey);
        stripeRef.current = stripe;

        const elements = stripe.elements({
          clientSecret,
          appearance: {
            theme: "night",
          },
        });
        elementsRef.current = elements;

        const paymentElement = elements.create("payment");
        paymentElement.mount("#business-payment-element");
        paymentElementRef.current = paymentElement;
      } catch (nextError) {
        if (!cancelled) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : "Payment setup is temporarily unavailable.",
          );
        }
      }
    };

    void mountPaymentElement();

    return () => {
      cancelled = true;
      paymentElementRef.current?.unmount();
      paymentElementRef.current = null;
      elementsRef.current = null;
    };
  }, [clientSecret, publishableKey, showForm]);

  const startSetup = async () => {
    setError(null);
    setSaving(true);
    try {
      const response = await fetchWithSession("/api/business/payment/setup-intent", {
        method: "POST",
      });
      const payload = readJsonSafely<{ clientSecret?: string; error?: string }>(
        await response.text(),
        {},
      );
      if (!response.ok || !payload.clientSecret) {
        throw new Error(payload.error || "Payment setup is temporarily unavailable.");
      }
      setClientSecret(payload.clientSecret);
      setShowForm(true);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Payment setup is temporarily unavailable.",
      );
    } finally {
      setSaving(false);
    }
  };

  const confirmSetup = async () => {
    if (!stripeRef.current || !elementsRef.current) {
      return;
    }
    setError(null);
    setSaving(true);

    try {
      const result = await stripeRef.current.confirmSetup({
        elements: elementsRef.current,
        confirmParams: {
          return_url: window.location.href,
        },
        redirect: "if_required",
      });

      if (result.error) {
        throw new Error(result.error.message || "Unable to save payment method.");
      }

      const setupIntentId = result.setupIntent?.id;
      if (!setupIntentId) {
        throw new Error("Payment setup is still pending. Please try again.");
      }

      const confirmResponse = await fetchWithSession("/api/business/payment/confirm-method", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          setupIntentId,
        }),
      });
      const payload = readJsonSafely<{ error?: string; paymentMethodReady?: boolean }>(
        await confirmResponse.text(),
        {},
      );
      if (!confirmResponse.ok || !payload.paymentMethodReady) {
        throw new Error(payload.error || "Unable to save payment method.");
      }

      setPaymentReady(true);
      onReadyChange?.(true);
      setShowForm(false);
      setSummary("Saved card on file");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to save payment method.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="panel-soft mt-5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#67B7FF]">
            Payment setup
          </p>
          <p className="mt-1 text-sm text-stone-600">
            {paymentReady ? "Payment ready" : "Add payment method"}
          </p>
        </div>
        <span
          className={
            paymentReady
              ? "status-badge status-badge--ready"
              : "status-badge status-badge--pending"
          }
        >
          {paymentReady ? "payment_method_ready" : "payment_method_required"}
        </span>
      </div>

      {loadingStatus ? (
        <p className="mt-3 text-xs text-stone-500">Checking payment setup…</p>
      ) : (
        <p className="mt-3 text-sm text-stone-600">
          {paymentReady
            ? summary || "Saved card on file."
            : "You’ll only be charged when the shift is confirmed/ready to go."}
        </p>
      )}

      {!paymentReady && !showForm ? (
        <button
          type="button"
          onClick={() => void startSetup()}
          disabled={saving || !publishableKey}
          className="primary-btn mt-4 w-full px-5 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Preparing…" : "Add payment method"}
        </button>
      ) : null}

      {!paymentReady && showForm ? (
        <div className="mt-4 space-y-3">
          <div id="business-payment-element" className="rounded-2xl border border-white/10 bg-black/35 p-3" />
          <button
            type="button"
            onClick={() => void confirmSetup()}
            disabled={saving}
            className="primary-btn w-full px-5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving…" : "Secure this shift"}
          </button>
        </div>
      ) : null}

      {error ? <p className="mt-3 text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}
