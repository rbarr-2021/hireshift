"use client";

import Link from "next/link";
import {
  formatAttendanceTimestamp,
  bookingStatusClass,
  formatBookingDate,
  formatBookingStatus,
  formatBookingTimeRange,
  formatTimeUntilBooking,
} from "@/lib/bookings";
import type { BookingRecord, PaymentRecord } from "@/lib/models";
import {
  formatPaymentStatus,
  formatPayoutStatus,
  getPayoutSupportCopy,
  getWorkerShiftStage,
  paymentStatusClass,
  payoutStatusClass,
} from "@/lib/payments";

export type WorkerBookingBusinessSnapshot = {
  name: string;
  contact: string;
  location: string;
  verificationStatus?: "pending" | "verified" | "rejected";
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 2,
  }).format(value);
}

export function WorkerBookingCard({
  booking,
  business,
  actions,
  payment,
  showDetailLink = false,
  countdownNow,
}: {
  booking: BookingRecord;
  business?: WorkerBookingBusinessSnapshot;
  actions?: React.ReactNode;
  payment?: PaymentRecord | null;
  showDetailLink?: boolean;
  countdownNow?: Date;
}) {
  const shiftStage = getWorkerShiftStage(booking, payment ?? null);
  const countdownLabel = countdownNow
    ? formatTimeUntilBooking(booking, countdownNow)
    : "";

  return (
    <article className="panel-soft p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-base font-semibold text-stone-900">
            {business?.name || "Business request"}
          </p>
          <p className="mt-1 text-sm text-stone-600">
            {business?.contact || "Hospitality business"}
            {business?.location ? ` | ${business.location}` : ""}
          </p>
          {business?.verificationStatus === "verified" ? (
            <div className="mt-2">
              <span className="status-badge status-badge--ready">Trusted business</span>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${bookingStatusClass(booking.status)}`}>
            {formatBookingStatus(booking.status)}
          </span>
          {payment ? (
            <span className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${paymentStatusClass(payment.status)}`}>
              {formatPaymentStatus(payment.status)}
            </span>
          ) : null}
          {payment ? (
            <span className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${payoutStatusClass(payment.payout_status)}`}>
              {formatPayoutStatus(payment.payout_status)}
            </span>
          ) : null}
        </div>
      </div>
      <div className="mt-4 grid gap-3 text-sm text-stone-600 sm:grid-cols-2">
        <p>
          <span className="font-medium text-stone-900">Shift:</span>{" "}
          {formatBookingDate(booking.shift_date)}
        </p>
        <p>
          <span className="font-medium text-stone-900">Time:</span>{" "}
          {formatBookingTimeRange(
            booking.start_time,
            booking.end_time,
            booking.shift_date,
            booking.shift_end_date,
          )}
        </p>
        <p>
          <span className="inline-flex items-center rounded-full bg-[#1DB954] px-3 py-1 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(29,185,84,0.24)]">
            Pay {formatCurrency(booking.hourly_rate_gbp)}/hr
          </span>
        </p>
        <p>
          <span className="font-medium text-stone-900">Status:</span>{" "}
          {shiftStage}
        </p>
        {booking.worker_checked_in_at ? (
          <p>
            <span className="font-medium text-stone-900">Started:</span>{" "}
            {formatAttendanceTimestamp(booking.worker_checked_in_at)}
          </p>
        ) : null}
        {booking.worker_checked_out_at ? (
          <p>
            <span className="font-medium text-stone-900">Finished:</span>{" "}
            {formatAttendanceTimestamp(booking.worker_checked_out_at)}
          </p>
        ) : null}
      </div>
      {countdownLabel ? (
        <div className="mt-4">
          <span className="status-badge status-badge--rating">{countdownLabel}</span>
        </div>
      ) : null}
      {payment ? (
        <p className="mt-4 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm leading-6 text-stone-500">
          {getPayoutSupportCopy(payment.payout_status)}
        </p>
      ) : null}
      {booking.notes ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/40 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Arrival details
          </p>
          <p className="mt-2 text-sm leading-6 text-stone-500">
            {booking.notes}
          </p>
        </div>
      ) : null}
      {actions || showDetailLink ? (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          {actions}
          {showDetailLink ? (
            <Link
              href={`/dashboard/worker/bookings/${booking.id}`}
              className="secondary-btn w-full px-5 sm:w-auto"
            >
              View details
            </Link>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function WorkerBookingEmptyState({
  title,
  description,
  actionHref,
  actionLabel,
}: {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="mobile-empty-state">
      <h3 className="text-lg font-semibold text-stone-900">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-stone-600">{description}</p>
      {actionHref && actionLabel ? (
        <Link href={actionHref} className="primary-btn mt-5 px-6">
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
