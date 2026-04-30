"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthState } from "@/components/auth/auth-provider";
import { AddressAutocomplete } from "@/components/forms/address-autocomplete";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatBookingDate,
  formatBookingTimeRange,
  formatTimeUntilBooking,
} from "@/lib/bookings";
import type {
  BusinessProfileRecord,
  ShiftListingRecord,
  UserRecord,
} from "@/lib/models";
import {
  formatShiftListingStatus,
  getRemainingShiftPositions,
  matchesShiftFilters,
  shiftListingStatusClass,
} from "@/lib/shift-listings";
import {
  CURRENT_UK_MINIMUM_HOURLY_RATE_GBP,
  formatCurrency,
  getUkMinimumRateValidationMessage,
} from "@/lib/pay-rules";
import { supabase } from "@/lib/supabase";

type ShiftCardBusiness = {
  name: string;
  city: string;
  verificationStatus: BusinessProfileRecord["verification_status"] | "pending";
};

const QUICK_DATE_FILTERS = [
  { id: "today", label: "Today", offsetDays: 0 },
  { id: "tomorrow", label: "Tomorrow", offsetDays: 1 },
  { id: "in-two-days", label: "In 2 days", offsetDays: 2 },
] as const;

const ROLE_FILTER_OPTIONS = [
  "Kitchen Porter",
  "Commis Chef",
  "Chef de Partie",
  "Sous Chef",
  "Head Chef",
  "Waiter",
  "Waitress",
  "Barista",
  "Bartender",
  "Cocktail Bartender",
  "Event Staff",
  "Other",
] as const;

const DISTANCE_FILTER_OPTIONS = [5, 10, 15, 25, 50] as const;

const initialFilters = {
  query: "",
  date: "",
  location: "",
  maxRate: "",
};

function formatShiftBrowseError(errorMessage: string) {
  if (
    errorMessage.includes("public.shift_listings") &&
    errorMessage.toLowerCase().includes("schema cache")
  ) {
    return "Shift browsing is not ready in this environment yet. Run the latest Supabase migration, then reload this page.";
  }

  return errorMessage;
}

