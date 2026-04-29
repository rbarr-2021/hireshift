"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast-provider";
import { formatBookingDate, formatBookingTimeRange } from "@/lib/bookings";
import { getPaymentEventLabel, paymentStatusClass, payoutStatusClass } from "@/lib/payments";
import { fetchWithSession } from "@/lib/route-client";

type PaymentEventItem = {
  id: string;
  event_type: string;
  source: string;
  created_at: string;
  metadata: Record<string, unknown>;
};

type AdminPaymentItem = {
  booking: {
    id: string;
    shift_date: string;
    shift_end_date: string | null;
    start_time: string;
    end_time: string;
    requested_role_label: string | null;
    location: string;
    status: string;
    total_amount_gbp: number;
    platform_fee_gbp: number;
    attendance_status: string;
    worker_hours_claimed: number | null;
    business_hours_approved: number | null;
    business_adjustment_reason: string | null;
  };
  payment: {
    id: string;
    status: string;
    payout_status: string;
    gross_amount_gbp: number;
    platform_fee_gbp: number;
    worker_payout_gbp: number;
    stripe_payment_intent_id: string | null;
    stripe_checkout_session_id: string | null;
    stripe_transfer_id: string | null;
    failure_reason: string | null;
    dispute_reason: string | null;
    stripe_last_synced_at: string | null;
    stripe_payment_status: string | null;
    stripe_transfer_status: string | null;
    reconciliation_status: string | null;
    reconciliation_issue: string | null;
    reconciliation_checked_at: string | null;
  } | null;
  workerName: string;
  businessName: string;
  workerPayoutReady: boolean;
  workerStripeAccountLinked: boolean;
  paymentLabel: string;
  payoutLabel: string;
  nextActionLabel: string;
  paymentEvents: PaymentEventItem[];
};

type PlatformPaymentControls = {
  payouts_enabled: boolean;
  refunds_enabled: boolean;
  admin_manual_release_required: boolean;
  max_single_payout_gbp: number | null;
  max_single_refund_gbp: number | null;
  emergency_hold_enabled: boolean;
  emergency_hold_reason: string | null;
  test_mode_banner_enabled: boolean;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 2,
  }).format(value);
}

function attendanceBadgeClass(status: string) {
  if (status === "approved" || status === "adjusted") {
    return "status-badge status-badge--ready";
  }

  if (status === "disputed") {
    return "bg-red-100 text-red-900";
  }

  if (status === "pending_approval") {
    return "status-badge status-badge--rating";
  }

  return "status-badge";
}

function payoutReadinessLabel(item: AdminPaymentItem) {
  if (item.workerPayoutReady) {
    return "Worker ready";
  }

  return item.workerStripeAccountLinked ? "Stripe incomplete" : "Stripe missing";
}

function payoutReadinessClass(item: AdminPaymentItem) {
  if (item.workerPayoutReady) {
    return "status-badge status-badge--ready";
  }

  return item.workerStripeAccountLinked
    ? "status-badge status-badge--rating"
    : "status-badge";
}

