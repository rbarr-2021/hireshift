"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import {
  calculateReviewAggregate,
  matchesWorkerFilters,
} from "@/lib/business-discovery";
import {
  WEEK_DAYS,
  type MarketplaceUserRecord,
  type ReviewRecord,
  type RoleRecord,
  type WorkerAvailabilitySlotRecord,
  type WorkerDiscoveryFilters,
  type WorkerProfileRecord,
  type WorkerRoleRecord,
} from "@/lib/models";
import { supabase } from "@/lib/supabase";
import {
  buildWorkerMarketplaceTags,
  getWorkerAvailabilityState,
  getWorkerExperienceLabel,
} from "@/lib/worker-marketplace";

const initialFilters: WorkerDiscoveryFilters = {
  query: "",
  role: "",
  skill: "",
  availableDay: "",
  availabilityStatus: "",
  maxHourlyRate: "",
  location: "",
  minRating: "",
  minTravelRadius: "",
};

const PAGE_SIZE = 9;
const DISCOVERY_STORAGE_KEY = "kruvo-business-discovery-filters";
const RECENT_SEARCHES_STORAGE_KEY = "kruvo-business-recent-searches";

type DiscoveryWorkerCard = {
  profile: WorkerProfileRecord;
  displayName: string;
  aggregate: ReturnType<typeof calculateReviewAggregate>;
  workerAvailability: WorkerAvailabilitySlotRecord[];
  availabilityStatus: "has_availability" | "needs_update";
  roleTags: ReturnType<typeof buildWorkerMarketplaceTags>;
  experienceLabel: string;
};

function parseInitialFilters(): WorkerDiscoveryFilters {
  if (typeof window === "undefined") {
    return initialFilters;
  }

  let savedFilters: Partial<WorkerDiscoveryFilters> = {};
  const savedValue = window.localStorage.getItem(DISCOVERY_STORAGE_KEY);

  if (savedValue) {
    try {
      savedFilters = JSON.parse(savedValue) as Partial<WorkerDiscoveryFilters>;
    } catch {
      savedFilters = {};
    }
  }

  const params = new URLSearchParams(window.location.search);
  const availableDay = params.get("day");
  const parsedAvailableDay =
    availableDay === null || availableDay === "" ? "" : Number(availableDay);

  return {
    ...initialFilters,
    ...savedFilters,
    query: params.get("query") ?? savedFilters.query ?? "",
    role: params.get("role") ?? savedFilters.role ?? "",
    skill: params.get("skill") ?? savedFilters.skill ?? "",
    availableDay:
      parsedAvailableDay === "" || Number.isNaN(parsedAvailableDay)
        ? savedFilters.availableDay ?? ""
        : parsedAvailableDay,
    availabilityStatus:
      (params.get("availability") as WorkerDiscoveryFilters["availabilityStatus"]) ??
      savedFilters.availabilityStatus ??
      "",
    maxHourlyRate: params.get("maxRate") ?? savedFilters.maxHourlyRate ?? "",
    location: params.get("location") ?? savedFilters.location ?? "",
    minRating: params.get("rating") ?? savedFilters.minRating ?? "",
    minTravelRadius: params.get("radius") ?? savedFilters.minTravelRadius ?? "",
  };
}

function syncFiltersToUrl(pathname: string, filters: WorkerDiscoveryFilters) {
  if (typeof window === "undefined") {
    return;
  }

  const params = new URLSearchParams();

  if (filters.query) params.set("query", filters.query);
  if (filters.role) params.set("role", filters.role);
  if (filters.skill) params.set("skill", filters.skill);
  if (filters.availableDay !== "") params.set("day", String(filters.availableDay));
  if (filters.availabilityStatus) params.set("availability", filters.availabilityStatus);
  if (filters.maxHourlyRate) params.set("maxRate", filters.maxHourlyRate);
  if (filters.location) params.set("location", filters.location);
  if (filters.minRating) params.set("rating", filters.minRating);
  if (filters.minTravelRadius) params.set("radius", filters.minTravelRadius);

  const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
  window.history.replaceState({}, "", nextUrl);
}

function formatCurrency(value: number | null) {
  if (!value) {
    return "Rate not listed";
  }

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);
}

function getFirstName(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return "Worker";
  }

  return trimmedValue.split(/\s+/)[0] ?? "Worker";
}

