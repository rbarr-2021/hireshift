import type {
  BookingRecord,
  PaymentRecord,
  PaymentStatus,
  PayoutStatus,
} from "@/lib/models";

function getPaymentStatusValue(payment?: PaymentRecord | null) {
  if (!payment) {
    return null;
  }

  const row = payment as PaymentRecord & { payment_status?: PaymentStatus | null };
  return row.payment_status ?? payment.status ?? null;
}

export function formatPaymentStatus(status: PaymentStatus) {
  const labels: Record<PaymentStatus, string> = {
    pending: "Unpaid",
    paid: "Paid",
    failed: "Failed",
    refunded: "Refunded",
    disputed: "Disputed",
    // Legacy labels (kept during transition).
    authorized: "Authorised",
    captured: "Paid",
    released: "Released",
  };

  return labels[status];
}

export function paymentStatusClass(status: PaymentStatus) {
  const classes: Record<PaymentStatus, string> = {
    pending: "status-badge",
    paid: "status-badge status-badge--ready",
    failed: "bg-red-100 text-red-900",
    refunded: "bg-stone-200 text-stone-800",
    disputed: "bg-red-100 text-red-900",
    // Legacy classes.
    authorized: "status-badge status-badge--rating",
    captured: "status-badge status-badge--ready",
    released: "bg-stone-200 text-stone-800",
  };

  return classes[status];
}

export function formatPayoutStatus(status: PayoutStatus) {
  const labels: Record<PayoutStatus, string> = {
    not_started: "Not started",
    pending: "Pending",
    in_progress: "In progress",
    completed: "Completed",
    failed: "Failed",
    on_hold: "On hold",
    // Legacy labels.
    pending_confirmation: "Pending confirmation",
    awaiting_shift_completion: "Awaiting shift completion",
    awaiting_business_approval: "Awaiting business approval",
    approved_for_payout: "Approved for payout",
    paid: "Paid",
    disputed: "Disputed",
  };

  return labels[status];
}

export function payoutStatusClass(status: PayoutStatus) {
  const classes: Record<PayoutStatus, string> = {
    not_started: "status-badge",
    pending: "status-badge status-badge--rating",
    in_progress: "status-badge status-badge--rating",
    completed: "status-badge status-badge--ready",
    failed: "bg-red-100 text-red-900",
    on_hold: "bg-amber-100 text-amber-900",
    // Legacy classes.
    pending_confirmation: "status-badge",
    awaiting_shift_completion: "status-badge status-badge--rating",
    awaiting_business_approval: "status-badge status-badge--rating",
    approved_for_payout: "status-badge status-badge--ready",
    paid: "status-badge status-badge--ready",
    disputed: "bg-red-100 text-red-900",
  };

  return classes[status];
}

export function getBookingPaymentSummary(payment?: PaymentRecord | null) {
  const status = getPaymentStatusValue(payment);
  return status ? formatPaymentStatus(status) : "Unpaid";
}

export function isBookingPaid(payment?: PaymentRecord | null) {
  const status = getPaymentStatusValue(payment);
  return status === "paid" || status === "captured" || status === "released";
}

export function isBookingPayable(booking: BookingRecord, payment?: PaymentRecord | null) {
  if (!(booking.status === "accepted" || booking.status === "completed" || booking.status === "no_show")) {
    return false;
  }

  return !isBookingPaid(payment);
}

export function formatBookingLifecycleLabel(
  booking: BookingRecord,
  payment?: PaymentRecord | null,
) {
  if (booking.status === "accepted" && isBookingPaid(payment)) {
    return "Funded";
  }

  if (booking.status === "declined") {
    return "Rejected";
  }

  const labels: Record<BookingRecord["status"], string> = {
    pending: "Pending",
    accepted: "Accepted",
    declined: "Declined",
    completed: "Completed",
    cancelled: "Cancelled",
    no_show: "No-show",
  };

  return labels[booking.status];
}

