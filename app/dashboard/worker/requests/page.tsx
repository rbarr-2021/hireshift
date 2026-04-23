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
import type { BookingRecord, PaymentRecord } from "@/lib/models";
import { processOwnNotificationJobs } from "@/lib/notifications/client";
import { supabase } from "@/lib/supabase";

export default function WorkerRequestsPage() {
  const { showToast } = useToast();
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [paymentsByBookingId, setPaymentsByBookingId] = useState<Record<string, PaymentRecord>>({});
  const [businessesById, setBusinessesById] = useState<Record<string, WorkerBookingBusinessSnapshot>>({});
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);

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

      setBookings(snapshot.bookings.filter((booking) => booking.status === "pending"));
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

  const handleBookingResponse = async (bookingId: string, status: "accepted" | "declined") => {
    setActioningId(bookingId);

    const { error } = await supabase.rpc("respond_to_booking_request", {
      target_booking_id: bookingId,
      next_status: status,
    });

    setActioningId(null);

    if (error) {
      showToast({
        title: "Booking update failed",
        description: error.message || "Unable to update the booking response.",
        tone: "error",
      });
      return;
    }

    const data = await reloadBooking(bookingId);

    setBookings((current) =>
      data?.status === "pending"
        ? current.map((booking) => (booking.id === bookingId ? data : booking))
        : current.filter((booking) => booking.id !== bookingId),
    );

    showToast({
      title: status === "accepted" ? "Booking accepted" : "Booking declined",
      description:
        status === "accepted"
          ? "The business can now see this shift as confirmed."
          : "The business has been updated that you cannot take this shift.",
      tone: "success",
    });

    if (status === "accepted") {
      const notificationResult = await processOwnNotificationJobs();

      if (!notificationResult.ok) {
        showToast({
          title: "Booking accepted",
          description: "The shift was confirmed, but the confirmation email could not be sent right now.",
          tone: "info",
        });
      }
    }
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
        <p className="section-label">Worker requests</p>
        <h1 className="mt-3 text-2xl font-semibold text-stone-900 sm:text-3xl">
          Incoming requests
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
              actions={
                <>
                  <button
                    type="button"
                    onClick={() => void handleBookingResponse(booking.id, "accepted")}
                    disabled={actioningId === booking.id}
                    className="primary-btn w-full px-5 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                  >
                    {actioningId === booking.id ? "Updating..." : "Accept"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleBookingResponse(booking.id, "declined")}
                    disabled={actioningId === booking.id}
                    className="secondary-btn w-full px-5 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                  >
                    Decline
                  </button>
                </>
              }
            />
          ))
        ) : (
          <WorkerBookingEmptyState
            title="No incoming requests"
            description="When businesses send shift requests, they will appear here."
          />
        )}
      </div>
    </div>
  );
}
