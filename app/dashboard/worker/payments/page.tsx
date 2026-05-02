"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  BookingRecord,
  BusinessProfileRecord,
  PaymentRecord,
  UserRecord,
  WorkerProfileRecord,
} from "@/lib/models";
import {
  formatPaymentStatus,
  formatPayoutStatus,
  getLastPaidPayout,
  getPayoutSupportCopy,
  getUpcomingPayout,
  paymentStatusClass,
  payoutStatusClass,
} from "@/lib/payments";
import { formatBookingDate, formatBookingTimeRange } from "@/lib/bookings";
import { isWorkerPayoutReady } from "@/lib/payout-readiness";
import { fetchWithSession } from "@/lib/route-client";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/toast-provider";

type StripeConnectInstance = {
  create: (componentName: string) => HTMLElement;
};

declare global {
  interface Window {
    StripeConnect?: {
      init?: (options: {
        publishableKey: string;
        fetchClientSecret: () => Promise<string | undefined>;
      }) => StripeConnectInstance;
    };
  }
}

type BusinessSnapshot = {
  name: string;
  location: string;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 2,
  }).format(value);
}

function getPayoutSetupStatus(workerProfile: WorkerProfileRecord | null) {
  if (
    workerProfile?.stripe_connect_charges_enabled &&
    workerProfile?.stripe_connect_payouts_enabled
  ) {
    return "payout_ready";
  }
  if (workerProfile?.stripe_connect_details_submitted) {
    return "payout_pending_verification";
  }
  return "payout_setup_required";
}

async function readJsonResponse<T>(response: Response, fallbackError: string): Promise<T> {
  const text = await response.text();

  if (!text) {
    return { error: fallbackError } as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return { error: fallbackError } as T;
  }
}

function WorkerPaymentsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [paymentsByBookingId, setPaymentsByBookingId] = useState<Record<string, PaymentRecord>>({});
  const [businessesById, setBusinessesById] = useState<Record<string, BusinessSnapshot>>({});
  const [workerProfile, setWorkerProfile] = useState<WorkerProfileRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [openingDashboard, setOpeningDashboard] = useState(false);
  const [refreshingStripeStatus, setRefreshingStripeStatus] = useState(false);
  const [embeddedPayoutClientSecret, setEmbeddedPayoutClientSecret] = useState<string | null>(null);
  const [showEmbeddedPayoutSetup, setShowEmbeddedPayoutSetup] = useState(false);
  const [fallbackOnboardingUrl, setFallbackOnboardingUrl] = useState<string | null>(null);
  const [embeddedSetupMessage, setEmbeddedSetupMessage] = useState<string | null>(null);
  const stripePublishableKey =
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() || "";

  useEffect(() => {
    let active = true;

    const refreshStripeStatus = async (showConnectedToast: boolean) => {
      setRefreshingStripeStatus(true);

      try {
        const response = await fetchWithSession("/api/worker/payout-account/refresh", {
          method: "POST",
        });
        const payload = await readJsonResponse<{
          error?: string;
          connected?: boolean;
          detailsSubmitted?: boolean;
          payoutsEnabled?: boolean;
          chargesEnabled?: boolean;
        }>(response, "Stripe payout status is not configured correctly yet.");

        if (!response.ok) {
          throw new Error(payload.error || "Unable to refresh payout status.");
        }

        if (!active) {
          return;
        }

        const {
          data: { user: refreshedUser },
        } = await supabase.auth.getUser();

        if (!refreshedUser || !active) {
          return;
        }

        const refreshedWorkerProfileResult = await supabase
          .from("worker_profiles")
          .select("*")
          .eq("user_id", refreshedUser.id)
          .maybeSingle<WorkerProfileRecord>();

        if (!active) {
          return;
        }

        setWorkerProfile(refreshedWorkerProfileResult.data ?? null);

        if (showConnectedToast) {
          const redirectTo = searchParams.get("redirect");
          const ready = Boolean(payload.payoutsEnabled && payload.chargesEnabled);

          showToast({
            title: ready ? "Stripe payouts connected" : "Finish Stripe setup",
            description: ready
              ? "Your payout account is ready for completed shift payments."
              : "You need to finish your payout setup with Stripe before accepting paid shifts.",
            tone: ready ? "success" : "info",
          });

          if (ready && redirectTo?.startsWith("/")) {
            router.replace(redirectTo);
          } else if (ready) {
            showToast({
              title: "Payouts set up",
              description: "Payouts set up. Choose a shift to accept.",
              tone: "success",
            });
            router.replace("/shifts");
          }
        }
      } catch (error) {
        if (!active) {
          return;
        }

        const message =
          error instanceof Error ? error.message : "Unable to refresh payout status.";
        showToast({
          title: "Payout status unavailable",
          description: message,
          tone: "error",
        });
      } finally {
        if (active) {
          setRefreshingStripeStatus(false);
        }
      }
    };

    const loadPayments = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || !active) {
        return;
      }

      const bookingsResult = await supabase
        .from("bookings")
        .select("*")
        .eq("worker_id", user.id)
        .order("shift_date", { ascending: false })
        .order("start_time", { ascending: false });

      const workerProfileResult = await supabase
        .from("worker_profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle<WorkerProfileRecord>();

      if (!active) {
        return;
      }

      const nextBookings = (bookingsResult.data as BookingRecord[] | null) ?? [];
      const bookingIds = nextBookings.map((booking) => booking.id);
      const businessIds = [...new Set(nextBookings.map((booking) => booking.business_id))];

      const [paymentsResult, businessUsersResult, businessProfilesResult] = await Promise.all([
        bookingIds.length > 0
          ? supabase.from("payments").select("*").in("booking_id", bookingIds)
          : Promise.resolve({ data: [] as PaymentRecord[] }),
        businessIds.length > 0
          ? supabase.from("users").select("*").in("id", businessIds)
          : Promise.resolve({ data: [] as UserRecord[] }),
        businessIds.length > 0
          ? supabase.from("business_profiles").select("*").in("user_id", businessIds)
          : Promise.resolve({ data: [] as BusinessProfileRecord[] }),
      ]);

      if (!active) {
        return;
      }

      const nextPayments = (paymentsResult.data as PaymentRecord[] | null) ?? [];
      const nextBusinesses = businessIds.reduce<Record<string, BusinessSnapshot>>((accumulator, businessId) => {
        const businessUser = ((businessUsersResult.data as UserRecord[] | null) ?? []).find(
          (entry) => entry.id === businessId,
        );
        const businessProfile = ((businessProfilesResult.data as BusinessProfileRecord[] | null) ?? []).find(
          (entry) => entry.user_id === businessId,
        );

        accumulator[businessId] = {
          name: businessProfile?.business_name || businessUser?.display_name || "Business",
          location:
            [businessProfile?.address_line_1, businessProfile?.city].filter(Boolean).join(", ") ||
            "Venue to be confirmed",
        };

        return accumulator;
      }, {});

      setBookings(nextBookings);
      setBusinessesById(nextBusinesses);
      setWorkerProfile(workerProfileResult.data ?? null);
      setPaymentsByBookingId(
        nextPayments.reduce<Record<string, PaymentRecord>>((accumulator, payment) => {
          accumulator[payment.booking_id] = payment;
          return accumulator;
        }, {}),
      );
      await refreshStripeStatus(searchParams.get("stripe") === "connected");
      setLoading(false);
    };

    void loadPayments();

    return () => {
      active = false;
    };
  }, [router, searchParams, showToast]);

  const upcomingPayout = useMemo(
    () => getUpcomingPayout(bookings, paymentsByBookingId),
    [bookings, paymentsByBookingId],
  );

  const lastPaidPayout = useMemo(
    () => getLastPaidPayout(bookings, paymentsByBookingId),
    [bookings, paymentsByBookingId],
  );

  const payoutHistory = useMemo(
    () =>
      bookings.filter((booking) => {
        const payment = paymentsByBookingId[booking.id];
        return Boolean(payment);
      }),
    [bookings, paymentsByBookingId],
  );
  const hasPayoutSummaryData = Boolean(upcomingPayout || lastPaidPayout || payoutHistory.length > 0);

  const payoutAccountReady = isWorkerPayoutReady(workerProfile);
  const payoutSetupStatus = getPayoutSetupStatus(workerProfile);

  const handleConnectPayouts = async () => {
    setConnecting(true);

    try {
      const response = await fetchWithSession("/api/worker/payout-account/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          returnTo: searchParams.get("redirect"),
        }),
      });
      const payload = await readJsonResponse<{
        error?: string;
        mode?: "embedded" | "redirect";
        clientSecret?: string | null;
        fallbackUrl?: string;
      }>(
        response,
        "Payout setup is temporarily unavailable. Please contact support.",
      );

      if (response.status === 401) {
        showToast({
          title: "Please log in again.",
          description: "Please log in again.",
          tone: "info",
        });
        setConnecting(false);
        router.push("/login?redirect=%2Fdashboard%2Fworker%2Fpayments");
        return;
      }

      if (response.status === 403) {
        showToast({
          title: "Only workers can set up payouts.",
          description: "Only workers can set up payouts.",
          tone: "info",
        });
        setConnecting(false);
        return;
      }

      if (!response.ok) {
        throw new Error(
          payload.error ||
            "Payout setup is temporarily unavailable. Please contact support.",
        );
      }

      if (payload.mode === "embedded" && payload.clientSecret && stripePublishableKey) {
        setEmbeddedSetupMessage("Opening secure payout setup...");
        setFallbackOnboardingUrl(payload.fallbackUrl ?? null);
        setEmbeddedPayoutClientSecret(payload.clientSecret);
        setShowEmbeddedPayoutSetup(true);
        setConnecting(false);
        return;
      }

      if (payload.fallbackUrl) {
        setFallbackOnboardingUrl(payload.fallbackUrl);
        setShowEmbeddedPayoutSetup(true);
        setEmbeddedSetupMessage("Embedded setup is unavailable right now. You can continue with secure setup.");
        setConnecting(false);
        return;
      }

      throw new Error("Payout setup is temporarily unavailable. Please contact support.");
    } catch (error) {
      const message = "Payout setup is temporarily unavailable. Please contact support.";
      showToast({
        title: "Payout setup unavailable",
        description: message,
        tone: "info",
      });
      setConnecting(false);
    }
  };

  useEffect(() => {
    if (!showEmbeddedPayoutSetup || !embeddedPayoutClientSecret || !stripePublishableKey) {
      return;
    }

    let cancelled = false;
    let mountedComponent: HTMLElement | null = null;

    const loadScript = async () => {
      const src = "https://connect-js.stripe.com/v1.0/connect.js";
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
      if (existing) {
        if (window.StripeConnect?.init) {
          return;
        }
        await new Promise<void>((resolve) => {
          existing.addEventListener("load", () => resolve(), { once: true });
        });
        return;
      }

      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Unable to load secure payout setup."));
        document.head.appendChild(script);
      });
    };

    const mountEmbedded = async () => {
      try {
        await loadScript();
        if (cancelled || !window.StripeConnect?.init) {
          return;
        }

        const connect = window.StripeConnect.init({
          publishableKey: stripePublishableKey,
          fetchClientSecret: async () => embeddedPayoutClientSecret ?? undefined,
        });

        const onboarding = connect.create("account-onboarding");
        const container = document.getElementById("worker-payout-embedded");
        if (!container || cancelled) {
          return;
        }
        container.replaceChildren();
        container.appendChild(onboarding);
        setEmbeddedSetupMessage(null);
        mountedComponent = onboarding;
      } catch {
        setEmbeddedSetupMessage("Embedded setup is unavailable right now. You can continue with secure setup.");
        showToast({
          title: "Payout setup unavailable",
          description: "Payout setup is temporarily unavailable. Please contact support.",
          tone: "info",
        });
      }
    };

    void mountEmbedded();

    return () => {
      cancelled = true;
      if (mountedComponent?.parentElement) {
        mountedComponent.parentElement.removeChild(mountedComponent);
      }
    };
  }, [embeddedPayoutClientSecret, showEmbeddedPayoutSetup, showToast, stripePublishableKey]);

  const handleOpenStripeDashboard = async () => {
    setOpeningDashboard(true);

    try {
      const response = await fetchWithSession("/api/worker/payout-account/dashboard", {
        method: "POST",
      });
      const payload = await readJsonResponse<{ error?: string; url?: string }>(
        response,
        "Stripe dashboard access is not configured correctly yet.",
      );

      if (!response.ok || !payload.url) {
        throw new Error(payload.error || "Unable to open Stripe dashboard.");
      }

      window.location.href = payload.url;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to open Stripe dashboard.";
      showToast({
        title: "Stripe dashboard unavailable",
        description: message,
        tone: "error",
      });
      setOpeningDashboard(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <p className="section-label">Payments</p>
          <Skeleton className="mt-4 h-10 w-56" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="panel-soft p-5">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="mt-4 h-10 w-32" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="section-label">Payments</p>
          <h1 className="mt-3 text-2xl font-semibold text-stone-900 sm:text-3xl">
            Earnings and payout status
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
            Track upcoming payouts, completed payments, and every shift that is moving through approval.
          </p>
        </div>
        <Link href="/dashboard/worker" className="secondary-btn w-full px-6 sm:w-auto">
          Back to overview
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <section className="panel-soft p-5 sm:col-span-2 xl:col-span-3">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-stone-500">Set up payouts</p>
              </div>
              <p className="mt-2 text-2xl font-semibold text-stone-900">
                {payoutAccountReady ? "Payout ready" : "Set up payouts"}
              </p>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
                {payoutAccountReady
                  ? "You're ready to receive payouts after approved shifts."
                  : "Add your bank details securely. You only need to do this once."}
              </p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              {!payoutAccountReady ? (
                <button
                  type="button"
                  onClick={() => void handleConnectPayouts()}
                  disabled={connecting}
                  className="primary-btn w-full px-6 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                  {connecting ? "Opening secure payout setup..." : "Set up payouts"}
                </button>
              ) : null}
              {payoutAccountReady ? (
                <button
                  type="button"
                  onClick={() => void handleOpenStripeDashboard()}
                  disabled={openingDashboard}
                  className="secondary-btn w-full px-6 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                  {openingDashboard ? "Opening..." : "Manage payout details"}
                </button>
              ) : null}
            </div>
          </div>
          {!payoutAccountReady ? (
            <p className="mt-3 text-xs text-stone-500">Secured by Stripe</p>
          ) : null}
          {payoutAccountReady ? (
            <p className="mt-3 text-sm leading-6 text-stone-600">
              Update your bank account, personal details, or payout settings securely in Stripe.
              Stripe will open securely. When finished, you can close that tab and return to NexHyr.
            </p>
          ) : null}
          {!payoutAccountReady && showEmbeddedPayoutSetup ? (
            <div className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-black/35 p-3">
              {embeddedSetupMessage ? <p className="text-sm text-stone-600">{embeddedSetupMessage}</p> : null}
              {embeddedPayoutClientSecret ? (
                <div id="worker-payout-embedded" className="min-h-[320px]" />
              ) : null}
              <div className="flex flex-col gap-3 sm:flex-row">
                {fallbackOnboardingUrl ? (
                  <a href={fallbackOnboardingUrl} className="secondary-btn w-full px-5 sm:w-auto">
                    Continue secure setup
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setShowEmbeddedPayoutSetup(false);
                    setEmbeddedPayoutClientSecret(null);
                    setEmbeddedSetupMessage(null);
                    setFallbackOnboardingUrl(null);
                  }}
                  className="secondary-btn w-full px-5 sm:w-auto"
                >
                  Back
                </button>
              </div>
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <span
              className={
                payoutSetupStatus === "payout_ready"
                  ? "status-badge status-badge--ready"
                  : "status-badge status-badge--rating"
              }
            >
              {payoutSetupStatus === "payout_ready"
                ? "Payout ready"
                : payoutSetupStatus === "payout_pending_verification"
                  ? "Payout verification pending"
                  : "Payout setup required"}
            </span>
            {refreshingStripeStatus ? (
              <span className="status-badge status-badge--rating">Refreshing status</span>
            ) : null}
          </div>
        </section>
        {hasPayoutSummaryData ? (
          <>
            <section className="panel-soft p-5">
              <p className="text-sm font-medium text-stone-500">Upcoming payout</p>
              <p className="mt-2 text-3xl font-semibold text-stone-900">
                {upcomingPayout ? formatCurrency(upcomingPayout.payment.worker_payout_gbp) : "None yet"}
              </p>
              <p className="mt-2 text-sm text-stone-600">
                {upcomingPayout
                  ? `${businessesById[upcomingPayout.booking.business_id]?.name || "Business"} | ${formatPayoutStatus(upcomingPayout.payment.payout_status)}`
                  : "Your next payout will appear here once a completed shift is approved."}
              </p>
            </section>
            <section className="panel-soft p-5">
              <p className="text-sm font-medium text-stone-500">Last payout</p>
              <p className="mt-2 text-3xl font-semibold text-stone-900">
                {lastPaidPayout ? formatCurrency(lastPaidPayout.payment.worker_payout_gbp) : "None yet"}
              </p>
              <p className="mt-2 text-sm text-stone-600">
                {lastPaidPayout
                  ? `${businessesById[lastPaidPayout.booking.business_id]?.name || "Business"} | paid`
                  : "Paid shifts will move here once payout is sent."}
              </p>
            </section>
            <section className="panel-soft p-5">
              <p className="text-sm font-medium text-stone-500">Tracked shifts</p>
              <p className="mt-2 text-3xl font-semibold text-stone-900">{payoutHistory.length}</p>
              <p className="mt-2 text-sm text-stone-600">
                Every paid or payout-tracked shift is listed below.
              </p>
            </section>
          </>
        ) : null}
      </div>

      {payoutHistory.length > 0 ? (
        <div className="space-y-4">
          {payoutHistory.map((booking) => {
            const payment = paymentsByBookingId[booking.id];
            const business = businessesById[booking.business_id];

            return (
              <article key={booking.id} className="panel-soft p-5 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-lg font-semibold text-stone-900">
                      {business?.name || "Business"}
                    </p>
                    <p className="mt-1 text-sm text-stone-600">
                      {business?.location || booking.location}
                    </p>
                  </div>
                  {payment ? (
                    <div className="flex flex-wrap gap-2">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${paymentStatusClass(payment.status)}`}>
                        {formatPaymentStatus(payment.status)}
                      </span>
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${payoutStatusClass(payment.payout_status)}`}>
                        {formatPayoutStatus(payment.payout_status)}
                      </span>
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-3 text-sm text-stone-600 sm:grid-cols-2">
                  <p><span className="font-medium text-stone-900">Shift:</span> {formatBookingDate(booking.shift_date)}</p>
                  <p><span className="font-medium text-stone-900">Time:</span> {formatBookingTimeRange(booking.start_time, booking.end_time, booking.shift_date, booking.shift_end_date)}</p>
                  <p><span className="font-medium text-stone-900">Rate:</span> {formatCurrency(booking.hourly_rate_gbp)}/hr</p>
                  <p><span className="font-medium text-stone-900">Expected payout:</span> {payment ? formatCurrency(payment.worker_payout_gbp) : "Pending"}</p>
                </div>

                <p className="mt-4 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm leading-6 text-stone-500">
                  {getPayoutSupportCopy(payment ?? null)}
                </p>
                {payment?.payout_hold_reason ? (
                  <div className="action-needed-banner mt-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#67B7FF]">
                      Action needed
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[#CFE6FF]">
                      {payment.payout_hold_reason}
                    </p>
                  </div>
                ) : null}

                <div className="mt-4">
                  <Link href={`/dashboard/worker/bookings/${booking.id}`} className="secondary-btn w-full px-5 sm:w-auto">
                    View shift detail
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      ) : hasPayoutSummaryData ? (
        <div className="mobile-empty-state">
          <h2 className="text-xl font-semibold text-stone-900">No payment activity yet</h2>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            Accept shifts and complete them reliably to see payout status here.
          </p>
        </div>
      ) : null}
    </div>
  );
}

export default function WorkerPaymentsPage() {
  return (
    <Suspense fallback={null}>
      <WorkerPaymentsPageContent />
    </Suspense>
  );
}
