"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthState } from "@/components/auth/auth-provider";
import { ShiftTimeRangePicker } from "@/components/forms/shift-time-range-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast-provider";
import {
  calculateBookingDurationHours,
  formatBookingDate,
  formatBookingTimeRange,
} from "@/lib/bookings";
import { buildBookingPricingSnapshot } from "@/lib/pricing";
import type {
  BookingRecord,
  BusinessProfileRecord,
  MarketplaceUserRecord,
  WorkerProfileRecord,
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

  return "Unable to create this booking right now.";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 2,
  }).format(value);
}

function buildBusinessLocation(profile: BusinessProfileRecord | null) {
  if (!profile?.address_line_1 || !profile.city) {
    return "";
  }

  return [profile.address_line_1, profile.city, profile.postcode]
    .filter(Boolean)
    .join(", ");
}

export default function BookingEntryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { authUserId, loading: authLoading } = useAuthState();
  const { showToast } = useToast();
  const workerId = searchParams.get("worker");
  const [workerProfile, setWorkerProfile] = useState<WorkerProfileRecord | null>(null);
  const [workerUser, setWorkerUser] = useState<MarketplaceUserRecord | null>(null);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfileRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [rate, setRate] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!authUserId || !workerId) {
      return;
    }

    let active = true;

    const loadBookingContext = async () => {
      const [workerProfileResult, workerUserResult, businessProfileResult] =
        await Promise.all([
          supabase
            .from("worker_profiles")
            .select("*")
            .eq("user_id", workerId)
            .maybeSingle<WorkerProfileRecord>(),
          supabase
            .from("marketplace_users")
            .select("*")
            .eq("id", workerId)
            .maybeSingle<MarketplaceUserRecord>(),
          supabase
            .from("business_profiles")
            .select("*")
            .eq("user_id", authUserId)
            .maybeSingle<BusinessProfileRecord>(),
        ]);

      if (!active) {
        return;
      }

      if (workerProfileResult.error) {
        console.error("[booking-create] worker_profiles load failed", workerProfileResult.error);
        setMessage(formatSupabaseError(workerProfileResult.error));
      } else if (businessProfileResult.error) {
        console.error("[booking-create] business_profiles load failed", businessProfileResult.error);
        setMessage(formatSupabaseError(businessProfileResult.error));
      }

      setWorkerProfile(workerProfileResult.data ?? null);
      setWorkerUser(workerUserResult.data ?? null);
      setBusinessProfile(businessProfileResult.data ?? null);
      setRate(
        workerProfileResult.data?.hourly_rate_gbp
          ? String(workerProfileResult.data.hourly_rate_gbp)
          : "",
      );
      setLoading(false);
    };

    void loadBookingContext();

    return () => {
      active = false;
    };
  }, [authLoading, authUserId, workerId]);

  const businessLocation = useMemo(
    () => buildBusinessLocation(businessProfile),
    [businessProfile],
  );

  const shiftEndDate = useMemo(
    () => (date ? deriveShiftEndDate(date, startTime, endTime) : date),
    [date, endTime, startTime],
  );

  const durationHours = useMemo(
    () => calculateBookingDurationHours(startTime, endTime, date || null, shiftEndDate || null),
    [date, endTime, shiftEndDate, startTime],
  );

  const totalAmount = useMemo(() => {
    const numericRate = Number(rate);

    if (!durationHours || Number.isNaN(numericRate) || numericRate <= 0) {
      return {
        workerPayGbp: 0,
        platformFeeGbp: 0,
        businessTotalGbp: 0,
      };
    }

    return buildBookingPricingSnapshot(durationHours * numericRate);
  }, [durationHours, rate]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (saving) {
      return;
    }

    if (!authUserId) {
      setMessage("Your session has expired. Please log in again.");
      showToast({
        title: "Session required",
        description: "Please log in again before creating a booking.",
        tone: "error",
      });
      return;
    }

    if (!workerId || !workerProfile) {
      const nextMessage = "Choose a valid worker profile before creating a booking.";
      setMessage(nextMessage);
      showToast({ title: "Worker missing", description: nextMessage, tone: "error" });
      return;
    }

    if (!businessLocation) {
      const nextMessage =
        "Complete your business address before creating a booking request.";
      setMessage(nextMessage);
      showToast({
        title: "Complete your profile",
        description: nextMessage,
        tone: "info",
      });
      return;
    }

    const numericRate = Number(rate);

    if (!date) {
      setMessage("Choose a shift date.");
      return;
    }

    if (!startTime || !endTime || durationHours <= 0) {
      setMessage("Enter a valid start and end time.");
      return;
    }

    if (Number.isNaN(numericRate) || numericRate <= 0) {
      setMessage("Enter a valid hourly rate.");
      return;
    }

    setSaving(true);
    setMessage(null);

    const payload: Omit<BookingRecord, "id" | "created_at" | "updated_at"> = {
      worker_id: workerId,
      business_id: authUserId,
      shift_date: date,
      shift_end_date: shiftEndDate,
      shift_listing_id: null,
      requested_role_label: workerProfile.job_role,
      shift_duration_hours: durationHours,
      start_time: startTime,
      end_time: endTime,
      hourly_rate_gbp: numericRate,
      location: businessLocation,
      notes: notes.trim() || null,
      status: "pending",
      total_amount_gbp: totalAmount.businessTotalGbp,
      platform_fee_gbp: totalAmount.platformFeeGbp,
    };

    console.info("[booking-create] insert payload", {
      workerId,
      businessId: authUserId,
      date,
      startTime,
      endTime,
      location: businessLocation,
    });

    const { error } = await supabase.from("bookings").insert(payload);

    setSaving(false);

    if (error) {
      const nextMessage = formatSupabaseError(error);
      console.error("[booking-create] bookings insert failed", error);
      setMessage(nextMessage);
      showToast({
        title: "Booking request failed",
        description: nextMessage,
        tone: "error",
      });
      return;
    }

    showToast({
      title: "Booking request sent",
      description: "The worker can now accept or decline this shift request.",
      tone: "success",
    });
    router.replace("/dashboard/business");
  };

  if (authLoading || (loading && authUserId && workerId)) {
    return (
      <div className="space-y-6">
        <div className="panel-soft p-5 sm:p-6">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-4 h-10 w-64" />
          <Skeleton className="mt-3 h-4 w-72" />
        </div>
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="panel-soft p-5 sm:p-6">
            <Skeleton className="h-6 w-40" />
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
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

  if (!authUserId) {
    return (
      <div className="mobile-empty-state">
        <h1 className="text-2xl font-semibold text-stone-900">Session required</h1>
        <p className="mt-3 text-sm leading-6 text-stone-600">
          Log in as a business account before creating a booking request.
        </p>
        <Link href="/login" className="primary-btn mt-6 px-6">
          Go to login
        </Link>
      </div>
    );
  }

  if (!workerId || !workerProfile) {
    return (
      <div className="mobile-empty-state">
        <h1 className="text-2xl font-semibold text-stone-900">Worker unavailable</h1>
        <p className="mt-3 text-sm leading-6 text-stone-600">
          Choose a worker from discovery before starting a booking request.
        </p>
        <Link href="/dashboard/business/discover" className="primary-btn mt-6 px-6">
          Discover workers
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="section-label">Booking request</p>
          <h1 className="mt-3 text-2xl font-semibold text-stone-900 sm:text-3xl">
            Book {workerUser?.display_name || workerProfile.job_role}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
            Send a clean booking request with date, time, rate, and notes. The worker
            will see it in their dashboard and can accept or decline without extra back-and-forth.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href={`/workers/${workerProfile.user_id}`}
            className="secondary-btn w-full px-6 sm:w-auto"
          >
            Back to worker
          </Link>
          <Link
            href="/dashboard/business"
            className="secondary-btn w-full px-6 sm:w-auto"
          >
            Business dashboard
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
              <label className="space-y-2 text-sm text-stone-600">
                <span className="font-medium text-stone-900">Date</span>
                <input
                  type="date"
                  value={date}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(event) => setDate(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-base text-stone-100 outline-none transition focus:border-[#00A7FF]"
                  required
                />
              </label>
              <label className="space-y-2 text-sm text-stone-600">
                <span className="font-medium text-stone-900">Hourly rate (GBP)</span>
                <input
                  type="number"
                  min="1"
                  step="0.5"
                  value={rate}
                  onChange={(event) => setRate(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-base text-stone-100 outline-none transition focus:border-[#00A7FF]"
                  required
                />
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
            </div>

            <label className="block space-y-2 text-sm text-stone-600">
              <span className="font-medium text-stone-900">Shift notes</span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={5}
                className="w-full rounded-3xl border border-white/10 bg-black/60 px-4 py-3 text-base text-stone-100 outline-none transition focus:border-[#00A7FF]"
                placeholder="Share service style, dress code, access notes, or anything the worker should know."
              />
            </label>

            <div className="mobile-sticky-bar flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-stone-500">
                {durationHours > 0 ? `${durationHours} hours scheduled` : "Enter a valid shift length"}
              </div>
              <button
                type="submit"
                disabled={saving}
                className="primary-btn w-full px-6 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {saving ? "Sending request..." : "Send booking request"}
              </button>
            </div>
          </form>
        </section>

        <aside className="space-y-4">
          <section className="panel-soft p-5 sm:p-6">
            <h2 className="text-xl font-semibold text-stone-900">Worker summary</h2>
            <div className="mt-4 space-y-3 text-sm text-stone-600">
              <p className="font-medium text-stone-900">
                {workerUser?.display_name || workerProfile.job_role}
              </p>
              <p>{workerProfile.job_role}</p>
              <p>
                {workerProfile.city} | {workerProfile.travel_radius_miles} mile radius
              </p>
              <p>
                Experience: {workerProfile.years_experience} years
              </p>
              <p>
                Suggested rate:{" "}
                {workerProfile.hourly_rate_gbp
                  ? formatCurrency(workerProfile.hourly_rate_gbp)
                  : "Set your rate"}
              </p>
            </div>
          </section>

          <section className="panel-soft p-5 sm:p-6">
            <h2 className="text-xl font-semibold text-stone-900">Booking summary</h2>
            <div className="mt-4 space-y-3 text-sm text-stone-600">
              <p>
                Venue location:{" "}
                <span className="font-medium text-stone-900">
                  {businessLocation || "Complete your business profile address"}
                </span>
              </p>
              <p>
                Shift:{" "}
                <span className="font-medium text-stone-900">
                  {date ? formatBookingDate(date) : "Choose a date"}
                </span>
              </p>
              <p>
                Time:{" "}
                <span className="font-medium text-stone-900">
                  {durationHours > 0 ? formatBookingTimeRange(startTime, endTime, date || null, shiftEndDate || null) : "Choose a valid time range"}
                </span>
              </p>
              <p>
                Worker pay:{" "}
                <span className="font-medium text-stone-900">
                  {formatCurrency(totalAmount.workerPayGbp)}
                </span>
              </p>
              <p>
                KruVii fee:{" "}
                <span className="font-medium text-stone-900">
                  {formatCurrency(totalAmount.platformFeeGbp)}
                </span>
              </p>
              <p>
                Business total:{" "}
                <span className="font-medium text-stone-900">
                  {formatCurrency(totalAmount.businessTotalGbp)}
                </span>
              </p>
              <p className="info-banner mt-4">
                Requests start as pending. Once accepted, you can complete payment securely.
              </p>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