function getDateOffsetValue(offsetDays: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

export default function WorkerShiftBrowsePage() {
  const router = useRouter();
  const { appUser } = useAuthState();
  const [filters, setFilters] = useState(initialFilters);
  const [otherRoleQuery, setOtherRoleQuery] = useState("");
  const [distanceMiles, setDistanceMiles] = useState("");
  const [searchLocationCoords, setSearchLocationCoords] = useState<{
    latitude: number | null;
    longitude: number | null;
  }>({
    latitude: null,
    longitude: null,
  });
  const [maxRateError, setMaxRateError] = useState("");
  const [listings, setListings] = useState<ShiftListingRecord[]>([]);
  const [businessesById, setBusinessesById] = useState<Record<string, ShiftCardBusiness>>({});
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [countdownNow, setCountdownNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCountdownNow(new Date());
    }, 30000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;

    const loadListings = async () => {
      const { data, error } = await supabase
        .from("shift_listings")
        .select("*")
        .eq("status", "open")
        .order("shift_date", { ascending: true })
        .order("start_time", { ascending: true });

      if (!active) {
        return;
      }

      if (error) {
        setErrorMessage(formatShiftBrowseError(error.message));
        setLoading(false);
        return;
      }

      const nextListings = (data as ShiftListingRecord[] | null) ?? [];
      const businessIds = [...new Set(nextListings.map((listing) => listing.business_id))];

      if (businessIds.length > 0) {
        const [usersResult, profilesResult] = await Promise.all([
          supabase.from("users").select("*").in("id", businessIds),
          supabase.from("business_profiles").select("*").in("user_id", businessIds),
        ]);

        if (!active) {
          return;
        }

        const users = (usersResult.data as UserRecord[] | null) ?? [];
        const profiles = (profilesResult.data as BusinessProfileRecord[] | null) ?? [];

        const nextBusinesses = businessIds.reduce<Record<string, ShiftCardBusiness>>(
          (accumulator, businessId) => {
            const nextUser = users.find((candidate) => candidate.id === businessId);
            const nextProfile = profiles.find((candidate) => candidate.user_id === businessId);

            accumulator[businessId] = {
              name:
                nextProfile?.business_name ||
                nextUser?.display_name ||
                "Hospitality business",
              city: nextProfile?.city || "",
              verificationStatus: nextProfile?.verification_status ?? "pending",
            };

            return accumulator;
          },
          {},
        );

        setBusinessesById(nextBusinesses);
      }

      setListings(nextListings);
      setLoading(false);
    };

    void loadListings();

    return () => {
      active = false;
    };
  }, []);

  const filteredListings = useMemo(
    () =>
      listings.filter((listing) =>
        matchesShiftFilters({
          listing,
          query: filters.query === "Other" ? otherRoleQuery : filters.query,
          date: filters.date,
          location: filters.location,
          maxRate: filters.maxRate,
          searchLatitude: searchLocationCoords.latitude,
          searchLongitude: searchLocationCoords.longitude,
          maxDistanceMiles: distanceMiles ? Number(distanceMiles) : null,
        }),
      ),
    [
      distanceMiles,
      filters.date,
      filters.location,
      filters.maxRate,
      filters.query,
      listings,
      otherRoleQuery,
      searchLocationCoords.latitude,
      searchLocationCoords.longitude,
    ],
  );

  const selectedQuickDateId = useMemo(
    () =>
      QUICK_DATE_FILTERS.find(
        (filter) => filters.date === getDateOffsetValue(filter.offsetDays),
      )?.id ?? null,
    [filters.date],
  );

  useEffect(() => {
    if (loading || errorMessage) {
      return;
    }

    if (!appUser || appUser.onboarding_complete) {
      return;
    }

    if (listings.length === 0) {
      router.replace("/profile/setup/worker");
    }
  }, [appUser, errorMessage, listings.length, loading, router]);

  return (
      <section className="public-section space-y-8">
      <div className="panel p-5 sm:p-7">
        <p className="section-label">Browse available shifts</p>
        <h1 className="mt-4 text-2xl font-semibold text-stone-900 sm:text-3xl">
          Live shifts {" > "} Browse {" > "} Take shift {" > "} Work
        </h1>
      </div>

      <div className="panel-soft p-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <label className="space-y-2 text-sm text-stone-600">
                  <span className="font-medium text-stone-900">Job Search</span>
            <select
              value={filters.query}
              onChange={(event) => {
                const nextValue = event.target.value;
                setFilters((current) => ({ ...current, query: nextValue }));
                if (nextValue !== "Other") {
                  setOtherRoleQuery("");
                }
              }}
              className="input"
            >
              <option value="">All roles</option>
              {ROLE_FILTER_OPTIONS.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            {filters.query === "Other" ? (
              <input
                value={otherRoleQuery}
                onChange={(event) => setOtherRoleQuery(event.target.value)}
                className="input"
                placeholder="Please state"
              />
            ) : null}
          </label>
          <label className="space-y-2 text-sm text-stone-600">
            <span className="font-medium text-stone-900">Date</span>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setFilters((current) => ({ ...current, date: "" }))
                  }
                  className={`rounded-full px-3 py-2 text-sm font-medium transition ${
                    !filters.date
                      ? "bg-stone-900 text-white"
                      : "bg-stone-100 text-stone-700 hover:bg-stone-200"
                  }`}
                >
                  Any day
                </button>
                {QUICK_DATE_FILTERS.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() =>
                      setFilters((current) => ({
                        ...current,
                        date: getDateOffsetValue(filter.offsetDays),
                      }))
                    }
                    className={`rounded-full px-3 py-2 text-sm font-medium transition ${
                      selectedQuickDateId === filter.id
                        ? "bg-stone-900 text-white"
                        : "bg-stone-100 text-stone-700 hover:bg-stone-200"
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="date"
                  value={filters.date}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, date: event.target.value }))
                  }
                  className="input"
                />
                {filters.date ? (
                  <button
                    type="button"
                    onClick={() =>
                      setFilters((current) => ({ ...current, date: "" }))
                    }
                    className="secondary-btn px-4 py-3 text-sm"
                  >
                    Clear date
                  </button>
                ) : null}
              </div>
            </div>
          </label>
          <div className="space-y-2 text-sm text-stone-600">
            <span className="font-medium text-stone-900">Location</span>
            <AddressAutocomplete
              label=""
              placeholder="Belfast"
              helperText="Pick an area, then choose how far you are willing to travel."
              onSelect={(suggestion) => {
                setFilters((current) => ({ ...current, location: suggestion.label }));
                setSearchLocationCoords({
                  latitude: suggestion.latitude,
                  longitude: suggestion.longitude,
                });
              }}
            />
          </div>
          <label className="space-y-2 text-sm text-stone-600">
            <span className="font-medium text-stone-900">Distance</span>
            <select
              value={distanceMiles}
              onChange={(event) => setDistanceMiles(event.target.value)}
              className="input"
            >
              <option value="">Any distance</option>
              {DISTANCE_FILTER_OPTIONS.map((distance) => (
                <option key={distance} value={distance}>
                  {distance} miles
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2 text-sm text-stone-600">
            <span className="font-medium text-stone-900">Max hourly rate</span>
            <input
              type="number"
              min={CURRENT_UK_MINIMUM_HOURLY_RATE_GBP}
              step="0.01"
              value={filters.maxRate}
              onChange={(event) => {
                setFilters((current) => ({ ...current, maxRate: event.target.value }));
                setMaxRateError(
                  getUkMinimumRateValidationMessage(event.currentTarget.value),
                );
              }}
              onBlur={(event) =>
                setMaxRateError(
                  getUkMinimumRateValidationMessage(event.currentTarget.value),
                )
              }
              className="input"
              placeholder=""
            />
            {maxRateError ? <p className="field-error">{maxRateError}</p> : null}
            <p className="text-xs text-stone-500">
              Starts from {formatCurrency(CURRENT_UK_MINIMUM_HOURLY_RATE_GBP)}.
            </p>
          </label>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="panel-soft p-5">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="mt-3 h-4 w-52" />
              <Skeleton className="mt-4 h-20 w-full" />
            </div>
          ))}
        </div>
      ) : errorMessage ? (
        <div className="mobile-empty-state">
          <h2 className="text-xl font-semibold text-stone-900">Shift browsing is unavailable</h2>
          <p className="mt-3 text-sm text-stone-600">{errorMessage}</p>
          <p className="mt-3 text-xs text-stone-500">
            If you just pulled this feature, run <code>npx supabase db push</code> and try again.
          </p>
        </div>
      ) : filteredListings.length === 0 ? (
        <div className="mobile-empty-state">
          <h2 className="text-xl font-semibold text-stone-900">No open shifts match those filters</h2>
          <p className="mt-3 text-sm text-stone-600">
            Try broadening the role, date, rate, or location filters.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filteredListings.map((listing) => {
            const business = businessesById[listing.business_id];
            const countdownLabel = formatTimeUntilBooking(listing, countdownNow);

            return (
              <article key={listing.id} className="panel-soft p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xl font-semibold text-stone-900">
                      {listing.title || listing.role_label}
                    </p>
                    <p className="mt-1 text-sm text-stone-600">
                      {business?.name || "Hospitality business"}
                      {business?.city ? ` | ${business.city}` : ""}
                    </p>
                {business?.verificationStatus === "verified" ? (
                  <div className="mt-2">
                    <span className="verified-badge-inline status-badge status-badge--ready">
                      <span className="verified-tick">&#10003;</span>
                      Trusted business
                    </span>
                  </div>
                ) : null}
                  </div>
                  <div className="flex flex-col items-start gap-2 sm:items-end">
                    <span
                      className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${shiftListingStatusClass(listing.status)}`}
                    >
                      {formatShiftListingStatus(listing.status)}
                    </span>
                    <div className="rounded-2xl bg-[#1DB954] px-4 py-3 text-white shadow-[0_12px_30px_rgba(29,185,84,0.3)]">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#EAFBEF]">
                        Rate
                      </p>
                      <p className="mt-1 text-lg font-semibold">
                        {formatCurrency(listing.hourly_rate_gbp)}
                        <span className="ml-1 text-sm font-medium text-[#EAFBEF]">/hr</span>
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 text-sm text-stone-600 sm:grid-cols-2">
                  <p>
                    <span className="font-medium text-stone-900">Role:</span>{" "}
                    {listing.role_label}
                  </p>
                  <p>
                    <span className="font-medium text-stone-900">Town / city:</span>{" "}
                    {listing.city || business?.city || "Location to be confirmed"}
                  </p>
                  <p>
                    <span className="font-medium text-stone-900">Date:</span>{" "}
                    {formatBookingDate(listing.shift_date)}
                  </p>
                  <p>
                    <span className="font-medium text-stone-900">Time:</span>{" "}
                    {formatBookingTimeRange(
                      listing.start_time,
                      listing.end_time,
                      listing.shift_date,
                      listing.shift_end_date,
                    )}
                  </p>
                  <p>
                    <span className="font-medium text-stone-900">Area:</span>{" "}
                    {listing.location}
                  </p>
                  <p>
                    <span className="font-medium text-stone-900">Spots left:</span>{" "}
                    {getRemainingShiftPositions(listing)}
                  </p>
                </div>

                {countdownLabel ? (
                  <div className="mt-4">
                    <span className="status-badge status-badge--rating">{countdownLabel}</span>
                  </div>
                ) : null}

                <div className="mt-4 rounded-2xl border border-white/10 bg-black/35 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                    Arrival details
                  </p>
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-stone-600">
                    {listing.description || "Meeting point and arrival details will appear here."}
                  </p>
                </div>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <Link
                    href={`/shifts/${listing.id}?intent=take`}
                    className="primary-btn w-full px-4 sm:w-auto"
                  >
                    {appUser?.onboarding_complete ? "Book shift" : "Complete profile to book shift"}
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
        )}
      </section>
  );
}
