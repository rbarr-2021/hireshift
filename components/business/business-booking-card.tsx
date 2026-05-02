"use client";

import Link from "next/link";
import {
  calculateBookingDurationHours,
  formatArrivalConfirmationStatusLabel,
  formatAttendanceStatusLabel,
  formatAttendanceTimestamp,
  formatHoursValue,
  formatShiftDateTimeRange,
} from "@/lib/bookings";
import type { BookingRecord, PaymentRecord } from "@/lib/models";
import {
  getBookingNextAction,
  getBusinessPaymentConfidenceMessage,
  getBusinessTrustStatusLabel,
  getShiftTimingGuidance,
} from "@/lib/booking-communication";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 2,
  }).format(value);
}

export type WorkerSnapshot = {
  name: string;
  role: string;
  city: string;
};

export function BusinessBookingCard({
  booking,
  worker,
  actions,
  payment,
  paymentLabel,
  paymentTone,
  payoutLabel,
  payoutTone,
  compact = false,
}: {
  booking: BookingRecord;
  worker?: WorkerSnapshot;
  actions?: React.ReactNode;
  payment?: PaymentRecord | null;
  paymentLabel?: string;
  paymentTone?: string;
  payoutLabel?: string;
  payoutTone?: string;
  compact?: boolean;
}) {
  const trustStatus = getBusinessTrustStatusLabel(booking, payment ?? null);
  const nextActionLabel = getBookingNextAction({
    role: "business",
    booking,
    payment,
  });
  const paymentConfidence = getBusinessPaymentConfidenceMessage({ booking, payment });
  const timingGuidance = getShiftTimingGuidance(booking);

  return (
    <article className="panel-soft p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-base font-semibold text-stone-900">
            {worker?.name || "Worker request"}
          </p>
          <p className="mt-1 text-sm text-stone-600">
            {worker?.role || "Hospitality worker"}
            {worker?.city ? ` | ${worker.city}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <span className="status-badge status-badge--ready">{trustStatus}</span>
          {paymentLabel ? (
            <span className={`status-badge ${paymentTone ?? ""}`.trim()}>{paymentLabel}</span>
          ) : null}
          {payoutLabel ? (
            <span className={`status-badge ${payoutTone ?? ""}`.trim()}>{payoutLabel}</span>
          ) : null}
        </div>
      </div>
      <div className="mt-4 grid gap-3 text-sm text-stone-600 sm:grid-cols-2">
        <p>
          <span className="font-medium text-stone-900">Shift:</span>{" "}
          {formatShiftDateTimeRange(booking)}
        </p>
        <p>
          <span className="inline-flex items-center rounded-full bg-[#1DB954] px-3 py-1 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(29,185,84,0.24)]">
            Pay {formatCurrency(booking.hourly_rate_gbp)}/hr
          </span>
        </p>
        {!compact ? (
          <>
            <p>
              <span className="font-medium text-stone-900">Total:</span>{" "}
              {formatCurrency(booking.total_amount_gbp)}
            </p>
            <p>
              <span className="font-medium text-stone-900">Scheduled hours:</span>{" "}
              {formatHoursValue(
                booking.shift_duration_hours ??
                  calculateBookingDurationHours(
                    booking.start_time,
                    booking.end_time,
                    booking.shift_date,
                    booking.shift_end_date,
                  ),
              ) ?? "Not set"}
            </p>
            <p>
              <span className="font-medium text-stone-900">Attendance:</span>{" "}
              {formatAttendanceStatusLabel(booking.attendance_status)}
            </p>
            <p>
              <span className="font-medium text-stone-900">Arrival:</span>{" "}
              {formatArrivalConfirmationStatusLabel(booking.arrival_confirmation_status)}
            </p>
            <p>
              <span className="font-medium text-stone-900">Timing:</span> {timingGuidance}
            </p>
            {booking.worker_hours_claimed ? (
              <p>
                <span className="font-medium text-stone-900">Claimed hours:</span>{" "}
                {formatHoursValue(booking.worker_hours_claimed)}
              </p>
            ) : null}
            {booking.business_hours_approved ? (
              <p>
                <span className="font-medium text-stone-900">Approved hours:</span>{" "}
                {formatHoursValue(booking.business_hours_approved)}
              </p>
            ) : null}
            {booking.worker_checked_in_at ? (
              <p>
                <span className="font-medium text-stone-900">Worker started:</span>{" "}
                {formatAttendanceTimestamp(booking.worker_checked_in_at)}
              </p>
            ) : null}
            {booking.worker_checked_out_at ? (
              <p>
                <span className="font-medium text-stone-900">Worker finished:</span>{" "}
                {formatAttendanceTimestamp(booking.worker_checked_out_at)}
              </p>
            ) : null}
          </>
        ) : (
          <>
            <p>
              <span className="font-medium text-stone-900">Timing:</span> {timingGuidance}
            </p>
            <p>
              <span className="font-medium text-stone-900">Total:</span>{" "}
              {formatCurrency(booking.total_amount_gbp)}
            </p>
          </>
        )}
      </div>
      {booking.business_adjustment_reason && !compact ? (
        <p className="mt-4 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm leading-6 text-stone-500">
          {booking.business_adjustment_reason}
        </p>
      ) : null}
      {booking.arrival_confirmation_note && !compact ? (
        <p className="mt-4 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm leading-6 text-stone-500">
          {booking.arrival_confirmation_note}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="status-badge status-badge--ready">{nextActionLabel}</span>
      </div>
      {!compact ? (
        <p className="mt-4 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm leading-6 text-stone-500">
          {paymentConfidence}
        </p>
      ) : null}
      {booking.notes && !compact ? (
        <p className="mt-4 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm leading-6 text-stone-500">
          {booking.notes}
        </p>
      ) : null}
      {actions ? (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {actions}
        </div>
      ) : null}
    </article>
  );
}

export function BusinessEmptyState({
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
