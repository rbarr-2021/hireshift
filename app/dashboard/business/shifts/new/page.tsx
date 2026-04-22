"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthState } from "@/components/auth/auth-provider";
import { ShiftTimeRangePicker } from "@/components/forms/shift-time-range-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast-provider";
import {
  CURRENT_UK_MINIMUM_HOURLY_RATE_GBP,
  getUkMinimumRateValidationMessage,
  getUkMinimumRateMessage,
  isBelowUkMinimumHourlyRate,
} from "@/lib/pay-rules";
import type {
  BusinessProfileRecord,
  ShiftListingRecord,
} from "@/lib/models";
import { deriveShiftEndDate } from "@/lib/shift-listings";
import { supabase } from "@/lib/supabase";

type SupabaseLikeError = {
  message?: string;
  details?: string | null;
  hint?: string | null;
  code?: string;
};

function formatSupabaseError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const candidate = error as SupabaseLikeError;
    const parts = [
      candidate.message,
      candidate.details ?? undefined,
      candidate.hint ?? undefined,
      candidate.code ? `code: ${candidate.code}` : undefined,
    ].filter(Boolean);

    if (parts.length > 0) {
      return parts.join(" | ");
    }
  }

  return "Unable to post this shift right now.";
}

function formatShiftListingError(error: unknown) {
  const nextMessage = formatSupabaseError(error);

  if (
    nextMessage.includes("public.shift_listings") &&
    nextMessage.toLowerCase().includes("schema cache")
  ) {
    return "Open shift listings are not ready in this environment yet. Run the latest Supabase migration, then try posting again.";
  }

  return nextMessage;
}

function buildBusinessLocation(profile: BusinessProfileRecord | null) {
  if (!profile?.address_line_1 || !profile.city) {
    return "";
  }

  return [profile.address_line_1, profile.city, profile.postcode]
    .filter(Boolean)
    .join(", ");
}

async function geocodeShiftLocation(query: string) {
  if (!query.trim()) {
    return { latitude: null, longitude: null };
  }

  const response = await fetch(`/api/address-search?q=${encodeURIComponent(query)}`);
  const payload = (await response.json()) as {
    suggestions?: Array<{ latitude: number | null; longitude: number | null }>;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error || "Unable to look up the shift location.");
  }

  const bestMatch = payload.suggestions?.[0];

  return {
    latitude: bestMatch?.latitude ?? null,
    longitude: bestMatch?.longitude ?? null,
  };
}

