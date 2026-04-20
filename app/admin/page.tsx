"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast-provider";
import { bookingStatusClass, formatBookingDate, formatBookingTimeRange } from "@/lib/bookings";
import { paymentStatusClass } from "@/lib/payments";
import { fetchWithSession } from "@/lib/route-client";

type AdminBookingItem = {
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
  } | null;
  workerName: string;
  businessName: string;
  lifecycleLabel: string;
  paymentLabel: string;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 2,
  }).format(value);
}

export default function AdminBookingsPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<AdminBookingItem[]>([]);
  const [counts, setCounts] = useState({
    pending: 0,
    confirmed: 0,
    completed: 0,
    unpaid: 0,
    paid: 0,
  });
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [payment, setPayment] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        if (query) params.set("query", query);
        if (status) params.set("status", status);
        if (payment) params.set("payment", payment);

        const response = await fetchWithSession(`/api/admin/bookings?${params.toString()}`);
        const payload = (await response.json()) as {
          error?: string;
          items?: AdminBookingItem[];
          counts?: typeof counts;
        };

        if (!response.ok) {
          throw new Error(payload.error || "Unable to load admin bookings.");
        }

        if (active) {
          setItems(payload.items ?? []);
          setCounts(payload.counts ?? counts);
        }
      } catch (nextError) {
        const message =
          nextError instanceof Error ? nextError.message : "Unable to load admin bookings.";

        if (active) {
          setError(message);
          setItems([]);
        }
        showToast({
          title: "Admin data unavailable",
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
  }, [counts, payment, query, showToast, status]);

  const statCards = useMemo(
    () => [
      { label: "Pending", value: counts.pending },
      { label: "Confirmed", value: counts.confirmed },
      { label: "Completed", value: counts.completed },
      { label: "Unpaid", value: counts.unpaid },
      { label: "Paid", value: counts.paid },
    ],
    [counts],
  );

  return (
    <div className="min-h-screen bg-black px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="section-label">KruVii admin</p>
            <h1 className="mt-3 text-2xl font-semibold text-stone-900 sm:text-3xl">
              Booking operations
            </h1>
          </div>
          <Link href="/dashboard/business" className="secondary-btn w-full px-6 sm:w-auto">
            Back to dashboard
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {statCards.map((card) => (
            <section key={card.label} className="panel-soft p-5">
              <p className="text-sm font-medium text-stone-500">{card.label}</p>
              <p className="mt-2 text-3xl font-semibold text-stone-900">{card.value}</p>
            </section>
          ))}
        </div>

        <section className="panel-soft p-5 sm:p-6">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_220px_220px]">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search worker, business, role, date"
              className="w-full rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-base text-stone-100 outline-none transition focus:border-[#00A7FF]"
            />
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-base text-stone-100 outline-none transition focus:border-[#00A7FF]"
            >
              <option value="">All booking statuses</option>
              <option value="pending">Pending</option>
              <option value="accepted">Accepted</option>
              <option value="declined">Declined</option>
              <option value="cancelled">Cancelled</option>
              <option value="completed">Completed</option>
              <option value="no_show">No-show</option>
            </select>
            <select
              value={payment}
              onChange={(event) => setPayment(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-base text-stone-100 outline-none transition focus:border-[#00A7FF]"
            >
              <option value="">All payment states</option>
              <option value="pending">Unpaid</option>
              <option value="captured">Paid</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
            </select>
          </div>
        </section>

        <section className="panel-soft p-5 sm:p-6">
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-28 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="mobile-empty-state">
              <h2 className="text-xl font-semibold text-stone-900">Admin access unavailable</h2>
              <p className="mt-3 text-sm leading-6 text-stone-600">{error}</p>
            </div>
          ) : items.length === 0 ? (
            <div className="mobile-empty-state">
              <h2 className="text-xl font-semibold text-stone-900">No bookings found</h2>
              <p className="mt-3 text-sm leading-6 text-stone-600">
                Try another search or filter combination.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => (
                <article key={item.booking.id} className="rounded-[2rem] border border-white/10 bg-black/40 p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <p className="text-lg font-semibold text-stone-100">
                        {item.businessName} {"->"} {item.workerName}
                      </p>
                      <p className="mt-2 text-sm text-stone-400">
                        {item.booking.requested_role_label || "Hospitality shift"} | {formatBookingDate(item.booking.shift_date)} |{" "}
                        {formatBookingTimeRange(
                          item.booking.start_time,
                          item.booking.end_time,
                          item.booking.shift_date,
                          item.booking.shift_end_date,
                        )}
                      </p>
                      <p className="mt-2 text-sm text-stone-400">{item.booking.location}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${bookingStatusClass(item.booking.status as never)}`}>
                        {item.lifecycleLabel}
                      </span>
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${paymentStatusClass((item.payment?.status ?? "pending") as never)}`}>
                        {item.paymentLabel}
                      </span>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm text-stone-400">
                      Total {formatCurrency(item.booking.total_amount_gbp)} | Fee {formatCurrency(item.booking.platform_fee_gbp)}
                    </div>
                    <Link
                      href={`/admin/bookings/${item.booking.id}`}
                      className="primary-btn w-full px-6 sm:w-auto"
                    >
                      View booking
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
