"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type WorkerAvailabilitySlotRecord,
  type WorkerDocumentRecord,
  type WorkerProfileRecord,
} from "@/lib/models";

function statusStyles(status: string) {
  if (status === "verified") return "bg-emerald-100 text-emerald-900";
  if (status === "rejected") return "bg-red-100 text-red-900";
  return "bg-amber-100 text-amber-900";
}

export default function WorkerDashboardPage() {
  const [profile, setProfile] = useState<WorkerProfileRecord | null>(null);
  const [availabilitySlots, setAvailabilitySlots] = useState<WorkerAvailabilitySlotRecord[]>([]);
  const [documents, setDocuments] = useState<WorkerDocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const loadDashboard = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || !active) {
        return;
      }

      const [profileResult, availabilityResult, documentsResult] = await Promise.all([
        supabase
          .from("worker_profiles")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle<WorkerProfileRecord>(),
        supabase.from("worker_availability_slots").select("*").eq("worker_id", user.id),
        supabase.from("worker_documents").select("*").eq("worker_id", user.id),
      ]);

      if (!active) {
        return;
      }

      setProfile(profileResult.data ?? null);
      setAvailabilitySlots((availabilityResult.data as WorkerAvailabilitySlotRecord[] | null) ?? []);
      setDocuments((documentsResult.data as WorkerDocumentRecord[] | null) ?? []);
      setLoading(false);
    };

    void loadDashboard();

    return () => {
      active = false;
    };
  }, []);

  const completion = useMemo(() => {
    if (!profile) {
      return 0;
    }

    const checks = [
      Boolean(profile.profile_photo_url),
      Boolean(profile.bio),
      Boolean(profile.job_role),
      profile.skills.length >= 2,
      Boolean(profile.hourly_rate_gbp || profile.daily_rate_gbp),
      Boolean(profile.city),
      Boolean(profile.travel_radius_miles),
      availabilitySlots.length > 0,
      (profile.work_history?.length ?? 0) > 0,
    ];

    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [availabilitySlots.length, profile]);

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="panel-soft p-5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-4 h-10 w-20" />
            </div>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="panel-soft p-5 sm:p-6">
            <Skeleton className="h-6 w-48" />
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index}>
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="mt-3 h-5 w-32" />
                </div>
              ))}
            </div>
          </div>
          <div className="panel-soft p-5 sm:p-6">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="mt-4 h-24 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="section-label">
            Worker Dashboard
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-stone-900 sm:text-3xl">
            Manage your marketplace profile
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
            Keep your worker profile current so businesses can assess your role fit,
            rates, travel range, documents, and recurring availability.
          </p>
        </div>
        <Link
          href="/dashboard/worker/profile"
          className="primary-btn w-full px-6 sm:w-auto"
        >
          Edit worker profile
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <section className="panel-soft p-5">
          <p className="text-sm font-medium text-stone-500">Completion</p>
          <p className="mt-2 text-3xl font-semibold text-stone-900">{completion}%</p>
        </section>
        <section className="panel-soft p-5">
          <p className="text-sm font-medium text-stone-500">Approval</p>
          <span className={`mt-3 inline-flex rounded-full px-3 py-1 text-sm font-medium ${statusStyles(profile?.verification_status ?? "pending")}`}>
            {profile?.verification_status ?? "pending"}
          </span>
        </section>
        <section className="panel-soft p-5">
          <p className="text-sm font-medium text-stone-500">Availability slots</p>
          <p className="mt-2 text-3xl font-semibold text-stone-900">{availabilitySlots.length}</p>
        </section>
        <section className="panel-soft p-5">
          <p className="text-sm font-medium text-stone-500">Documents</p>
          <p className="mt-2 text-3xl font-semibold text-stone-900">{documents.length}</p>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="panel-soft p-5 sm:p-6">
          <h2 className="text-xl font-semibold text-stone-900">Profile snapshot</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-stone-500">Primary role</p>
              <p className="mt-1 font-medium text-stone-900">{profile?.job_role ?? "Not set"}</p>
            </div>
            <div>
              <p className="text-sm text-stone-500">Rates</p>
              <p className="mt-1 font-medium text-stone-900">
                {profile?.hourly_rate_gbp ? `GBP ${profile.hourly_rate_gbp}/hr` : "No hourly rate"}
                {profile?.daily_rate_gbp ? ` • GBP ${profile.daily_rate_gbp}/day` : ""}
              </p>
            </div>
            <div>
              <p className="text-sm text-stone-500">Location</p>
              <p className="mt-1 font-medium text-stone-900">
                {profile?.city ?? "No city"}{profile?.travel_radius_miles ? ` • ${profile.travel_radius_miles} mile radius` : ""}
              </p>
            </div>
            <div>
              <p className="text-sm text-stone-500">Skills</p>
              <p className="mt-1 font-medium text-stone-900">
                {profile?.skills?.length ? profile.skills.join(", ") : "No skills selected"}
              </p>
            </div>
          </div>
        </section>

        <section className="panel-soft p-5 sm:p-6">
          <h2 className="text-xl font-semibold text-stone-900">Next actions</h2>
          <div className="info-banner mt-4">
            Upload a strong profile photo, keep availability fresh, and add supporting
            documents to look trusted and booking-ready.
          </div>
        </section>
      </div>
    </div>
  );
}