export function getWorkerShiftStage(
  booking: BookingRecord,
  payment?: PaymentRecord | null,
) {
  if (payment?.payout_status === "completed" || payment?.payout_status === "paid") {
    return "Paid";
  }

  if (payment?.payout_status === "failed" || payment?.payout_status === "disputed") {
    return "Disputed";
  }

  if (payment?.payout_status === "on_hold") {
    return "On hold";
  }

  if (payment?.payout_status === "in_progress" || payment?.payout_status === "approved_for_payout") {
    return "Payout on the way";
  }

  if (payment?.payout_status === "pending" || payment?.payout_status === "awaiting_business_approval") {
    return "Awaiting business confirmation";
  }

  if (payment?.payout_status === "not_started" || payment?.payout_status === "awaiting_shift_completion") {
    if (booking.worker_checked_in_at && !booking.worker_checked_out_at) {
      return "In progress";
    }

    if (booking.worker_checked_out_at) {
      return "Awaiting business confirmation";
    }

    return "Funded";
  }

  if (booking.status === "pending") {
    return "Booked";
  }

  if (booking.status === "accepted") {
    if (booking.worker_checked_in_at && !booking.worker_checked_out_at) {
      return "In progress";
    }

    if (booking.worker_checked_out_at) {
      return "Awaiting business confirmation";
    }

    return isBookingPaid(payment) ? "Funded" : "Accepted";
  }

  if (booking.status === "completed") {
    return "Awaiting payout";
  }

  if (booking.status === "cancelled") {
    return "Cancelled";
  }

  if (booking.status === "declined") {
    return "Rejected";
  }

  if (booking.status === "no_show") {
    return "Disputed";
  }

  return "Booked";
}

export function getPayoutSupportCopy(payment?: PaymentRecord | PayoutStatus | null) {
  const payoutStatus =
    typeof payment === "string" ? payment : payment?.payout_status ?? null;

  if (!payoutStatus) {
    return "Payout starts once the shift is paid and later confirmed complete.";
  }

  if (payoutStatus === "not_started") {
    return "Payout starts once this shift has been funded and confirmed.";
  }

  if (payoutStatus === "pending") {
    return "Payout is queued and waiting for release checks.";
  }

  if (payoutStatus === "in_progress") {
    return "Payout transfer is in progress through Stripe.";
  }

  if (payoutStatus === "completed") {
    return "This payout has been sent.";
  }

  if (payoutStatus === "failed") {
    return "Payout could not be completed and needs review.";
  }

  if (payoutStatus === "pending_confirmation") {
    return "This shift still needs to be funded by the business before payout can move.";
  }

  if (payoutStatus === "awaiting_shift_completion") {
    return "This shift is funded. Start and finish the shift to keep payout moving.";
  }

  if (payoutStatus === "awaiting_business_approval") {
    return "Your shift is logged. Payout is waiting for business confirmation.";
  }

  if (payoutStatus === "approved_for_payout") {
    return "Confirmed. Your payout is now being sent through Stripe.";
  }

  if (payoutStatus === "paid") {
    return "This payout has been sent.";
  }

  if (payoutStatus === "disputed") {
    return "Payout is paused while an issue is reviewed.";
  }

  return "Payout is temporarily on hold while this booking is reviewed.";
}

export function getUpcomingPayout(
  bookings: BookingRecord[],
  paymentsByBookingId: Record<string, PaymentRecord>,
) {
  for (const booking of bookings) {
    const payment = paymentsByBookingId[booking.id];

    if (
      payment &&
      (payment.payout_status === "in_progress" ||
        payment.payout_status === "pending" ||
        payment.payout_status === "not_started" ||
        payment.payout_status === "approved_for_payout" ||
        payment.payout_status === "awaiting_business_approval" ||
        payment.payout_status === "awaiting_shift_completion")
    ) {
      return { booking, payment };
    }
  }

  return null;
}

export function getLastPaidPayout(
  bookings: BookingRecord[],
  paymentsByBookingId: Record<string, PaymentRecord>,
) {
  const paidPairs = bookings
    .map((booking) => ({
      booking,
      payment: paymentsByBookingId[booking.id],
    }))
    .filter(
      (entry): entry is { booking: BookingRecord; payment: PaymentRecord } =>
        Boolean(entry.payment) &&
        (entry.payment.payout_status === "paid" ||
          entry.payment.payout_status === "completed"),
    )
    .sort((left, right) => {
      const leftTime = left.payment.payout_sent_at ? Date.parse(left.payment.payout_sent_at) : 0;
      const rightTime = right.payment.payout_sent_at ? Date.parse(right.payment.payout_sent_at) : 0;
      return rightTime - leftTime;
    });

  return paidPairs[0] ?? null;
}
