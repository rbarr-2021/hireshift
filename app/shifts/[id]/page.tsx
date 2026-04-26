"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthState } from "@/components/auth/auth-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast-provider";
import {
  calculateBookingDurationHours,
  formatBookingDate,
  formatBookingTimeRange,
} from "@/lib/bookings";
import { formatBlockedUntil, isWorkerBlocked } from "@/lib/reliability";
import { rememberPostAuthIntent } from "@/lib/post-auth-intent";
import { isWorkerPayoutReady } from "@/lib/payout-readiness";
import { processOwnNotificationJobs } from "@/lib/notifications/client";
import type {
  BusinessProfileRecord,
  ShiftListingRecord,
  UserRecord,
  WorkerProfileRecord,
  WorkerReliabilityRecord,
} from "@/lib/models";
import {
  formatShiftListingStatus,
  hasShiftListingStarted,
  getRemainingShiftPositions,
  shiftListingStatusClass,
} from "@/lib/shift-listings";
import { supabase } from "@/lib/supabase";

type BusinessSummary = {
  name: string;
  city: string;
  contact: string;
  verificationStatus: BusinessProfileRecord["verification_status"] | "pending";
};

function formatSupabaseError(error: unknown) {
  if (error instanceof Error) {
    if (error.message.includes("another accepted shift during this time")) {
      return "You already have another accepted shift during these hours.";
    }

    if (error.message.includes("Set up Stripe payouts")) {
      return "Set up payouts before taking your first shift.";
    }

    return error.message;
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: string }).message);

    if (message.includes("another accepted shift during this time")) {
      return "You already have another accepted shift during these hours.";
    }

    if (message.includes("Set up Stripe payouts")) {
      return "Set up payouts before taking your first shift.";
    }

    return message;
  }

  return "Unable to take this shift right now.";
}

