"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  formatBookingDate,
  formatBookingTimeRange,
  isPastBooking,
} from "@/lib/bookings";
import { supabase } from "@/lib/supabase";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast-provider";
import {
  BusinessBookingCard,
  BusinessEmptyState,
  type WorkerSnapshot,
} from "@/components/business/business-booking-card";
import type {
  BookingRecord,
  BusinessProfileRecord,
  MarketplaceUserRecord,
  PaymentRecord,
  ShiftListingRecord,
  WorkerProfileRecord,
} from "@/lib/models";
import { calculateBusinessProfileCompletion } from "@/lib/business-discovery";
import {
  buildWorkerSnapshots,
} from "@/lib/business-bookings";
import {
  formatPaymentStatus,
  formatPayoutStatus,
  getPayoutSupportCopy,
  isBookingPaid,
  paymentStatusClass,
  payoutStatusClass,
} from "@/lib/payments";
import { fetchWithSession } from "@/lib/route-client";
import {
  formatShiftListingStatus,
  getRemainingShiftPositions,
  shiftListingStatusClass,
} from "@/lib/shift-listings";

function statusStyles(status: string) {
  if (status === "verified") return "bg-emerald-100 text-emerald-900";
  if (status === "rejected") return "bg-red-100 text-red-900";
  return "bg-amber-100 text-amber-900";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 2,
  }).format(value);
}

