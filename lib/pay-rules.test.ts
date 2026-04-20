import { describe, expect, it } from "vitest";
import {
  CURRENT_UK_MINIMUM_HOURLY_RATE_GBP,
  getUkMinimumRateMessage,
  isBelowUkMinimumHourlyRate,
} from "./pay-rules";

describe("pay rules", () => {
  it("flags hourly rates below the UK minimum", () => {
    expect(isBelowUkMinimumHourlyRate(CURRENT_UK_MINIMUM_HOURLY_RATE_GBP - 0.01)).toBe(true);
    expect(isBelowUkMinimumHourlyRate(CURRENT_UK_MINIMUM_HOURLY_RATE_GBP)).toBe(false);
  });

  it("returns a clear minimum rate message", () => {
    expect(getUkMinimumRateMessage()).toContain("12.71");
    expect(getUkMinimumRateMessage()).toContain("2026-04-01");
  });
});
