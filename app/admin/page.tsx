"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast-provider";
import { bookingStatusClass, formatBookingDate, formatBookingTimeRange } from "@/lib/bookings";
import type { ShiftListingRecord } from "@/lib/models";
import { paymentStatusClass, payoutStatusClass } from "@/lib/payments";
import { fetchWithSession } from "@/lib/route-client";
import { clearSessionHintCookie } from "@/lib/session-hint";
import { getRemainingShiftPositions } from "@/lib/shift-listings";
import { supabase } from "@/lib/supabase";

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
    payout_status: string;
  } | null;
  workerName: string;
  businessName: string;
  lifecycleLabel: string;
  paymentLabel: string;
  payoutLabel: string;
};

type AdminUnfulfilledListingItem = {
  listing: ShiftListingRecord;
  businessName: string;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 2,
  }).format(value);
}

function isPastShift(item: AdminBookingItem) {
  const endDate = item.booking.shift_end_date || item.booking.shift_date;
  const endDateTime = new Date(`${endDate}T${item.booking.end_time}:00`);
  return Number.isFinite(endDateTime.getTime()) && endDateTime.getTime() < Date.now();
}

function isLiveShift(item: AdminBookingItem) {
  return (
    ["pending", "accepted"].includes(item.booking.status) &&
    !isPastShift(item) &&
    item.payment?.payout_status !== "disputed" &&
    item.payment?.payout_status !== "on_hold"
  );
}

function needsAdminReview(item: AdminBookingItem) {
  return (
    item.payment?.payout_status === "awaiting_business_approval" ||
    item.payment?.payout_status === "approved_for_payout" ||
    item.payment?.payout_status === "pending_confirmation" ||
    item.payment?.payout_status === "awaiting_shift_completion"
  );
}

function isDisputeItem(item: AdminBookingItem) {
  return (
    item.payment?.payout_status === "disputed" ||
    item.payment?.payout_status === "on_hold" ||
    item.booking.status === "no_show"
  );
}

