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
import {
  formatHoursValue,
  getCheckInWindow,
  isPastBooking,
  isWithinCheckInWindow,
} from "@/lib/bookings";
import { getCurrentCoordinates } from "@/lib/geolocation";
import { fetchWithSession } from "@/lib/route-client";
import type {
  BookingRecord,
  PaymentRecord,
  WorkerReliabilityRecord,
  WorkerProfileRecord,
} from "@/lib/models";
import { isLateCancellationWindow } from "@/lib/reliability";
import { getPaymentStatusValue } from "@/lib/payments";
import { supabase } from "@/lib/supabase";

export default function WorkerAcceptedJobsPage() {
  const { showToast } = useToast();
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [paymentsByBookingId, setPaymentsByBookingId] = useState<Record<string, PaymentRecord>>({});
  const [businessesById, setBusinessesById] = useState<Record<string, WorkerBookingBusinessSnapshot>>({});
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [countdownNow, setCountdownNow] = useState(() => new Date());
  const [workerPayoutReady, setWorkerPayoutReady] = useState(false);

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
      const workerProfileResult = await supabase
        .from("worker_profiles")
        .select("stripe_connect_charges_enabled,stripe_connect_payouts_enabled")
        .eq("user_id", user.id)
        .maybeSingle<Pick<WorkerProfileRecord, "stripe_connect_charges_enabled" | "stripe_connect_payouts_enabled">>();

      if (!active) {
        return;
      }

      setBookings(snapshot.bookings.filter((booking) => booking.status === "accepted"));
      setPaymentsByBookingId(snapshot.paymentsByBookingId);
      setBusinessesById(snapshot.businessesById);
      setWorkerPayoutReady(
        Boolean(
          workerProfileResult.data?.stripe_connect_charges_enabled &&
            workerProfileResult.data?.stripe_connect_payouts_enabled,
        ),
      );
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

  const handleAttendance = async (
    booking: BookingRecord,
    action: "check_in" | "check_out",
  ) => {
    setActioningId(booking.id);

    try {
      const coordinates = await getCurrentCoordinates();
      const response = await fetchWithSession(`/api/bookings/${booking.id}/attendance`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          latitude: coordinates?.latitude ?? null,
          longitude: coordinates?.longitude ?? null,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        booking?: BookingRecord | null;
        payment?: PaymentRecord | null;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Unable to update shift attendance.");
      }

      if (payload.booking) {
        setBookings((current) =>
          current.map((item) => (item.id === booking.id ? payload.booking! : item)),
        );
      }

      if (payload.payment) {
        setPaymentsByBookingId((current) => ({
          ...current,
          [booking.id]: payload.payment!,
        }));
      }

      showToast({
        title: action === "check_in" ? "Shift started" : "Shift finished",
        description:
          action === "check_in"
            ? "Your start time has been logged."
            : "Your finish time has been logged for business confirmation.",
        tone: "success",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to update shift attendance.";
      showToast({
        title: "Attendance update failed",
        description: message,
        tone: "error",
      });
    } finally {
      setActioningId(null);
    }
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
          Your booked shifts
        </h1>
      </div>

      <div className="space-y-4">
        {bookings.length > 0 ? (
          bookings.map((booking) => {
            const payment = paymentsByBookingId[booking.id];
            const paymentSecured = getPaymentStatusValue(payment) === "paid";
            return (
            <WorkerBookingCard
              key={booking.id}
              booking={booking}
              business={businessesById[booking.business_id]}
              payment={payment}
              workerPayoutReady={workerPayoutReady}
              showDetailLink
              countdownNow={countdownNow}
              actions={
                !isPastBooking(booking) ? (
                  <>
                    {!paymentSecured ? (
                      <p className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm leading-6 text-stone-500">
                        You’re confirmed once the business payment is secured.
                      </p>
                    ) : null}
                    {!booking.worker_checked_in_at && !isWithinCheckInWindow(booking, countdownNow) ? (
                      <p className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm leading-6 text-stone-500">
                        {countdownNow > getCheckInWindow(booking).closesAt
                          ? "Check-in window has closed for this shift."
                          : `Check-in opens at ${new Intl.DateTimeFormat("en-GB", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            }).format(getCheckInWindow(booking).opensAt)}.`}
                      </p>
                    ) : null}
                    {!booking.worker_checked_in_at ? (
                      <button
                        type="button"
                        onClick={() => void handleAttendance(booking, "check_in")}
                        disabled={
                          actioningId === booking.id ||
                          !paymentSecured ||
                          !isWithinCheckInWindow(booking, countdownNow)
                        }
                        className="primary-btn w-full px-5 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                      >
                        {actioningId === booking.id ? "Updating..." : "Start shift"}
                      </button>
                    ) : null}
                    {booking.worker_checked_in_at && !booking.worker_checked_out_at ? (
                      <button
                        type="button"
                        onClick={() => void handleAttendance(booking, "check_out")}
                        disabled={actioningId === booking.id}
                        className="primary-btn w-full px-5 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                      >
                        {actioningId === booking.id ? "Updating..." : "End shift"}
                      </button>
                    ) : null}
                    {!booking.worker_checked_in_at ? (
                      <button
                        type="button"
                        onClick={() => void handleCancelBooking(booking)}
                        disabled={actioningId === booking.id}
                        className="secondary-btn w-full px-5 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                      >
                        {actioningId === booking.id ? "Updating..." : "Cancel shift"}
                      </button>
                    ) : null}
                    {booking.attendance_status === "pending_approval" ? (
                      <p className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm leading-6 text-stone-500">
                        Awaiting business approval.
                      </p>
                    ) : null}
                    {booking.arrival_confirmation_status === "worker_checked_in" ? (
                      <p className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm leading-6 text-stone-500">
                        Checked in - awaiting arrival confirmation.
                      </p>
                    ) : null}
                    {booking.arrival_confirmation_status === "business_confirmed" ? (
                      <p className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm leading-6 text-stone-500">
                        Arrival confirmed.
                      </p>
                    ) : null}
                    {booking.arrival_confirmation_status === "issue_reported" ? (
                      <p className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm leading-6 text-stone-500">
                        Arrival issue reported. Support is reviewing.
                      </p>
                    ) : null}
                    {(booking.attendance_status === "approved" || booking.attendance_status === "adjusted") ? (
                      <p className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm leading-6 text-stone-500">
                        Hours approved
                        {booking.business_hours_approved ? `: ${formatHoursValue(booking.business_hours_approved)}` : "."}
                      </p>
                    ) : null}
                  </>
                ) : undefined
              }
            />
            );
          })
        ) : (
          <WorkerBookingEmptyState
            title="No upcoming shifts yet"
            description="Browse available shifts to get started."
            actionHref="/shifts"
            actionLabel="Browse shifts"
          />
        )}
      </div>
    </div>
  );
}
