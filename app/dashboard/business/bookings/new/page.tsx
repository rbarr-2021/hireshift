"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function BookingEntryPlaceholderPage() {
  const searchParams = useSearchParams();
  const workerId = searchParams.get("worker");

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-700">
          Booking entry
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-stone-900">
          Booking flow placeholder
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
          Phase 3 adds discovery and a route entry point for booking. Full booking
          workflow stays out of scope until the next phase.
        </p>
      </div>

      <div className="rounded-3xl bg-stone-100 p-6">
        <p className="text-sm text-stone-600">
          Selected worker: <span className="font-medium text-stone-900">{workerId ?? "Not provided"}</span>
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href={workerId ? `/workers/${workerId}` : "/dashboard/business/discover"}
          className="rounded-2xl border border-stone-300 px-6 py-3 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
        >
          Back
        </Link>
        <Link
          href="/dashboard/business/discover"
          className="rounded-2xl bg-stone-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-stone-800"
        >
          Return to discovery
        </Link>
      </div>
    </div>
  );
}