function renderBookingList(items: AdminBookingItem[]) {
  return (
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
              {item.payment ? (
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${payoutStatusClass(item.payment.payout_status as never)}`}>
                  {item.payoutLabel}
                </span>
              ) : null}
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
  );
}

function renderUnfulfilledListingList(items: AdminUnfulfilledListingItem[]) {
  return (
    <div className="space-y-4">
      {items.map((item) => (
        <article key={item.listing.id} className="rounded-[2rem] border border-white/10 bg-black/40 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-lg font-semibold text-stone-100">
                {item.businessName} {"->"} {item.listing.role_label}
              </p>
              <p className="mt-2 text-sm text-stone-400">
                {formatBookingDate(item.listing.shift_date)} |{" "}
                {formatBookingTimeRange(
                  item.listing.start_time,
                  item.listing.end_time,
                  item.listing.shift_date,
                  item.listing.shift_end_date,
                )}
              </p>
              <p className="mt-2 text-sm text-stone-400">{item.listing.location}</p>
            </div>
            <span className="inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] status-badge">
              Unfilled
            </span>
          </div>
          <div className="mt-4 grid gap-2 text-sm text-stone-400 sm:grid-cols-3">
            <p>
              <span className="font-medium text-stone-100">Positions:</span>{" "}
              {getRemainingShiftPositions(item.listing)} unfilled
            </p>
            <p>
              <span className="font-medium text-stone-100">Posted:</span>{" "}
              {item.listing.open_positions} total
            </p>
            <p>
              <span className="font-medium text-stone-100">Claimed:</span>{" "}
              {item.listing.claimed_positions}
            </p>
          </div>
        </article>
      ))}
    </div>
  );
}

export default function AdminBookingsPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [items, setItems] = useState<AdminBookingItem[]>([]);
  const [unfulfilledListings, setUnfulfilledListings] = useState<AdminUnfulfilledListingItem[]>([]);
  const [counts, setCounts] = useState({
    pending: 0,
    approved: 0,
    completed: 0,
    disputed: 0,
    onHold: 0,
    paid: 0,
  });
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [payment, setPayment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

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
          unfulfilledListings?: AdminUnfulfilledListingItem[];
        };

        if (!response.ok) {
          throw new Error(payload.error || "Unable to load admin bookings.");
        }

        if (active) {
          setItems(payload.items ?? []);
          setUnfulfilledListings(payload.unfulfilledListings ?? []);
          setCounts(
            payload.counts ?? {
              pending: 0,
              approved: 0,
              completed: 0,
              disputed: 0,
              onHold: 0,
              paid: 0,
            },
          );
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
  }, [payment, query, showToast, status]);

  const statCards = useMemo(
    () => [
      { label: "Pending", value: counts.pending },
      { label: "Approved", value: counts.approved },
      { label: "Completed", value: counts.completed },
      { label: "Disputed", value: counts.disputed },
      { label: "On hold", value: counts.onHold },
      { label: "Paid", value: counts.paid },
    ],
    [counts],
  );

  const groupedItems = useMemo(
    () => ({
      live: items.filter(isLiveShift),
      review: items.filter(needsAdminReview),
      disputes: items.filter(isDisputeItem),
      past: items.filter((item) => isPastShift(item) || ["completed", "cancelled", "declined"].includes(item.booking.status)),
    }),
    [items],
  );

  const categoryCards = useMemo(
    () => [
      {
        label: "Live shifts",
        value: groupedItems.live.length,
        tone: "status-badge status-badge--ready",
        description: "Current and upcoming bookings",
      },
      {
        label: "Needs review",
        value: groupedItems.review.length,
        tone: "status-badge status-badge--rating",
        description: "Awaiting payout or completion checks",
      },
      {
        label: "Disputes",
        value: groupedItems.disputes.length,
        tone: "status-badge",
        description: "Held, disputed, or no-show items",
      },
      {
        label: "Past shifts",
        value: groupedItems.past.length + unfulfilledListings.length,
        tone: "status-badge",
        description: "Finished bookings and unfilled listings",
      },
    ],
    [
      groupedItems.disputes.length,
      groupedItems.live.length,
      groupedItems.past.length,
      groupedItems.review.length,
      unfulfilledListings.length,
    ],
  );

  const handleSignOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    clearSessionHintCookie();
    router.replace("/login");
  };

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
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link href="/dashboard/business" className="secondary-btn w-full px-6 sm:w-auto">
              Back to dashboard
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="secondary-btn w-full px-6 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {signingOut ? "Signing out..." : "Log out"}
            </button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          {statCards.map((card) => (
            <section key={card.label} className="panel-soft p-5">
              <p className="text-sm font-medium text-stone-500">{card.label}</p>
              <p className="mt-2 text-3xl font-semibold text-stone-900">{card.value}</p>
            </section>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {categoryCards.map((card) => (
            <section key={card.label} className="panel-soft p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-stone-500">{card.label}</p>
                  <p className="mt-2 text-3xl font-semibold text-stone-900">{card.value}</p>
                </div>
                <span className={card.tone}>{card.label}</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-stone-600">{card.description}</p>
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
              <option value="captured">Charge captured</option>
              <option value="approved_for_payout">Approved for payout</option>
              <option value="paid">Paid out</option>
              <option value="disputed">Disputed</option>
              <option value="on_hold">On hold</option>
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
            <div className="space-y-6">
              <section className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl font-semibold text-stone-900">Live shifts</h2>
                  <span className="status-badge status-badge--ready">{groupedItems.live.length}</span>
                </div>
                {groupedItems.live.length > 0 ? (
                  renderBookingList(groupedItems.live)
                ) : (
                  <div className="rounded-[1.75rem] border border-white/10 bg-black/30 px-5 py-4 text-sm text-stone-500">
                    No live shifts match the current filters.
                  </div>
                )}
              </section>

              <section className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl font-semibold text-stone-900">Needs review</h2>
                  <span className="status-badge status-badge--rating">{groupedItems.review.length}</span>
                </div>
                {groupedItems.review.length > 0 ? (
                  renderBookingList(groupedItems.review)
                ) : (
                  <div className="rounded-[1.75rem] border border-white/10 bg-black/30 px-5 py-4 text-sm text-stone-500">
                    No review items match the current filters.
                  </div>
                )}
              </section>

              <section className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl font-semibold text-stone-900">Disputes</h2>
                  <span className="status-badge">{groupedItems.disputes.length}</span>
                </div>
                {groupedItems.disputes.length > 0 ? (
                  renderBookingList(groupedItems.disputes)
                ) : (
                  <div className="rounded-[1.75rem] border border-white/10 bg-black/30 px-5 py-4 text-sm text-stone-500">
                    No disputes match the current filters.
                  </div>
                )}
              </section>

              <section className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl font-semibold text-stone-900">Unfulfilled</h2>
                  <span className="status-badge">{unfulfilledListings.length}</span>
                </div>
                {unfulfilledListings.length > 0 ? (
                  renderUnfulfilledListingList(unfulfilledListings)
                ) : (
                  <div className="rounded-[1.75rem] border border-white/10 bg-black/30 px-5 py-4 text-sm text-stone-500">
                    No unfilled past listings match the current filters.
                  </div>
                )}
              </section>

              <section className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl font-semibold text-stone-900">Past shifts</h2>
                  <span className="status-badge">{groupedItems.past.length}</span>
                </div>
                {groupedItems.past.length > 0 ? (
                  renderBookingList(groupedItems.past)
                ) : (
                  <div className="rounded-[1.75rem] border border-white/10 bg-black/30 px-5 py-4 text-sm text-stone-500">
                    No past shifts match the current filters.
                  </div>
                )}
              </section>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