export default function BusinessWorkerDiscoveryPage() {
  const pathname = usePathname();
  const [workers, setWorkers] = useState<WorkerProfileRecord[]>([]);
  const [workerUsers, setWorkerUsers] = useState<MarketplaceUserRecord[]>([]);
  const [workerRoles, setWorkerRoles] = useState<WorkerRoleRecord[]>([]);
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [availabilitySlots, setAvailabilitySlots] = useState<WorkerAvailabilitySlotRecord[]>([]);
  const [reviews, setReviews] = useState<ReviewRecord[]>([]);
  const [filters, setFilters] = useState<WorkerDiscoveryFilters>(parseInitialFilters);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
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
      return JSON.parse(savedRecentSearches) as string[];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(DISCOVERY_STORAGE_KEY, JSON.stringify(filters));
    syncFiltersToUrl(pathname, filters);
  }, [filters, pathname]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(recentSearches));
  }, [recentSearches]);

  useEffect(() => {
    let active = true;

    const loadDiscoveryData = async () => {
      const [
        workersResult,
        workerUsersResult,
        workerRolesResult,
        rolesResult,
        availabilityResult,
        reviewsResult,
      ] = await Promise.all([
        supabase.from("worker_profiles").select("*").order("updated_at", { ascending: false }),
        supabase.from("marketplace_users").select("*").eq("role", "worker"),
        supabase.from("worker_roles").select("*"),
        supabase.from("roles").select("*").order("sort_order", { ascending: true }),
        supabase.from("worker_availability_slots").select("*"),
        supabase.from("reviews").select("*"),
      ]);

      if (!active) {
        return;
      }

      const firstError =
        workersResult.error ??
        workerUsersResult.error ??
        workerRolesResult.error ??
        rolesResult.error ??
        availabilityResult.error ??
        reviewsResult.error;

      if (firstError) {
        setErrorMessage(firstError.message);
        setLoading(false);
        return;
      }

      setWorkers((workersResult.data as WorkerProfileRecord[] | null) ?? []);
      setWorkerUsers((workerUsersResult.data as MarketplaceUserRecord[] | null) ?? []);
      setWorkerRoles((workerRolesResult.data as WorkerRoleRecord[] | null) ?? []);
      setRoles((rolesResult.data as RoleRecord[] | null) ?? []);
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

  useEffect(() => {
    const query = filters.query.trim();

    if (!query) {
      return;
    }

    const timer = window.setTimeout(() => {
      setRecentSearches((current) => [query, ...current.filter((item) => item !== query)].slice(0, 5));
    }, 400);

    return () => window.clearTimeout(timer);
  }, [filters.query]);

  const discoveryResults = useMemo<DiscoveryWorkerCard[]>(() => {
    return workers
      .map((worker) => {
        const displayName =
          workerUsers.find((candidate) => candidate.id === worker.user_id)?.display_name?.trim() ||
          worker.job_role ||
          "Hospitality professional";
        const workerAvailability = availabilitySlots.filter(
          (slot) => slot.worker_id === worker.user_id,
        );
        const workerReviews = reviews.filter(
          (review) => review.reviewee_user_id === worker.user_id,
        );
        const aggregate = calculateReviewAggregate(workerReviews);
        const roleTags = buildWorkerMarketplaceTags({
          workerId: worker.user_id,
          workerRoles,
          roles,
        });
        const availabilityStatus = getWorkerAvailabilityState({
          availabilitySlots: workerAvailability,
          availabilitySummary: worker.availability_summary,
        });

        return {
          profile: worker,
          displayName,
          aggregate,
          workerAvailability,
          availabilityStatus,
          roleTags,
          experienceLabel: getWorkerExperienceLabel(worker.years_experience),
        };
      })
      .filter((entry) =>
        matchesWorkerFilters({
          profile: entry.profile,
          filters,
          aggregate: entry.aggregate,
          availabilitySlots: entry.workerAvailability,
          displayName: entry.displayName,
          roleLabels: entry.roleTags.map((tag) => tag.label),
          availabilityStatus: entry.availabilityStatus,
        }),
      )
      .sort((left, right) => {
        if (left.aggregate.averageRating !== null && right.aggregate.averageRating !== null) {
          return right.aggregate.averageRating - left.aggregate.averageRating;
        }

        if (left.aggregate.averageRating !== null) {
          return -1;
        }

        if (right.aggregate.averageRating !== null) {
          return 1;
        }

        return right.profile.years_experience - left.profile.years_experience;
      });
  }, [availabilitySlots, filters, reviews, roles, workerRoles, workerUsers, workers]);

  const paginatedResults = discoveryResults.slice(0, page * PAGE_SIZE);

  const roleOptions = useMemo(
    () => [...new Set(workers.map((worker) => worker.job_role).filter(Boolean))].sort((left, right) => left.localeCompare(right)),
    [workers],
  );

  const skillOptions = useMemo(
    () =>
      [...new Set(
        workers.flatMap((worker) =>
          buildWorkerMarketplaceTags({
            workerId: worker.user_id,
            workerRoles,
            roles,
          }).map((tag) => tag.label),
        ),
      )].sort((left, right) => left.localeCompare(right)),
    [roles, workerRoles, workers],
  );

  const selectedWeekdayLabel =
    filters.availableDay === ""
      ? "Any day"
      : WEEK_DAYS.find((day) => day.key === filters.availableDay)?.label ?? "Any day";

  const hasInvalidRate = Boolean(filters.maxHourlyRate) && Number(filters.maxHourlyRate) < 0;
  const hasInvalidRating =
    Boolean(filters.minRating) &&
    (Number(filters.minRating) < 1 || Number(filters.minRating) > 5);
  const hasInvalidTravelRadius =
    Boolean(filters.minTravelRadius) && Number(filters.minTravelRadius) < 0;
  const filtersAreInvalid = hasInvalidRate || hasInvalidRating || hasInvalidTravelRadius;

  const activeFilterSummary = [
    filters.role ? `Role: ${filters.role}` : null,
    filters.skill ? `Tag: ${filters.skill}` : null,
    filters.location ? `Location: ${filters.location}` : null,
    filters.availableDay !== "" ? `Day: ${selectedWeekdayLabel}` : null,
    filters.availabilityStatus === "has_availability"
      ? "Availability added"
      : filters.availabilityStatus === "needs_update"
      ? "Needs availability"
      : null,
  ].filter((value): value is string => Boolean(value));

  const updateFilters = (nextFilters: Partial<WorkerDiscoveryFilters>) => {
    setPage(1);
    setFilters((current) => ({ ...current, ...nextFilters }));
  };

  const resetFilters = () => {
    setFilters(initialFilters);
    setPage(1);
  };

  const advancedFilterCount = [
    filters.skill,
    filters.availableDay !== "" ? String(filters.availableDay) : "",
    filters.availabilityStatus,
    filters.maxHourlyRate,
    filters.minRating,
    filters.minTravelRadius,
  ].filter(Boolean).length;

  const renderPrimaryFilterFields = () => (
    <>
      <div>
        <label className="mb-2 block text-sm font-medium text-stone-700">Search workers</label>
        <input
          value={filters.query}
          onChange={(event) => updateFilters({ query: event.target.value })}
          className="input"
          placeholder="Name, role, city, keyword..."
        />
        {recentSearches.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {recentSearches.map((search) => (
              <button
                key={search}
                type="button"
                onClick={() => updateFilters({ query: search })}
                className="status-badge status-badge--rating"
              >
                {search}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-stone-700">Primary role</label>
        <select
          value={filters.role}
          onChange={(event) =>
            updateFilters({ role: event.target.value as WorkerDiscoveryFilters["role"] })
          }
          className="input"
        >
          <option value="">Any role</option>
          {roleOptions.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-stone-700">Location</label>
        <input
          value={filters.location}
          onChange={(event) => updateFilters({ location: event.target.value })}
          className="input"
          placeholder="Belfast"
        />
      </div>
    </>
  );

  const renderAdvancedFilterFields = () => (
    <>
      <div>
        <label className="mb-2 block text-sm font-medium text-stone-700">Role tag</label>
        <select
          value={filters.skill}
          onChange={(event) => updateFilters({ skill: event.target.value })}
          className="input"
        >
          <option value="">Any tag</option>
          {skillOptions.map((skill) => (
            <option key={skill} value={skill}>
              {skill}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-stone-700">Availability day</label>
        <select
          value={filters.availableDay}
          onChange={(event) =>
            updateFilters({
              availableDay: event.target.value === "" ? "" : Number(event.target.value),
            })
          }
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
          Availability status
        </label>
        <select
          value={filters.availabilityStatus}
          onChange={(event) =>
            updateFilters({
              availabilityStatus: event.target.value as WorkerDiscoveryFilters["availabilityStatus"],
            })
          }
          className="input"
        >
          <option value="">Any status</option>
          <option value="has_availability">Has weekly availability</option>
          <option value="needs_update">Needs availability update</option>
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
          onChange={(event) => updateFilters({ maxHourlyRate: event.target.value })}
          className="input"
          placeholder="22"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-stone-700">Minimum rating</label>
        <input
          type="number"
          min={1}
          max={5}
          step="0.5"
          value={filters.minRating}
          onChange={(event) => updateFilters({ minRating: event.target.value })}
          className="input"
          placeholder="4.5"
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
          onChange={(event) => updateFilters({ minTravelRadius: event.target.value })}
          className="input"
          placeholder="10"
        />
      </div>
    </>
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="section-label">Worker marketplace</p>
          <h1 className="mt-3 text-2xl font-semibold text-stone-900 sm:text-3xl">
            Discover workers
          </h1>
        </div>
        <div className="panel-soft px-4 py-3">
          <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Live results</p>
          <p className="mt-2 text-2xl font-semibold text-stone-900">{discoveryResults.length}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(290px,320px)_minmax(0,1fr)]">
        <aside className="hidden panel-soft p-5 lg:block">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-stone-900">Filters</h2>
            </div>
            <button type="button" onClick={resetFilters} className="secondary-btn px-4 py-2">
              Reset
            </button>
          </div>
          <div className="mt-5 space-y-4">{renderPrimaryFilterFields()}</div>
          <div className="mt-4 border-t border-white/10 pt-4">
            <button
              type="button"
              onClick={() => setShowAdvancedFilters((current) => !current)}
              className="secondary-btn w-full justify-between px-4 py-3"
            >
              {showAdvancedFilters ? "Hide more filters" : "More filters"}
              <span className="text-xs text-stone-500">
                {advancedFilterCount > 0 ? `${advancedFilterCount} active` : "Optional"}
              </span>
            </button>
            {showAdvancedFilters ? (
              <div className="mt-4 space-y-4">{renderAdvancedFilterFields()}</div>
            ) : null}
          </div>
        </aside>

        <section className="space-y-4">
          <div className="sticky top-[4.75rem] z-20 flex flex-col gap-3">
            <div className="flex flex-col gap-3 rounded-[2rem] border border-white/10 bg-black/70 px-4 py-4 shadow-[0_18px_50px_rgba(2,8,23,0.35)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="mt-2 text-sm text-stone-200">
                  {hasInvalidRate
                    ? "Max hourly rate must be zero or more."
                    : hasInvalidRating
                    ? "Minimum rating must be between 1 and 5."
                    : hasInvalidTravelRadius
                    ? "Minimum travel radius must be zero or more."
                    : errorMessage
                    ? `We could not load worker discovery right now: ${errorMessage}`
                    : activeFilterSummary.length > 0
                    ? activeFilterSummary.join(" • ")
                    : "Start broad, then narrow by role, rate, and availability."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setShowFilters((current) => !current)}
                  className="secondary-btn px-4 py-2 lg:hidden"
                >
                  {showFilters ? "Hide filters" : "Show filters"}
                </button>
                <button type="button" onClick={resetFilters} className="secondary-btn px-4 py-2">
                  Clear all
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {["Chef", "Bartender", "Barista", "Event Staff"].map((spotlightRole) => (
                <button
                  key={spotlightRole}
                  type="button"
                  onClick={() => updateFilters({ role: spotlightRole })}
                  className={`rounded-full px-3 py-2 text-sm font-medium transition ${
                    filters.role === spotlightRole
                      ? "bg-stone-900 text-white"
                      : "bg-stone-100 text-stone-700 hover:bg-stone-200"
                  }`}
                >
                  {spotlightRole}
                </button>
              ))}
            </div>
          </div>

          {showFilters ? (
            <div className="fixed inset-0 z-40 bg-black/60 px-3 py-4 backdrop-blur-sm lg:hidden">
              <div className="mx-auto flex h-full max-w-md flex-col rounded-[1.75rem] border border-white/10 bg-[#07111f] p-4 shadow-2xl">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="section-label">Filters</p>
                    <h2 className="mt-2 text-xl font-semibold text-white">Workers</h2>
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
                  {renderPrimaryFilterFields()}
                  <div className="border-t border-white/10 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowAdvancedFilters((current) => !current)}
                      className="secondary-btn w-full justify-between px-4 py-3"
                    >
                      {showAdvancedFilters ? "Hide more filters" : "More filters"}
                      <span className="text-xs text-stone-500">
                        {advancedFilterCount > 0 ? `${advancedFilterCount} active` : "Optional"}
                      </span>
                    </button>
                    {showAdvancedFilters ? (
                      <div className="mt-4 space-y-4">{renderAdvancedFilterFields()}</div>
                    ) : null}
                  </div>
                </div>
                <div className="mt-4 flex gap-3">
                  <button type="button" onClick={resetFilters} className="secondary-btn flex-1">
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
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="panel-soft p-5">
                  <div className="flex flex-col gap-4 sm:flex-row">
                    <Skeleton className="h-24 w-24 rounded-[2rem]" />
                    <div className="flex-1">
                      <Skeleton className="h-6 w-44" />
                      <Skeleton className="mt-3 h-4 w-36" />
                      <Skeleton className="mt-4 h-4 w-56" />
                      <Skeleton className="mt-4 h-12 w-full" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : errorMessage ? (
            <div className="mobile-empty-state">
              <h2 className="text-xl font-semibold text-stone-900">Worker marketplace unavailable</h2>
              <p className="mt-3 text-sm text-stone-600">{errorMessage}</p>
            </div>
          ) : filtersAreInvalid ? (
            <div className="mobile-empty-state">
              <h2 className="text-xl font-semibold text-stone-900">Check your filters</h2>
            </div>
          ) : paginatedResults.length === 0 ? (
            <div className="mobile-empty-state">
              <h2 className="text-xl font-semibold text-stone-900">No workers found</h2>
              <button type="button" onClick={resetFilters} className="primary-btn mt-5 px-6">
                Reset filters
              </button>
            </div>
          ) : (
            <>
              <div className="grid gap-4 xl:grid-cols-2">
                {paginatedResults.map((entry) => (
                  <article key={entry.profile.user_id} className="panel-soft h-full p-5">
                    <div className="flex h-full flex-col">
                      <div className="flex items-start gap-4">
                        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-stone-100">
                          {entry.profile.profile_photo_url ? (
                            <Image
                              src={entry.profile.profile_photo_url}
                              alt={entry.displayName}
                              fill
                              className="object-cover"
                              unoptimized
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-lg font-semibold text-stone-500">
                              {entry.displayName.slice(0, 1)}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-2xl font-semibold leading-none text-stone-900">
                                {getFirstName(entry.displayName)}
                              </p>
                              <p className="mt-1 text-sm font-medium text-stone-700">
                                {entry.profile.job_role}
                              </p>
                              <p className="mt-2 line-clamp-1 text-sm text-stone-600">
                                {entry.profile.city || "Location to be confirmed"}
                                {entry.profile.travel_radius_miles
                                  ? ` • Covers ${entry.profile.travel_radius_miles} miles`
                                  : ""}
                              </p>
                            </div>
                            <div className="text-left sm:text-right">
                              <p className="text-xl font-semibold text-stone-900">
                                {formatCurrency(entry.profile.hourly_rate_gbp)}
                                {entry.profile.hourly_rate_gbp ? <span className="text-sm text-stone-500"> /hr</span> : null}
                              </p>
                            </div>
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            {entry.profile.verification_status === "verified" ? (
                              <span className="verified-badge-inline rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-900">
                                <span className="verified-tick">&#10003;</span>
                                Verified
                              </span>
                            ) : null}
                            {entry.aggregate.averageRating !== null ? (
                              <span className="rounded-full bg-[#00A7FF]/12 px-3 py-1 text-xs font-medium text-[#0B2035]">
                                {entry.aggregate.averageRating}/5 rating
                              </span>
                            ) : (
                              <span className="rounded-full border border-white/10 bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700">
                                New profile
                              </span>
                            )}
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-medium ${
                                entry.availabilityStatus === "has_availability"
                                  ? "bg-[#A6FF34]/12 text-[#4A6900]"
                                  : "bg-stone-100 text-stone-700"
                              }`}
                            >
                              {entry.availabilityStatus === "has_availability"
                                ? "Availability added"
                                : "Availability to update"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-auto flex flex-col gap-3 pt-6">
                        <Link
                          href={`/workers/${entry.profile.user_id}`}
                          className="primary-btn w-full px-4"
                        >
                          View profile
                        </Link>
                      </div>
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
