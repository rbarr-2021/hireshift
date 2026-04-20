import { describe, expect, it } from "vitest";
import {
  buildBookingPricingSnapshot,
  calculateBusinessTotal,
  calculatePlatformFee,
} from "./pricing";

describe("pricing helpers", () => {
  it("calculates the platform fee from the worker subtotal", () => {
    expect(calculatePlatformFee(100)).toBe(15);
  });

  it("builds a stable booking pricing snapshot", () => {
    expect(buildBookingPricingSnapshot(120)).toEqual({
      workerPayGbp: 120,
      platformFeeGbp: 18,
      businessTotalGbp: 138,
    });
  });

  it("adds worker pay and platform fee into the business total", () => {
    expect(calculateBusinessTotal(120, 18)).toBe(138);
  });
});

