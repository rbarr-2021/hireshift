"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast-provider";
import {
  WorkerBookingCard,
  WorkerBookingEmptyState,
  type WorkerBookingBusinessSnapshot,
} from "@/components/worker/worker-booking-card";
import { loadWorkerBookingsSnapshot } from "@/components/worker/worker-bookings-loader";
import { isPastBooking } from "@/lib/bookings";
import type {
  BookingRecord,
  PaymentRecord,
  WorkerReliabilityRecord,
} from "@/lib/models";
import { isLateCancellationWindow } from "@/lib/reliability";
import { supabase } from "@/lib/supabase";

export default function WorkerAcceptedJobsPage() {
  const { showToast } = useToast();
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [paymentsByBookingId, setPaymentsByBookingId] = useState<Record<string, PaymentRecord>>({});
  const [businessesById, setBusinessesById] = useState<Record<string, WorkerBookingBusinessSnapshot>>({});
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [countdownNow, setCountdownNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCountdownNow(new Date());
    }, 30000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || !active) {
        return;
      }

      const snapshot = await loadWorkerBookingsSnapshot(user.id);

      if (!active) {
        return;
      }

      setBookings(snapshot.bookings.filter((booking) => booking.status === "accepted"));
      setPaymentsByBookingId(snapshot.paymentsByBookingId);
      setBusinessesById(snapshot.businessesById);
      setLoading(false);
    };

    void load();

    return () => {
      active = false;
    };
  }, []);

  const reloadBooking = async (bookingId: string) => {
    const { data } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", bookingId)
      .maybeSingle<BookingRecord>();

    return data ?? null;
  };

  const handleCancelBooking = async (booking: BookingRecord) => {
    const warningMessage = isLateCancellationWindow(booking)
      ? "Cancelling this shift now may affect your reliability standing. Continue?"
      : "Cancel this accepted shift?";

    if (typeof window !== "undefined" && !window.confirm(warningMessage)) {
      return;
    }

    setActioningId(booking.id);

    const { error } = await supabase.rpc("worker_cancel_booking", {
      target_booking_id: booking.id,
    });

    setActioningId(null);

    if (error) {
      showToast({
        title: "Cancellation failed",
        description: error.message,
        tone: "error",
      });
      return;
    }

    const refreshedBooking = await reloadBooking(booking.id);

    await supabase
      .from("worker_reliability")
      .select("*")
      .eq("worker_id", booking.worker_id)
      .maybeSingle<WorkerReliabilityRecord>();

    setBookings((current) =>
      refreshedBooking?.status === "accepted"
        ? current.map((item) => (item.id === booking.id ? refreshedBooking : item))
        : current.filter((item) => item.id !== booking.id),
    );

    showToast({
      title: isLateCancellationWindow(booking)
        ? "Late cancellation recorded"
        : "Shift cancelled",
      description: isLateCancellationWindow(booking)
        ? "This cancellation may affect your reliability standing."
        : "This shift has been released.",
      tone: isLateCancellationWindow(booking) ? "info" : "success",
    });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-36 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="section-label">Worker jobs</p>
        <h1 className="mt-3 text-2xl font-semibold text-stone-900 sm:text-3xl">
          Accepted jobs
        </h1>
      </div>

      <div className="space-y-4">
        {bookings.length > 0 ? (
          bookings.map((booking) => (
            <WorkerBookingCard
              key={booking.id}
              booking={booking}
              business={businessesById[booking.business_id]}
              payment={paymentsByBookingId[booking.id]}
              showDetailLink
              countdownNow={countdownNow}
              actions={
                !isPastBooking(booking) ? (
                  <button
                    type="button"
                    onClick={() => void handleCancelBooking(booking)}
                    disabled={actioningId === booking.id}
                    className="secondary-btn w-full px-5 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                  >
                    {actioningId === booking.id ? "Updating..." : "Cancel shift"}
                  </button>
                ) : undefined
              }
            />
          ))
        ) : (
          <WorkerBookingEmptyState
            title="No accepted jobs yet"
            description="Accepted shifts will appear here so you can keep this area focused."
            actionHref="/shifts"
            actionLabel="Browse shifts"
          />
        )}
      </div>
    </div>
  );
}
