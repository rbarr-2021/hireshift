"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  BookingRecord,
  BusinessProfileRecord,
  PaymentRecord,
  UserRecord,
} from "@/lib/models";
import {
  formatPaymentStatus,
  formatPayoutStatus,
  getLastPaidPayout,
  getPayoutSupportCopy,
  getUpcomingPayout,
  paymentStatusClass,
  payoutStatusClass,
} from "@/lib/payments";
import { formatBookingDate, formatBookingTimeRange } from "@/lib/bookings";
import { supabase } from "@/lib/supabase";

type BusinessSnapshot = {
  name: string;
  location: string;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 2,
  }).format(value);
}

export default function WorkerPaymentsPage() {
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [paymentsByBookingId, setPaymentsByBookingId] = useState<Record<string, PaymentRecord>>({});
  const [businessesById, setBusinessesById] = useState<Record<string, BusinessSnapshot>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const loadPayments = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || !active) {
        return;
      }

      const bookingsResult = await supabase
        .from("bookings")
        .select("*")
        .eq("worker_id", user.id)
        .order("shift_date", { ascending: false })
        .order("start_time", { ascending: false });

      if (!active) {
        return;
      }

      const nextBookings = (bookingsResult.data as BookingRecord[] | null) ?? [];
      const bookingIds = nextBookings.map((booking) => booking.id);
      const businessIds = [...new Set(nextBookings.map((booking) => booking.business_id))];

      const [paymentsResult, businessUsersResult, businessProfilesResult] = await Promise.all([
        bookingIds.length > 0
          ? supabase.from("payments").select("*").in("booking_id", bookingIds)
          : Promise.resolve({ data: [] as PaymentRecord[] }),
        businessIds.length > 0
          ? supabase.from("users").select("*").in("id", businessIds)
          : Promise.resolve({ data: [] as UserRecord[] }),
        businessIds.length > 0
          ? supabase.from("business_profiles").select("*").in("user_id", businessIds)
          : Promise.resolve({ data: [] as BusinessProfileRecord[] }),
      ]);

      if (!active) {
        return;
      }

      const nextPayments = (paymentsResult.data as PaymentRecord[] | null) ?? [];
      const nextBusinesses = businessIds.reduce<Record<string, BusinessSnapshot>>((accumulator, businessId) => {
        const businessUser = ((businessUsersResult.data as UserRecord[] | null) ?? []).find(
          (entry) => entry.id === businessId,
        );
        const businessProfile = ((businessProfilesResult.data as BusinessProfileRecord[] | null) ?? []).find(
          (entry) => entry.user_id === businessId,
        );

        accumulator[businessId] = {
          name: businessProfile?.business_name || businessUser?.display_name || "Business",
          location:
            [businessProfile?.address_line_1, businessProfile?.city].filter(Boolean).join(", ") ||
            "Venue to be confirmed",
        };

        return accumulator;
      }, {});

      setBookings(nextBookings);
      setBusinessesById(nextBusinesses);
      setPaymentsByBookingId(
        nextPayments.reduce<Record<string, PaymentRecord>>((accumulator, payment) => {
          accumulator[payment.booking_id] = payment;
          return accumulator;
        }, {}),
      );
      setLoading(false);
    };

    void loadPayments();

    return () => {
      active = false;
    };
  }, []);

  const upcomingPayout = useMemo(
    () => getUpcomingPayout(bookings, paymentsByBookingId),
    [bookings, paymentsByBookingId],
  );

  const lastPaidPayout = useMemo(
    () => getLastPaidPayout(bookings, paymentsByBookingId),
    [bookings, paymentsByBookingId],
  );

  const payoutHistory = useMemo(
    () =>
      bookings.filter((booking) => {
        const payment = paymentsByBookingId[booking.id];
        return Boolean(payment);
      }),
    [bookings, paymentsByBookingId],
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <p className="section-label">Payments</p>
          <Skeleton className="mt-4 h-10 w-56" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="panel-soft p-5">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="mt-4 h-10 w-32" />
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
            Earnings and payout status
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
            Track upcoming payouts, completed payments, and every shift that is moving through approval.
          </p>
        </div>
        <Link href="/dashboard/worker" className="secondary-btn w-full px-6 sm:w-auto">
          Back to overview
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <section className="panel-soft p-5">
          <p className="text-sm font-medium text-stone-500">Upcoming payout</p>
          <p className="mt-2 text-3xl font-semibold text-stone-900">
            {upcomingPayout ? formatCurrency(upcomingPayout.payment.worker_payout_gbp) : "None yet"}
          </p>
          <p className="mt-2 text-sm text-stone-600">
            {upcomingPayout
              ? `${businessesById[upcomingPayout.booking.business_id]?.name || "Business"} | ${formatPayoutStatus(upcomingPayout.payment.payout_status)}`
              : "Your next payout will appear here once a completed shift is approved."}
          </p>
        </section>
        <section className="panel-soft p-5">
          <p className="text-sm font-medium text-stone-500">Last payout</p>
          <p className="mt-2 text-3xl font-semibold text-stone-900">
            {lastPaidPayout ? formatCurrency(lastPaidPayout.payment.worker_payout_gbp) : "None yet"}
          </p>
          <p className="mt-2 text-sm text-stone-600">
            {lastPaidPayout
              ? `${businessesById[lastPaidPayout.booking.business_id]?.name || "Business"} | paid`
              : "Paid shifts will move here once payout is sent."}
          </p>
        </section>
        <section className="panel-soft p-5">
          <p className="text-sm font-medium text-stone-500">Tracked shifts</p>
          <p className="mt-2 text-3xl font-semibold text-stone-900">{payoutHistory.length}</p>
          <p className="mt-2 text-sm text-stone-600">
            Every paid or payout-tracked shift is listed below.
          </p>
        </section>
      </div>

      {payoutHistory.length > 0 ? (
        <div className="space-y-4">
          {payoutHistory.map((booking) => {
            const payment = paymentsByBookingId[booking.id];
            const business = businessesById[booking.business_id];

            return (
              <article key={booking.id} className="panel-soft p-5 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-lg font-semibold text-stone-900">
                      {business?.name || "Business"}
                    </p>
                    <p className="mt-1 text-sm text-stone-600">
                      {business?.location || booking.location}
                    </p>
                  </div>
                  {payment ? (
                    <div className="flex flex-wrap gap-2">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${paymentStatusClass(payment.status)}`}>
                        {formatPaymentStatus(payment.status)}
                      </span>
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${payoutStatusClass(payment.payout_status)}`}>
                        {formatPayoutStatus(payment.payout_status)}
                      </span>
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-3 text-sm text-stone-600 sm:grid-cols-2">
                  <p><span className="font-medium text-stone-900">Shift:</span> {formatBookingDate(booking.shift_date)}</p>
                  <p><span className="font-medium text-stone-900">Time:</span> {formatBookingTimeRange(booking.start_time, booking.end_time, booking.shift_date, booking.shift_end_date)}</p>
                  <p><span className="font-medium text-stone-900">Rate:</span> {formatCurrency(booking.hourly_rate_gbp)}/hr</p>
                  <p><span className="font-medium text-stone-900">Expected payout:</span> {payment ? formatCurrency(payment.worker_payout_gbp) : "Pending"}</p>
                </div>

                <p className="mt-4 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm leading-6 text-stone-500">
                  {getPayoutSupportCopy(payment ?? null)}
                </p>

                <div className="mt-4">
                  <Link href={`/dashboard/worker/bookings/${booking.id}`} className="secondary-btn w-full px-5 sm:w-auto">
                    View shift detail
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mobile-empty-state">
          <h2 className="text-xl font-semibold text-stone-900">No payment activity yet</h2>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            Accept shifts and complete them reliably to see payout status here.
          </p>
        </div>
      )}
    </div>
  );
}
