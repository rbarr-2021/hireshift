"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthState } from "@/components/auth/auth-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast-provider";
import type {
  BusinessProfileRecord,
  ShiftListingRecord,
} from "@/lib/models";
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
] as const;

export default function NewShiftListingPage() {
  const router = useRouter();
  const { authUserId, loading: authLoading } = useAuthState();
  const { showToast } = useToast();
  const [businessProfile, setBusinessProfile] = useState<BusinessProfileRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [roleLabel, setRoleLabel] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [shiftDate, setShiftDate] = useState("");
  const [startTime, setStartTime] = useState("17:00");
  const [endTime, setEndTime] = useState("23:00");
  const [hourlyRate, setHourlyRate] = useState("");
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

    if (!shiftDate) {
      setMessage("Choose a shift date.");
      return;
    }

    if (!startTime || !endTime || endTime <= startTime) {
      setMessage("Enter a valid same-day start and end time.");
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

    setSaving(true);
    setMessage(null);

    const payload: Omit<ShiftListingRecord, "id" | "status" | "claimed_worker_id" | "claimed_booking_id" | "created_at" | "updated_at"> = {
      business_id: authUserId,
      role_label: roleLabel.trim(),
      title: title.trim() || null,
      description: description.trim() || null,
      shift_date: shiftDate,
      start_time: startTime,
      end_time: endTime,
      hourly_rate_gbp: numericRate,
      location: businessLocation,
      city: businessProfile?.city ?? null,
    };

    const { error } = await supabase.from("shift_listings").insert(payload);

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
      description: "Workers can now browse and take this open shift.",
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
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="section-label">Open shift listing</p>
          <h1 className="mt-3 text-2xl font-semibold text-stone-900 sm:text-3xl">
            Post a shift workers can browse and take
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
            Keep this lightweight. Add the role, date, time, rate, and a clear
            note so workers can decide quickly if the shift is right for them.
          </p>
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
            <div className="space-y-2">
              <label className="font-medium text-stone-900">Common roles</label>
              <div className="flex flex-wrap gap-2">
                {commonRoleSuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setRoleLabel(suggestion)}
                    className={`rounded-full px-3 py-2 text-sm font-medium transition ${
                      roleLabel === suggestion
                        ? "bg-stone-900 text-white"
                        : "bg-stone-100 text-stone-700 hover:bg-stone-200"
                    }`}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm text-stone-600 sm:col-span-2">
                <span className="font-medium text-stone-900">Role label</span>
                <input
                  value={roleLabel}
                  onChange={(event) => setRoleLabel(event.target.value)}
                  className="input"
                  placeholder="Sous Chef"
                  required
                />
              </label>
              <label className="space-y-2 text-sm text-stone-600 sm:col-span-2">
                <span className="font-medium text-stone-900">Listing title</span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="input"
                  placeholder="Saturday evening service cover"
                />
              </label>
              <label className="space-y-2 text-sm text-stone-600">
                <span className="font-medium text-stone-900">Date</span>
                <input
                  type="date"
                  value={shiftDate}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(event) => setShiftDate(event.target.value)}
                  className="input"
                  required
                />
              </label>
              <label className="space-y-2 text-sm text-stone-600">
                <span className="font-medium text-stone-900">Hourly rate (GBP)</span>
                <input
                  type="number"
                  min="1"
                  step="0.50"
                  value={hourlyRate}
                  onChange={(event) => setHourlyRate(event.target.value)}
                  className="input"
                  placeholder="18.50"
                  required
                />
              </label>
              <label className="space-y-2 text-sm text-stone-600">
                <span className="font-medium text-stone-900">Start time</span>
                <input
                  type="time"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  className="input"
                  required
                />
              </label>
              <label className="space-y-2 text-sm text-stone-600">
                <span className="font-medium text-stone-900">End time</span>
                <input
                  type="time"
                  value={endTime}
                  onChange={(event) => setEndTime(event.target.value)}
                  className="input"
                  required
                />
              </label>
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

            <div className="mobile-sticky-bar flex flex-col gap-3 sm:hidden">
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
              <p className="font-medium text-stone-900">
                {title || roleLabel || "Shift title"}
              </p>
              <p>{roleLabel || "Role label goes here"}</p>
              <p>{businessProfile?.business_name || "Your business name"}</p>
              <p>{businessProfile?.city || "Your city"}</p>
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
              <p className="info-banner mt-4">
                Open listings let workers see real opportunities quickly. Once a
                worker takes the shift, we create the accepted booking automatically.
              </p>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
