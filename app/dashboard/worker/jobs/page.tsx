"use client";

import { useEffect, useState } from "react";
import { CancelBookingAction } from "@/components/bookings/cancel-booking-action";
import { AdminContactCard } from "@/components/support/admin-contact-card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  WorkerBookingCard,
  WorkerBookingEmptyState,
  type WorkerBookingBusinessSnapshot,
} from "@/components/worker/worker-booking-card";
import { loadWorkerBookingsSnapshot } from "@/components/worker/worker-bookings-loader";
import {
  canCancelBooking,
  formatHoursValue,
  isPastBooking,
} from "@/lib/bookings";
import type {
  BookingRecord,
  PaymentRecord,
  WorkerProfileRecord,
} from "@/lib/models";
import { getPaymentStatusValue } from "@/lib/payments";
import { supabase } from "@/lib/supabase";

export default function WorkerAcceptedJobsPage() {
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [paymentsByBookingId, setPaymentsByBookingId] = useState<Record<string, PaymentRecord>>({});
  const [businessesById, setBusinessesById] = useState<Record<string, WorkerBookingBusinessSnapshot>>({});
  const [loading, setLoading] = useState(true);
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
                compact
                workerPayoutReady={workerPayoutReady}
                showDetailLink={false}
                countdownNow={countdownNow}
                actions={
                  !isPastBooking(booking) ? (
                    <>
                      {!paymentSecured ? (
                        <p className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm leading-6 text-stone-500">
                          You’re confirmed once the business payment is secured.
                        </p>
                      ) : (
                        <p className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm leading-6 text-stone-500">
                          Attend your shift at the agreed time. The business will approve your hours afterwards.
                        </p>
                      )}
                      <a
                        href={`/dashboard/worker/bookings/${booking.id}`}
                        className="primary-btn w-full px-5 text-center sm:w-auto"
                      >
                        View shift
                      </a>
                      {canCancelBooking(booking, payment) ? (
                        <CancelBookingAction
                          bookingId={booking.id}
                          actorRole="worker"
                          className="secondary-btn w-full px-5 sm:w-auto"
                          onCancelled={() => {
                            setBookings((current) =>
                              current.filter((item) => item.id !== booking.id),
                            );
                            setPaymentsByBookingId((current) => {
                              const next = { ...current };
                              delete next[booking.id];
                              return next;
                            });
                          }}
                        />
                      ) : null}
                      {booking.attendance_status === "pending_approval" ? (
                        <p className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm leading-6 text-stone-500">
                          Awaiting business approval.
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
      <AdminContactCard
        accountType="worker"
        title="Contact Support"
        description="Having an issue? Contact support and we’ll help."
      />
    </div>
  );
}
