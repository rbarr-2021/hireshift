"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuthState } from "@/components/auth/auth-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBookingDate, formatBookingTimeRange } from "@/lib/bookings";
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
import { supabase } from "@/lib/supabase";

type ShiftCardBusiness = {
  name: string;
  city: string;
};

const QUICK_DATE_FILTERS = [
  { id: "today", label: "Today", offsetDays: 0 },
  { id: "tomorrow", label: "Tomorrow", offsetDays: 1 },
  { id: "in-two-days", label: "In 2 days", offsetDays: 2 },
] as const;

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
  const { appUser } = useAuthState();
  const [filters, setFilters] = useState(initialFilters);
  const [listings, setListings] = useState<ShiftListingRecord[]>([]);
  const [businessesById, setBusinessesById] = useState<Record<string, ShiftCardBusiness>>({});
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
          query: filters.query,
          date: filters.date,
          location: filters.location,
          maxRate: filters.maxRate,
        }),
      ),
    [filters.date, filters.location, filters.maxRate, filters.query, listings],
  );

  const selectedQuickDateId = useMemo(
    () =>
      QUICK_DATE_FILTERS.find(
        (filter) => filters.date === getDateOffsetValue(filter.offsetDays),
      )?.id ?? null,
    [filters.date],
  );

  return (
    <section className="public-section space-y-8">
      <div className="panel p-5 sm:p-7">
        <p className="section-label">Browse available shifts</p>
        <h1 className="mt-4 text-2xl font-semibold text-stone-900 sm:text-3xl">
          See real hospitality shifts before you commit to more setup
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
          Browse open business shift listings now. You only need to complete
          your worker details when you take your first shift.
        </p>
        {!appUser?.onboarding_complete ? (
          <div className="info-banner mt-6">
            Just a few details before your first shift. You can browse freely now
            and complete your profile only when you click take shift.
          </div>
        ) : null}
      </div>

      <div className="panel-soft p-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-2 text-sm text-stone-600">
            <span className="font-medium text-stone-900">Role or venue</span>
            <input
              value={filters.query}
              onChange={(event) =>
                setFilters((current) => ({ ...current, query: event.target.value }))
              }
              className="input"
              placeholder="Chef, bar, Belfast..."
            />
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
          <label className="space-y-2 text-sm text-stone-600">
            <span className="font-medium text-stone-900">Location</span>
            <input
              value={filters.location}
              onChange={(event) =>
                setFilters((current) => ({ ...current, location: event.target.value }))
              }
              className="input"
              placeholder="Newcastle"
            />
          </label>
          <label className="space-y-2 text-sm text-stone-600">
            <span className="font-medium text-stone-900">Max hourly rate</span>
            <input
              type="number"
              min={0}
              value={filters.maxRate}
              onChange={(event) =>
                setFilters((current) => ({ ...current, maxRate: event.target.value }))
              }
              className="input"
              placeholder="25"
            />
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
                  </div>
                  <span
                    className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${shiftListingStatusClass(listing.status)}`}
                  >
                    {formatShiftListingStatus(listing.status)}
                  </span>
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
                    <span className="font-medium text-stone-900">Rate:</span>{" "}
                    GBP {listing.hourly_rate_gbp}/hr
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

                <p className="mt-4 line-clamp-3 text-sm leading-6 text-stone-600">
                  {listing.description || "No extra shift notes yet."}
                </p>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <Link
                    href={`/shifts/${listing.id}`}
                    className="secondary-btn w-full px-4 sm:w-auto"
                  >
                    View shift
                  </Link>
                  <Link
                    href={`/shifts/${listing.id}?intent=take`}
                    className="primary-btn w-full px-4 sm:w-auto"
                  >
                    {appUser?.onboarding_complete ? "Take shift" : "Complete profile to take shift"}
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
