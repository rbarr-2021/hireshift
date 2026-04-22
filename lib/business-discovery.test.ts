import { describe, expect, it } from "vitest";
import {
  calculateReviewAggregate,
  matchesWorkerFilters,
} from "./business-discovery";
import {
  buildWorkerMarketplaceTags,
  getWorkerAvailabilityState,
  getWorkerExperienceLabel,
} from "./worker-marketplace";
import type {
  ReviewRecord,
  RoleRecord,
  WorkerAvailabilitySlotRecord,
  WorkerProfileRecord,
  WorkerRoleRecord,
} from "./models";

const baseProfile: WorkerProfileRecord = {
  user_id: "worker-1",
  job_role: "Bartender",
  primary_role_id: null,
  bio: "Cocktail bartender with busy late-night service experience.",
  hourly_rate_gbp: 18,
  years_experience: 6,
  city: "Belfast",
  postcode: "BT1",
  travel_radius_miles: 12,
  availability_summary: "Evenings and weekends",
  profile_photo_url: null,
  profile_photo_path: null,
  stripe_connect_account_id: null,
  stripe_connect_details_submitted: false,
  stripe_connect_payouts_enabled: false,
  stripe_connect_charges_enabled: false,
  stripe_connect_onboarding_completed_at: null,
  stripe_connect_last_synced_at: null,
  work_history: [],
  verification_status: "verified",
  created_at: "",
  updated_at: "",
};

const baseAvailability: WorkerAvailabilitySlotRecord[] = [
  {
    id: "slot-1",
    worker_id: "worker-1",
    day_of_week: 5,
    start_time: "17:00:00",
    end_time: "23:00:00",
    created_at: "",
    updated_at: "",
  },
];

const reviews: ReviewRecord[] = [
  {
    id: "review-1",
    booking_id: "booking-1",
    reviewer_user_id: "business-1",
    reviewee_user_id: "worker-1",
    punctuality_rating: 5,
    skill_rating: 4,
    attitude_rating: 5,
    reliability_rating: 4,
    comment: null,
    created_at: "",
  },
];

describe("business discovery helpers", () => {
  it("matches worker filters against display name, tags, and availability status", () => {
    const aggregate = calculateReviewAggregate(reviews);

    expect(
      matchesWorkerFilters({
        profile: baseProfile,
        filters: {
          query: "Ava",
          role: "",
          skill: "Cocktail Bartender",
          availableDay: 5,
          availabilityStatus: "has_availability",
          maxHourlyRate: "20",
          location: "Belf",
          minRating: "4",
          minTravelRadius: "10",
        },
        aggregate,
        availabilitySlots: baseAvailability,
        displayName: "Ava Clarke",
        roleLabels: ["Cocktail Bartender", "Bartender"],
        availabilityStatus: "has_availability",
      }),
    ).toBe(true);
  });

  it("rejects filters that do not match skill or availability state", () => {
    const aggregate = calculateReviewAggregate(reviews);

    expect(
      matchesWorkerFilters({
        profile: baseProfile,
        filters: {
          query: "",
          role: "",
          skill: "Barista",
          availableDay: "",
          availabilityStatus: "",
          maxHourlyRate: "",
          location: "",
          minRating: "",
          minTravelRadius: "",
        },
        aggregate,
        availabilitySlots: baseAvailability,
        displayName: "Ava Clarke",
        roleLabels: ["Cocktail Bartender", "Bartender"],
        availabilityStatus: "has_availability",
      }),
    ).toBe(false);

    expect(
      matchesWorkerFilters({
        profile: baseProfile,
        filters: {
          query: "",
          role: "",
          skill: "",
          availableDay: "",
          availabilityStatus: "needs_update",
          maxHourlyRate: "",
          location: "",
          minRating: "",
          minTravelRadius: "",
        },
        aggregate,
        availabilitySlots: baseAvailability,
        displayName: "Ava Clarke",
        roleLabels: ["Cocktail Bartender", "Bartender"],
        availabilityStatus: "has_availability",
      }),
    ).toBe(false);
  });

  it("builds worker marketplace tags in primary-first order", () => {
    const workerRoles: WorkerRoleRecord[] = [
      {
        id: "worker-role-1",
        worker_id: "worker-1",
        role_id: "role-2",
        is_primary: false,
        created_at: "",
      },
      {
        id: "worker-role-2",
        worker_id: "worker-1",
        role_id: "role-1",
        is_primary: true,
        created_at: "",
      },
    ];

    const roles: RoleRecord[] = [
      {
        id: "role-1",
        category_id: "bar",
        slug: "cocktail-bartender",
        label: "Cocktail Bartender",
        search_terms: [],
        sort_order: 1,
        is_active: true,
        created_at: "",
        category_slug: "bar",
        category_label: "Bar",
      },
      {
        id: "role-2",
        category_id: "front-of-house",
        slug: "waiter",
        label: "Waiter",
        search_terms: [],
        sort_order: 2,
        is_active: true,
        created_at: "",
        category_slug: "front-of-house",
        category_label: "Front of House",
      },
    ];

    expect(
      buildWorkerMarketplaceTags({
        workerId: "worker-1",
        workerRoles,
        roles,
      }).map((tag) => tag.label),
    ).toEqual(["Cocktail Bartender", "Waiter"]);
  });

  it("summarises experience and availability for marketplace cards", () => {
    expect(getWorkerExperienceLabel(8)).toBe("Senior");
    expect(
      getWorkerAvailabilityState({
        availabilitySlots: [],
        availabilitySummary: null,
      }),
    ).toBe("needs_update");
    expect(
      getWorkerAvailabilityState({
        availabilitySlots: baseAvailability,
        availabilitySummary: null,
      }),
    ).toBe("has_availability");
  });
});
