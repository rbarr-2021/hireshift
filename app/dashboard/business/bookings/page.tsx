"use client";
import { useEffect, useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BusinessBookingCard,
  BusinessEmptyState,
  type WorkerSnapshot,
} from "@/components/business/business-booking-card";
import { getPastBusinessBookings, buildWorkerSnapshots } from "@/lib/business-bookings";
import type {
  BookingRecord,
  MarketplaceUserRecord,
  PaymentRecord,
  ShiftListingRecord,
  WorkerProfileRecord,
} from "@/lib/models";
import {
  formatPaymentStatus,
  formatPayoutStatus,
  paymentStatusClass,
  payoutStatusClass,
} from "@/lib/payments";
import { supabase } from "@/lib/supabase";
import {
  formatBookingDate,
  formatBookingTimeRange,
} from "@/lib/bookings";
import {
  getRemainingShiftPositions,
  isUnfulfilledShiftListing,
} from "@/lib/shift-listings";

export default function BusinessPastBookingsPage() {
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [unfulfilledListings, setUnfulfilledListings] = useState<ShiftListingRecord[]>([]);
  const [workersById, setWorkersById] = useState<Record<string, WorkerSnapshot>>({});
  const [paymentsByBookingId, setPaymentsByBookingId] = useState<Record<string, PaymentRecord>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const loadBookings = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || !active) {
        return;
      }

      const bookingsResult = await supabase
        .from("bookings")
        .select("*")
        .eq("business_id", user.id)
        .order("shift_date", { ascending: false })
        .order("start_time", { ascending: false });

      const shiftListingsResult = await supabase
        .from("shift_listings")
        .select("*")
        .eq("business_id", user.id)
        .order("shift_date", { ascending: false })
        .order("start_time", { ascending: false });

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

      setBookings(nextBookings);
      setUnfulfilledListings(
        ((shiftListingsResult.data as ShiftListingRecord[] | null) ?? []).filter((listing) =>
          isUnfulfilledShiftListing(listing),
        ),
      );
      setWorkersById(nextWorkerMap);
      setPaymentsByBookingId(nextPaymentsByBookingId);
      setLoading(false);
    };

    void loadBookings();

    return () => {
      active = false;
    };
  }, []);

  const pastBookings = useMemo(() => getPastBusinessBookings(bookings), [bookings]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <p className="section-label">Payments</p>
          <Skeleton className="mt-4 h-10 w-56" />
        </div>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="panel-soft p-5">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="mt-4 h-20 w-full" />
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
            Payment history
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
            Review completed bookings and payout progress in one place.
          </p>
        </div>
        <span className="status-badge status-badge--rating">
          {pastBookings.length + unfulfilledListings.length}
        </span>
      </div>

      {unfulfilledListings.length > 0 ? (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-stone-900">Unfilled shifts</h2>
            <span className="status-badge">{unfulfilledListings.length}</span>
          </div>
          {unfulfilledListings.map((listing) => (
            <article key={listing.id} className="panel-soft p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-lg font-semibold text-stone-900">
                    {listing.title || listing.role_label}
                  </p>
                  <p className="mt-1 text-sm text-stone-600">
                    {formatBookingDate(listing.shift_date)} |{" "}
                    {formatBookingTimeRange(
                      listing.start_time,
                      listing.end_time,
                      listing.shift_date,
                      listing.shift_end_date,
                    )}
                  </p>
                  <p className="mt-1 text-sm text-stone-600">{listing.location}</p>
                </div>
                <span className="status-badge">Unfilled</span>
              </div>
              <div className="mt-4 grid gap-3 text-sm text-stone-600 sm:grid-cols-3">
                <p>
                  <span className="font-medium text-stone-900">Positions unfilled:</span>{" "}
                  {getRemainingShiftPositions(listing)}
                </p>
                <p>
                  <span className="font-medium text-stone-900">Posted:</span>{" "}
                  {listing.open_positions}
                </p>
                <p>
                  <span className="font-medium text-stone-900">Claimed:</span>{" "}
                  {listing.claimed_positions}
                </p>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {pastBookings.length > 0 ? (
        <div className="space-y-4">
          {pastBookings.map((booking) => (
            <BusinessBookingCard
              key={booking.id}
              booking={booking}
              worker={workersById[booking.worker_id]}
              payment={paymentsByBookingId[booking.id]}
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
          ))}
        </div>
      ) : unfulfilledListings.length === 0 ? (
        <BusinessEmptyState
          title="No payments yet"
          description="No completed bookings yet. Post shifts to start building payment history."
          actionHref="/dashboard/business/shifts/new"
          actionLabel="Post a shift"
        />
      ) : null}
    </div>
  );
}
