"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Skeleton } from "@/components/ui/skeleton";
import {
  HOSPITALITY_ROLES,
  WEEK_DAYS,
  type ReviewRecord,
  type WorkerAvailabilitySlotRecord,
  type WorkerDiscoveryFilters,
  type WorkerProfileRecord,
} from "@/lib/models";
import {
  calculateReviewAggregate,
  matchesWorkerFilters,
} from "@/lib/business-discovery";

const initialFilters: WorkerDiscoveryFilters = {
  query: "",
  role: "",
  availableDay: "",
  maxHourlyRate: "",
  location: "",
  minRating: "",
  minTravelRadius: "",
};

const PAGE_SIZE = 9;
const DISCOVERY_STORAGE_KEY = "kruvo-business-discovery-filters";
const RECENT_SEARCHES_STORAGE_KEY = "kruvo-business-recent-searches";

export default function BusinessWorkerDiscoveryPage() {
  const [workers, setWorkers] = useState<WorkerProfileRecord[]>([]);
  const [availabilitySlots, setAvailabilitySlots] = useState<WorkerAvailabilitySlotRecord[]>([]);
  const [reviews, setReviews] = useState<ReviewRecord[]>([]);
  const [filters, setFilters] = useState<WorkerDiscoveryFilters>(() => {
    if (typeof window === "undefined") {
      return initialFilters;
    }

    const savedFilters = window.localStorage.getItem(DISCOVERY_STORAGE_KEY);

    if (!savedFilters) {
      return initialFilters;
    }

    try {
      return { ...initialFilters, ...JSON.parse(savedFilters) };
    } catch {
      return initialFilters;
    }
  });
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }

    const savedRecentSearches = window.localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY);

    if (!savedRecentSearches) {
      return [];
    }

    try {
      return JSON.parse(savedRecentSearches);
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(DISCOVERY_STORAGE_KEY, JSON.stringify(filters));
  }, [filters]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      RECENT_SEARCHES_STORAGE_KEY,
      JSON.stringify(recentSearches),
    );
  }, [recentSearches]);

  useEffect(() => {
    let active = true;

    const loadDiscoveryData = async () => {
      const [workersResult, availabilityResult, reviewsResult] = await Promise.all([
        supabase.from("worker_profiles").select("*").order("updated_at", { ascending: false }),
        supabase.from("worker_availability_slots").select("*"),
        supabase.from("reviews").select("*"),
      ]);

      if (!active) {
        return;
      }

      const firstError =
        workersResult.error ?? availabilityResult.error ?? reviewsResult.error;

      if (firstError) {
        setErrorMessage(firstError.message);
        setLoading(false);
        return;
      }

      setWorkers((workersResult.data as WorkerProfileRecord[] | null) ?? []);
      setAvailabilitySlots(
        (availabilityResult.data as WorkerAvailabilitySlotRecord[] | null) ?? [],
      );
      setReviews((reviewsResult.data as ReviewRecord[] | null) ?? []);
      setLoading(false);
    };

    void loadDiscoveryData();

    return () => {
      active = false;
    };
  }, []);

  const discoveryResults = useMemo(() => {
    return workers
      .map((worker) => {
        const workerAvailability = availabilitySlots.filter(
          (slot) => slot.worker_id === worker.user_id,
        );
        const workerReviews = reviews.filter(
          (review) => review.reviewee_user_id === worker.user_id,
        );
        const aggregate = calculateReviewAggregate(workerReviews);

        return {
          worker,
          workerAvailability,
          aggregate,
        };
      })
      .filter(({ worker, workerAvailability, aggregate }) =>
        matchesWorkerFilters({
          profile: worker,
          filters,
          aggregate,
          availabilitySlots: workerAvailability,
        }),
      );
  }, [availabilitySlots, filters, reviews, workers]);

  const paginatedResults = discoveryResults.slice(0, page * PAGE_SIZE);

  const selectedWeekdayLabel =
    filters.availableDay === ""
      ? "Any day"
      : WEEK_DAYS.find((day) => day.key === filters.availableDay)?.label ?? "Any day";

  const hasInvalidRate =
    Boolean(filters.maxHourlyRate) && Number(filters.maxHourlyRate) < 0;
  const hasInvalidRating =
    Boolean(filters.minRating) &&
    (Number(filters.minRating) < 1 || Number(filters.minRating) > 5);
  const hasInvalidTravelRadius =
    Boolean(filters.minTravelRadius) && Number(filters.minTravelRadius) < 0;
  const filtersAreInvalid = hasInvalidRate || hasInvalidRating || hasInvalidTravelRadius;

  useEffect(() => {
    const query = filters.query.trim();

    if (!query) {
      return;
    }

    const timer = window.setTimeout(() => {
      setRecentSearches((current) => {
        const next = [query, ...current.filter((item) => item !== query)].slice(0, 5);
        return next;
      });
    }, 400);

    return () => window.clearTimeout(timer);
  }, [filters.query]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="section-label">
            Worker Discovery
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-stone-900 sm:text-3xl">
            Search and shortlist hospitality workers
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
            Filter workers by role, availability, rates, city, minimum
            rating, and travel radius. Booking stays as a placeholder entry point
            in this phase.
          </p>
        </div>
        <div className="panel-soft px-4 py-3">
          <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Results</p>
          <p className="mt-2 text-2xl font-semibold text-stone-900">
            {discoveryResults.length}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(280px,320px)_minmax(0,1fr)]">
        <aside className="hidden panel-soft p-5 lg:block">
          <h2 className="text-lg font-semibold text-stone-900">Filters</h2>
          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-stone-700">
                Search workers
              </label>
              <input
                value={filters.query}
                onChange={(event) => {
                  setPage(1);
                  setFilters((current) => ({ ...current, query: event.target.value }));
                }}
                className="input"
                placeholder="Chef, cocktail, Manchester..."
              />
              {recentSearches.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {recentSearches.map((search) => (
                    <button
                      key={search}
                      type="button"
                      onClick={() => {
                        setPage(1);
                        setFilters((current) => ({ ...current, query: search }));
                      }}
                      className="status-badge status-badge--rating"
                    >
                      {search}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-stone-700">Role</label>
              <select
                value={filters.role}
                onChange={(event) => {
                  setPage(1);
                  setFilters((current) => ({
                    ...current,
                    role: event.target.value as WorkerDiscoveryFilters["role"],
                  }));
                }}
                className="input"
              >
                <option value="">Any role</option>
                {HOSPITALITY_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-stone-700">
                Availability day
              </label>
              <select
                value={filters.availableDay}
                onChange={(event) => {
                  setPage(1);
                  setFilters((current) => ({
                    ...current,
                    availableDay:
                      event.target.value === "" ? "" : Number(event.target.value),
                  }));
                }}
                className="input"
              >
                <option value="">Any day</option>
                {WEEK_DAYS.map((day) => (
                  <option key={day.key} value={day.key}>
                    {day.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-stone-700">
                Max hourly rate (GBP)
              </label>
              <input
                type="number"
                min={0}
                value={filters.maxHourlyRate}
                onChange={(event) => {
                  setPage(1);
                  setFilters((current) => ({
                    ...current,
                    maxHourlyRate: event.target.value,
                  }));
                }}
                className="input"
                placeholder="25"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-stone-700">
                Location
              </label>
              <input
                value={filters.location}
                onChange={(event) => {
                  setPage(1);
                  setFilters((current) => ({ ...current, location: event.target.value }));
                }}
                className="input"
                placeholder="Manchester"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-stone-700">
                Minimum rating
              </label>
              <input
                type="number"
                min={1}
                max={5}
                step="0.5"
                value={filters.minRating}
                onChange={(event) => {
                  setPage(1);
                  setFilters((current) => ({ ...current, minRating: event.target.value }));
                }}
                className="input"
                placeholder="4"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-stone-700">
                Minimum travel radius (miles)
              </label>
              <input
                type="number"
                min={0}
                value={filters.minTravelRadius}
                onChange={(event) => {
                  setPage(1);
                  setFilters((current) => ({
                    ...current,
                    minTravelRadius: event.target.value,
                  }));
                }}
                className="input"
                placeholder="10"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                setFilters(initialFilters);
                setPage(1);
              }}
              className="secondary-btn w-full"
            >
              Reset filters
            </button>
          </div>
        </aside>

        <section className="space-y-4">
          <div className="sticky top-[4.75rem] z-20 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="info-banner w-full flex-1">
            {hasInvalidRate
              ? "Max hourly rate must be zero or more."
              : hasInvalidRating
                ? "Minimum rating must be between 1 and 5."
                : hasInvalidTravelRadius
                  ? "Minimum travel radius must be zero or more."
                  : errorMessage
                    ? `We could not load worker discovery right now: ${errorMessage}`
              : `Showing workers available on ${selectedWeekdayLabel}. Location uses city matching, and distance uses each worker's stated travel radius.`}
            </div>
            <button
              type="button"
              onClick={() => setShowFilters((current) => !current)}
              className="secondary-btn w-full lg:hidden"
            >
              {showFilters ? "Hide filters" : "Show filters"}
            </button>
          </div>

          {showFilters ? (
            <div className="fixed inset-0 z-40 bg-black/60 px-3 py-4 backdrop-blur-sm lg:hidden">
              <div className="mx-auto flex h-full max-w-md flex-col rounded-[1.75rem] border border-white/10 bg-[#07111f] p-4 shadow-2xl">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="section-label">Filters</p>
                    <h2 className="mt-2 text-xl font-semibold text-stone-900">Refine workers</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowFilters(false)}
                    className="secondary-btn min-w-[88px] px-3"
                  >
                    Done
                  </button>
                </div>
                <div className="mt-5 flex-1 space-y-4 overflow-y-auto pr-1">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-stone-700">
                      Search workers
                    </label>
                    <input
                      value={filters.query}
                      onChange={(event) => {
                        setPage(1);
                        setFilters((current) => ({ ...current, query: event.target.value }));
                      }}
                      className="input"
                      placeholder="Chef, cocktail, Manchester..."
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-stone-700">Role</label>
                    <select
                      value={filters.role}
                      onChange={(event) => {
                        setPage(1);
                        setFilters((current) => ({
                          ...current,
                          role: event.target.value as WorkerDiscoveryFilters["role"],
                        }));
                      }}
                      className="input"
                    >
                      <option value="">Any role</option>
                      {HOSPITALITY_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-stone-700">
                      Availability day
                    </label>
                    <select
                      value={filters.availableDay}
                      onChange={(event) => {
                        setPage(1);
                        setFilters((current) => ({
                          ...current,
                          availableDay:
                            event.target.value === "" ? "" : Number(event.target.value),
                        }));
                      }}
                      className="input"
                    >
                      <option value="">Any day</option>
                      {WEEK_DAYS.map((day) => (
                        <option key={day.key} value={day.key}>
                          {day.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-stone-700">
                      Max hourly rate (GBP)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={filters.maxHourlyRate}
                      onChange={(event) => {
                        setPage(1);
                        setFilters((current) => ({
                          ...current,
                          maxHourlyRate: event.target.value,
                        }));
                      }}
                      className="input"
                      placeholder="25"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-stone-700">
                      Location
                    </label>
                    <input
                      value={filters.location}
                      onChange={(event) => {
                        setPage(1);
                        setFilters((current) => ({ ...current, location: event.target.value }));
                      }}
                      className="input"
                      placeholder="Manchester"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-stone-700">
                      Minimum rating
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      step="0.5"
                      value={filters.minRating}
                      onChange={(event) => {
                        setPage(1);
                        setFilters((current) => ({ ...current, minRating: event.target.value }));
                      }}
                      className="input"
                      placeholder="4"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-stone-700">
                      Minimum travel radius (miles)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={filters.minTravelRadius}
                      onChange={(event) => {
                        setPage(1);
                        setFilters((current) => ({
                          ...current,
                          minTravelRadius: event.target.value,
                        }));
                      }}
                      className="input"
                      placeholder="10"
                    />
                  </div>
                </div>
                <div className="mt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setFilters(initialFilters);
                      setPage(1);
                    }}
                    className="secondary-btn flex-1"
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowFilters(false)}
                    className="primary-btn flex-1"
                  >
                    Show results
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {loading ? (
            <div className="grid gap-4 xl:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="panel-soft p-5">
                  <div className="flex flex-col gap-4 sm:flex-row">
                    <Skeleton className="h-20 w-20 rounded-3xl" />
                    <div className="flex-1">
                      <Skeleton className="h-6 w-40" />
                      <Skeleton className="mt-3 h-4 w-48" />
                      <Skeleton className="mt-3 h-4 w-44" />
                    </div>
                  </div>
                  <Skeleton className="mt-5 h-16 w-full" />
                  <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                    <Skeleton className="h-11 w-full sm:w-32" />
                    <Skeleton className="h-11 w-full sm:w-28" />
                  </div>
                </div>
              ))}
            </div>
          ) : errorMessage ? (
            <div className="mobile-empty-state">
              <h2 className="text-xl font-semibold text-stone-900">Discovery is temporarily unavailable</h2>
              <p className="mt-3 text-sm text-stone-600">{errorMessage}</p>
            </div>
          ) : filtersAreInvalid ? (
            <div className="mobile-empty-state">
              <h2 className="text-xl font-semibold text-stone-900">Fix the highlighted filters</h2>
              <p className="mt-3 text-sm text-stone-600">
                Adjust the invalid filter values above to view matching workers.
              </p>
            </div>
          ) : paginatedResults.length === 0 ? (
            <div className="mobile-empty-state">
              <h2 className="text-xl font-semibold text-stone-900">No workers match those filters</h2>
              <p className="mt-3 text-sm text-stone-600">
                Try broadening the search, role, rate, or location filters.
              </p>
            </div>
          ) : (
            <>
              <div className="grid gap-4 xl:grid-cols-2">
                {paginatedResults.map(({ worker, aggregate, workerAvailability }) => (
                  <article key={worker.user_id} className="panel-soft p-5">
                    <div className="flex flex-col gap-4 sm:flex-row">
                      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-3xl bg-stone-100">
                        {worker.profile_photo_url ? (
                          <Image
                            src={worker.profile_photo_url}
                            alt={worker.job_role}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-stone-500">
                            No photo
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xl font-semibold text-stone-900">{worker.job_role}</p>
                        <p className="mt-1 text-sm text-stone-600">
                          {worker.city} | {worker.travel_radius_miles} mile radius
                        </p>
                        <p className="mt-2 text-sm text-stone-600">
                          {aggregate.averageRating !== null
                            ? `${aggregate.averageRating}/5 rating from ${aggregate.reviewCount} review${aggregate.reviewCount === 1 ? "" : "s"}`
                            : "No ratings yet"}
                        </p>
                      </div>
                    </div>

                    <p className="mt-4 line-clamp-3 text-sm leading-6 text-stone-600">
                      {worker.bio || "No profile summary available yet."}
                    </p>

                    <div className="mt-4 grid gap-3 text-sm text-stone-700 sm:grid-cols-2">
                      <p>
                        <span className="font-medium">Rates:</span>{" "}
                        {worker.hourly_rate_gbp ? `GBP ${worker.hourly_rate_gbp}/hr` : "No hourly rate"}
                      </p>
                      <p>
                        <span className="font-medium">Experience:</span>{" "}
                        {worker.years_experience} years
                      </p>
                      <p>
                        <span className="font-medium">Availability:</span>{" "}
                        {workerAvailability.length} weekly slot{workerAvailability.length === 1 ? "" : "s"}
                      </p>
                    </div>

                    <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                      <Link
                        href={`/workers/${worker.user_id}`}
                        className="secondary-btn w-full px-4 sm:w-auto"
                      >
                        View profile
                      </Link>
                      <Link
                        href={`/dashboard/business/bookings/new?worker=${worker.user_id}`}
                        className="primary-btn w-full px-4 sm:w-auto"
                      >
                        Book now
                      </Link>
                    </div>
                  </article>
                ))}
              </div>

              {discoveryResults.length > paginatedResults.length ? (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => setPage((current) => current + 1)}
                    className="secondary-btn px-6"
                  >
                    Load more workers
                  </button>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