export default function ShiftDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { appUser } = useAuthState();
  const { showToast } = useToast();
  const shiftId = params.id as string;
  const [listing, setListing] = useState<ShiftListingRecord | null>(null);
  const [business, setBusiness] = useState<BusinessSummary | null>(null);
  const [workerAlreadyBooked, setWorkerAlreadyBooked] = useState(false);
  const [workerProfile, setWorkerProfile] = useState<WorkerProfileRecord | null>(null);
  const [reliability, setReliability] = useState<WorkerReliabilityRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [taking, setTaking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const intentTake =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("intent") === "take";

  useEffect(() => {
    let active = true;

    const loadShift = async () => {
      const { data, error } = await supabase
        .from("shift_listings")
        .select("*")
        .eq("id", shiftId)
        .maybeSingle<ShiftListingRecord>();

      if (!active) {
        return;
      }

      if (error) {
        setMessage(error.message);
        setLoading(false);
        return;
      }

      if (!data) {
        setLoading(false);
        return;
      }

      const bookingResultPromise = appUser?.id
        ? supabase
            .from("bookings")
            .select("id")
            .eq("worker_id", appUser.id)
            .eq("shift_listing_id", data.id)
            .in("status", ["pending", "accepted", "completed"])
            .limit(1)
        : Promise.resolve({ data: [], error: null });

      const reliabilityResultPromise = appUser?.id
        ? supabase
            .from("worker_reliability")
            .select("*")
            .eq("worker_id", appUser.id)
            .maybeSingle<WorkerReliabilityRecord>()
        : Promise.resolve({ data: null, error: null });

      const workerProfileResultPromise = appUser?.id
        ? supabase
            .from("worker_profiles")
            .select("*")
            .eq("user_id", appUser.id)
            .maybeSingle<WorkerProfileRecord>()
        : Promise.resolve({ data: null, error: null });

      const [userResult, profileResult, bookingResult, reliabilityResult, workerProfileResult] =
        await Promise.all([
        supabase.from("users").select("*").eq("id", data.business_id).maybeSingle<UserRecord>(),
        supabase
          .from("business_profiles")
          .select("*")
          .eq("user_id", data.business_id)
          .maybeSingle<BusinessProfileRecord>(),
        bookingResultPromise,
        reliabilityResultPromise,
        workerProfileResultPromise,
      ]);

      if (!active) {
        return;
      }

      setListing(data);
      setBusiness({
        name:
          profileResult.data?.business_name ||
          userResult.data?.display_name ||
          "Hospitality business",
        city: profileResult.data?.city || data.city || "",
        contact:
          profileResult.data?.contact_name ||
          userResult.data?.email ||
          "Business contact",
        verificationStatus: profileResult.data?.verification_status ?? "pending",
      });
      const hasExistingBooking =
        ((bookingResult.data as { id: string }[] | null) ?? []).length > 0;
      setWorkerAlreadyBooked(hasExistingBooking);
      setReliability(reliabilityResult.data ?? null);
      setWorkerProfile(workerProfileResult.data ?? null);

      if (intentTake && appUser?.onboarding_complete) {
        setMessage(
          isWorkerBlocked(reliabilityResult.data ?? null)
            ? `Your account is temporarily unable to take new shifts until ${formatBlockedUntil(reliabilityResult.data?.blocked_until) ?? "a later date"}.`
            : hasExistingBooking
            ? "You've already taken this shift."
            : "Profile complete - you're ready to take this shift.",
        );
      }

      setLoading(false);
    };

    void loadShift();

    return () => {
      active = false;
    };
  }, [appUser?.id, appUser?.onboarding_complete, intentTake, shiftId]);

  const handleTakeShift = async () => {
    if (!listing) {
      return;
    }

    const targetPath = `/shifts/${listing.id}?intent=take`;
    rememberPostAuthIntent(targetPath);

    if (!appUser) {
      router.push(`/login?redirect=${encodeURIComponent(targetPath)}`);
      return;
    }

    if (!appUser.onboarding_complete) {
      showToast({
        title: "Complete your profile to take this shift",
        description: "Just a few details before your first shift. You only need to do this once.",
        tone: "info",
      });
      router.push(`/profile/setup/worker?redirect=${encodeURIComponent(targetPath)}`);
      return;
    }

    if (!isWorkerPayoutReady(workerProfile)) {
      showToast({
        title: "Set up payouts to take this shift",
        description:
          "Connect Stripe once so NexHyr can pay you quickly after completed shifts.",
        tone: "info",
      });
      router.push(`/dashboard/worker/payments?redirect=${encodeURIComponent(targetPath)}`);
      return;
    }

    if (isWorkerBlocked(reliability)) {
      const nextMessage = `Your account is temporarily unable to take new shifts until ${formatBlockedUntil(reliability?.blocked_until) ?? "a later date"}.`;
      setMessage(nextMessage);
      showToast({
        title: "Shift taking temporarily restricted",
        description: nextMessage,
        tone: "error",
      });
      return;
    }

    setTaking(true);
    setMessage(null);

    const { error } = await supabase.rpc("claim_shift_listing", {
      target_listing_id: listing.id,
    });

    setTaking(false);

    if (error) {
      const nextMessage = formatSupabaseError(error);
      setMessage(nextMessage);
      showToast({
        title: "Shift could not be taken",
        description: nextMessage,
        tone: "error",
      });
      return;
    }

    showToast({
      title: "Shift secured",
      description: "Nice one - this shift is now in your upcoming work.",
      tone: "success",
    });
    const notificationResult = await processOwnNotificationJobs();

    if (!notificationResult.ok) {
      console.warn("[shift-claim] confirmation notification not sent", {
        listingId: listing.id,
        error: notificationResult.error,
      });
      showToast({
        title: "Shift secured",
        description: "The shift was secured, but the confirmation email could not be sent right now.",
        tone: "info",
      });
    }

    router.replace("/dashboard/worker");
  };

  const shiftLength = useMemo(() => {
    if (!listing) {
      return "";
    }

    const hours = calculateBookingDurationHours(
      listing.start_time,
      listing.end_time,
      listing.shift_date,
      listing.shift_end_date,
    );

    return hours > 0 ? `${hours} hours` : "";
  }, [listing]);

  const listingStarted = useMemo(
    () => (listing ? hasShiftListingStarted(listing) : false),
    [listing],
  );

  if (loading) {
    return (
      <section className="public-section">
        <div className="panel p-5 sm:p-7">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-4 h-10 w-64" />
          <Skeleton className="mt-4 h-32 w-full" />
        </div>
      </section>
    );
  }

  if (!listing) {
    return (
      <section className="public-section">
        <div className="mobile-empty-state">
          <h1 className="text-2xl font-semibold text-stone-900">Shift unavailable</h1>
          <p className="mt-3 text-sm text-stone-600">
            This shift is no longer open or could not be loaded.
          </p>
          <Link href="/shifts" className="primary-btn mt-6 px-6">
            Browse shifts
          </Link>
        </div>
      </section>
    );
  }

  if (listingStarted) {
    return (
      <section className="public-section">
        <div className="mobile-empty-state">
          <h1 className="text-2xl font-semibold text-stone-900">Shift no longer available</h1>
          <p className="mt-3 text-sm text-stone-600">
            This listing has already started, so it is no longer visible for worker claims.
          </p>
          <Link href="/shifts" className="primary-btn mt-6 px-6">
            Browse current shifts
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="public-section space-y-6">
      <div className="panel p-5 sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="section-label">Shift details</p>
            <h1 className="mt-4 text-2xl font-semibold text-stone-900 sm:text-3xl">
              {listing.title || listing.role_label}
            </h1>
            <p className="mt-3 text-sm leading-6 text-stone-600">
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
      </div>

      {message ? <div className="info-banner">{message}</div> : null}

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="panel-soft p-5 sm:p-6">
          <h2 className="text-xl font-semibold text-stone-900">What you need to know</h2>
          <div className="mt-4 grid gap-3 text-sm text-stone-600 sm:grid-cols-2">
            <p><span className="font-medium text-stone-900">Role:</span> {listing.role_label}</p>
            <p><span className="font-medium text-stone-900">Date:</span> {formatBookingDate(listing.shift_date)}</p>
            <p><span className="font-medium text-stone-900">Time:</span> {formatBookingTimeRange(listing.start_time, listing.end_time, listing.shift_date, listing.shift_end_date)}</p>
            <p><span className="font-medium text-stone-900">Shift length:</span> {shiftLength || "TBC"}</p>
            <p><span className="font-medium text-stone-900">Rate:</span> GBP {listing.hourly_rate_gbp}/hr</p>
            <p><span className="font-medium text-stone-900">Location:</span> {listing.location}</p>
            <p><span className="font-medium text-stone-900">Spots left:</span> {getRemainingShiftPositions(listing)}</p>
          </div>
          <div className="mt-5 rounded-3xl border border-white/10 bg-black/40 p-4 text-sm leading-7 text-stone-500">
            {listing.description || "No extra shift notes yet."}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="panel-soft p-5 sm:p-6">
            <h2 className="text-xl font-semibold text-stone-900">Business snapshot</h2>
            <div className="mt-4 space-y-3 text-sm text-stone-600">
              <p className="font-medium text-stone-900">{business?.name || "Hospitality business"}</p>
              {business?.verificationStatus === "verified" ? (
                <span className="status-badge status-badge--ready">Trusted business</span>
              ) : null}
              <p>{business?.contact || "Business contact"}</p>
              <p>{business?.city || listing.city || "Location to be confirmed"}</p>
            </div>
          </section>

          <section className="panel-soft p-5 sm:p-6">
            <h2 className="text-xl font-semibold text-stone-900">Ready to take it?</h2>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              {appUser?.onboarding_complete
                ? isWorkerBlocked(reliability)
                  ? `You are temporarily unable to take new shifts until ${formatBlockedUntil(reliability?.blocked_until) ?? "a later date"}.`
                  : isWorkerPayoutReady(workerProfile)
                    ? "You are shift-ready. Take this shift now and it will move straight into your accepted work."
                    : "Connect Stripe payouts once before your first shift so NexHyr can pay you after completion."
                : "Complete your profile once before your first shift, then you can take future shifts without being blocked again."}
            </p>
            <div className="mt-5 flex flex-col gap-3">
              <button
                type="button"
                onClick={handleTakeShift}
                disabled={
                  taking ||
                  isWorkerBlocked(reliability) ||
                  workerAlreadyBooked ||
                  listingStarted ||
                  listing.status !== "open" ||
                  getRemainingShiftPositions(listing) === 0
                }
                className="primary-btn w-full disabled:cursor-not-allowed disabled:opacity-60"
              >
                {taking
                  ? "Taking shift..."
                  : workerAlreadyBooked
                    ? "Already taken"
                  : listingStarted
                    ? "Shift started"
                  : isWorkerBlocked(reliability)
                    ? "Temporarily blocked"
                  : appUser?.onboarding_complete && !isWorkerPayoutReady(workerProfile)
                    ? "Set up payouts to take shift"
                  : appUser?.onboarding_complete
                    ? "Take shift"
                    : "Complete profile to take shift"}
              </button>
              <Link href="/shifts" className="secondary-btn w-full">
                Back to shifts
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}
