"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast-provider";
import { bookingStatusClass, formatShiftDateTimeRange } from "@/lib/bookings";
import { paymentStatusClass, payoutStatusClass } from "@/lib/payments";
import { fetchWithSession } from "@/lib/route-client";
import { BookingMessageBox } from "@/components/messages/booking-message-box";

type AdminBookingDetail = {
  booking: {
    id: string;
    worker_id: string;
    business_id: string;
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
    meeting_point: string | null;
    site_contact_name: string | null;
    site_contact_phone: string | null;
    arrival_instructions: string | null;
    dress_code: string | null;
    equipment_required: string | null;
    expected_duties: string | null;
    parking_info: string | null;
    staff_entrance_info: string | null;
    break_policy: string | null;
    meal_provided: boolean;
    safety_or_ppe_requirements: string | null;
    experience_level_required: string | null;
    cancelled_at: string | null;
    cancelled_by_user_id: string | null;
    cancelled_by_role: string | null;
    cancellation_reason: string | null;
    cancellation_note: string | null;
    worker_checked_in_at: string | null;
    worker_checked_out_at: string | null;
  };
  payment: {
    status: string;
    payout_status: string;
    stripe_payment_intent_id: string | null;
    stripe_transfer_id: string | null;
    stripe_checkout_session_id: string | null;
    shift_completed_at: string | null;
    payout_approved_at: string | null;
    payout_sent_at: string | null;
    dispute_reason: string | null;
    payout_hold_reason: string | null;
  } | null;
  workerName: string;
  businessName: string;
  lifecycleLabel: string;
  paymentLabel: string;
  payoutLabel: string;
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

  const updateBooking = async ({
    status,
    payoutAction,
    reason,
    successTitle,
    successDescription,
  }: {
    status?: string;
    payoutAction?: string;
    reason?: string;
    successTitle: string;
    successDescription: string;
  }) => {
    setUpdating(true);

    try {
      const response = await fetchWithSession(`/api/admin/bookings/${bookingId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status, payoutAction, reason }),
      });
      const payload = (await response.json()) as { error?: string; item?: AdminBookingDetail };

      if (!response.ok || !payload.item) {
        throw new Error(payload.error || "Unable to update booking.");
      }

      setItem(payload.item);
      showToast({
        title: successTitle,
        description: successDescription,
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
            {item.payment ? (
              <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${payoutStatusClass(item.payment.payout_status as never)}`}>
                {item.payoutLabel}
              </span>
            ) : null}
          </div>

          <div className="mt-5 grid gap-4 text-sm text-stone-600 sm:grid-cols-2">
            <p><span className="font-medium text-stone-900">Role:</span> {item.booking.requested_role_label || "Hospitality shift"}</p>
            <p><span className="font-medium text-stone-900">Shift:</span> {formatShiftDateTimeRange(item.booking)}</p>
            <p><span className="font-medium text-stone-900">Rate:</span> {formatCurrency(item.booking.hourly_rate_gbp)}/hr</p>
            <p><span className="font-medium text-stone-900">Total:</span> {formatCurrency(item.booking.total_amount_gbp)}</p>
            <p><span className="font-medium text-stone-900">Fee:</span> {formatCurrency(item.booking.platform_fee_gbp)}</p>
            <p className="sm:col-span-2"><span className="font-medium text-stone-900">Location:</span> {item.booking.location}</p>
            <p><span className="font-medium text-stone-900">Meeting point:</span> {item.booking.meeting_point || "Not provided"}</p>
            <p><span className="font-medium text-stone-900">Site contact:</span> {item.booking.site_contact_name || "Not provided"}</p>
            <p><span className="font-medium text-stone-900">Contact phone:</span> {item.booking.site_contact_phone || "Not provided"}</p>
            <p><span className="font-medium text-stone-900">Dress code:</span> {item.booking.dress_code || "Not provided"}</p>
            <p><span className="font-medium text-stone-900">Equipment required:</span> {item.booking.equipment_required || "None listed"}</p>
            <p><span className="font-medium text-stone-900">Experience level:</span> {item.booking.experience_level_required || "Not specified"}</p>
            <p className="sm:col-span-2"><span className="font-medium text-stone-900">Expected duties:</span> {item.booking.expected_duties || "Not provided"}</p>
            <p className="sm:col-span-2"><span className="font-medium text-stone-900">Arrival instructions:</span> {item.booking.arrival_instructions || "Not provided"}</p>
            <p><span className="font-medium text-stone-900">Parking info:</span> {item.booking.parking_info || "Not provided"}</p>
            <p><span className="font-medium text-stone-900">Staff entrance:</span> {item.booking.staff_entrance_info || "Not provided"}</p>
            <p><span className="font-medium text-stone-900">Break policy:</span> {item.booking.break_policy || "Not provided"}</p>
            <p><span className="font-medium text-stone-900">Meal provided:</span> {item.booking.meal_provided ? "Yes" : "No"}</p>
            <p className="sm:col-span-2"><span className="font-medium text-stone-900">Safety/PPE:</span> {item.booking.safety_or_ppe_requirements || "Not provided"}</p>
            {item.booking.notes ? (
              <p className="sm:col-span-2"><span className="font-medium text-stone-900">Notes:</span> {item.booking.notes}</p>
            ) : null}
            {item.booking.cancelled_at ? (
              <p><span className="font-medium text-stone-900">Cancelled at:</span> {new Date(item.booking.cancelled_at).toLocaleString("en-GB")}</p>
            ) : null}
            {item.booking.cancelled_by_role ? (
              <p><span className="font-medium text-stone-900">Cancelled by:</span> {item.booking.cancelled_by_role}</p>
            ) : null}
            {item.booking.cancelled_by_user_id ? (
              <p><span className="font-medium text-stone-900">Cancelled by user:</span> {item.booking.cancelled_by_user_id}</p>
            ) : null}
            {item.booking.cancellation_reason ? (
              <p><span className="font-medium text-stone-900">Cancellation reason:</span> {item.booking.cancellation_reason}</p>
            ) : null}
            {item.booking.cancellation_note ? (
              <p className="sm:col-span-2"><span className="font-medium text-stone-900">Cancellation note:</span> {item.booking.cancellation_note}</p>
            ) : null}
            <p>
              <span className="font-medium text-stone-900">Worker check-in:</span>{" "}
              {item.booking.worker_checked_in_at
                ? new Date(item.booking.worker_checked_in_at).toLocaleString("en-GB")
                : "Not recorded (check-in not used for this booking)"}
            </p>
            <p>
              <span className="font-medium text-stone-900">Worker check-out:</span>{" "}
              {item.booking.worker_checked_out_at
                ? new Date(item.booking.worker_checked_out_at).toLocaleString("en-GB")
                : "Not recorded"}
            </p>
            {item.payment?.stripe_payment_intent_id ? (
              <p className="sm:col-span-2"><span className="font-medium text-stone-900">Payment intent:</span> {item.payment.stripe_payment_intent_id}</p>
            ) : null}
            {item.payment?.shift_completed_at ? (
              <p><span className="font-medium text-stone-900">Shift completed:</span> {new Date(item.payment.shift_completed_at).toLocaleString("en-GB")}</p>
            ) : null}
            {item.payment?.payout_approved_at ? (
              <p><span className="font-medium text-stone-900">Payout approved:</span> {new Date(item.payment.payout_approved_at).toLocaleString("en-GB")}</p>
            ) : null}
            {item.payment?.payout_sent_at ? (
              <p><span className="font-medium text-stone-900">Paid out:</span> {new Date(item.payment.payout_sent_at).toLocaleString("en-GB")}</p>
            ) : null}
            {item.payment?.dispute_reason ? (
              <p className="sm:col-span-2"><span className="font-medium text-stone-900">Dispute reason:</span> {item.payment.dispute_reason}</p>
            ) : null}
            {item.payment?.payout_hold_reason ? (
              <p className="sm:col-span-2"><span className="font-medium text-stone-900">Hold reason:</span> {item.payment.payout_hold_reason}</p>
            ) : null}
          </div>
        </section>

        <section className="panel-soft p-5 sm:p-6">
          <h2 className="text-xl font-semibold text-stone-900">Booking actions</h2>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" disabled={updating} onClick={() => void updateBooking({ status: "accepted", successTitle: "Booking updated", successDescription: "Booking marked as accepted." })} className="secondary-btn px-5 disabled:cursor-not-allowed disabled:opacity-60">Mark accepted</button>
            <button type="button" disabled={updating} onClick={() => void updateBooking({ status: "declined", successTitle: "Booking updated", successDescription: "Booking marked as declined." })} className="secondary-btn px-5 disabled:cursor-not-allowed disabled:opacity-60">Mark declined</button>
            <button type="button" disabled={updating} onClick={() => void updateBooking({ status: "cancelled", successTitle: "Booking updated", successDescription: "Booking cancelled." })} className="secondary-btn px-5 disabled:cursor-not-allowed disabled:opacity-60">Cancel booking</button>
            <button type="button" disabled={updating} onClick={() => void updateBooking({ status: "completed", successTitle: "Booking updated", successDescription: "Booking marked as completed." })} className="primary-btn px-5 disabled:cursor-not-allowed disabled:opacity-60">Mark completed</button>
            <button type="button" disabled={updating} onClick={() => void updateBooking({ status: "no_show", successTitle: "Booking updated", successDescription: "Booking marked as no-show." })} className="secondary-btn px-5 disabled:cursor-not-allowed disabled:opacity-60">Mark no-show</button>
          </div>
        </section>

        <section className="panel-soft p-5 sm:p-6">
          <h2 className="text-xl font-semibold text-stone-900">Payout actions</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Fast payout still stays protected. Approve once the shift is confirmed, hold or dispute if something needs checking, then mark paid when funds are sent.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" disabled={updating || !item.payment} onClick={() => void updateBooking({ payoutAction: "approve_payout", successTitle: "Payout approved", successDescription: "This booking is now ready for payout." })} className="primary-btn px-5 disabled:cursor-not-allowed disabled:opacity-60">Approve payout</button>
            <button type="button" disabled={updating || !item.payment} onClick={() => void updateBooking({ payoutAction: "hold", reason: "Manual review before payout release.", successTitle: "Payout placed on hold", successDescription: "This payout is now on hold for review." })} className="secondary-btn px-5 disabled:cursor-not-allowed disabled:opacity-60">Place on hold</button>
            <button type="button" disabled={updating || !item.payment} onClick={() => void updateBooking({ payoutAction: "dispute", reason: "Issue flagged during post-shift review.", successTitle: "Booking disputed", successDescription: "The payout has been moved into dispute." })} className="secondary-btn px-5 disabled:cursor-not-allowed disabled:opacity-60">Flag dispute</button>
            <button type="button" disabled={updating || !item.payment?.stripe_transfer_id} onClick={() => void updateBooking({ payoutAction: "mark_paid", successTitle: "Payout marked as paid", successDescription: "Worker payout has been recorded as sent." })} className="primary-btn px-5 disabled:cursor-not-allowed disabled:opacity-60">Mark paid</button>
          </div>
          {!item.payment?.stripe_transfer_id ? (
            <div className="action-needed-banner mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#67B7FF]">
                Action needed
              </p>
              <p className="mt-2 text-sm leading-6 text-[#CFE6FF]">
                Mark paid unlocks only after Stripe confirms a worker transfer. If payout is on hold, ask the worker to connect Stripe payouts first.
              </p>
            </div>
          ) : null}
        </section>

        <BookingMessageBox
          bookingId={item.booking.id}
          recipients={[
            { label: "Message worker", recipient_id: item.booking.worker_id, recipient_role: "worker" },
            { label: "Message business", recipient_id: item.booking.business_id, recipient_role: "business" },
          ]}
          compact
        />
      </div>
    </div>
  );
}
