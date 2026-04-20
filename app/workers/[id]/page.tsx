"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { calculateReviewAggregate } from "@/lib/business-discovery";
import {
  WEEK_DAYS,
  type MarketplaceUserRecord,
  type ReviewRecord,
  type RoleRecord,
  type WorkerAvailabilitySlotRecord,
  type WorkerProfileRecord,
  type WorkerRoleRecord,
} from "@/lib/models";
import { supabase } from "@/lib/supabase";
import {
  buildWorkerMarketplaceTags,
  getWorkerAvailabilityState,
  getWorkerExperienceLabel,
} from "@/lib/worker-marketplace";

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

export default function WorkerPublicProfilePage() {
  const params = useParams();
  const workerId = params.id as string;
  const [profile, setProfile] = useState<WorkerProfileRecord | null>(null);
  const [workerUser, setWorkerUser] = useState<MarketplaceUserRecord | null>(null);
  const [workerRoles, setWorkerRoles] = useState<WorkerRoleRecord[]>([]);
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [availability, setAvailability] = useState<WorkerAvailabilitySlotRecord[]>([]);
  const [reviews, setReviews] = useState<ReviewRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadWorker = async () => {
      const [
        profileResult,
        userResult,
        workerRolesResult,
        rolesResult,
        availabilityResult,
        reviewsResult,
      ] = await Promise.all([
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
        supabase.from("worker_roles").select("*").eq("worker_id", workerId),
        supabase.from("roles").select("*").order("sort_order", { ascending: true }),
        supabase
          .from("worker_availability_slots")
          .select("*")
          .eq("worker_id", workerId)
          .order("day_of_week", { ascending: true }),
        supabase.from("reviews").select("*").eq("reviewee_user_id", workerId),
      ]);

      if (!active) {
        return;
      }

      const firstError =
        profileResult.error ??
        userResult.error ??
        workerRolesResult.error ??
        rolesResult.error ??
        availabilityResult.error ??
        reviewsResult.error;

      if (firstError) {
        setMessage(firstError.message);
      }

      setProfile(profileResult.data ?? null);
      setWorkerUser(userResult.data ?? null);
      setWorkerRoles((workerRolesResult.data as WorkerRoleRecord[] | null) ?? []);
      setRoles((rolesResult.data as RoleRecord[] | null) ?? []);
      setAvailability((availabilityResult.data as WorkerAvailabilitySlotRecord[] | null) ?? []);
      setReviews((reviewsResult.data as ReviewRecord[] | null) ?? []);
      setLoading(false);
    };

    void loadWorker();

    return () => {
      active = false;
    };
  }, [workerId]);

  const aggregate = useMemo(() => calculateReviewAggregate(reviews), [reviews]);

  const groupedAvailability = useMemo(
    () =>
      WEEK_DAYS.map((day) => ({
        label: day.label,
        slots: availability.filter((slot) => slot.day_of_week === day.key),
      })).filter((day) => day.slots.length > 0),
    [availability],
  );

  const roleTags = useMemo(
    () => buildWorkerMarketplaceTags({ workerId, workerRoles, roles }),
    [roles, workerId, workerRoles],
  );

  const displayName =
    workerUser?.display_name?.trim() || profile?.job_role || "Hospitality professional";

  const experienceLabel = profile ? getWorkerExperienceLabel(profile.years_experience) : "";
  const availabilityStatus = profile
    ? getWorkerAvailabilityState({
        availabilitySlots: availability,
        availabilitySummary: profile.availability_summary,
      })
    : "needs_update";

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="panel p-5 sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:justify-between">
            <div className="flex flex-col gap-5 sm:flex-row">
              <Skeleton className="h-28 w-28 rounded-[2rem]" />
              <div className="flex-1">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="mt-4 h-10 w-60" />
                <Skeleton className="mt-3 h-4 w-48" />
                <Skeleton className="mt-4 h-4 w-56" />
              </div>
            </div>
            <Skeleton className="h-40 w-full lg:w-80" />
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="mobile-empty-state">
          <h1 className="text-2xl font-semibold text-stone-900">Worker not found</h1>
          <p className="mt-3 text-sm text-stone-600">
            This worker profile is unavailable or has not been completed yet.
          </p>
          {message ? <p className="mt-3 text-xs text-stone-500">{message}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black px-4 py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="panel p-5 sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="flex flex-col gap-5 sm:flex-row">
              <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-[2rem] bg-stone-100">
                {profile.profile_photo_url ? (
                  <Image
                    src={profile.profile_photo_url}
                    alt={displayName}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-3xl font-semibold text-stone-500">
                    {displayName.slice(0, 1)}
                  </div>
                )}
              </div>

              <div className="min-w-0">
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-700">
                  Worker marketplace profile
                </p>
                <h1 className="mt-3 text-2xl font-semibold text-stone-900 sm:text-3xl">
                  {displayName}
                </h1>
                <p className="mt-2 text-base font-medium text-stone-700">{profile.job_role}</p>
                <p className="mt-2 text-sm text-stone-600">
                  {profile.city}
                  {profile.travel_radius_miles
                    ? ` • Covers up to ${profile.travel_radius_miles} miles`
                    : ""}
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  {profile.verification_status === "verified" ? (
                    <span className="status-badge status-badge--ready">Verified</span>
                  ) : null}
                  {aggregate.averageRating !== null ? (
                    <span className="status-badge status-badge--rating">
                      {aggregate.averageRating}/5 from {aggregate.reviewCount} review
                      {aggregate.reviewCount === 1 ? "" : "s"}
                    </span>
                  ) : (
                    <span className="status-badge">New to KruVii</span>
                  )}
                  <span className="status-badge">{experienceLabel}</span>
                  <span
                    className={`status-badge ${
                      availabilityStatus === "has_availability" ? "status-badge--ready" : ""
                    }`}
                  >
                    {availabilityStatus === "has_availability"
                      ? "Availability added"
                      : "Availability needs update"}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {roleTags.length > 0 ? (
                    roleTags.map((tag) => (
                      <span
                        key={tag.id}
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          tag.isPrimary
                            ? "bg-[#00A7FF]/12 text-[#0B2035]"
                            : "bg-stone-100 text-stone-700"
                        }`}
                      >
                        {tag.label}
                      </span>
                    ))
                  ) : (
                    <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700">
                      {profile.job_role}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <aside className="rounded-[2rem] border border-white/10 bg-black/50 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#00A7FF]">
                Book this worker
              </p>
              <p className="mt-3 text-3xl font-semibold text-stone-100">
                {formatCurrency(profile.hourly_rate_gbp)}
                {profile.hourly_rate_gbp ? <span className="text-base text-stone-400"> / hour</span> : null}
              </p>
              <p className="mt-3 text-sm leading-6 text-stone-400">
                Send a clean shift request with date, time, rate, and notes. The worker
                can respond from their dashboard straight away.
              </p>
              <div className="mt-5 flex flex-col gap-3">
                <Link
                  href={`/dashboard/business/bookings/new?worker=${profile.user_id}`}
                  className="primary-btn w-full"
                >
                  Request shift
                </Link>
                <Link href="/dashboard/business/discover" className="secondary-btn w-full">
                  Back to marketplace
                </Link>
              </div>
            </aside>
          </div>
        </section>

        {message ? <div className="info-banner">{message}</div> : null}

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="space-y-6">
            <div className="panel-soft p-6">
              <h2 className="text-xl font-semibold text-stone-900">About</h2>
              <p className="mt-4 text-sm leading-7 text-stone-600">
                {profile.bio || "No introduction added yet."}
              </p>
            </div>

            <div className="panel-soft p-6">
              <h2 className="text-xl font-semibold text-stone-900">Work highlights</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-[1.5rem] border border-white/10 bg-black/40 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-stone-500">Experience</p>
                  <p className="mt-2 text-lg font-semibold text-stone-900">
                    {profile.years_experience} years
                  </p>
                  <p className="mt-2 text-sm text-stone-600">{experienceLabel}</p>
                </div>
                <div className="rounded-[1.5rem] border border-white/10 bg-black/40 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-stone-500">Travel range</p>
                  <p className="mt-2 text-lg font-semibold text-stone-900">
                    {profile.travel_radius_miles} miles
                  </p>
                  <p className="mt-2 text-sm text-stone-600">Based around {profile.city}</p>
                </div>
              </div>
            </div>

            <div className="panel-soft p-6">
              <h2 className="text-xl font-semibold text-stone-900">Work history</h2>
              <div className="mt-4 space-y-4">
                {profile.work_history?.length ? (
                  profile.work_history.map((entry, index) => (
                    <div key={`${entry.venue}-${index}`} className="rounded-[1.5rem] border border-white/10 bg-black/40 p-4">
                      <p className="font-medium text-stone-900">{entry.role || "Previous role"}</p>
                      <p className="mt-1 text-sm text-stone-600">
                        {entry.venue || "Venue"}
                        {entry.startYear || entry.endYear
                          ? ` • ${[entry.startYear, entry.endYear].filter(Boolean).join(" - ")}`
                          : ""}
                      </p>
                      {entry.summary ? (
                        <p className="mt-2 text-sm leading-6 text-stone-600">{entry.summary}</p>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-stone-600">No work history added yet.</p>
                )}
              </div>
            </div>
          </section>

          <aside className="space-y-6">
            <div className="panel-soft p-6">
              <h2 className="text-xl font-semibold text-stone-900">Availability summary</h2>
              <div className="mt-4 space-y-3 text-sm text-stone-700">
                {groupedAvailability.length > 0 ? (
                  groupedAvailability.map((day) => (
                    <div key={day.label}>
                      <p className="font-medium text-stone-900">{day.label}</p>
                      <p className="mt-1 text-stone-600">
                        {day.slots
                          .map((slot) => `${slot.start_time.slice(0, 5)} - ${slot.end_time.slice(0, 5)}`)
                          .join(", ")}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-stone-600">No weekly availability published yet.</p>
                )}
                {profile.availability_summary ? (
                  <div className="rounded-[1.5rem] border border-white/10 bg-black/40 p-4 text-stone-600">
                    {profile.availability_summary}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="panel-soft p-6">
              <h2 className="text-xl font-semibold text-stone-900">Marketplace trust</h2>
              <div className="mt-4 space-y-3 text-sm text-stone-700">
                <p>
                  <span className="font-medium text-stone-900">Review count:</span>{" "}
                  {aggregate.reviewCount}
                </p>
                <p>
                  <span className="font-medium text-stone-900">Profile status:</span>{" "}
                  {profile.verification_status === "verified"
                    ? "Verified"
                    : profile.verification_status === "rejected"
                    ? "Changes required"
                    : "Pending review"}
                </p>
                <p>
                  <span className="font-medium text-stone-900">Published rate:</span>{" "}
                  {formatCurrency(profile.hourly_rate_gbp)}
                </p>
              </div>
            </div>

            <div className="panel-soft p-6">
              <h2 className="text-xl font-semibold text-stone-900">Ready to move?</h2>
              <p className="mt-3 text-sm leading-6 text-stone-600">
                If the profile looks like a fit, send a shift request now and the worker will
                see it in their dashboard.
              </p>
              <Link
                href={`/dashboard/business/bookings/new?worker=${profile.user_id}`}
                className="primary-btn mt-5 w-full"
              >
                Request shift
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