const commonRoleSuggestions = [
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

export default function NewShiftListingPage() {
  const router = useRouter();
  const { authUserId, loading: authLoading } = useAuthState();
  const { showToast } = useToast();
  const [businessProfile, setBusinessProfile] = useState<BusinessProfileRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [roleLabel, setRoleLabel] = useState("");
  const [otherRoleLabel, setOtherRoleLabel] = useState("");
  const [description, setDescription] = useState("");
  const [shiftDateInput, setShiftDateInput] = useState("");
  const [shiftDates, setShiftDates] = useState<string[]>([]);
  const [startTime, setStartTime] = useState("17:00");
  const [endTime, setEndTime] = useState("23:00");
  const [hourlyRate, setHourlyRate] = useState("");
  const [hourlyRateError, setHourlyRateError] = useState("");
  const [openPositions, setOpenPositions] = useState("1");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !authUserId) {
      return;
    }

    let active = true;

    const loadProfile = async () => {
      const { data, error } = await supabase
        .from("business_profiles")
        .select("*")
        .eq("user_id", authUserId)
        .maybeSingle<BusinessProfileRecord>();

      if (!active) {
        return;
      }

      if (error) {
        setMessage(formatShiftListingError(error));
      }

      setBusinessProfile(data ?? null);
      setLoading(false);
    };

    void loadProfile();

    return () => {
      active = false;
    };
  }, [authLoading, authUserId]);

  const businessLocation = useMemo(
    () => buildBusinessLocation(businessProfile),
    [businessProfile],
  );

  const totalSlots = useMemo(
    () => shiftDates.length * Math.max(1, Number(openPositions) || 1),
    [openPositions, shiftDates.length],
  );

  const isOvernightShift = useMemo(
    () => Boolean(startTime && endTime && endTime <= startTime),
    [endTime, startTime],
  );

  const handleHourlyRateInput = (value: string, input: HTMLInputElement) => {
    setHourlyRate(value);
    const nextError = getUkMinimumRateValidationMessage(value);
    setHourlyRateError(nextError);
    input.setCustomValidity("");
  };

  const handleAddShiftDate = () => {
    if (!shiftDateInput) {
      setMessage("Choose a shift date first.");
      return;
    }

    setShiftDates((current) =>
      [...new Set([...current, shiftDateInput])].sort((left, right) =>
        left.localeCompare(right),
      ),
    );
    setShiftDateInput("");
    setMessage(null);
  };

  const handleRemoveShiftDate = (targetDate: string) => {
    setShiftDates((current) => current.filter((item) => item !== targetDate));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (saving) {
      return;
    }

    if (!authUserId) {
      setMessage("Your session has expired. Please log in again.");
      return;
    }

    if (!roleLabel.trim()) {
      setMessage("Choose a role for this shift.");
      return;
    }

    if (roleLabel === "Other" && !otherRoleLabel.trim()) {
      setMessage("Please state the role for this shift.");
      return;
    }

    if (shiftDates.length === 0) {
      setMessage("Add at least one shift date.");
      return;
    }

    if (!startTime || !endTime || startTime === endTime) {
      setMessage("Enter a valid start and end time.");
      return;
    }

    if (!businessLocation) {
      setMessage("Complete your business address before posting an open shift.");
      return;
    }

    const numericRate = Number(hourlyRate);

    if (Number.isNaN(numericRate) || numericRate <= 0) {
      setMessage("Enter a valid hourly rate.");
      return;
    }

    if (isBelowUkMinimumHourlyRate(numericRate)) {
      setHourlyRateError(getUkMinimumRateMessage());
      setMessage(getUkMinimumRateMessage());
      return;
    }

    setHourlyRateError("");

    const numericOpenPositions = Number(openPositions);

    if (Number.isNaN(numericOpenPositions) || numericOpenPositions < 1) {
      setMessage("Enter how many workers you need for each shift.");
      return;
    }

    setSaving(true);
    setMessage(null);

    let locationCoordinates = {
      latitude: null as number | null,
      longitude: null as number | null,
    };

    try {
      locationCoordinates = await geocodeShiftLocation(businessLocation);
    } catch (error) {
      setSaving(false);
      const nextMessage =
        error instanceof Error ? error.message : "Unable to look up the shift location.";
      setMessage(nextMessage);
      showToast({
        title: "Location lookup failed",
        description: nextMessage,
        tone: "error",
      });
      return;
    }

    const payloads: Array<
      Omit<
        ShiftListingRecord,
        | "id"
        | "status"
        | "claimed_worker_id"
        | "claimed_booking_id"
        | "created_at"
        | "updated_at"
        | "claimed_positions"
      >
    > = shiftDates.map((shiftDate) => ({
      business_id: authUserId,
      role_label: (roleLabel === "Other" ? otherRoleLabel : roleLabel).trim(),
      title: null,
      description: description.trim() || null,
      shift_date: shiftDate,
      shift_end_date: deriveShiftEndDate(shiftDate, startTime, endTime),
      start_time: startTime,
      end_time: endTime,
      hourly_rate_gbp: numericRate,
      location: businessLocation,
      city: businessProfile?.city ?? null,
      location_lat: locationCoordinates.latitude,
      location_lng: locationCoordinates.longitude,
      open_positions: numericOpenPositions,
    }));

    const { error } = await supabase.from("shift_listings").insert(payloads);

    setSaving(false);

    if (error) {
      const nextMessage = formatShiftListingError(error);
      setMessage(nextMessage);
      showToast({
        title: "Shift listing failed",
        description: nextMessage,
        tone: "error",
      });
      return;
    }

    showToast({
      title: "Shift listing posted",
      description:
        totalSlots === 1
          ? "Workers can now browse and take this open shift."
          : `${totalSlots} shift slots are now live for workers to browse.`,
      tone: "success",
    });
    router.replace("/dashboard/business");
  };

  if (authLoading || loading) {
    return (
      <div className="space-y-6">
        <div className="panel-soft p-5 sm:p-6">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-4 h-10 w-60" />
          <Skeleton className="mt-3 h-4 w-72" />
        </div>
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="panel-soft p-5 sm:p-6">
            <Skeleton className="h-6 w-40" />
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          </div>
          <div className="panel-soft p-5 sm:p-6">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="mt-4 h-36 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-44 sm:pb-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="section-label">Open shift listing</p>
          <h1 className="mt-3 text-2xl font-semibold text-stone-900 sm:text-3xl">
            Post a shift workers can browse and take
          </h1>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/dashboard/business" className="secondary-btn w-full px-6 sm:w-auto">
            Back to dashboard
          </Link>
          <Link href="/dashboard/business/discover" className="secondary-btn w-full px-6 sm:w-auto">
            Discover workers
          </Link>
        </div>
      </div>

      {message ? (
        <div className="info-banner border border-red-400/30 bg-red-500/10 text-red-100">
          {message}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="panel-soft p-5 sm:p-6">
          <h2 className="text-xl font-semibold text-stone-900">Shift details</h2>
          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm text-stone-600 sm:col-span-2">
                <span className="font-medium text-stone-900">Role</span>
                <select
                  value={roleLabel}
                  onChange={(event) => {
                    setRoleLabel(event.target.value);
                    if (event.target.value !== "Other") {
                      setOtherRoleLabel("");
                    }
                  }}
                  className="input"
                  required
                >
                  <option value="">Select a role</option>
                  {commonRoleSuggestions.map((suggestion) => (
                    <option key={suggestion} value={suggestion}>
                      {suggestion}
                    </option>
                  ))}
                </select>
              </label>
              {roleLabel === "Other" ? (
                <label className="space-y-2 text-sm text-stone-600 sm:col-span-2">
                  <span className="font-medium text-stone-900">Please state</span>
                  <input
                    value={otherRoleLabel}
                    onChange={(event) => setOtherRoleLabel(event.target.value)}
                    className="input"
                    placeholder="Senior pizza chef"
                    required
                  />
                </label>
              ) : null}
              <label className="space-y-2 text-sm text-stone-600">
                <span className="font-medium text-stone-900">Add shift date</span>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={shiftDateInput}
                    min={new Date().toISOString().slice(0, 10)}
                    onChange={(event) => setShiftDateInput(event.target.value)}
                    className="input"
                  />
                  <button type="button" onClick={handleAddShiftDate} className="secondary-btn px-4">
                    Add
                  </button>
                </div>
                <div>
                  {shiftDates.length > 0 ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {shiftDates.map((shiftDate) => (
                        <span
                          key={shiftDate}
                          className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-2 text-xs font-medium text-emerald-900"
                        >
                          <span aria-hidden="true">&#10003;</span>
                          {shiftDate}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-stone-500">Added dates will show here.</p>
                  )}
                </div>
              </label>
              <label className="space-y-2 text-sm text-stone-600">
                <span className="font-medium text-stone-900">Hourly rate (GBP)</span>
                <input
                  type="number"
                  min={CURRENT_UK_MINIMUM_HOURLY_RATE_GBP}
                  step="0.01"
                  value={hourlyRate}
                  onChange={(event) =>
                    handleHourlyRateInput(event.target.value, event.currentTarget)
                  }
                  onBlur={(event) =>
                    setHourlyRateError(
                      getUkMinimumRateValidationMessage(event.currentTarget.value),
                    )
                  }
                  className="input"
                  placeholder="18.50"
                  required
                />
                {hourlyRateError ? <p className="field-error">{hourlyRateError}</p> : null}
                <p className="text-xs text-stone-500">
                  Keep this at or above the current UK minimum of GBP 12.71/hr.
                </p>
              </label>
              <div className="sm:col-span-2">
                <ShiftTimeRangePicker
                  startTime={startTime}
                  endTime={endTime}
                  onStartTimeChange={setStartTime}
                  onEndTimeChange={setEndTime}
                  disabled={saving}
                />
              </div>
              <label className="space-y-2 text-sm text-stone-600 sm:col-span-2">
                <span className="font-medium text-stone-900">Workers needed per shift</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={openPositions}
                  onChange={(event) => setOpenPositions(event.target.value)}
                  className="input"
                  placeholder="1"
                  required
                />
              </label>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/40 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-stone-100">Shift dates</p>
                  <p className="mt-1 text-xs text-stone-500">
                    Add one or more dates. If the end time is earlier than the start time, we will treat it as next day.
                  </p>
                </div>
                {isOvernightShift ? (
                  <span className="status-badge status-badge--rating">Overnight shift</span>
                ) : null}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {shiftDates.length > 0 ? (
                  shiftDates.map((shiftDate) => (
                    <button
                      key={shiftDate}
                      type="button"
                      onClick={() => handleRemoveShiftDate(shiftDate)}
                      className="rounded-full bg-stone-100 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-200"
                    >
                      {shiftDate} x
                    </button>
                  ))
                ) : (
                  <p className="text-sm text-stone-500">No shift dates added yet.</p>
                )}
              </div>
            </div>

            <label className="block space-y-2 text-sm text-stone-600">
              <span className="font-medium text-stone-900">Shift description</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={5}
                className="input min-h-36 resize-y"
                placeholder="Share the service style, team setup, dress code, and anything useful for a worker deciding whether to take this shift."
              />
            </label>

            <div className="hidden items-center justify-between gap-4 sm:flex">
              <div className="text-sm text-stone-500">
                Workers will only see this listing while it is still open.
              </div>
              <button
                type="submit"
                disabled={saving}
                className="primary-btn px-6 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Posting shift..." : "Post open shift"}
              </button>
            </div>

            <div
              className="mobile-sticky-bar flex flex-col gap-3 sm:hidden"
              style={{ bottom: "max(5.75rem, calc(env(safe-area-inset-bottom) + 5.75rem))" }}
            >
              <div className="text-sm text-stone-500">
                Workers will only see this listing while it is still open.
              </div>
              <button
                type="submit"
                disabled={saving}
                className="primary-btn w-full px-6 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {saving ? "Posting shift..." : "Post open shift"}
              </button>
            </div>
          </form>
        </section>

        <aside className="space-y-4">
          <section className="panel-soft p-5 sm:p-6">
            <h2 className="text-xl font-semibold text-stone-900">What workers will see</h2>
            <div className="mt-4 space-y-3 text-sm text-stone-600">
              <p>{roleLabel || "Role label goes here"}</p>
              <p>{businessProfile?.business_name || "Your business name"}</p>
              <p>{businessProfile?.city || "Your city"}</p>
              <p>
                {shiftDates.length > 0
                  ? `${shiftDates.length} shift date${shiftDates.length === 1 ? "" : "s"} | ${openPositions || 1} worker${openPositions === "1" ? "" : "s"} each`
                  : "Add at least one date"}
              </p>
            </div>
          </section>

          <section className="panel-soft p-5 sm:p-6">
            <h2 className="text-xl font-semibold text-stone-900">Posting notes</h2>
            <div className="mt-4 space-y-3 text-sm text-stone-600">
              <p>
                Location:{" "}
                <span className="font-medium text-stone-900">
                  {businessLocation || "Complete your business address first"}
                </span>
              </p>
              <p>
                Shift pattern:{" "}
                <span className="font-medium text-stone-900">
                  {startTime && endTime
                    ? isOvernightShift
                      ? `${startTime} - ${endTime} next day`
                      : `${startTime} - ${endTime}`
                    : "Set your shift hours"}
                </span>
              </p>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
