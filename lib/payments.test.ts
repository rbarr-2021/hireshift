import { describe, expect, it } from "vitest";
import {
  formatBookingLifecycleLabel,
  formatPaymentStatus,
  isBookingPayable,
} from "./payments";
import type { BookingRecord, PaymentRecord } from "./models";

const baseBooking: BookingRecord = {
  id: "booking-1",
  worker_id: "worker-1",
  business_id: "business-1",
  shift_date: "2026-04-20",
  shift_end_date: "2026-04-20",
  shift_listing_id: null,
  requested_role_label: "Chef",
  shift_duration_hours: 8,
  start_time: "10:00:00",
  end_time: "18:00:00",
  hourly_rate_gbp: 20,
  location: "Venue",
  notes: null,
  status: "accepted",
  total_amount_gbp: 184,
  platform_fee_gbp: 24,
  created_at: "",
  updated_at: "",
};

const paidPayment: PaymentRecord = {
  id: "payment-1",
  booking_id: "booking-1",
  business_id: "business-1",
  worker_id: "worker-1",
  stripe_payment_intent_id: "pi_123",
  stripe_transfer_id: null,
  stripe_checkout_session_id: "cs_123",
  stripe_checkout_url: null,
  stripe_checkout_expires_at: null,
  currency: "GBP",
  gross_amount_gbp: 184,
  platform_fee_gbp: 24,
  worker_payout_gbp: 160,
  status: "captured",
  created_at: "",
  updated_at: "",
};

describe("payments helpers", () => {
  it("formats payment status for business-facing UI", () => {
    expect(formatPaymentStatus("captured")).toBe("Paid");
    expect(formatPaymentStatus("pending")).toBe("Unpaid");
  });

  it("treats accepted and unpaid bookings as payable", () => {
    expect(isBookingPayable(baseBooking, null)).toBe(true);
    expect(isBookingPayable(baseBooking, paidPayment)).toBe(false);
  });

  it("shows confirmed once an accepted booking has been paid", () => {
    expect(formatBookingLifecycleLabel(baseBooking, paidPayment)).toBe("Confirmed");
  });
});

