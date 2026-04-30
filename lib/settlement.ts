import {
  calculateBookingDurationHours,
  getBookingEndDateTime,
  getBookingStartDateTime,
} from "@/lib/bookings";
import type { BookingRecord, PaymentRecord } from "@/lib/models";
import { buildBookingPricingSnapshot } from "@/lib/pricing";

export type SettlementStatus =
  | "settled"
  | "refund_due"
  | "top_up_required"
  | "manual_review";

export type AttendanceIssueFlag =
  | "early_check_in"
  | "late_check_in"
  | "late_check_out"
  | "early_check_out"
  | "actual_hours_exceed_estimate"
  | "actual_hours_below_estimate";

function round2(value: number) {
  return Number(value.toFixed(2));
}

export function getEstimatedHours(booking: BookingRecord) {
  return (
    booking.shift_duration_hours ??
    calculateBookingDurationHours(
      booking.start_time,
      booking.end_time,
      booking.shift_date,
      booking.shift_end_date,
    )
  );
}

export function calculateSettlement(input: {
  booking: BookingRecord;
  payment: PaymentRecord | null;
  approvedHours: number;
}) {
  const estimatedHours = getEstimatedHours(input.booking);
  const estimatedWorkerSubtotal = round2(estimatedHours * input.booking.hourly_rate_gbp);
  const finalWorkerSubtotal = round2(input.approvedHours * input.booking.hourly_rate_gbp);
  const estimatedPricing = buildBookingPricingSnapshot(estimatedWorkerSubtotal);
  const finalPricing = buildBookingPricingSnapshot(finalWorkerSubtotal);
  const collectedGrossAmount = input.payment?.gross_amount_gbp ?? estimatedPricing.businessTotalGbp;
  const settlementDifferenceGbp = round2(collectedGrossAmount - finalPricing.businessTotalGbp);
  const refundDueGbp = settlementDifferenceGbp > 0 ? settlementDifferenceGbp : 0;
  const topUpDueGbp = settlementDifferenceGbp < 0 ? Math.abs(settlementDifferenceGbp) : 0;

  let settlementStatus: SettlementStatus = "settled";
  let reason = "Estimated and approved totals match.";

  if (!Number.isFinite(input.approvedHours) || input.approvedHours <= 0) {
    settlementStatus = "manual_review";
    reason = "Approved hours are invalid.";
  } else if (topUpDueGbp > 0) {
    settlementStatus = "top_up_required";
    reason = "Approved hours are higher than estimated. Extra payment is required.";
  } else if (refundDueGbp > 0) {
    settlementStatus = "refund_due";
    reason = "Approved hours are lower than estimated. A refund is due.";
  }

  return {
    estimatedHours,
    approvedHours: round2(input.approvedHours),
    estimatedGrossAmountGbp: estimatedPricing.businessTotalGbp,
    collectedGrossAmountGbp: collectedGrossAmount,
    finalGrossAmountGbp: finalPricing.businessTotalGbp,
    finalPlatformFeeGbp: finalPricing.platformFeeGbp,
    finalWorkerPayoutGbp: finalPricing.workerPayGbp,
    settlementDifferenceGbp,
    refundDueGbp,
    topUpDueGbp,
    settlementStatus,
    reason,
  };
}

export function getAttendanceIssueFlags(booking: BookingRecord) {
  const flags: AttendanceIssueFlag[] = [];
  const scheduledStart = getBookingStartDateTime(booking).getTime();
  const scheduledEnd = getBookingEndDateTime(booking).getTime();
  const checkedIn = booking.worker_checked_in_at
    ? Date.parse(booking.worker_checked_in_at)
    : null;
  const checkedOut = booking.worker_checked_out_at
    ? Date.parse(booking.worker_checked_out_at)
    : null;
  const estimatedHours = getEstimatedHours(booking);

  if (checkedIn !== null) {
    if (checkedIn < scheduledStart) {
      flags.push("early_check_in");
    }
    if (checkedIn > scheduledStart) {
      flags.push("late_check_in");
    }
  }

  if (checkedOut !== null) {
    if (checkedOut > scheduledEnd) {
      flags.push("late_check_out");
    }
    if (checkedOut < scheduledEnd) {
      flags.push("early_check_out");
    }
  }

  if (booking.business_hours_approved && booking.business_hours_approved > estimatedHours) {
    flags.push("actual_hours_exceed_estimate");
  }

  if (booking.business_hours_approved && booking.business_hours_approved < estimatedHours) {
    flags.push("actual_hours_below_estimate");
  }

  return flags;
}