export default function AdminPaymentsPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<AdminPaymentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paymentFilter, setPaymentFilter] = useState("");
  const [query, setQuery] = useState("");
  const [expandedBookingId, setExpandedBookingId] = useState<string | null>(null);
  const [actionBusyByBooking, setActionBusyByBooking] = useState<Record<string, boolean>>({});
  const [syncBusyByBooking, setSyncBusyByBooking] = useState<Record<string, boolean>>({});
  const [controls, setControls] = useState<PlatformPaymentControls | null>(null);
  const [controlsBusy, setControlsBusy] = useState(false);
  const [stripeTestModeActive, setStripeTestModeActive] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (paymentFilter) params.set("payment", paymentFilter);
      if (query) params.set("query", query);

      const response = await fetchWithSession(`/api/admin/bookings?${params.toString()}`);
      const payload = (await response.json()) as {
        error?: string;
        items?: AdminPaymentItem[];
      };

      if (!response.ok) {
        throw new Error(payload.error || "Unable to load admin payments.");
      }

      setItems((payload.items ?? []).filter((item) => Boolean(item.payment)));
    } catch (nextError) {
      const message =
        nextError instanceof Error ? nextError.message : "Unable to load admin payments.";
      setError(message);
      setItems([]);
      showToast({
        title: "Payments unavailable",
        description: message,
        tone: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentFilter, query]);

  useEffect(() => {
    let active = true;

    const loadControls = async () => {
      try {
        const response = await fetchWithSession("/api/admin/payment-controls");
        const payload = (await response.json()) as {
          error?: string;
          controls?: PlatformPaymentControls;
          stripe_mode?: { test_mode_active?: boolean };
        };

        if (!response.ok) {
          throw new Error(payload.error || "Unable to load platform controls.");
        }

        if (!active) {
          return;
        }

        setControls(payload.controls ?? null);
        setStripeTestModeActive(Boolean(payload.stripe_mode?.test_mode_active));
      } catch (nextError) {
        if (!active) {
          return;
        }
        showToast({
          title: "Controls unavailable",
          description:
            nextError instanceof Error
              ? nextError.message
              : "Unable to load platform controls.",
          tone: "error",
        });
      }
    };

    void loadControls();

    return () => {
      active = false;
    };
  }, [showToast]);

  const saveControls = async () => {
    if (!controls) {
      return;
    }

    setControlsBusy(true);

    try {
      const response = await fetchWithSession("/api/admin/payment-controls", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(controls),
      });
      const payload = (await response.json()) as { error?: string; controls?: PlatformPaymentControls };

      if (!response.ok) {
        throw new Error(payload.error || "Unable to save controls.");
      }

      setControls(payload.controls ?? controls);
      showToast({
        title: "Controls updated",
        description: "Operational payment controls have been saved.",
        tone: "success",
      });
    } catch (nextError) {
      showToast({
        title: "Save failed",
        description:
          nextError instanceof Error ? nextError.message : "Unable to save controls.",
        tone: "error",
      });
    } finally {
      setControlsBusy(false);
    }
  };

  const runAction = async (input: {
    bookingId: string;
    payoutAction: "approve_payout" | "hold" | "retry_payout" | "refund" | "flag_issue";
    requireReason?: boolean;
    refundAmountGbp?: number | null;
    successTitle: string;
  }) => {
    const reason = input.requireReason
      ? window.prompt("Add a short reason:")?.trim() || ""
      : "";

    if (input.requireReason && !reason) {
      showToast({
        title: "Reason required",
        description: "Please add a reason to continue.",
        tone: "error",
      });
      return;
    }

    setActionBusyByBooking((previous) => ({ ...previous, [input.bookingId]: true }));

    try {
      const response = await fetchWithSession(`/api/admin/bookings/${input.bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payoutAction: input.payoutAction,
          reason: reason || undefined,
          refundAmountGbp: input.refundAmountGbp ?? undefined,
        }),
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Unable to update payment.");
      }

      showToast({
        title: input.successTitle,
        description: "Payment status has been updated.",
        tone: "success",
      });

      await load();
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Unable to update payment.";
      showToast({
        title: "Action failed",
        description: message,
        tone: "error",
      });
    } finally {
      setActionBusyByBooking((previous) => ({ ...previous, [input.bookingId]: false }));
    }
  };

  const runStripeSync = async (bookingId: string) => {
    setSyncBusyByBooking((previous) => ({ ...previous, [bookingId]: true }));

    try {
      const response = await fetchWithSession(`/api/admin/bookings/${bookingId}/reconcile`, {
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Stripe sync failed.");
      }

      showToast({
        title: "Stripe sync complete",
        description: "Reconciliation status has been updated.",
        tone: "success",
      });

      await load();
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Stripe sync failed.";
      showToast({
        title: "Sync failed",
        description: message,
        tone: "error",
      });
    } finally {
      setSyncBusyByBooking((previous) => ({ ...previous, [bookingId]: false }));
    }
  };

  const totals = useMemo(
    () =>
      items.reduce(
        (accumulator, item) => {
          if (!item.payment) {
            return accumulator;
          }

          accumulator.revenue += item.payment.gross_amount_gbp;
          accumulator.commission += item.payment.platform_fee_gbp;
          accumulator.pendingRelease +=
            item.payment.payout_status === "pending" || item.payment.payout_status === "not_started"
              ? 1
              : 0;
          accumulator.inProgress += item.payment.payout_status === "in_progress" ? 1 : 0;
          accumulator.completed += item.payment.payout_status === "completed" ? 1 : 0;
          accumulator.risk +=
            item.payment.payout_status === "failed" ||
            item.payment.payout_status === "on_hold" ||
            item.payment.status === "disputed"
              ? 1
              : 0;
          return accumulator;
        },
        {
          revenue: 0,
          commission: 0,
          pendingRelease: 0,
          inProgress: 0,
          completed: 0,
          risk: 0,
        },
      ),
    [items],
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="section-label">NexHyr admin</p>
        <h1 className="mt-3 text-2xl font-semibold text-stone-900 sm:text-3xl">Payment control</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
          See what has been paid, what is approved, and what is safe to release next.
        </p>
      </div>

      {controls?.emergency_hold_enabled ? (
        <section className="rounded-2xl border border-amber-300/40 bg-amber-100/10 px-4 py-3 text-sm text-amber-100">
          Emergency payment hold is active
          {controls.emergency_hold_reason ? `: ${controls.emergency_hold_reason}` : "."}
        </section>
      ) : null}
      {controls && !controls.payouts_enabled ? (
        <section className="rounded-2xl border border-red-300/40 bg-red-100/10 px-4 py-3 text-sm text-red-100">
          Payouts are currently disabled.
        </section>
      ) : null}
      {controls && !controls.refunds_enabled ? (
        <section className="rounded-2xl border border-red-300/40 bg-red-100/10 px-4 py-3 text-sm text-red-100">
          Refunds are currently disabled.
        </section>
      ) : null}
      {controls?.test_mode_banner_enabled && stripeTestModeActive ? (
        <section className="rounded-2xl border border-blue-300/40 bg-blue-100/10 px-4 py-3 text-sm text-blue-100">
          Stripe test mode appears to be active.
        </section>
      ) : null}

      {controls ? (
        <section className="panel-soft p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-stone-900">Platform payment controls</h2>
            <button
              type="button"
              onClick={() => void saveControls()}
              disabled={controlsBusy}
              className="secondary-btn px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {controlsBusy ? "Saving..." : "Save controls"}
            </button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm text-stone-200">
              <input
                type="checkbox"
                checked={controls.payouts_enabled}
                onChange={(event) =>
                  setControls((previous) =>
                    previous
                      ? { ...previous, payouts_enabled: event.target.checked }
                      : previous,
                  )
                }
              />
              Payouts enabled
            </label>
            <label className="flex items-center gap-2 text-sm text-stone-200">
              <input
                type="checkbox"
                checked={controls.refunds_enabled}
                onChange={(event) =>
                  setControls((previous) =>
                    previous
                      ? { ...previous, refunds_enabled: event.target.checked }
                      : previous,
                  )
                }
              />
              Refunds enabled
            </label>
            <label className="flex items-center gap-2 text-sm text-stone-200">
              <input
                type="checkbox"
                checked={controls.admin_manual_release_required}
                onChange={(event) =>
                  setControls((previous) =>
                    previous
                      ? { ...previous, admin_manual_release_required: event.target.checked }
                      : previous,
                  )
                }
              />
              Manual admin payout release required
            </label>
            <label className="flex items-center gap-2 text-sm text-stone-200">
              <input
                type="checkbox"
                checked={controls.test_mode_banner_enabled}
                onChange={(event) =>
                  setControls((previous) =>
                    previous
                      ? { ...previous, test_mode_banner_enabled: event.target.checked }
                      : previous,
                  )
                }
              />
              Test mode banner enabled
            </label>
            <label className="flex items-center gap-2 text-sm text-stone-200">
              <input
                type="checkbox"
                checked={controls.emergency_hold_enabled}
                onChange={(event) =>
                  setControls((previous) =>
                    previous
                      ? { ...previous, emergency_hold_enabled: event.target.checked }
                      : previous,
                  )
                }
              />
              Emergency hold enabled
            </label>
            <label className="text-sm text-stone-200">
              Emergency hold reason
              <input
                value={controls.emergency_hold_reason ?? ""}
                onChange={(event) =>
                  setControls((previous) =>
                    previous
                      ? { ...previous, emergency_hold_reason: event.target.value }
                      : previous,
                  )
                }
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-sm text-stone-100"
              />
            </label>
            <label className="text-sm text-stone-200">
              Max single payout (GBP)
              <input
                type="number"
                min={0}
                step={0.01}
                value={controls.max_single_payout_gbp ?? ""}
                onChange={(event) =>
                  setControls((previous) =>
                    previous
                      ? {
                          ...previous,
                          max_single_payout_gbp:
                            event.target.value === "" ? null : Number(event.target.value),
                        }
                      : previous,
                  )
                }
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-sm text-stone-100"
              />
            </label>
            <label className="text-sm text-stone-200">
              Max single refund (GBP)
              <input
                type="number"
                min={0}
                step={0.01}
                value={controls.max_single_refund_gbp ?? ""}
                onChange={(event) =>
                  setControls((previous) =>
                    previous
                      ? {
                          ...previous,
                          max_single_refund_gbp:
                            event.target.value === "" ? null : Number(event.target.value),
                        }
                      : previous,
                  )
                }
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-sm text-stone-100"
              />
            </label>
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <section className="panel-soft p-5">
          <p className="text-sm font-medium text-stone-500">Total revenue collected</p>
          <p className="mt-2 text-2xl font-semibold text-stone-900">{formatCurrency(totals.revenue)}</p>
        </section>
        <section className="panel-soft p-5">
          <p className="text-sm font-medium text-stone-500">Platform commission</p>
          <p className="mt-2 text-2xl font-semibold text-stone-900">{formatCurrency(totals.commission)}</p>
        </section>
        <section className="panel-soft p-5">
          <p className="text-sm font-medium text-stone-500">Payouts pending release</p>
          <p className="mt-2 text-2xl font-semibold text-stone-900">{totals.pendingRelease}</p>
        </section>
        <section className="panel-soft p-5">
          <p className="text-sm font-medium text-stone-500">Payouts in progress</p>
          <p className="mt-2 text-2xl font-semibold text-stone-900">{totals.inProgress}</p>
        </section>
        <section className="panel-soft p-5">
          <p className="text-sm font-medium text-stone-500">Payouts completed</p>
          <p className="mt-2 text-2xl font-semibold text-stone-900">{totals.completed}</p>
        </section>
        <section className="panel-soft p-5">
          <p className="text-sm font-medium text-stone-500">Failed / on hold / disputed</p>
          <p className="mt-2 text-2xl font-semibold text-stone-900">{totals.risk}</p>
        </section>
      </div>

      <section className="panel-soft p-5 sm:p-6">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search worker, business, role, date"
            className="w-full rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-base text-stone-100 outline-none transition focus:border-[#00A7FF]"
          />
          <select
            value={paymentFilter}
            onChange={(event) => setPaymentFilter(event.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-base text-stone-100 outline-none transition focus:border-[#00A7FF]"
          >
            <option value="">All states</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending payment</option>
            <option value="failed">Failed</option>
            <option value="refunded">Refunded</option>
            <option value="disputed">Disputed</option>
            <option value="pending">Payout pending</option>
            <option value="in_progress">Payout in progress</option>
            <option value="completed">Payout completed</option>
            <option value="on_hold">On hold</option>
          </select>
        </div>
      </section>

      <section className="panel-soft p-5 sm:p-6">
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-36 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="mobile-empty-state">
            <h2 className="text-xl font-semibold text-stone-900">Payments unavailable</h2>
            <p className="mt-3 text-sm leading-6 text-stone-600">{error}</p>
          </div>
        ) : items.length === 0 ? (
          <div className="mobile-empty-state">
            <h2 className="text-xl font-semibold text-stone-900">No payment records yet</h2>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              Paid bookings will appear here once business checkout completes.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item) => {
              const payment = item.payment;

              if (!payment) {
                return null;
              }

              const isBusy = Boolean(actionBusyByBooking[item.booking.id]);
              const syncBusy = Boolean(syncBusyByBooking[item.booking.id]);
              const canRelease =
                payment.status === "paid" &&
                (payment.payout_status === "pending" || payment.payout_status === "not_started") &&
                (item.booking.attendance_status === "approved" ||
                  item.booking.attendance_status === "adjusted") &&
                Boolean(item.booking.business_hours_approved && item.booking.business_hours_approved > 0) &&
                item.workerPayoutReady;

              const canRetry = payment.payout_status === "failed";
              const canRefund =
                payment.status === "paid" &&
                payment.payout_status !== "in_progress" &&
                payment.payout_status !== "completed" &&
                !payment.stripe_transfer_id;
              const isExpanded = expandedBookingId === item.booking.id;

              return (
                <article
                  key={item.booking.id}
                  className="rounded-[2rem] border border-white/10 bg-black/40 p-5"
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <p className="text-lg font-semibold text-stone-100">
                        {item.businessName} {"->"} {item.workerName}
                      </p>
                      <p className="mt-2 text-sm text-stone-400">
                        {item.booking.requested_role_label || "Hospitality shift"} |{" "}
                        {formatBookingDate(item.booking.shift_date)} |{" "}
                        {formatBookingTimeRange(
                          item.booking.start_time,
                          item.booking.end_time,
                          item.booking.shift_date,
                          item.booking.shift_end_date,
                        )}
                      </p>
                      <p className="mt-2 text-sm text-stone-400">{item.booking.location}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${paymentStatusClass(payment.status as never)}`}
                      >
                        {item.paymentLabel}
                      </span>
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${payoutStatusClass(payment.payout_status as never)}`}
                      >
                        {item.payoutLabel}
                      </span>
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${attendanceBadgeClass(item.booking.attendance_status as never)}`}
                      >
                        {item.booking.attendance_status.replaceAll("_", " ")}
                      </span>
                      <span className={payoutReadinessClass(item)}>{payoutReadinessLabel(item)}</span>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 text-sm text-stone-400 sm:grid-cols-2 xl:grid-cols-4">
                    <p>
                      <span className="font-medium text-stone-100">Gross:</span>{" "}
                      {formatCurrency(payment.gross_amount_gbp)}
                    </p>
                    <p>
                      <span className="font-medium text-stone-100">Platform fee:</span>{" "}
                      {formatCurrency(payment.platform_fee_gbp)}
                    </p>
                    <p>
                      <span className="font-medium text-stone-100">Worker payout:</span>{" "}
                      {formatCurrency(payment.worker_payout_gbp)}
                    </p>
                    <p>
                      <span className="font-medium text-stone-100">Next action:</span>{" "}
                      {item.nextActionLabel}
                    </p>
                    <p>
                      <span className="font-medium text-stone-100">Reconciliation:</span>{" "}
                      {payment.reconciliation_status ?? "needs_review"}
                    </p>
                  </div>

                  {payment.reconciliation_issue ? (
                    <p className="mt-3 rounded-xl border border-amber-200/40 bg-amber-100/10 px-3 py-2 text-sm text-amber-100">
                      {payment.reconciliation_issue}
                    </p>
                  ) : null}

                  <div className="mt-5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="secondary-btn px-4 py-2 text-sm"
                      onClick={() =>
                        setExpandedBookingId((current) =>
                          current === item.booking.id ? null : item.booking.id,
                        )
                      }
                    >
                      {isExpanded ? "Hide details" : "View details"}
                    </button>
                    <Link href={`/admin/bookings/${item.booking.id}`} className="secondary-btn px-4 py-2 text-sm">
                      Open booking
                    </Link>
                    <button
                      type="button"
                      disabled={syncBusy}
                      onClick={() => void runStripeSync(item.booking.id)}
                      className="secondary-btn px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {syncBusy ? "Syncing..." : "Sync with Stripe"}
                    </button>
                    {canRelease ? (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          void runAction({
                            bookingId: item.booking.id,
                            payoutAction: "approve_payout",
                            successTitle: "Payout release started",
                          })
                        }
                        className="primary-btn px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Release payout
                      </button>
                    ) : null}
                    {canRetry ? (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          void runAction({
                            bookingId: item.booking.id,
                            payoutAction: "retry_payout",
                            requireReason: true,
                            successTitle: "Payout retry started",
                          })
                        }
                        className="secondary-btn px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Retry payout
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() =>
                        void runAction({
                          bookingId: item.booking.id,
                          payoutAction: "hold",
                          requireReason: true,
                          successTitle: "Payout placed on hold",
                        })
                      }
                      className="secondary-btn px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Hold payout
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() =>
                        void runAction({
                            bookingId: item.booking.id,
                            payoutAction: "flag_issue",
                            requireReason: true,
                            successTitle: "Issue flagged",
                          })
                      }
                      className="secondary-btn px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Flag issue
                    </button>
                    {canRefund ? (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          void runAction({
                            bookingId: item.booking.id,
                            payoutAction: "refund",
                            requireReason: true,
                            successTitle: "Refund requested",
                          })
                        }
                        className="secondary-btn px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Refund payment
                      </button>
                    ) : null}
                  </div>

                  {isExpanded ? (
                    <div className="mt-5 space-y-4 rounded-2xl border border-white/10 bg-black/30 p-4">
                      <div className="grid gap-3 text-sm text-stone-300 sm:grid-cols-2">
                        <p>
                          <span className="font-medium text-stone-100">Claimed hours:</span>{" "}
                          {item.booking.worker_hours_claimed ?? "-"}
                        </p>
                        <p>
                          <span className="font-medium text-stone-100">Approved hours:</span>{" "}
                          {item.booking.business_hours_approved ?? "-"}
                        </p>
                        {item.booking.business_adjustment_reason ? (
                          <p className="sm:col-span-2">
                            <span className="font-medium text-stone-100">Adjustment reason:</span>{" "}
                            {item.booking.business_adjustment_reason}
                          </p>
                        ) : null}
                        {payment.dispute_reason ? (
                          <p className="sm:col-span-2">
                            <span className="font-medium text-stone-100">Dispute reason:</span>{" "}
                            {payment.dispute_reason}
                          </p>
                        ) : null}
                        {payment.failure_reason ? (
                          <p className="sm:col-span-2">
                            <span className="font-medium text-stone-100">Hold / failure:</span>{" "}
                            {payment.failure_reason}
                          </p>
                        ) : null}
                        <p>
                          <span className="font-medium text-stone-100">Stripe payment state:</span>{" "}
                          {payment.stripe_payment_status ?? "-"}
                        </p>
                        <p>
                          <span className="font-medium text-stone-100">Stripe transfer state:</span>{" "}
                          {payment.stripe_transfer_status ?? "-"}
                        </p>
                        <p>
                          <span className="font-medium text-stone-100">Last synced:</span>{" "}
                          {payment.stripe_last_synced_at
                            ? new Date(payment.stripe_last_synced_at).toLocaleString("en-GB")
                            : "-"}
                        </p>
                        <p>
                          <span className="font-medium text-stone-100">Reconciled:</span>{" "}
                          {payment.reconciliation_checked_at
                            ? new Date(payment.reconciliation_checked_at).toLocaleString("en-GB")
                            : "-"}
                        </p>
                      </div>

                      <details className="rounded-xl border border-white/10 bg-black/40 p-3">
                        <summary className="cursor-pointer text-sm font-medium text-stone-200">
                          Technical details
                        </summary>
                        <div className="mt-3 grid gap-2 text-xs text-stone-400">
                          <p>Payment intent: {payment.stripe_payment_intent_id ?? "-"}</p>
                          <p>Checkout session: {payment.stripe_checkout_session_id ?? "-"}</p>
                          <p>Transfer: {payment.stripe_transfer_id ?? "-"}</p>
                        </div>
                      </details>

                      <div>
                        <p className="text-sm font-medium text-stone-100">Payment timeline</p>
                        <div className="mt-3 space-y-2">
                          {item.paymentEvents.length === 0 ? (
                            <p className="text-xs text-stone-500">No payment events yet.</p>
                          ) : (
                            item.paymentEvents.slice(0, 8).map((event) => (
                              <div
                                key={event.id}
                                className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-stone-300"
                              >
                                <p className="font-medium text-stone-100">
                                  {getPaymentEventLabel(event.event_type)}
                                </p>
                                <p className="mt-1 text-stone-400">
                                  {new Date(event.created_at).toLocaleString("en-GB")} | {event.source}
                                </p>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