export default function BusinessDashboardPage() {
  const { showToast } = useToast();
  const [profile, setProfile] = useState<BusinessProfileRecord | null>(null);
  const [workerCount, setWorkerCount] = useState(0);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [paymentsByBookingId, setPaymentsByBookingId] = useState<Record<string, PaymentRecord>>({});
  const [shiftListings, setShiftListings] = useState<ShiftListingRecord[]>([]);
  const [workersById, setWorkersById] = useState<Record<string, WorkerSnapshot>>({});
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadDashboard = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || !active) {
        return;
      }

      const [profileResult, workersResult, bookingsResult, shiftListingsResult] = await Promise.all([
        supabase
          .from("business_profiles")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle<BusinessProfileRecord>(),
        supabase.from("worker_profiles").select("user_id"),
        supabase
          .from("bookings")
          .select("*")
          .eq("business_id", user.id)
          .order("shift_date", { ascending: true })
          .order("start_time", { ascending: true }),
        supabase
          .from("shift_listings")
          .select("*")
          .eq("business_id", user.id)
          .order("shift_date", { ascending: true })
          .order("start_time", { ascending: true }),
      ]);

      if (!active) {
        return;
      }

      const nextBookings = (bookingsResult.data as BookingRecord[] | null) ?? [];
      const bookingIds = nextBookings.map((booking) => booking.id);
      const workerIds = [...new Set(nextBookings.map((booking) => booking.worker_id))];
      let nextWorkerMap: Record<string, WorkerSnapshot> = {};
      let nextPaymentsByBookingId: Record<string, PaymentRecord> = {};

      if (workerIds.length > 0) {
        const [workerUsersResult, workerProfilesResult] = await Promise.all([
          supabase.from("marketplace_users").select("*").in("id", workerIds),
          supabase.from("worker_profiles").select("*").in("user_id", workerIds),
        ]);

        const workerUsers = (workerUsersResult.data as MarketplaceUserRecord[] | null) ?? [];
        const workerProfiles = (workerProfilesResult.data as WorkerProfileRecord[] | null) ?? [];

        nextWorkerMap = buildWorkerSnapshots({
          workerIds,
          workerUsers,
          workerProfiles,
        });
      }

      if (bookingIds.length > 0) {
        const paymentsResult = await supabase.from("payments").select("*").in("booking_id", bookingIds);
        const nextPayments = (paymentsResult.data as PaymentRecord[] | null) ?? [];
        nextPaymentsByBookingId = nextPayments.reduce<Record<string, PaymentRecord>>((accumulator, payment) => {
          accumulator[payment.booking_id] = payment;
          return accumulator;
        }, {});
      }

      setProfile(profileResult.data ?? null);
      setWorkerCount(((workersResult.data as Pick<WorkerProfileRecord, "user_id">[] | null) ?? []).length);
      setBookings(nextBookings);
      setPaymentsByBookingId(nextPaymentsByBookingId);
      setShiftListings((shiftListingsResult.data as ShiftListingRecord[] | null) ?? []);
      setWorkersById(nextWorkerMap);
      setLoading(false);
    };

    void loadDashboard();

    return () => {
      active = false;
    };
  }, []);

  const completion = useMemo(
    () => calculateBusinessProfileCompletion(profile),
    [profile],
  );

  const pendingRequests = useMemo(
    () => bookings.filter((booking) => booking.status === "pending"),
    [bookings],
  );

  const upcomingBookings = useMemo(
    () => bookings.filter((booking) => booking.status === "accepted" && !isPastBooking(booking)),
    [bookings],
  );

  const payoutApprovals = useMemo(
    () =>
      bookings.filter((booking) => {
        const payment = paymentsByBookingId[booking.id];
        return (
          Boolean(payment) &&
          (booking.status === "accepted" || booking.status === "completed") &&
          ["awaiting_shift_completion", "awaiting_business_approval", "approved_for_payout", "disputed", "on_hold"].includes(
            payment?.payout_status ?? "",
          )
        );
      }),
    [bookings, paymentsByBookingId],
  );

  const openShiftListings = useMemo(
    () => shiftListings.filter((listing) => listing.status === "open"),
    [shiftListings],
  );

  const claimedShiftListings = useMemo(
    () => shiftListings.filter((listing) => listing.status === "claimed"),
    [shiftListings],
  );

  const reloadBooking = async (bookingId: string) => {
    const { data } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", bookingId)
      .maybeSingle<BookingRecord>();

    return data ?? null;
  };

  const reloadPayment = async (bookingId: string) => {
    const { data } = await supabase
      .from("payments")
      .select("*")
      .eq("booking_id", bookingId)
      .maybeSingle<PaymentRecord>();

    return data ?? null;
  };

  const syncBookingState = async (bookingId: string) => {
    const [refreshedBooking, refreshedPayment] = await Promise.all([
      reloadBooking(bookingId),
      reloadPayment(bookingId),
    ]);

    if (refreshedBooking) {
      setBookings((current) =>
        current.map((booking) => (booking.id === bookingId ? refreshedBooking : booking)),
      );
    }

    setPaymentsByBookingId((current) => {
      if (!refreshedPayment) {
        if (!current[bookingId]) {
          return current;
        }

        const next = { ...current };
        delete next[bookingId];
        return next;
      }

      return {
        ...current,
        [bookingId]: refreshedPayment,
      };
    });
  };

  const handleRecordOutcome = async (
    bookingId: string,
    outcome: "completed" | "no_show",
  ) => {
    setActioningId(bookingId);

    const { error } = await supabase.rpc("business_record_booking_outcome", {
      target_booking_id: bookingId,
      outcome,
    });

    setActioningId(null);

    if (error) {
      showToast({
        title: "Could not update booking",
        description: error.message,
        tone: "error",
      });
      return;
    }

    const refreshedBooking = await reloadBooking(bookingId);

    if (refreshedBooking) {
      setBookings((current) =>
        current.map((booking) => (booking.id === bookingId ? refreshedBooking : booking)),
      );
    }

    showToast({
      title: outcome === "completed" ? "Shift marked completed" : "No-show recorded",
      description:
        outcome === "completed"
          ? "This worker's completed shift has been recorded."
          : "This no-show has been recorded against the worker's reliability standing.",
      tone: outcome === "completed" ? "success" : "info",
    });
  };

  const handlePayoutAction = async (
    bookingId: string,
    action: "mark_complete" | "approve_payout" | "flag_issue",
  ) => {
    setActioningId(bookingId);

    try {
      const response = await fetchWithSession(`/api/bookings/${bookingId}/payout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          reason: action === "flag_issue" ? "Issue raised by business after the shift." : undefined,
        }),
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Unable to update payout status.");
      }

      await syncBookingState(bookingId);
      showToast({
        title:
          action === "mark_complete"
            ? "Shift marked complete"
            : action === "approve_payout"
              ? "Payout approved"
              : "Issue flagged",
        description:
          action === "mark_complete"
            ? "The shift is now ready for payout approval."
            : action === "approve_payout"
              ? "This payout is approved for release."
              : "This booking has been moved into dispute review.",
        tone: action === "flag_issue" ? "info" : "success",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to update payout status.";
      showToast({
        title: "Update failed",
        description: message,
        tone: "error",
      });
    } finally {
      setActioningId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="panel-soft p-5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-4 h-10 w-24" />
            </div>
          ))}
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="panel-soft p-5 sm:p-6">
              <Skeleton className="h-6 w-44" />
              <Skeleton className="mt-4 h-32 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <div>
          <p className="section-label">Business Dashboard</p>
          <h1 className="mt-3 text-2xl font-semibold text-stone-900 sm:text-3xl">
            Manage worker requests and confirmed shifts
          </h1>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <section className="panel-soft p-5">
          <p className="text-sm font-medium text-stone-500">Profile completion</p>
          <p className="mt-2 text-3xl font-semibold text-stone-900">{completion}%</p>
        </section>
        <section className="panel-soft p-5">
          <p className="text-sm font-medium text-stone-500">Approval status</p>
          <span className={`mt-3 inline-flex rounded-full px-3 py-1 text-sm font-medium ${statusStyles(profile?.verification_status ?? "pending")}`}>
            {profile?.verification_status ?? "pending"}
          </span>
        </section>
        <section className="panel-soft p-5">
          <p className="text-sm font-medium text-stone-500">Pending requests</p>
          <p className="mt-2 text-3xl font-semibold text-stone-900">{pendingRequests.length}</p>
        </section>
        <section className="panel-soft p-5">
          <p className="text-sm font-medium text-stone-500">Upcoming bookings</p>
          <p className="mt-2 text-3xl font-semibold text-stone-900">{upcomingBookings.length}</p>
          <p className="mt-2 text-xs uppercase tracking-[0.16em] text-stone-500">
            {workerCount} workers available to discover
          </p>
        </section>
        <section className="panel-soft p-5 sm:col-span-2 xl:col-span-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-stone-500">Payout approvals</p>
              <p className="mt-2 text-3xl font-semibold text-stone-900">{payoutApprovals.length}</p>
            </div>
            <p className="max-w-xl text-sm leading-6 text-stone-600">
              Worker payout is released only after shift completion is confirmed, keeping instant pay fast but still protected for both sides.
            </p>
          </div>
        </section>
        <section className="panel-soft p-5 sm:col-span-2 xl:col-span-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-stone-500">Open shift listings</p>
              <p className="mt-2 text-3xl font-semibold text-stone-900">{openShiftListings.length}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.16em] text-stone-500">
              <span>{claimedShiftListings.length} claimed</span>
              <span>{shiftListings.length} total listings</span>
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <section className="panel-soft p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-stone-900">Pending requests</h2>
            <span className="status-badge">{pendingRequests.length}</span>
          </div>
          <div className="mt-4 space-y-4">
            {pendingRequests.length > 0 ? (
              pendingRequests.map((booking) => (
                <BusinessBookingCard
                  key={booking.id}
                  booking={booking}
                  worker={workersById[booking.worker_id]}
                  paymentLabel={formatPaymentStatus(paymentsByBookingId[booking.id]?.status ?? "pending")}
                  paymentTone={paymentStatusClass(paymentsByBookingId[booking.id]?.status ?? "pending")}
                  payoutLabel={
                    paymentsByBookingId[booking.id]
                      ? formatPayoutStatus(paymentsByBookingId[booking.id].payout_status)
                      : undefined
                  }
                  payoutTone={
                    paymentsByBookingId[booking.id]
                      ? payoutStatusClass(paymentsByBookingId[booking.id].payout_status)
                      : undefined
                  }
                />
              ))
            ) : (
              <BusinessEmptyState
                title="No pending requests"
                description="When you send booking requests, they will appear here until the worker responds."
                actionHref="/dashboard/business/discover"
                actionLabel="Book a worker"
              />
            )}
          </div>
        </section>

        <section className="panel-soft p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-stone-900">Upcoming bookings</h2>
            <span className="status-badge status-badge--ready">{upcomingBookings.length}</span>
          </div>
          <div className="mt-4 space-y-4">
            {upcomingBookings.length > 0 ? (
              upcomingBookings.map((booking) => (
                <BusinessBookingCard
                  key={booking.id}
                  booking={booking}
                  worker={workersById[booking.worker_id]}
                  paymentLabel={formatPaymentStatus(paymentsByBookingId[booking.id]?.status ?? "pending")}
                  paymentTone={paymentStatusClass(paymentsByBookingId[booking.id]?.status ?? "pending")}
                  payoutLabel={
                    paymentsByBookingId[booking.id]
                      ? formatPayoutStatus(paymentsByBookingId[booking.id].payout_status)
                      : undefined
                  }
                  payoutTone={
                    paymentsByBookingId[booking.id]
                      ? payoutStatusClass(paymentsByBookingId[booking.id].payout_status)
                      : undefined
                  }
                  actions={
                    <>
                      {!isBookingPaid(paymentsByBookingId[booking.id]) ? (
                        <Link
                          href={`/dashboard/business/bookings/${booking.id}/pay`}
                          className="primary-btn w-full px-5 sm:w-auto"
                        >
                          Pay now
                        </Link>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void handlePayoutAction(booking.id, "mark_complete")}
                        disabled={actioningId === booking.id}
                        className="primary-btn w-full px-5 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                      >
                        {actioningId === booking.id ? "Updating..." : "Mark completed"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRecordOutcome(booking.id, "no_show")}
                        disabled={actioningId === booking.id}
                        className="secondary-btn w-full px-5 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                      >
                        Mark no-show
                      </button>
                    </>
                  }
                />
              ))
            ) : (
              <BusinessEmptyState
                title="No confirmed shifts yet"
                description="Accepted booking requests will show up here with the confirmed date, time, and rate."
              />
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="panel-soft p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-stone-900">Post-shift approvals</h2>
            <span className="status-badge status-badge--ready">{payoutApprovals.length}</span>
          </div>
          <div className="mt-4 space-y-4">
            {payoutApprovals.length > 0 ? (
              payoutApprovals.slice(0, 4).map((booking) => {
                const payment = paymentsByBookingId[booking.id];

                return (
                  <BusinessBookingCard
                    key={booking.id}
                    booking={booking}
                    worker={workersById[booking.worker_id]}
                    paymentLabel={formatPaymentStatus(payment?.status ?? "pending")}
                    paymentTone={paymentStatusClass(payment?.status ?? "pending")}
                    payoutLabel={payment ? formatPayoutStatus(payment.payout_status) : undefined}
                    payoutTone={payment ? payoutStatusClass(payment.payout_status) : undefined}
                    actions={
                      <>
                        {booking.status !== "completed" ? (
                          <button
                            type="button"
                            onClick={() => void handlePayoutAction(booking.id, "mark_complete")}
                            disabled={actioningId === booking.id}
                            className="primary-btn w-full px-5 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                          >
                            {actioningId === booking.id ? "Updating..." : "Mark shift complete"}
                          </button>
                        ) : null}
                        {payment?.payout_status !== "approved_for_payout" && payment?.payout_status !== "paid" ? (
                          <button
                            type="button"
                            onClick={() => void handlePayoutAction(booking.id, "approve_payout")}
                            disabled={actioningId === booking.id || booking.status !== "completed"}
                            className="secondary-btn w-full px-5 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                          >
                            Approve payout
                          </button>
                        ) : null}
                        {payment?.payout_status !== "disputed" ? (
                          <button
                            type="button"
                            onClick={() => void handlePayoutAction(booking.id, "flag_issue")}
                            disabled={actioningId === booking.id}
                            className="secondary-btn w-full px-5 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                          >
                            Flag issue
                          </button>
                        ) : null}
                      </>
                    }
                  />
                );
              })
            ) : (
              <BusinessEmptyState
                title="No payouts waiting on you"
                description="After a shift ends, confirm completion here so approved payouts can move quickly."
              />
            )}
          </div>
        </section>

        <section className="panel-soft p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-stone-900">Shift listings</h2>
            <Link href="/dashboard/business/shifts/new" className="secondary-btn px-4 py-2">
              Create listing
            </Link>
          </div>
          <div className="mt-4 space-y-4">
            {shiftListings.length > 0 ? (
              shiftListings.slice(0, 4).map((listing) => (
                <article key={listing.id} className="rounded-3xl border border-white/10 bg-black/40 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-base font-semibold text-stone-100">
                        {listing.title || listing.role_label}
                      </p>
                      <p className="mt-1 text-sm text-stone-400">
                        {formatBookingDate(listing.shift_date)} | {formatBookingTimeRange(listing.start_time, listing.end_time, listing.shift_date, listing.shift_end_date)}
                      </p>
                    </div>
                    <span className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${shiftListingStatusClass(listing.status)}`}>
                      {formatShiftListingStatus(listing.status)}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-stone-400 sm:grid-cols-2">
                    <p>
                      <span className="font-medium text-stone-100">Rate:</span>{" "}
                      {formatCurrency(listing.hourly_rate_gbp)}/hr
                    </p>
                    <p>
                      <span className="font-medium text-stone-100">Location:</span>{" "}
                      {listing.city || listing.location}
                    </p>
                    <p>
                      <span className="font-medium text-stone-100">Spots left:</span>{" "}
                      {getRemainingShiftPositions(listing)} / {listing.open_positions}
                    </p>
                  </div>
                </article>
              ))
            ) : (
              <BusinessEmptyState
                title="No shift listings yet"
                description="Create your first open shift so workers can discover it before you send direct booking requests."
                actionHref="/dashboard/business/shifts/new"
                actionLabel="Post a shift"
              />
            )}
          </div>
        </section>

        <section className="panel-soft p-5 sm:p-6">
          <h2 className="text-xl font-semibold text-stone-900">Business profile snapshot</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-stone-500">Business name</p>
              <p className="mt-1 font-medium text-stone-900">
                {profile?.business_name ?? "Not set"}
              </p>
            </div>
            <div>
              <p className="text-sm text-stone-500">Primary contact</p>
              <p className="mt-1 font-medium text-stone-900">
                {profile?.contact_name ?? "Not set"}
              </p>
            </div>
            <div>
              <p className="text-sm text-stone-500">Location</p>
              <p className="mt-1 font-medium text-stone-900">
                {[profile?.address_line_1, profile?.city, profile?.postcode]
                  .filter(Boolean)
                  .join(", ") || "Not set"}
              </p>
            </div>
            <div>
              <p className="text-sm text-stone-500">Business sector</p>
              <p className="mt-1 font-medium text-stone-900">
                {profile?.sector ?? "Not set"}
              </p>
            </div>
          </div>
        </section>

        <section className="panel-soft p-5 sm:p-6">
          <h2 className="text-xl font-semibold text-stone-900">Next actions</h2>
          <div className="info-banner mt-4">
            {getPayoutSupportCopy("awaiting_business_approval")}
          </div>
        </section>
      </div>
    </div>
  );
}
