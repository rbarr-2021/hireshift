"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  HOSPITALITY_ROLES,
  HOSPITALITY_SKILLS,
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
  skills: [],
  availableDay: "",
  maxHourlyRate: "",
  location: "",
  minRating: "",
  minTravelRadius: "",
};

const PAGE_SIZE = 9;

export default function BusinessWorkerDiscoveryPage() {
  const [workers, setWorkers] = useState<WorkerProfileRecord[]>([]);
  const [availabilitySlots, setAvailabilitySlots] = useState<WorkerAvailabilitySlotRecord[]>([]);
  const [reviews, setReviews] = useState<ReviewRecord[]>([]);
  const [filters, setFilters] = useState<WorkerDiscoveryFilters>(initialFilters);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [page, setPage] = useState(1);

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

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-700">
            Worker Discovery
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-stone-900">
            Search and shortlist hospitality workers
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
            Filter workers by role, skills, availability, rates, city, minimum
            rating, and travel radius. Booking stays as a placeholder entry point
            in this phase.
          </p>
        </div>
        <div className="rounded-2xl bg-stone-100 px-4 py-3">
          <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Results</p>
          <p className="mt-2 text-2xl font-semibold text-stone-900">
            {discoveryResults.length}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="rounded-3xl bg-stone-100 p-5">
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
              <p className="mb-2 text-sm font-medium text-stone-700">Skills</p>
              <div className="grid gap-2">
                {HOSPITALITY_SKILLS.slice(0, 8).map((skill) => {
                  const checked = filters.skills.includes(skill);
                  return (
                    <label key={skill} className="flex items-center gap-2 text-sm text-stone-700">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          setPage(1);
                          setFilters((current) => ({
                            ...current,
                            skills: event.target.checked
                              ? [...current.skills, skill]
                              : current.skills.filter((item) => item !== skill),
                          }));
                        }}
                      />
                      {skill}
                    </label>
                  );
                })}
              </div>
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
              className="w-full rounded-2xl border border-stone-300 px-4 py-3 text-sm font-medium text-stone-700 transition hover:bg-white"
            >
              Reset filters
            </button>
          </div>
        </aside>

        <section className="space-y-4">
          <div className="rounded-3xl bg-stone-100 p-4 text-sm text-stone-600">
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

          {loading ? (
            <div className="rounded-3xl bg-stone-100 p-8 text-center text-stone-600">
              Loading workers...
            </div>
          ) : errorMessage ? (
            <div className="rounded-3xl bg-stone-100 p-8 text-center">
              <h2 className="text-xl font-semibold text-stone-900">Discovery is temporarily unavailable</h2>
              <p className="mt-3 text-sm text-stone-600">{errorMessage}</p>
            </div>
          ) : filtersAreInvalid ? (
            <div className="rounded-3xl bg-stone-100 p-8 text-center">
              <h2 className="text-xl font-semibold text-stone-900">Fix the highlighted filters</h2>
              <p className="mt-3 text-sm text-stone-600">
                Adjust the invalid filter values above to view matching workers.
              </p>
            </div>
          ) : paginatedResults.length === 0 ? (
            <div className="rounded-3xl bg-stone-100 p-8 text-center">
              <h2 className="text-xl font-semibold text-stone-900">No workers match those filters</h2>
              <p className="mt-3 text-sm text-stone-600">
                Try broadening the search, role, skills, or location filters.
              </p>
            </div>
          ) : (
            <>
              <div className="grid gap-4 xl:grid-cols-2">
                {paginatedResults.map(({ worker, aggregate, workerAvailability }) => (
                  <article key={worker.user_id} className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
                    <div className="flex gap-4">
                      <div className="relative h-20 w-20 overflow-hidden rounded-3xl bg-stone-100">
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

                    <div className="mt-4 flex flex-wrap gap-2">
                      {worker.skills.slice(0, 5).map((skill) => (
                        <span key={skill} className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700">
                          {skill}
                        </span>
                      ))}
                    </div>

                    <div className="mt-4 grid gap-3 text-sm text-stone-700 sm:grid-cols-2">
                      <p>
                        <span className="font-medium">Rates:</span>{" "}
                        {worker.hourly_rate_gbp ? `GBP ${worker.hourly_rate_gbp}/hr` : "No hourly rate"}
                        {worker.daily_rate_gbp ? ` | GBP ${worker.daily_rate_gbp}/day` : ""}
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

                    <div className="mt-5 flex flex-wrap gap-3">
                      <Link
                        href={`/workers/${worker.user_id}`}
                        className="rounded-2xl border border-stone-300 px-4 py-3 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
                      >
                        View profile
                      </Link>
                      <Link
                        href={`/dashboard/business/bookings/new?worker=${worker.user_id}`}
                        className="rounded-2xl bg-stone-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-stone-800"
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
                    className="rounded-2xl border border-stone-300 px-6 py-3 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
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
