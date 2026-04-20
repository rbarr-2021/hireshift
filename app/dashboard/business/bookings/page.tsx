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
  WorkerProfileRecord,
} from "@/lib/models";
import { formatPaymentStatus, paymentStatusClass } from "@/lib/payments";
import { supabase } from "@/lib/supabase";

export default function BusinessPastBookingsPage() {
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
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
          <p className="section-label">Past Bookings</p>
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
          <p className="section-label">Past Bookings</p>
          <h1 className="mt-3 text-2xl font-semibold text-stone-900 sm:text-3xl">
            Booking history
          </h1>
        </div>
        <span className="status-badge status-badge--rating">{pastBookings.length}</span>
      </div>

      {pastBookings.length > 0 ? (
        <div className="space-y-4">
          {pastBookings.map((booking) => (
            <BusinessBookingCard
              key={booking.id}
              booking={booking}
              worker={workersById[booking.worker_id]}
              paymentLabel={formatPaymentStatus(paymentsByBookingId[booking.id]?.status ?? "pending")}
              paymentTone={paymentStatusClass(paymentsByBookingId[booking.id]?.status ?? "pending")}
            />
          ))}
        </div>
      ) : (
        <BusinessEmptyState
          title="No past bookings yet"
          description="Completed, declined, cancelled, and older shifts will collect here."
        />
      )}
    </div>
  );
}
