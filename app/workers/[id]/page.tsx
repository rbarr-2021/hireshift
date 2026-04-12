"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Skeleton } from "@/components/ui/skeleton";
import {
  WEEK_DAYS,
  type ReviewRecord,
  type UserRecord,
  type WorkerAvailabilitySlotRecord,
  type WorkerProfileRecord,
} from "@/lib/models";
import { calculateReviewAggregate } from "@/lib/business-discovery";

export default function WorkerPublicProfilePage() {
  const params = useParams();
  const workerId = params.id as string;
  const [profile, setProfile] = useState<WorkerProfileRecord | null>(null);
  const [workerUser, setWorkerUser] = useState<UserRecord | null>(null);
  const [availability, setAvailability] = useState<WorkerAvailabilitySlotRecord[]>([]);
  const [reviews, setReviews] = useState<ReviewRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const loadWorker = async () => {
      const [profileResult, userResult, availabilityResult, reviewsResult] =
        await Promise.all([
          supabase
            .from("worker_profiles")
            .select("*")
            .eq("user_id", workerId)
            .maybeSingle<WorkerProfileRecord>(),
          supabase.from("users").select("*").eq("id", workerId).maybeSingle<UserRecord>(),
          supabase
            .from("worker_availability_slots")
            .select("*")
            .eq("worker_id", workerId)
            .order("day_of_week", { ascending: true }),
          supabase
            .from("reviews")
            .select("*")
            .eq("reviewee_user_id", workerId),
        ]);

      if (!active) {
        return;
      }

      setProfile(profileResult.data ?? null);
      setWorkerUser(userResult.data ?? null);
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

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12">
        <div className="panel p-5 sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row">
            <Skeleton className="h-24 w-24 rounded-[2rem] sm:h-28 sm:w-28" />
            <div className="flex-1">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-4 h-10 w-60" />
              <Skeleton className="mt-3 h-4 w-40" />
              <Skeleton className="mt-3 h-4 w-52" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12">
        <div className="panel-soft p-5 text-center sm:p-8">
          <h1 className="text-2xl font-semibold text-stone-900">Worker not found</h1>
          <p className="mt-3 text-sm text-stone-600">
            This worker profile is unavailable or has not been completed yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black px-4 py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="panel p-5 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex flex-col gap-5 sm:flex-row">
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-[2rem] bg-stone-100 sm:h-28 sm:w-28">
                {profile.profile_photo_url ? (
                  <Image
                    src={profile.profile_photo_url}
                    alt={workerUser?.display_name || profile.job_role}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-stone-500">
                    No photo
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-700">
                  Worker profile
                </p>
                <h1 className="mt-3 text-2xl font-semibold text-stone-900 sm:text-3xl">
                  {workerUser?.display_name || profile.job_role}
                </h1>
                <p className="mt-2 text-sm text-stone-600">{profile.job_role}</p>
                <p className="mt-2 text-sm text-stone-600">
                  {profile.city} | {profile.travel_radius_miles} mile travel radius
                </p>
                <p className="mt-3 text-sm text-stone-600">
                  {aggregate.averageRating !== null
                    ? `${aggregate.averageRating}/5 average rating from ${aggregate.reviewCount} review${aggregate.reviewCount === 1 ? "" : "s"}`
                    : "No reviews yet"}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="status-badge status-badge--rating">Ratings and reviews</span>
                  <span className={`status-badge ${profile.verification_status === "verified" ? "status-badge--ready" : ""}`}>
                    {profile.verification_status}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap">
              <Link
                href={`/dashboard/business/bookings/new?worker=${profile.user_id}`}
                className="primary-btn w-full px-6 sm:w-auto"
              >
                Book now
              </Link>
              <Link
                href="/dashboard/business/discover"
                className="secondary-btn w-full px-6 sm:w-auto"
              >
                Back to discovery
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="space-y-6">
            <div className="panel-soft p-6">
              <h2 className="text-xl font-semibold text-stone-900">About</h2>
              <p className="mt-4 text-sm leading-7 text-stone-600">
                {profile.bio || "No bio provided."}
              </p>
            </div>

            <div className="panel-soft p-6">
              <h2 className="text-xl font-semibold text-stone-900">Skills</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {profile.skills.map((skill) => (
                  <span key={skill} className="rounded-full bg-stone-100 px-3 py-1 text-sm font-medium text-stone-700">
                    {skill}
                  </span>
                ))}
              </div>
            </div>

            <div className="panel-soft p-6">
              <h2 className="text-xl font-semibold text-stone-900">Experience</h2>
              <div className="mt-4 space-y-4">
                <p className="text-sm text-stone-600">
                  {profile.years_experience} years of hospitality experience
                </p>
                {profile.work_history?.length ? (
                  profile.work_history.map((entry, index) => (
                    <div key={`${entry.venue}-${index}`} className="panel-soft p-4">
                      <p className="font-medium text-stone-900">{entry.role || "Previous role"}</p>
                      <p className="mt-1 text-sm text-stone-600">
                        {entry.venue || "Venue"} | {[entry.startYear, entry.endYear].filter(Boolean).join(" - ")}
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
              <h2 className="text-xl font-semibold text-stone-900">Rates</h2>
              <div className="mt-4 space-y-3 text-sm text-stone-700">
                <p>Hourly: {profile.hourly_rate_gbp ? `GBP ${profile.hourly_rate_gbp}` : "Not set"}</p>
                <p>Daily: {profile.daily_rate_gbp ? `GBP ${profile.daily_rate_gbp}` : "Not set"}</p>
              </div>
            </div>

            <div className="panel-soft p-6">
              <h2 className="text-xl font-semibold text-stone-900">Availability</h2>
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
                  <p className="text-stone-600">No structured availability added yet.</p>
                )}
                {profile.availability_summary ? (
                  <p className="panel-soft p-3 text-stone-600">
                    {profile.availability_summary}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="panel-soft p-6">
              <h2 className="text-xl font-semibold text-stone-900">Trust signals</h2>
              <div className="mt-4 space-y-3 text-sm text-stone-700">
                <p>Approval status: {profile.verification_status}</p>
                <p>Review count: {aggregate.reviewCount}</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
