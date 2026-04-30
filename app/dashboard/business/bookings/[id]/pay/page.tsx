"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast-provider";
import {
  calculateBookingDurationHours,
  formatBookingDate,
  formatBookingTimeRange,
} from "@/lib/bookings";
import type { BookingRecord, PaymentRecord, WorkerProfileRecord } from "@/lib/models";
import { formatPaymentStatus, formatPayoutStatus } from "@/lib/payments";
import { buildBookingPricingSnapshot } from "@/lib/pricing";
import { fetchWithSession } from "@/lib/route-client";
import { supabase } from "@/lib/supabase";
import { AdminContactCard } from "@/components/support/admin-contact-card";
import { BookingMessageBox } from "@/components/messages/booking-message-box";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 2,
  }).format(value);
}

export default function BusinessBookingPaymentPage() {
  const params = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const bookingId = params.id as string;
  const [booking, setBooking] = useState<BookingRecord | null>(null);
  const [payment, setPayment] = useState<PaymentRecord | null>(null);
  const [workerProfile, setWorkerProfile] = useState<WorkerProfileRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [startingCheckout, setStartingCheckout] = useState(false);
  const stripePublishableKey =
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() || null;

  useEffect(() => {
    let active = true;

    const loadBooking = async () => {
      const { data: bookingData } = await supabase
        .from("bookings")
        .select("*")
        .eq("id", bookingId)
        .maybeSingle<BookingRecord>();

      if (!bookingData || !active) {
        setLoading(false);
        return;
      }

      const [paymentResult, workerProfileResult] = await Promise.all([
        supabase.from("payments").select("*").eq("booking_id", bookingData.id).maybeSingle<PaymentRecord>(),
        supabase
          .from("worker_profiles")
          .select("*")
          .eq("user_id", bookingData.worker_id)
          .maybeSingle<WorkerProfileRecord>(),
      ]);

      if (!active) {
        return;
      }

      setBooking(bookingData);
      setPayment(paymentResult.data ?? null);
      setWorkerProfile(workerProfileResult.data ?? null);
      setLoading(false);
    };

    void loadBooking();

    return () => {
      active = false;
    };
  }, [bookingId]);

  const pricing = useMemo(() => {
    if (!booking) {
      return buildBookingPricingSnapshot(0);
    }

    const duration =
      booking.shift_duration_hours ||
      calculateBookingDurationHours(
        booking.start_time,
        booking.end_time,
        booking.shift_date,
        booking.shift_end_date,
      );
    const subtotal = Number((duration * booking.hourly_rate_gbp).toFixed(2));
    return buildBookingPricingSnapshot(subtotal);
  }, [booking]);

  const handleCheckout = async () => {
    if (!booking || startingCheckout) {
      return;
    }

    if (!stripePublishableKey) {
      showToast({
        title: "Payment unavailable",
        description:
          "Stripe publishable key is missing in this environment. Add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY and redeploy.",
        tone: "error",
      });
      return;
    }

    setStartingCheckout(true);

    try {
      const response = await fetchWithSession(`/api/bookings/${booking.id}/checkout`, {
        method: "POST",
      });
      const responseText = await response.text();
      const payload = responseText
        ? (JSON.parse(responseText) as { error?: string; url?: string })
        : ({ error: "Payment server returned an empty response." } as {
            error?: string;
            url?: string;
          });

      if (!response.ok || !payload.url) {
        throw new Error(payload.error || "Unable to start payment right now.");
      }

      window.location.href = payload.url;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to start payment right now.";
      showToast({
        title: "Payment unavailable",
        description: message,
        tone: "error",
      });
      setStartingCheckout(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="panel-soft p-5 sm:p-6">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-4 h-10 w-72" />
          <Skeleton className="mt-3 h-4 w-56" />
        </div>
        <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="panel-soft p-5 sm:p-6">
            <Skeleton className="h-56 w-full" />
          </div>
          <div className="panel-soft p-5 sm:p-6">
            <Skeleton className="h-56 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="mobile-empty-state">
        <h1 className="text-2xl font-semibold text-stone-900">Booking not found</h1>
        <p className="mt-3 text-sm leading-6 text-stone-600">
          We could not load this booking for payment.
        </p>
        <Link href="/dashboard/business" className="primary-btn mt-6 px-6">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const bookingReadyForPayment = booking.status === "accepted";
  const topUpDue = Number(payment?.top_up_due_gbp ?? 0);
  const refundDue = Number(payment?.refund_due_gbp ?? 0);
  const isTopUpFlow = topUpDue > 0;
  const paymentLabel = payment ? formatPaymentStatus(payment.status) : "Unpaid";
  const payoutLabel = payment ? formatPayoutStatus(payment.payout_status) : "Pending confirmation";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="section-label">Booking payment</p>
          <h1 className="mt-3 text-2xl font-semibold text-stone-900 sm:text-3xl">
            {isTopUpFlow ? "Review and pay extra balance" : "Review and pay shift"}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
            {isTopUpFlow
              ? "Approved hours were higher than estimated. Pay the extra balance to settle this shift."
              : "Pay the estimated shift amount through secure Stripe checkout to lock in this booking."}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/dashboard/business" className="secondary-btn w-full px-6 sm:w-auto">
            Back to dashboard
          </Link>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="secondary-btn w-full px-6 sm:w-auto"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="panel-soft p-5 sm:p-6">
          <h2 className="text-xl font-semibold text-stone-900">Shift summary</h2>
          <div className="mt-5 grid gap-4 text-sm text-stone-600 sm:grid-cols-2">
            <p>
              <span className="font-medium text-stone-900">Worker:</span>{" "}
              {workerProfile?.job_role || booking.requested_role_label || "Hospitality worker"}
            </p>
            <p>
              <span className="font-medium text-stone-900">Date:</span>{" "}
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
              <span className="font-medium text-stone-900">Location:</span> {booking.location}
            </p>
            <p>
              <span className="font-medium text-stone-900">Meeting point:</span>{" "}
              {booking.meeting_point || "Not provided"}
            </p>
            <p>
              <span className="font-medium text-stone-900">Site contact:</span>{" "}
              {booking.site_contact_name || "Not provided"}
            </p>
            <p>
              <span className="font-medium text-stone-900">Contact phone:</span>{" "}
              {booking.site_contact_phone || "Not provided"}
            </p>
            <p>
              <span className="font-medium text-stone-900">Dress code:</span>{" "}
              {booking.dress_code || "Not provided"}
            </p>
            <p>
              <span className="font-medium text-stone-900">Equipment required:</span>{" "}
              {booking.equipment_required || "None listed"}
            </p>
            <p>
              <span className="font-medium text-stone-900">Experience level:</span>{" "}
              {booking.experience_level_required || "Not specified"}
            </p>
            <p className="sm:col-span-2">
              <span className="font-medium text-stone-900">Expected duties:</span>{" "}
              {booking.expected_duties || "Not provided"}
            </p>
            <p className="sm:col-span-2">
              <span className="font-medium text-stone-900">Arrival instructions:</span>{" "}
              {booking.arrival_instructions || "Not provided"}
            </p>
            <p>
              <span className="font-medium text-stone-900">Parking info:</span>{" "}
              {booking.parking_info || "Not provided"}
            </p>
            <p>
              <span className="font-medium text-stone-900">Staff entrance:</span>{" "}
              {booking.staff_entrance_info || "Not provided"}
            </p>
            <p>
              <span className="font-medium text-stone-900">Break policy:</span>{" "}
              {booking.break_policy || "Not provided"}
            </p>
            <p>
              <span className="font-medium text-stone-900">Meal provided:</span>{" "}
              {booking.meal_provided ? "Yes" : "No"}
            </p>
            <p className="sm:col-span-2">
              <span className="font-medium text-stone-900">Safety/PPE:</span>{" "}
              {booking.safety_or_ppe_requirements || "Not provided"}
            </p>
            <p>
              <span className="font-medium text-stone-900">Hourly rate:</span>{" "}
              {formatCurrency(booking.hourly_rate_gbp)}/hr
            </p>
            <p>
              <span className="font-medium text-stone-900">Payment status:</span> {paymentLabel}
            </p>
            <p>
              <span className="font-medium text-stone-900">Payout status:</span> {payoutLabel}
            </p>
          </div>
          {booking.notes ? (
            <p className="mt-5 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm leading-6 text-stone-500">
              {booking.notes}
            </p>
          ) : null}
        </section>

        <aside className="panel-soft p-5 sm:p-6">
          <h2 className="text-xl font-semibold text-stone-900">Totals</h2>
          <div className="mt-5 space-y-3 text-sm text-stone-600">
            <div className="flex items-center justify-between gap-4">
              <span>Worker pay</span>
              <span className="font-medium text-stone-900">{formatCurrency(pricing.workerPayGbp)}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span>NexHyr fee</span>
              <span className="font-medium text-stone-900">{formatCurrency(pricing.platformFeeGbp)}</span>
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-white/10 pt-3">
              <span className="font-medium text-stone-900">Total due</span>
              <span className="text-lg font-semibold text-stone-900">
                {formatCurrency(isTopUpFlow ? topUpDue : pricing.businessTotalGbp)}
              </span>
            </div>
            {payment?.final_gross_amount_gbp ? (
              <div className="flex items-center justify-between gap-4">
                <span>Final approved total</span>
                <span className="font-medium text-stone-900">
                  {formatCurrency(payment.final_gross_amount_gbp)}
                </span>
              </div>
            ) : null}
            {refundDue > 0 ? (
              <div className="flex items-center justify-between gap-4">
                <span>Refund due</span>
                <span className="font-medium text-stone-900">
                  {formatCurrency(refundDue)}
                </span>
              </div>
            ) : null}
          </div>
          <div className="info-banner mt-5">
            Payment secures the worker for this shift. Final pay is based on approved hours.
          </div>

          {!bookingReadyForPayment && !isTopUpFlow ? (
            <div className="info-banner mt-5">
              Payment becomes available after the worker accepts the booking request or once the shift has been marked completed.
            </div>
          ) : payment?.status === "captured" || payment?.status === "released" ? (
            <div className="info-banner mt-5">This booking has already been paid.</div>
          ) : (
            <div className="mt-5 space-y-3">
              <button
                type="button"
                onClick={() => void handleCheckout()}
                disabled={startingCheckout}
                className="primary-btn w-full disabled:cursor-not-allowed disabled:opacity-60"
              >
                {startingCheckout
                  ? "Redirecting..."
                  : isTopUpFlow
                    ? "Pay extra balance"
                    : "Secure shift payment"}
              </button>
              <p className="text-xs leading-5 text-stone-500">
                This shift must be paid before it begins or the booking will not go ahead.
              </p>
            </div>
          )}
        </aside>
      </div>
      <AdminContactCard
        accountType="business"
        bookingId={booking.id}
        roleLabel={booking.requested_role_label}
        shiftDate={booking.shift_date}
        title="Contact Support"
        description="Having an issue? Contact support and we’ll help."
      />
      <BookingMessageBox
        bookingId={booking.id}
        recipients={[
          { label: "Message worker", recipient_id: booking.worker_id, recipient_role: "worker" },
          { label: "Message admin/support", recipient_role: "admin" },
        ]}
      />
    </div>
  );
}
