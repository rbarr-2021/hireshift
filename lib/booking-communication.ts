import {
  getBookingEndDateTime,
  getBookingStartDateTime,
  isWithinCheckInWindow,
} from "@/lib/bookings";
import type { BookingRecord, PaymentRecord, WorkerProfileRecord } from "@/lib/models";
import { getPaymentStatusValue } from "@/lib/payments";

type UserRole = "worker" | "business";

export function getShiftTimingGuidance(booking: BookingRecord, now = new Date()) {
  const start = getBookingStartDateTime(booking);
  const end = getBookingEndDateTime(booking);
  const startMs = start.getTime();
  const endMs = end.getTime();
  const nowMs = now.getTime();

  if (nowMs >= endMs) {
    return "Shift completed";
  }

  if (nowMs >= startMs && nowMs < endMs) {
    return "In progress";
  }

  const msUntilStart = startMs - nowMs;
  const hoursUntilStart = Math.floor(msUntilStart / (1000 * 60 * 60));

  if (hoursUntilStart <= 0) {
    return "Starts today";
  }

  if (hoursUntilStart < 24) {
    return `Starts in ${hoursUntilStart} hour${hoursUntilStart === 1 ? "" : "s"}`;
  }

  if (hoursUntilStart < 48) {
    return "Starts tomorrow";
  }

  return "Upcoming shift";
}

export function getWorkerTrustStatusLabel(
  booking: BookingRecord,
  payment: PaymentRecord | null | undefined,
  now = new Date(),
) {
  const paymentStatus = getPaymentStatusValue(payment);

  if (paymentStatus === "disputed" || booking.attendance_status === "disputed") {
    return "Issue raised";
  }

  if (payment?.payout_status === "on_hold") {
    return "On hold";
  }

  if (payment?.payout_status === "completed" || payment?.payout_status === "paid") {
    return "Paid";
  }

  if (booking.status === "accepted" && paymentStatus !== "paid") {
    return "Awaiting business payment";
  }

  if (booking.attendance_status === "approved" || booking.attendance_status === "adjusted") {
    return "Payment being processed";
  }

  if (booking.attendance_status === "pending_approval") {
    return "Waiting for business approval";
  }

  if (booking.attendance_status === "checked_in") {
    if (booking.arrival_confirmation_status === "business_confirmed") {
      return "Arrival confirmed";
    }
    if (booking.arrival_confirmation_status === "issue_reported") {
      return "Arrival issue reported";
    }
    return "Shift in progress";
  }

  if (booking.worker_checked_out_at) {
    return "Shift completed";
  }

  if (!booking.worker_checked_in_at && isWithinCheckInWindow(booking, now)) {
    return "Check in available";
  }

  return getShiftTimingGuidance(booking, now) === "Upcoming shift"
    ? "Upcoming shift"
    : "Shift booked";
}

export function getBusinessTrustStatusLabel(
  booking: BookingRecord,
  payment: PaymentRecord | null | undefined,
  now = new Date(),
) {
  const paymentStatus = getPaymentStatusValue(payment);
  if (paymentStatus === "disputed" || booking.attendance_status === "disputed") {
    return "Issue raised";
  }

  if (payment?.payout_status === "on_hold") {
    return "On hold";
  }

  if (payment?.payout_status === "completed" || payment?.payout_status === "paid") {
    return "Payment complete";
  }

  if (booking.attendance_status === "approved" || booking.attendance_status === "adjusted") {
    return "Hours approved";
  }

  if (booking.attendance_status === "pending_approval") {
    return "Awaiting hours approval";
  }

  if (booking.attendance_status === "checked_in") {
    if (booking.arrival_confirmation_status === "business_confirmed") {
      return "Arrival confirmed";
    }
    if (booking.arrival_confirmation_status === "issue_reported") {
      return "Arrival issue reported";
    }
    return "Worker checked in";
  }

  if (paymentStatus === "paid") {
    const timing = getShiftTimingGuidance(booking, now);
    return timing === "Upcoming shift" || timing === "Starts tomorrow" || timing === "Starts today"
      ? "Shift upcoming"
      : "Payment secured";
  }

  return "Worker booked";
}

