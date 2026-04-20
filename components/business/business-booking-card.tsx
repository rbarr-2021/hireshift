"use client";

import Link from "next/link";
import {
  bookingStatusClass,
  formatBookingDate,
  formatBookingTimeRange,
} from "@/lib/bookings";
import {
  formatBookingLifecycleLabel,
  paymentStatusClass,
  payoutStatusClass,
} from "@/lib/payments";
import type { BookingRecord } from "@/lib/models";

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
  paymentLabel,
  paymentTone,
  payoutLabel,
  payoutTone,
}: {
  booking: BookingRecord;
  worker?: WorkerSnapshot;
  actions?: React.ReactNode;
  paymentLabel?: string;
  paymentTone?: string;
  payoutLabel?: string;
  payoutTone?: string;
}) {
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
          <span
            className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${bookingStatusClass(booking.status)}`}
          >
            {formatBookingLifecycleLabel(booking)}
          </span>
          {paymentLabel ? (
            <span
              className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${paymentTone ?? paymentStatusClass("pending")}`}
            >
              {paymentLabel}
            </span>
          ) : null}
          {payoutLabel ? (
            <span
              className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${payoutTone ?? payoutStatusClass("pending_confirmation")}`}
            >
              {payoutLabel}
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
          <span className="font-medium text-stone-900">Rate:</span>{" "}
          {formatCurrency(booking.hourly_rate_gbp)}/hr
        </p>
        <p>
          <span className="font-medium text-stone-900">Total:</span>{" "}
          {formatCurrency(booking.total_amount_gbp)}
        </p>
      </div>
      {booking.notes ? (
        <p className="mt-4 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm leading-6 text-stone-500">
          {booking.notes}
        </p>
      ) : null}
      {actions ? <div className="mt-4 flex flex-col gap-3 sm:flex-row">{actions}</div> : null}
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
