import type {
  BusinessProfileRecord,
  ReviewAggregate,
  ReviewRecord,
  WorkerAvailabilitySlotRecord,
  WorkerDiscoveryFilters,
  WorkerProfileRecord,
} from "@/lib/models";

export function calculateBusinessProfileCompletion(
  profile: BusinessProfileRecord | null,
) {
  if (!profile) {
    return 0;
  }

  const checks = [
    Boolean(profile.business_name),
    Boolean(profile.sector),
    Boolean(profile.contact_name),
    Boolean(profile.phone),
    Boolean(profile.address_line_1),
    Boolean(profile.city),
    Boolean(profile.postcode),
    Boolean(profile.description),
  ];

  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export function calculateReviewAggregate(reviews: ReviewRecord[]): ReviewAggregate {
  if (reviews.length === 0) {
    return { averageRating: null, reviewCount: 0 };
  }

  const total = reviews.reduce((sum, review) => {
    const average =
      (review.punctuality_rating +
        review.skill_rating +
        review.attitude_rating +
        review.reliability_rating) /
      4;

    return sum + average;
  }, 0);

  return {
    averageRating: Number((total / reviews.length).toFixed(1)),
    reviewCount: reviews.length,
  };
}

export function matchesWorkerFilters(input: {
  profile: WorkerProfileRecord;
  filters: WorkerDiscoveryFilters;
  aggregate: ReviewAggregate;
  availabilitySlots: WorkerAvailabilitySlotRecord[];
}) {
  const { profile, filters, aggregate, availabilitySlots } = input;

  if (filters.query) {
    const query = filters.query.toLowerCase().trim();
    const searchableContent = [
      profile.job_role,
      profile.bio ?? "",
      profile.city,
      profile.postcode ?? "",
      profile.availability_summary ?? "",
      ...profile.skills,
    ]
      .join(" ")
      .toLowerCase();

    if (!searchableContent.includes(query)) {
      return false;
    }
  }

  if (filters.role && profile.job_role !== filters.role) {
    return false;
  }

  if (
    filters.skills.length > 0 &&
    !filters.skills.every((skill) => profile.skills.includes(skill))
  ) {
    return false;
  }

  if (
    filters.availableDay !== "" &&
    !availabilitySlots.some((slot) => slot.day_of_week === filters.availableDay)
  ) {
    return false;
  }

  if (
    filters.maxHourlyRate &&
    profile.hourly_rate_gbp !== null &&
    profile.hourly_rate_gbp > Number(filters.maxHourlyRate)
  ) {
    return false;
  }

  if (
    filters.location &&
    !profile.city.toLowerCase().includes(filters.location.toLowerCase())
  ) {
    return false;
  }

  if (
    filters.minRating &&
    (aggregate.averageRating === null ||
      aggregate.averageRating < Number(filters.minRating))
  ) {
    return false;
  }

  if (
    filters.minTravelRadius &&
    profile.travel_radius_miles < Number(filters.minTravelRadius)
  ) {
    return false;
  }

  return true;
}
