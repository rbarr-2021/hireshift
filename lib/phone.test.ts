import { describe, expect, it } from "vitest";
import {
  isValidInternationalPhoneNumber,
  normaliseInternationalPhoneNumber,
} from "./phone";

describe("phone helpers", () => {
  it("normalises international numbers", () => {
    expect(normaliseInternationalPhoneNumber("0044 7700 900123")).toBe("+447700900123");
    expect(normaliseInternationalPhoneNumber("+44 (7700) 900-123")).toBe("+447700900123");
  });

  it("rejects local-style or malformed numbers", () => {
    expect(normaliseInternationalPhoneNumber("07700900123")).toBeNull();
    expect(normaliseInternationalPhoneNumber("+0447700900123")).toBeNull();
    expect(isValidInternationalPhoneNumber("not-a-number")).toBe(false);
  });
});
