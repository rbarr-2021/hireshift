"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast-provider";
import { formatBookingDate, formatBookingTimeRange } from "@/lib/bookings";
import { paymentStatusClass, payoutStatusClass } from "@/lib/payments";
import { fetchWithSession } from "@/lib/route-client";

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
  };
  payment: {
    status: string;
    payout_status: string;
    gross_amount_gbp: number;
    platform_fee_gbp: number;
    worker_payout_gbp: number;
    stripe_payment_intent_id: string | null;
    stripe_transfer_id: string | null;
    payout_approved_at: string | null;
    payout_sent_at: string | null;
    payout_hold_reason: string | null;
  } | null;
  workerName: string;
  businessName: string;
  workerPayoutReady: boolean;
  workerStripeAccountLinked: boolean;
  lifecycleLabel: string;
  paymentLabel: string;
  payoutLabel: string;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 2,
  }).format(value);
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

  useEffect(() => {
    let active = true;

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

        if (active) {
          setItems((payload.items ?? []).filter((item) => Boolean(item.payment)));
        }
      } catch (nextError) {
        const message =
          nextError instanceof Error ? nextError.message : "Unable to load admin payments.";

        if (active) {
          setError(message);
          setItems([]);
        }

        showToast({
          title: "Payments unavailable",
          description: message,
          tone: "error",
        });
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [paymentFilter, query, showToast]);

  const totals = useMemo(
    () =>
      items.reduce(
        (accumulator, item) => {
          if (!item.payment) {
            return accumulator;
          }

          accumulator.gross += item.payment.gross_amount_gbp;
          accumulator.commission += item.payment.platform_fee_gbp;
          accumulator.workerPayout += item.payment.worker_payout_gbp;
          accumulator.onHold += item.payment.payout_status === "on_hold" ? 1 : 0;
          accumulator.ready += item.workerPayoutReady ? 1 : 0;
          accumulator.paid += item.payment.payout_status === "paid" ? 1 : 0;

          return accumulator;
        },
        {
          gross: 0,
          commission: 0,
          workerPayout: 0,
          onHold: 0,
          ready: 0,
          paid: 0,
        },
      ),
    [items],
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="section-label">NexHyr admin</p>
        <h1 className="mt-3 text-2xl font-semibold text-stone-900 sm:text-3xl">
          Payments and payouts
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
          Track business payments, NexHyr commission, worker payout readiness, and Stripe transfer status.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <section className="panel-soft p-5">
          <p className="text-sm font-medium text-stone-500">Business paid</p>
          <p className="mt-2 text-2xl font-semibold text-stone-900">{formatCurrency(totals.gross)}</p>
        </section>
        <section className="panel-soft p-5">
          <p className="text-sm font-medium text-stone-500">NexHyr commission</p>
          <p className="mt-2 text-2xl font-semibold text-stone-900">{formatCurrency(totals.commission)}</p>
        </section>
        <section className="panel-soft p-5">
          <p className="text-sm font-medium text-stone-500">Worker payout</p>
          <p className="mt-2 text-2xl font-semibold text-stone-900">{formatCurrency(totals.workerPayout)}</p>
        </section>
        <section className="panel-soft p-5">
          <p className="text-sm font-medium text-stone-500">Ready workers</p>
          <p className="mt-2 text-2xl font-semibold text-stone-900">{totals.ready}</p>
        </section>
        <section className="panel-soft p-5">
          <p className="text-sm font-medium text-stone-500">Paid payouts</p>
          <p className="mt-2 text-2xl font-semibold text-stone-900">{totals.paid}</p>
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
            <option value="">All payment states</option>
            <option value="captured">Business paid</option>
            <option value="awaiting_business_approval">Awaiting approval</option>
            <option value="approved_for_payout">Approved for payout</option>
            <option value="paid">Worker paid</option>
            <option value="on_hold">On hold</option>
            <option value="disputed">Disputed</option>
            <option value="failed">Failed</option>
            <option value="refunded">Refunded</option>
          </select>
        </div>
      </section>

      <section className="panel-soft p-5 sm:p-6">
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-32 w-full" />
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
              Paid bookings will appear here once a business completes checkout.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item) => {
              const payment = item.payment;

              if (!payment) {
                return null;
              }

              return (
                <article key={item.booking.id} className="rounded-[2rem] border border-white/10 bg-black/40 p-5">
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
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${paymentStatusClass(payment.status as never)}`}>
                        {item.paymentLabel}
                      </span>
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${payoutStatusClass(payment.payout_status as never)}`}>
                        {item.payoutLabel}
                      </span>
                      <span className={payoutReadinessClass(item)}>
                        {payoutReadinessLabel(item)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 text-sm text-stone-400 sm:grid-cols-2 xl:grid-cols-4">
                    <p>
                      <span className="font-medium text-stone-100">Business paid:</span>{" "}
                      {formatCurrency(payment.gross_amount_gbp)}
                    </p>
                    <p>
                      <span className="font-medium text-stone-100">NexHyr fee:</span>{" "}
                      {formatCurrency(payment.platform_fee_gbp)}
                    </p>
                    <p>
                      <span className="font-medium text-stone-100">Worker payout:</span>{" "}
                      {formatCurrency(payment.worker_payout_gbp)}
                    </p>
                    <p>
                      <span className="font-medium text-stone-100">Transfer:</span>{" "}
                      {payment.stripe_transfer_id ? "Sent" : "Not sent"}
                    </p>
                  </div>

                  {payment.payout_hold_reason ? (
                    <p className="mt-4 rounded-2xl border border-amber-200/70 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                      {payment.payout_hold_reason}
                    </p>
                  ) : null}

                  <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-stone-500">
                      Admin approves payout after shift completion. Stripe then sends the worker share and NexHyr keeps the fee.
                    </p>
                    <Link
                      href={`/admin/bookings/${item.booking.id}`}
                      className="primary-btn w-full px-6 sm:w-auto"
                    >
                      Manage payout
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