export function getBookingNextAction(input: {
  role: UserRole;
  booking: BookingRecord;
  payment?: PaymentRecord | null;
  workerProfile?: WorkerProfileRecord | null;
  workerPayoutReady?: boolean;
  now?: Date;
}) {
  const now = input.now ?? new Date();

  if (input.role === "worker") {
    const paymentStatus = getPaymentStatusValue(input.payment);
    const workerNeedsPayoutSetup = !(
      input.workerPayoutReady ??
      (input.workerProfile?.stripe_connect_charges_enabled &&
        input.workerProfile?.stripe_connect_payouts_enabled)
    );

    if (workerNeedsPayoutSetup) {
      return "Complete payout setup";
    }

    if (input.booking.status === "accepted" && paymentStatus !== "paid") {
      return "Waiting for business payment";
    }

    if (input.payment?.payout_status === "completed" || input.payment?.payout_status === "paid") {
      return "View earnings";
    }

    if (input.booking.attendance_status === "pending_approval") {
      return "Waiting for business approval";
    }

    if (
      input.booking.attendance_status === "approved" ||
      input.booking.attendance_status === "adjusted"
    ) {
      return "Payment is being processed";
    }

    if (!input.booking.worker_checked_in_at && isWithinCheckInWindow(input.booking, now)) {
      return "Check in";
    }

    if (input.booking.worker_checked_in_at && !input.booking.worker_checked_out_at) {
      return "Check out";
    }

    return "View shift details";
  }

  const paymentStatus = getPaymentStatusValue(input.payment);

  if (paymentStatus !== "paid") {
    return "Pay estimated amount";
  }

  if (
    input.booking.attendance_status === "checked_in" &&
    input.booking.arrival_confirmation_status !== "business_confirmed"
  ) {
    return "Confirm arrival";
  }

  if ((input.payment?.top_up_due_gbp ?? 0) > 0 || input.payment?.settlement_status === "top_up_required") {
    return "Pay extra balance";
  }

  if ((input.payment?.refund_due_gbp ?? 0) > 0 || input.payment?.settlement_status === "refund_due") {
    return "Refund due";
  }

  if (input.booking.attendance_status === "pending_approval") {
    return "Approve hours";
  }

  if (
    input.booking.attendance_status === "disputed" ||
    input.payment?.payout_status === "on_hold"
  ) {
    return "Review issue";
  }

  if (input.booking.attendance_status === "checked_in") {
    return "Confirm worker arrival";
  }

  if (input.booking.attendance_status === "approved" || input.booking.attendance_status === "adjusted") {
    return "No action needed";
  }

  return "View booking";
}

export function getWorkerPaymentConfidenceMessage(input: {
  payment?: PaymentRecord | null;
  workerProfile?: WorkerProfileRecord | null;
  workerPayoutReady?: boolean;
}) {
  const paymentStatus = getPaymentStatusValue(input.payment);
  const payoutReady = Boolean(
    input.workerPayoutReady ??
      (input.workerProfile?.stripe_connect_charges_enabled &&
        input.workerProfile?.stripe_connect_payouts_enabled),
  );

  if (!payoutReady) {
    return "Complete payout setup before your first shift so we can pay you.";
  }

  if (paymentStatus !== "paid") {
    return "You’re confirmed once the business payment is secured.";
  }

  if (input.payment?.settlement_status === "top_up_required") {
    return "Extra approved time is waiting on business top-up payment.";
  }

  if (
    input.payment?.payout_status === "completed" ||
    input.payment?.payout_status === "paid"
  ) {
    return "Paid.";
  }

  if (
    input.payment?.payout_status === "in_progress" ||
    input.payment?.payout_status === "pending"
  ) {
    return "Payment is being processed.";
  }

  return "You’ll be paid after the shift is completed and hours are approved.";
}

export function getBusinessPaymentConfidenceMessage(input: {
  booking: BookingRecord;
  payment?: PaymentRecord | null;
}) {
  const paymentStatus = getPaymentStatusValue(input.payment);

  if (paymentStatus === "paid" && (input.payment?.top_up_due_gbp ?? 0) > 0) {
    return "Approved hours are higher than estimated. Extra payment required.";
  }

  if (paymentStatus === "paid" && (input.payment?.refund_due_gbp ?? 0) > 0) {
    return "Approved hours are lower than estimated. Refund due.";
  }

  if (paymentStatus === "paid") {
    return "Payment secured.";
  }

  if (input.booking.attendance_status === "pending_approval") {
    return "Approve hours so payout can be released.";
  }

  if (
    input.booking.attendance_status === "disputed" ||
    input.payment?.payout_status === "on_hold"
  ) {
    return "Issue raised — admin review needed.";
  }

  return "Payment required to confirm this worker.";
}
