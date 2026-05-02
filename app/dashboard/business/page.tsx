"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  isPastBooking,
} from "@/lib/bookings";
import { supabase } from "@/lib/supabase";
import { Skeleton } from "@/components/ui/skeleton";
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
  isLiveShiftListing,
  isUnfulfilledShiftListing,
} from "@/lib/shift-listings";
import { AdminContactCard } from "@/components/support/admin-contact-card";

export default function BusinessDashboardPage() {
  const [profile, setProfile] = useState<BusinessProfileRecord | null>(null);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [paymentsByBookingId, setPaymentsByBookingId] = useState<Record<string, PaymentRecord>>({});
  const [shiftListings, setShiftListings] = useState<ShiftListingRecord[]>([]);
  const [workersById, setWorkersById] = useState<Record<string, WorkerSnapshot>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const loadDashboard = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || !active) {
        return;
      }

      const [profileResult, bookingsResult, shiftListingsResult] = await Promise.all([
        supabase
          .from("business_profiles")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle<BusinessProfileRecord>(),
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
  const completedBookings = useMemo(
    () => bookings.filter((booking) => booking.status === "completed"),
    [bookings],
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

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
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
      <div className="flex flex-col gap-2">
        <p className="section-label">Business Dashboard</p>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold text-stone-900 sm:text-3xl">
            {profile?.business_name || "Bookings and shift progress"}
          </h1>
          {profile?.verification_status === "verified" ? (
            <span className="verified-badge-inline status-badge status-badge--ready">
              <span className="verified-tick">&#10003;</span>
              verified
            </span>
          ) : null}
        </div>
      </div>

      {completion < 100 ? (
        <section className="panel-soft p-5">
          <p className="text-sm font-medium text-stone-500">Profile completion</p>
          <p className="mt-2 text-3xl font-semibold text-stone-900">{completion}%</p>
          <Link href="/dashboard/business/profile" className="secondary-btn mt-4 inline-flex px-4 py-2">
            Complete profile
          </Link>
        </section>
      ) : null}

      <section className="panel-soft p-5 sm:p-6">
        <h2 className="text-xl font-semibold text-stone-900">Main actions</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Link
            href="#pending-bookings"
            className="rounded-2xl border border-white/10 bg-black/40 px-4 py-4 transition hover:border-[#00A7FF]/60"
          >
            <p className="text-sm text-stone-500">Pending Bookings</p>
            <p className="mt-2 text-2xl font-semibold text-stone-900">{pendingRequests.length}</p>
          </Link>
          <Link
            href="/dashboard/business/bookings"
            className="rounded-2xl border border-white/10 bg-black/40 px-4 py-4 transition hover:border-[#00A7FF]/60"
          >
            <p className="text-sm text-stone-500">Upcoming Shifts</p>
            <p className="mt-2 text-2xl font-semibold text-stone-900">{upcomingBookings.length}</p>
          </Link>
          <Link
            href="/dashboard/business/shifts/new"
            className="rounded-2xl border border-white/10 bg-black/40 px-4 py-4 transition hover:border-[#00A7FF]/60"
          >
            <p className="text-sm text-stone-500">Post Shift</p>
            <p className="mt-2 text-base font-semibold text-stone-900">Create a new listing</p>
          </Link>
        </div>
      </section>

      <section className="panel-soft p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-semibold text-stone-900">Shift summary</h2>
          <Link href="/dashboard/business/bookings" className="secondary-btn px-4 py-2">
            View all shifts
          </Link>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.16em] text-stone-500">Upcoming shifts</p>
            <p className="mt-2 text-2xl font-semibold text-stone-100">{upcomingBookings.length}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.16em] text-stone-500">Active shifts</p>
            <p className="mt-2 text-2xl font-semibold text-stone-100">{openShiftListings.length}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.16em] text-stone-500">Unfilled</p>
            <p className="mt-2 text-2xl font-semibold text-stone-100">{unfulfilledShiftListings.length}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-1">
        <section id="pending-bookings" className="panel-soft p-5 sm:p-6">
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
                  compact
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

      </div>

      <section className="panel-soft p-5 sm:p-6">
        <details>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xl font-semibold text-stone-900">
            <span>Completed and past</span>
            <span className="status-badge">{completedBookings.length}</span>
          </summary>
          <div className="mt-4 space-y-3">
            {completedBookings.length > 0 ? (
              completedBookings.slice(0, 8).map((booking) => (
                <BusinessBookingCard
                  key={booking.id}
                  booking={booking}
                  worker={workersById[booking.worker_id]}
                  payment={paymentsByBookingId[booking.id]}
                  compact
                />
              ))
            ) : (
              <p className="text-sm text-stone-600">No completed bookings yet.</p>
            )}
          </div>
        </details>
      </section>

      <AdminContactCard
        accountType="business"
        title="Need admin support?"
        description="For approval questions, disputes, or payout help, message admin directly."
      />
    </div>
  );
}
