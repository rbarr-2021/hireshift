"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast-provider";
import { bookingStatusClass, formatBookingDate, formatBookingTimeRange } from "@/lib/bookings";
import { paymentStatusClass } from "@/lib/payments";
import { fetchWithSession } from "@/lib/route-client";

type AdminBookingDetail = {
  booking: {
    id: string;
    shift_date: string;
    shift_end_date: string | null;
    start_time: string;
    end_time: string;
    requested_role_label: string | null;
    location: string;
    status: string;
    total_amount_gbp: number;
    platform_fee_gbp: number;
    notes: string | null;
    hourly_rate_gbp: number;
  };
  payment: {
    status: string;
    stripe_payment_intent_id: string | null;
    stripe_checkout_session_id: string | null;
  } | null;
  workerName: string;
  businessName: string;
  lifecycleLabel: string;
  paymentLabel: string;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 2,
  }).format(value);
}

export default function AdminBookingDetailPage() {
  const params = useParams();
  const { showToast } = useToast();
  const bookingId = params.id as string;
  const [item, setItem] = useState<AdminBookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const response = await fetchWithSession(`/api/admin/bookings/${bookingId}`);
        const payload = (await response.json()) as { error?: string; item?: AdminBookingDetail };

        if (!response.ok || !payload.item) {
          throw new Error(payload.error || "Unable to load booking.");
        }

        if (active) {
          setItem(payload.item);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to load booking.";
        showToast({
          title: "Booking unavailable",
          description: message,
          tone: "error",
        });
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [bookingId, showToast]);

  const updateStatus = async (status: string) => {
    setUpdating(true);

    try {
      const response = await fetchWithSession(`/api/admin/bookings/${bookingId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      });
      const payload = (await response.json()) as { error?: string; item?: AdminBookingDetail };

      if (!response.ok || !payload.item) {
        throw new Error(payload.error || "Unable to update booking.");
      }

      setItem(payload.item);
      showToast({
        title: "Booking updated",
        description: `Status changed to ${payload.item.lifecycleLabel}.`,
        tone: "success",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update booking.";
      showToast({
        title: "Update failed",
        description: message,
        tone: "error",
      });
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black px-4 py-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <Skeleton className="h-12 w-80" />
          <Skeleton className="h-72 w-full" />
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="min-h-screen bg-black px-4 py-8">
        <div className="mx-auto max-w-5xl">
          <div className="mobile-empty-state">
            <h1 className="text-2xl font-semibold text-stone-900">Booking unavailable</h1>
            <Link href="/admin" className="primary-btn mt-6 px-6">
              Back to admin
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="section-label">Admin booking detail</p>
            <h1 className="mt-3 text-2xl font-semibold text-stone-900 sm:text-3xl">
              {item.businessName} {"->"} {item.workerName}
            </h1>
          </div>
          <Link href="/admin" className="secondary-btn w-full px-6 sm:w-auto">
            Back to admin
          </Link>
        </div>

        <section className="panel-soft p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${bookingStatusClass(item.booking.status as never)}`}>
              {item.lifecycleLabel}
            </span>
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${paymentStatusClass((item.payment?.status ?? "pending") as never)}`}>
              {item.paymentLabel}
            </span>
          </div>

          <div className="mt-5 grid gap-4 text-sm text-stone-600 sm:grid-cols-2">
            <p><span className="font-medium text-stone-900">Role:</span> {item.booking.requested_role_label || "Hospitality shift"}</p>
            <p><span className="font-medium text-stone-900">Date:</span> {formatBookingDate(item.booking.shift_date)}</p>
            <p><span className="font-medium text-stone-900">Time:</span> {formatBookingTimeRange(item.booking.start_time, item.booking.end_time, item.booking.shift_date, item.booking.shift_end_date)}</p>
            <p><span className="font-medium text-stone-900">Rate:</span> {formatCurrency(item.booking.hourly_rate_gbp)}/hr</p>
            <p><span className="font-medium text-stone-900">Total:</span> {formatCurrency(item.booking.total_amount_gbp)}</p>
            <p><span className="font-medium text-stone-900">Fee:</span> {formatCurrency(item.booking.platform_fee_gbp)}</p>
            <p className="sm:col-span-2"><span className="font-medium text-stone-900">Location:</span> {item.booking.location}</p>
            {item.booking.notes ? (
              <p className="sm:col-span-2"><span className="font-medium text-stone-900">Notes:</span> {item.booking.notes}</p>
            ) : null}
            {item.payment?.stripe_payment_intent_id ? (
              <p className="sm:col-span-2"><span className="font-medium text-stone-900">Payment intent:</span> {item.payment.stripe_payment_intent_id}</p>
            ) : null}
          </div>
        </section>

        <section className="panel-soft p-5 sm:p-6">
          <h2 className="text-xl font-semibold text-stone-900">Admin actions</h2>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" disabled={updating} onClick={() => void updateStatus("accepted")} className="secondary-btn px-5 disabled:cursor-not-allowed disabled:opacity-60">Mark accepted</button>
            <button type="button" disabled={updating} onClick={() => void updateStatus("declined")} className="secondary-btn px-5 disabled:cursor-not-allowed disabled:opacity-60">Mark declined</button>
            <button type="button" disabled={updating} onClick={() => void updateStatus("cancelled")} className="secondary-btn px-5 disabled:cursor-not-allowed disabled:opacity-60">Cancel booking</button>
            <button type="button" disabled={updating} onClick={() => void updateStatus("completed")} className="primary-btn px-5 disabled:cursor-not-allowed disabled:opacity-60">Mark completed</button>
            <button type="button" disabled={updating} onClick={() => void updateStatus("no_show")} className="secondary-btn px-5 disabled:cursor-not-allowed disabled:opacity-60">Mark no-show</button>
          </div>
        </section>
      </div>
    </div>
  );
}
