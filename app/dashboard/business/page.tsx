"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { BusinessProfileRecord, WorkerProfileRecord } from "@/lib/models";
import { calculateBusinessProfileCompletion } from "@/lib/business-discovery";

function statusStyles(status: string) {
  if (status === "verified") return "bg-emerald-100 text-emerald-900";
  if (status === "rejected") return "bg-red-100 text-red-900";
  return "bg-amber-100 text-amber-900";
}

export default function BusinessDashboardPage() {
  const [profile, setProfile] = useState<BusinessProfileRecord | null>(null);
  const [workerCount, setWorkerCount] = useState(0);

  useEffect(() => {
    let active = true;

    const loadDashboard = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || !active) {
        return;
      }

      const [profileResult, workersResult] = await Promise.all([
        supabase
          .from("business_profiles")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle<BusinessProfileRecord>(),
        supabase.from("worker_profiles").select("user_id"),
      ]);

      if (!active) {
        return;
      }

      setProfile(profileResult.data ?? null);
      setWorkerCount(((workersResult.data as Pick<WorkerProfileRecord, "user_id">[] | null) ?? []).length);
    };

    void loadDashboard();

    return () => {
      active = false;
    };
  }, []);

  const completion = useMemo(
    () => calculateBusinessProfileCompletion(profile),
    [profile],
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-700">
            Business Dashboard
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-stone-900">
            Discover hospitality workers and manage your venue profile
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
            Your business profile powers trust with workers, and discovery helps
            you shortlist staff by role, skills, availability, price, and area.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/dashboard/business/profile"
            className="rounded-2xl border border-stone-300 px-6 py-3 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
          >
            Edit profile
          </Link>
          <Link
            href="/dashboard/business/discover"
            className="rounded-2xl bg-stone-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-stone-800"
          >
            Discover workers
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <section className="rounded-3xl bg-stone-100 p-5">
          <p className="text-sm font-medium text-stone-500">Profile completion</p>
          <p className="mt-2 text-3xl font-semibold text-stone-900">{completion}%</p>
        </section>
        <section className="rounded-3xl bg-stone-100 p-5">
          <p className="text-sm font-medium text-stone-500">Approval status</p>
          <span className={`mt-3 inline-flex rounded-full px-3 py-1 text-sm font-medium ${statusStyles(profile?.verification_status ?? "pending")}`}>
            {profile?.verification_status ?? "pending"}
          </span>
        </section>
        <section className="rounded-3xl bg-stone-100 p-5">
          <p className="text-sm font-medium text-stone-500">Workers discoverable</p>
          <p className="mt-2 text-3xl font-semibold text-stone-900">{workerCount}</p>
        </section>
        <section className="rounded-3xl bg-stone-100 p-5">
          <p className="text-sm font-medium text-stone-500">Business sector</p>
          <p className="mt-2 text-xl font-semibold text-stone-900">
            {profile?.sector ?? "Not set"}
          </p>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-3xl bg-stone-100 p-6">
          <h2 className="text-xl font-semibold text-stone-900">Business profile snapshot</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm text-stone-500">Business name</p>
              <p className="mt-1 font-medium text-stone-900">
                {profile?.business_name ?? "Not set"}
              </p>
            </div>
            <div>
              <p className="text-sm text-stone-500">Primary contact</p>
              <p className="mt-1 font-medium text-stone-900">
                {profile?.contact_name ?? "Not set"}
              </p>
            </div>
            <div>
              <p className="text-sm text-stone-500">Location</p>
              <p className="mt-1 font-medium text-stone-900">
                {[profile?.address_line_1, profile?.city, profile?.postcode]
                  .filter(Boolean)
                  .join(", ") || "Not set"}
              </p>
            </div>
            <div>
              <p className="text-sm text-stone-500">Phone</p>
              <p className="mt-1 font-medium text-stone-900">
                {profile?.phone ?? "Not set"}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-3xl bg-stone-100 p-6">
          <h2 className="text-xl font-semibold text-stone-900">Next actions</h2>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-stone-600">
            <li>Complete your business profile so workers understand your venue.</li>
            <li>Use discovery to shortlist workers by role, skills, and availability.</li>
            <li>Open a worker detail page to review rates, background, and availability before booking.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
