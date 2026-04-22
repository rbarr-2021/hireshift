import { describe, expect, it } from "vitest";
import {
  deriveShiftEndDate,
  hasShiftListingStarted,
  getRemainingShiftPositions,
  matchesShiftFilters,
} from "./shift-listings";

describe("shift listing helpers", () => {
  it("rolls overnight shifts into the next date", () => {
    expect(deriveShiftEndDate("2026-04-18", "20:00", "03:00")).toBe("2026-04-19");
    expect(deriveShiftEndDate("2026-04-18", "09:00", "17:00")).toBe("2026-04-18");
  });

  it("calculates remaining positions safely", () => {
    expect(
      getRemainingShiftPositions({
        id: "listing",
        business_id: "business",
        role_label: "Bartender",
        title: null,
        description: null,
        shift_date: "2026-04-18",
        shift_end_date: "2026-04-19",
        start_time: "20:00:00",
        end_time: "03:00:00",
        hourly_rate_gbp: 15,
        location: "Newcastle",
        city: "Newcastle",
        location_lat: 54.9783,
        location_lng: -1.6178,
        open_positions: 3,
        claimed_positions: 1,
        status: "open",
        claimed_worker_id: null,
        claimed_booking_id: null,
        created_at: "",
        updated_at: "",
      }),
    ).toBe(2);
  });

  it("filters listings by query, date, location, and max rate", () => {
    const listing = {
      id: "listing",
      business_id: "business",
      role_label: "Bartender",
      title: "Late bar cover",
      description: "Cocktail service",
      shift_date: "2026-04-18",
      shift_end_date: "2026-04-19",
      start_time: "20:00:00",
      end_time: "03:00:00",
      hourly_rate_gbp: 17,
      location: "Quayside",
      city: "Newcastle",
      location_lat: 54.9705,
      location_lng: -1.5989,
      open_positions: 2,
      claimed_positions: 0,
      status: "open" as const,
      claimed_worker_id: null,
      claimed_booking_id: null,
      created_at: "",
      updated_at: "",
    };

    expect(
      matchesShiftFilters({
        listing,
        query: "cocktail",
        date: "2026-04-18",
        location: "newcastle",
        maxRate: "18",
        now: new Date("2026-04-18T10:00:00"),
      }),
    ).toBe(true);

    expect(
      matchesShiftFilters({
        listing,
        query: "chef",
        date: "",
        location: "",
        maxRate: "",
        now: new Date("2026-04-18T10:00:00"),
      }),
    ).toBe(false);
  });

  it("treats listings as unavailable once the shift start time has passed", () => {
    const listing = {
      id: "listing",
      business_id: "business",
      role_label: "Bartender",
      title: "Late bar cover",
      description: "Cocktail service",
      shift_date: "2026-04-18",
      shift_end_date: "2026-04-19",
      start_time: "20:00:00",
      end_time: "03:00:00",
      hourly_rate_gbp: 17,
      location: "Quayside",
      city: "Newcastle",
      location_lat: 54.9705,
      location_lng: -1.5989,
      open_positions: 2,
      claimed_positions: 0,
      status: "open" as const,
      claimed_worker_id: null,
      claimed_booking_id: null,
      created_at: "",
      updated_at: "",
    };

    expect(hasShiftListingStarted(listing, new Date("2026-04-18T20:00:00"))).toBe(true);
    expect(hasShiftListingStarted(listing, new Date("2026-04-18T19:59:00"))).toBe(false);
    expect(
      matchesShiftFilters({
        listing,
        query: "",
        date: "",
        location: "",
        maxRate: "",
        now: new Date("2026-04-18T20:00:00"),
      }),
    ).toBe(false);
  });

  it("filters listings by travel distance when coordinates are available", () => {
    const listing = {
      id: "listing",
      business_id: "business",
      role_label: "Chef de Partie",
      title: "Dinner service",
      description: "Busy kitchen pass",
      shift_date: "2026-04-18",
      shift_end_date: "2026-04-18",
      start_time: "17:00:00",
      end_time: "23:00:00",
      hourly_rate_gbp: 18,
      location: "Belfast City Centre",
      city: "Belfast",
      location_lat: 54.5973,
      location_lng: -5.9301,
      open_positions: 2,
      claimed_positions: 0,
      status: "open" as const,
      claimed_worker_id: null,
      claimed_booking_id: null,
      created_at: "",
      updated_at: "",
    };

    expect(
      matchesShiftFilters({
        listing,
        query: "",
        date: "",
        location: "Belfast",
        maxRate: "",
        searchLatitude: 54.5970,
        searchLongitude: -5.9305,
        maxDistanceMiles: 5,
        now: new Date("2026-04-18T10:00:00"),
      }),
    ).toBe(true);

    expect(
      matchesShiftFilters({
        listing,
        query: "",
        date: "",
        location: "Belfast",
        maxRate: "",
        searchLatitude: 54.5970,
        searchLongitude: -5.9305,
        maxDistanceMiles: 0.1,
        now: new Date("2026-04-18T10:00:00"),
      }),
    ).toBe(false);
  });
});
