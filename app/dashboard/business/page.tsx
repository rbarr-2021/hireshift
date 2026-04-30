"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CancelBookingAction } from "@/components/bookings/cancel-booking-action";
import {
  canCancelBooking,
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
  getPayoutSupportCopy,
  isBookingPaid,
} from "@/lib/payments";
import { fetchWithSession } from "@/lib/route-client";
import {
  formatShiftListingStatus,
  getRemainingShiftPositions,
  isLiveShiftListing,
  isUnfulfilledShiftListing,
  shiftListingStatusClass,
} from "@/lib/shift-listings";
import { AdminContactCard } from "@/components/support/admin-contact-card";

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
  const [completedBookingIds, setCompletedBookingIds] = useState<Set<string>>(
    () => new Set(),
  );

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
      setCompletedBookingIds(
        new Set(
          nextBookings
            .filter((booking) => booking.status === "completed")
            .map((booking) => booking.id),
        ),
      );
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
    () => shiftListings.filter((listing) => isLiveShiftListing(listing)),
    [shiftListings],
  );

  const claimedShiftListings = useMemo(
    () => shiftListings.filter((listing) => listing.status === "claimed"),
    [shiftListings],
  );

  const unfulfilledShiftListings = useMemo(
    () => shiftListings.filter((listing) => isUnfulfilledShiftListing(listing)),
    [shiftListings],
  );

  const visibleShiftListings = useMemo(
    () => [
      ...openShiftListings,
      ...claimedShiftListings,
      ...unfulfilledShiftListings,
      ...shiftListings.filter(
        (listing) =>
          listing.status === "cancelled" &&
          !openShiftListings.some((item) => item.id === listing.id) &&
          !claimedShiftListings.some((item) => item.id === listing.id) &&
          !unfulfilledShiftListings.some((item) => item.id === listing.id),
      ),
    ],
    [claimedShiftListings, openShiftListings, shiftListings, unfulfilledShiftListings],
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

      if (refreshedBooking.status === "completed") {
        setCompletedBookingIds((current) => new Set(current).add(bookingId));
      }
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
    action:
      | "confirm_arrival"
      | "report_arrival_issue"
      | "approve_hours"
      | "adjust_hours"
      | "dispute_hours"
      | "no_show",
  ) => {
    const booking = bookings.find((item) => item.id === bookingId);

    if (!booking) {
      return;
    }

    let reason: string | undefined;
    let adjustedHours: number | undefined;

    if (action === "adjust_hours") {
      const hoursInput = window.prompt(
        "Enter approved hours for this shift.",
        booking.worker_hours_claimed ? booking.worker_hours_claimed.toString() : "",
      );

      if (hoursInput === null) {
        return;
      }

      const parsedHours = Number.parseFloat(hoursInput);

      if (!Number.isFinite(parsedHours) || parsedHours <= 0) {
        showToast({
          title: "Invalid hours",
          description: "Enter a valid approved hours value.",
          tone: "error",
        });
        return;
      }

      const reasonInput = window.prompt("Add a reason for adjusting hours.");
      if (reasonInput === null) {
        return;
      }

      const trimmedReason = reasonInput.trim();
      if (!trimmedReason) {
        showToast({
          title: "Reason required",
          description: "Add a reason when adjusting worker hours.",
          tone: "error",
        });
        return;
      }

      adjustedHours = parsedHours;
      reason = trimmedReason;
    }

    if (action === "dispute_hours") {
      const reasonInput = window.prompt("Describe the attendance issue for review.");
      if (reasonInput === null) {
        return;
      }

      const trimmedReason = reasonInput.trim();
      if (!trimmedReason) {
        showToast({
          title: "Reason required",
          description: "Add a reason to dispute attendance.",
          tone: "error",
        });
        return;
      }

      reason = trimmedReason;
    }

    if (action === "no_show") {
      reason = "Worker marked as no-show by business.";
    }
    if (action === "report_arrival_issue") {
      const reasonInput = window.prompt("What is the arrival issue?");
      if (reasonInput === null) {
        return;
      }
      const trimmedReason = reasonInput.trim();
      if (!trimmedReason) {
        showToast({
          title: "Reason required",
          description: "Add a short reason for the arrival issue.",
          tone: "error",
        });
        return;
      }
      reason = trimmedReason;
    }

    setActioningId(bookingId);

    try {
      const response = await fetchWithSession(`/api/bookings/${bookingId}/attendance`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          reason,
          adjustedHours,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        booking?: BookingRecord | null;
        payment?: PaymentRecord | null;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Unable to update booking.");
      }

      if (payload.booking) {
        setBookings((current) =>
          current.map((booking) => (booking.id === bookingId ? payload.booking! : booking)),
        );
      }

      if (payload.payment) {
        setPaymentsByBookingId((current) => ({
          ...current,
          [bookingId]: payload.payment!,
        }));
      } else {
        await syncBookingState(bookingId);
      }

      if (payload.booking?.status === "completed") {
        setCompletedBookingIds((current) => new Set(current).add(bookingId));
      }

      showToast({
        title:
          action === "confirm_arrival"
            ? "Arrival confirmed"
            : action === "report_arrival_issue"
              ? "Arrival issue reported"
            :
          action === "approve_hours"
            ? "Hours approved"
            : action === "adjust_hours"
              ? "Hours adjusted"
            : action === "no_show"
              ? "No-show recorded"
              : "Attendance disputed",
        description:
          action === "confirm_arrival"
            ? "Arrival confirmed. You can approve final hours after the shift."
            : action === "report_arrival_issue"
              ? "Arrival issue reported and payout is now on hold for review."
            :
          action === "approve_hours"
            ? "Attendance approved and payout can now move."
            : action === "adjust_hours"
              ? "Adjusted hours saved and payout can now move."
            : action === "no_show"
              ? "This no-show has been recorded and payout is paused."
              : "This shift has been moved into attendance dispute review.",
        tone: action === "dispute_hours" || action === "no_show" ? "info" : "success",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to update booking.";
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
            Bookings and shift progress
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
          <span className={`mt-3 inline-flex rounded-full px-3 py-1 text-sm font-medium ${statusStyles(profile?.verification_status ?? "pending")} ${profile?.verification_status === "verified" ? "verified-badge-inline" : ""}`}>
            {profile?.verification_status === "verified" ? (
              <>
                <span className="verified-tick">&#10003;</span>
                verified
              </>
            ) : (
              profile?.verification_status ?? "pending"
            )}
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
              <p className="text-sm font-medium text-stone-500">Post-shift actions</p>
              <p className="mt-2 text-3xl font-semibold text-stone-900">{payoutApprovals.length}</p>
            </div>
              <p className="max-w-xl text-sm leading-6 text-stone-600">
              Review attendance after each shift and approve hours so payout can move.
            </p>
          </div>
        </section>
        <section className="panel-soft p-5 sm:col-span-2 xl:col-span-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-stone-500">Live shift listings</p>
              <p className="mt-2 text-3xl font-semibold text-stone-900">{openShiftListings.length}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.16em] text-stone-500">
              <span>{claimedShiftListings.length} claimed</span>
              <span>{unfulfilledShiftListings.length} unfilled</span>
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
                  payment={paymentsByBookingId[booking.id]}
                />
              ))
            ) : (
              <BusinessEmptyState
                title="No pending requests"
                description="No worker requests are waiting right now."
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
                  payment={paymentsByBookingId[booking.id]}
                  actions={
                    <>
                      {!isBookingPaid(paymentsByBookingId[booking.id]) ? (
                        <Link
                          href={`/dashboard/business/bookings/${booking.id}/pay`}
                          className="primary-btn w-full px-5 sm:w-auto sm:flex-1"
                        >
                          Secure shift payment
                        </Link>
                      ) : (paymentsByBookingId[booking.id] &&
                          ((paymentsByBookingId[booking.id].top_up_due_gbp ?? 0) > 0 ||
                            paymentsByBookingId[booking.id].settlement_status === "top_up_required")) ? (
                        <Link
                          href={`/dashboard/business/bookings/${booking.id}/pay`}
                          className="primary-btn w-full px-5 sm:w-auto sm:flex-1"
                        >
                          Secure shift payment
                        </Link>
                      ) : booking.worker_checked_in_at &&
                        booking.arrival_confirmation_status !== "business_confirmed" ? (
                        <button
                          type="button"
                          onClick={() => void handleRecordOutcome(booking.id, "confirm_arrival")}
                          disabled={actioningId === booking.id}
                          className="primary-btn w-full px-5 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:flex-1"
                        >
                          Confirm arrival
                        </button>
                      ) : canCancelBooking(booking, paymentsByBookingId[booking.id]) ? (
                        <CancelBookingAction
                          bookingId={booking.id}
                          actorRole="business"
                          className="secondary-btn w-full px-5 sm:w-auto sm:flex-1"
                          onCancelled={(nextBooking, nextPayment) => {
                            if (nextBooking) {
                              setBookings((current) =>
                                current.map((currentBooking) =>
                                  currentBooking.id === booking.id ? nextBooking : currentBooking,
                                ),
                              );
                            }
                            if (nextPayment) {
                              setPaymentsByBookingId((current) => ({
                                ...current,
                                [booking.id]: nextPayment,
                              }));
                            }
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleRecordOutcome(booking.id, "approve_hours")}
                          disabled={
                            actioningId === booking.id ||
                            !isBookingPaid(paymentsByBookingId[booking.id]) ||
                            !(booking.worker_checked_out_at || isPastBooking(booking))
                          }
                          className="primary-btn w-full px-5 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:flex-1"
                        >
                          <span className="inline-flex items-center justify-center gap-2">
                            {actioningId === booking.id ? "Updating..." : "Approve hours"}
                            {completedBookingIds.has(booking.id) ? (
                              <span
                                aria-label="Completed"
                                className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400 text-xs font-bold text-black"
                              >
                                &#10003;
                              </span>
                            ) : null}
                          </span>
                        </button>
                      )}
                    </>
                  }
                />
              ))
            ) : (
              <BusinessEmptyState
                title="No bookings yet"
                description="Post a shift or book a worker to get started."
                actionHref="/dashboard/business/shifts/new"
                actionLabel="Post a shift"
              />
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="panel-soft p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-stone-900">Post-shift actions</h2>
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
                    payment={payment}
                    actions={
                      <>
                        {!isBookingPaid(payment) ? (
                          <Link
                            href={`/dashboard/business/bookings/${booking.id}/pay`}
                            className="primary-btn w-full px-5 sm:w-auto"
                          >
                            Secure shift payment
                          </Link>
                        ) : booking.worker_checked_in_at &&
                          booking.arrival_confirmation_status !== "business_confirmed" ? (
                          <button
                            type="button"
                            onClick={() => void handleRecordOutcome(booking.id, "confirm_arrival")}
                            disabled={actioningId === booking.id}
                            className="primary-btn w-full px-5 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                          >
                            Confirm arrival
                          </button>
                        ) : canCancelBooking(booking, payment) ? (
                          <CancelBookingAction
                            bookingId={booking.id}
                            actorRole="business"
                            className="secondary-btn w-full px-5 sm:w-auto"
                            onCancelled={(nextBooking, nextPayment) => {
                              if (nextBooking) {
                                setBookings((current) =>
                                  current.map((currentBooking) =>
                                    currentBooking.id === booking.id ? nextBooking : currentBooking,
                                  ),
                                );
                              }
                              if (nextPayment) {
                                setPaymentsByBookingId((current) => ({
                                  ...current,
                                  [booking.id]: nextPayment,
                                }));
                              }
                            }}
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => void handleRecordOutcome(booking.id, "approve_hours")}
                            disabled={
                              actioningId === booking.id ||
                              !isBookingPaid(payment) ||
                              !(booking.worker_checked_out_at || isPastBooking(booking))
                            }
                            className="primary-btn w-full px-5 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                          >
                            {actioningId === booking.id ? "Updating..." : "Approve hours"}
                          </button>
                        )}
                      </>
                    }
                  />
                );
              })
            ) : (
              <BusinessEmptyState
                title="No post-shift actions waiting"
                description="No hours are waiting for approval."
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
            {visibleShiftListings.length > 0 ? (
              visibleShiftListings.slice(0, 4).map((listing) => {
                const isUnfulfilled = isUnfulfilledShiftListing(listing);

                return (
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
                    <span
                      className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${
                        isUnfulfilled ? "status-badge" : shiftListingStatusClass(listing.status)
                      }`}
                    >
                      {isUnfulfilled ? "Unfilled" : formatShiftListingStatus(listing.status)}
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
              );
              })
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

      <AdminContactCard
        accountType="business"
        title="Need admin support?"
        description="For approval questions, disputes, or payout help, message admin directly."
      />
    </div>
  );
}
