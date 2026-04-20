import type { BookingRecord, PaymentRecord, PaymentStatus } from "@/lib/models";

export function formatPaymentStatus(status: PaymentStatus) {
  const labels: Record<PaymentStatus, string> = {
    pending: "Unpaid",
    authorized: "Authorised",
    captured: "Paid",
    released: "Released",
    refunded: "Refunded",
    failed: "Failed",
  };

  return labels[status];
}

export function paymentStatusClass(status: PaymentStatus) {
  const classes: Record<PaymentStatus, string> = {
    pending: "status-badge",
    authorized: "status-badge status-badge--rating",
    captured: "status-badge status-badge--ready",
    released: "bg-stone-200 text-stone-800",
    refunded: "bg-stone-200 text-stone-800",
    failed: "bg-red-100 text-red-900",
  };

  return classes[status];
}

export function getBookingPaymentSummary(payment?: PaymentRecord | null) {
  return payment ? formatPaymentStatus(payment.status) : "Unpaid";
}

export function isBookingPaid(payment?: PaymentRecord | null) {
  return payment?.status === "captured" || payment?.status === "released";
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
    return "Confirmed";
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

