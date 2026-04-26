"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast-provider";
import {
  formatBookingDate,
  formatAttendanceTimestamp,
  formatBookingTimeRange,
} from "@/lib/bookings";
import type {
  BookingRecord,
  BusinessProfileRecord,
  PaymentRecord,
  UserRecord,
} from "@/lib/models";
import {
  formatPaymentStatus,
  formatPayoutStatus,
  getPayoutSupportCopy,
  getWorkerShiftStage,
  paymentStatusClass,
  payoutStatusClass,
} from "@/lib/payments";
import { fetchWithSession } from "@/lib/route-client";
import { supabase } from "@/lib/supabase";

type BusinessSnapshot = {
  name: string;
  contact: string;
  location: string;
  verificationStatus: BusinessProfileRecord["verification_status"] | "pending";
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 2,
  }).format(value);
}

export default function WorkerBookingDetailPage() {
  const params = useParams();
  const { showToast } = useToast();
  const bookingId = params.id as string;
  const [booking, setBooking] = useState<BookingRecord | null>(null);
  const [payment, setPayment] = useState<PaymentRecord | null>(null);
  const [business, setBusiness] = useState<BusinessSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingAttendance, setUpdatingAttendance] = useState(false);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || !active) {
        return;
      }

      try {
        const bookingResult = await supabase
          .from("bookings")
          .select("*")
          .eq("id", bookingId)
          .eq("worker_id", user.id)
          .maybeSingle<BookingRecord>();

        if (!bookingResult.data) {
          throw new Error("This shift could not be loaded.");
        }

        const [paymentResult, businessUserResult, businessProfileResult] = await Promise.all([
          supabase
            .from("payments")
            .select("*")
            .eq("booking_id", bookingResult.data.id)
            .maybeSingle<PaymentRecord>(),
          supabase
            .from("users")
            .select("*")
            .eq("id", bookingResult.data.business_id)
            .maybeSingle<UserRecord>(),
          supabase
            .from("business_profiles")
            .select("*")
            .eq("user_id", bookingResult.data.business_id)
            .maybeSingle<BusinessProfileRecord>(),
        ]);

        if (!active) {
          return;
        }

        setBooking(bookingResult.data);
        setPayment(paymentResult.data ?? null);
        setBusiness({
          name:
            businessProfileResult.data?.business_name ||
            businessUserResult.data?.display_name ||
            "Business",
          contact:
            businessProfileResult.data?.contact_name ||
            businessUserResult.data?.email ||
            "Business contact",
          location:
            [businessProfileResult.data?.address_line_1, businessProfileResult.data?.city]
              .filter(Boolean)
              .join(", ") || bookingResult.data.location,
          verificationStatus: businessProfileResult.data?.verification_status ?? "pending",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to load shift.";
        showToast({
          title: "Shift unavailable",
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

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="panel-soft p-5 sm:p-6">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-4 h-10 w-72" />
        </div>
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="mobile-empty-state">
        <h1 className="text-2xl font-semibold text-stone-900">Shift unavailable</h1>
        <Link href="/dashboard/worker" className="primary-btn mt-6 px-6">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const handleAttendance = async (action: "check_in" | "check_out") => {
    setUpdatingAttendance(true);

    try {
      const response = await fetchWithSession(`/api/bookings/${booking.id}/attendance`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action }),
      });
      const payload = (await response.json()) as {
        error?: string;
        booking?: BookingRecord | null;
        payment?: PaymentRecord | null;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Unable to update attendance.");
      }

      if (payload.booking) {
        setBooking(payload.booking);
      }

      if (payload.payment) {
        setPayment(payload.payment);
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
      const message = error instanceof Error ? error.message : "Unable to update attendance.";
      showToast({
        title: "Attendance update failed",
        description: message,
        tone: "error",
      });
    } finally {
      setUpdatingAttendance(false);
    }
  };

  const workerPayout = payment?.worker_payout_gbp ?? booking.total_amount_gbp - booking.platform_fee_gbp;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="section-label">Worker shift detail</p>
          <h1 className="mt-3 text-2xl font-semibold text-stone-900 sm:text-3xl">
            {business?.name || "Business"} shift
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
            Funded shifts move to payout after the business confirms completion.
          </p>
        </div>
        <Link href="/dashboard/worker" className="secondary-btn w-full px-6 sm:w-auto">
          Back to dashboard
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="panel-soft p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            {payment ? (
              <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${paymentStatusClass(payment.status)}`}>
                {formatPaymentStatus(payment.status)}
              </span>
            ) : null}
            {payment ? (
              <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${payoutStatusClass(payment.payout_status)}`}>
                {formatPayoutStatus(payment.payout_status)}
              </span>
            ) : null}
          </div>

          <div className="mt-5 grid gap-4 text-sm text-stone-600 sm:grid-cols-2">
            <p><span className="font-medium text-stone-900">Role:</span> {booking.requested_role_label || "Hospitality shift"}</p>
            <p><span className="font-medium text-stone-900">Shift date:</span> {formatBookingDate(booking.shift_date)}</p>
            <p><span className="font-medium text-stone-900">Time:</span> {formatBookingTimeRange(booking.start_time, booking.end_time, booking.shift_date, booking.shift_end_date)}</p>
            <p><span className="font-medium text-stone-900">Stage:</span> {getWorkerShiftStage(booking, payment)}</p>
            <p><span className="font-medium text-stone-900">Business:</span> {business?.contact || "Business contact"}</p>
            {business?.verificationStatus === "verified" ? (
              <p><span className="font-medium text-stone-900">Trust:</span> Trusted business ✓</p>
            ) : null}
            <p><span className="font-medium text-stone-900">Location:</span> {business?.location || booking.location}</p>
            <p><span className="font-medium text-stone-900">Agreed rate:</span> {formatCurrency(booking.hourly_rate_gbp)}/hr</p>
            <p><span className="font-medium text-stone-900">Expected payout:</span> {formatCurrency(workerPayout)}</p>
            {booking.worker_checked_in_at ? (
              <p><span className="font-medium text-stone-900">Started:</span> {formatAttendanceTimestamp(booking.worker_checked_in_at)}</p>
            ) : null}
            {booking.worker_checked_out_at ? (
              <p><span className="font-medium text-stone-900">Finished:</span> {formatAttendanceTimestamp(booking.worker_checked_out_at)}</p>
            ) : null}
          </div>

          {booking.notes ? (
            <p className="mt-5 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm leading-6 text-stone-500">
              {booking.notes}
            </p>
          ) : null}
        </section>

        <aside className="panel-soft p-5 sm:p-6">
          <h2 className="text-xl font-semibold text-stone-900">Payment status</h2>
          <div className="info-banner mt-4">
            {payment ? getPayoutSupportCopy(payment.payout_status) : "Once this shift is paid for, your payout status will update here automatically."}
          </div>
          <div className="mt-5 space-y-3 text-sm text-stone-600">
            <div className="flex items-center justify-between gap-4">
              <span>Booking status</span>
              <span className="font-medium text-stone-900">{booking.status.replace(/_/g, " ")}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span>Charge status</span>
              <span className="font-medium text-stone-900">{payment ? formatPaymentStatus(payment.status) : "Pending"}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span>Payout status</span>
              <span className="font-medium text-stone-900">{payment ? formatPayoutStatus(payment.payout_status) : "Pending confirmation"}</span>
            </div>
            {payment?.payout_sent_at ? (
              <div className="flex items-center justify-between gap-4">
                <span>Paid out</span>
                <span className="font-medium text-stone-900">{new Date(payment.payout_sent_at).toLocaleString("en-GB")}</span>
              </div>
            ) : null}
            {payment?.dispute_reason ? (
              <p className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm leading-6 text-stone-500">
                {payment.dispute_reason}
              </p>
            ) : null}
          </div>
          {booking.status === "accepted" ? (
            <div className="mt-5 flex flex-col gap-3">
              {!booking.worker_checked_in_at ? (
                <button
                  type="button"
                  onClick={() => void handleAttendance("check_in")}
                  disabled={updatingAttendance}
                  className="primary-btn w-full px-5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {updatingAttendance ? "Updating..." : "Start shift"}
                </button>
              ) : null}
              {booking.worker_checked_in_at && !booking.worker_checked_out_at ? (
                <button
                  type="button"
                  onClick={() => void handleAttendance("check_out")}
                  disabled={updatingAttendance}
                  className="primary-btn w-full px-5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {updatingAttendance ? "Updating..." : "End shift"}
                </button>
              ) : null}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
