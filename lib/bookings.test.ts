import { describe, expect, it, vi } from "vitest";
import {
  calculateBookingDurationHours,
  formatBookingTimeRange,
  isPastBooking,
} from "./bookings";

describe("bookings helpers", () => {
  it("formats overnight time ranges clearly", () => {
    expect(formatBookingTimeRange("20:00:00", "03:00:00", "2026-04-18", "2026-04-19")).toBe(
      "20:00 - 03:00 (next day)",
    );
  });

  it("calculates overnight durations using shift dates", () => {
    expect(
      calculateBookingDurationHours("20:00:00", "03:00:00", "2026-04-18", "2026-04-19"),
    ).toBe(7);
  });

  it("returns zero for invalid same-day ranges", () => {
    expect(calculateBookingDurationHours("17:00:00", "09:00:00", "2026-04-18", "2026-04-18")).toBe(0);
  });

  it("detects whether a booking is already in the past", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-18T12:00:00Z"));

    expect(
      isPastBooking({
        id: "1",
        worker_id: "worker",
        business_id: "business",
        shift_date: "2026-04-18",
        shift_end_date: "2026-04-18",
        shift_listing_id: null,
        start_time: "09:00:00",
        end_time: "11:00:00",
        hourly_rate_gbp: 15,
        location: "Venue",
        notes: null,
        status: "accepted",
        total_amount_gbp: 30,
        platform_fee_gbp: 0,
        created_at: "",
        updated_at: "",
      }),
    ).toBe(true);

    expect(
      isPastBooking({
        id: "2",
        worker_id: "worker",
        business_id: "business",
        shift_date: "2026-04-18",
        shift_end_date: "2026-04-18",
        shift_listing_id: null,
        start_time: "13:00:00",
        end_time: "18:00:00",
        hourly_rate_gbp: 15,
        location: "Venue",
        notes: null,
        status: "accepted",
        total_amount_gbp: 75,
        platform_fee_gbp: 0,
        created_at: "",
        updated_at: "",
      }),
    ).toBe(false);

    vi.useRealTimers();
  });
});
