"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  isPastBooking,
} from "@/lib/bookings";
import { supabase } from "@/lib/supabase";
import { Skeleton } from "@/components/ui/skeleton";
import {
  WorkerBookingCard,
  WorkerBookingEmptyState,
  type WorkerBookingBusinessSnapshot,
} from "@/components/worker/worker-booking-card";
import {
  type BookingRecord,
  type BusinessProfileRecord,
  type PaymentRecord,
  type UserRecord,
  type WorkerAvailabilitySlotRecord,
  type WorkerProfileRecord,
  type WorkerReliabilityRecord,
} from "@/lib/models";
import {
  formatPayoutStatus,
  getLastPaidPayout,
  getUpcomingPayout,
} from "@/lib/payments";
import {
  formatBlockedUntil,
  formatReliabilityStatus,
  isWorkerBlocked,
  reliabilityStatusClass,
} from "@/lib/reliability";
import { AdminContactCard } from "@/components/support/admin-contact-card";

function statusStyles(status: string) {
  if (status === "verified") return "bg-emerald-100 text-emerald-900";
  if (status === "rejected") return "bg-red-100 text-red-900";
  return "bg-amber-100 text-amber-900";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 2,
  }).format(value);
}

export default function WorkerDashboardPage() {
  const [profile, setProfile] = useState<WorkerProfileRecord | null>(null);
  const [availabilitySlots, setAvailabilitySlots] = useState<WorkerAvailabilitySlotRecord[]>([]);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [paymentsByBookingId, setPaymentsByBookingId] = useState<Record<string, PaymentRecord>>({});
  const [reliability, setReliability] = useState<WorkerReliabilityRecord | null>(null);
  const [businessesById, setBusinessesById] = useState<Record<string, WorkerBookingBusinessSnapshot>>({});
  const [loading, setLoading] = useState(true);
  const [countdownNow, setCountdownNow] = useState(() => new Date());

  useEffect(() => {
    let active = true;

    const loadDashboard = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || !active) {
        return;
      }

      const [profileResult, availabilityResult, bookingsResult, reliabilityResult] = await Promise.all([
        supabase
          .from("worker_profiles")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle<WorkerProfileRecord>(),
        supabase.from("worker_availability_slots").select("*").eq("worker_id", user.id),
        supabase
          .from("bookings")
          .select("*")
          .eq("worker_id", user.id)
          .order("shift_date", { ascending: true })
          .order("start_time", { ascending: true }),
        supabase
          .from("worker_reliability")
          .select("*")
          .eq("worker_id", user.id)
          .maybeSingle<WorkerReliabilityRecord>(),
      ]);

      if (!active) {
        return;
      }

      const nextBookings = (bookingsResult.data as BookingRecord[] | null) ?? [];
      const bookingIds = nextBookings.map((booking) => booking.id);
      const businessIds = [...new Set(nextBookings.map((booking) => booking.business_id))];
      let nextBusinessMap: Record<string, WorkerBookingBusinessSnapshot> = {};
      let nextPaymentsByBookingId: Record<string, PaymentRecord> = {};

      if (businessIds.length > 0) {
        const [businessUsersResult, businessProfilesResult] = await Promise.all([
          supabase.from("users").select("*").in("id", businessIds),
          supabase.from("business_profiles").select("*").in("user_id", businessIds),
        ]);

        const businessUsers = (businessUsersResult.data as UserRecord[] | null) ?? [];
        const businessProfiles = (businessProfilesResult.data as BusinessProfileRecord[] | null) ?? [];

        nextBusinessMap = businessIds.reduce<Record<string, WorkerBookingBusinessSnapshot>>((accumulator, businessId) => {
          const nextUser = businessUsers.find((candidate) => candidate.id === businessId);
          const nextProfile = businessProfiles.find((candidate) => candidate.user_id === businessId);

          accumulator[businessId] = {
            name: nextProfile?.business_name || nextUser?.display_name || "Business",
            contact: nextProfile?.contact_name || nextUser?.email || "Business contact",
            location: [nextProfile?.address_line_1, nextProfile?.city]
              .filter(Boolean)
              .join(", "),
          };

          return accumulator;
        }, {});
      }

      if (bookingIds.length > 0) {
        const paymentsResult = await supabase.from("payments").select("*").in("booking_id", bookingIds);
        const nextPayments = (paymentsResult.data as PaymentRecord[] | null) ?? [];
        nextPaymentsByBookingId = nextPayments.reduce<Record<string, PaymentRecord>>((accumulator, payment) => {
          accumulator[payment.booking_id] = payment;
          return accumulator;
        }, {});
      }

      setProfile(profileResult.data ?? null);
      setAvailabilitySlots((availabilityResult.data as WorkerAvailabilitySlotRecord[] | null) ?? []);
      setBookings(nextBookings);
      setPaymentsByBookingId(nextPaymentsByBookingId);
      setReliability(reliabilityResult.data ?? null);
      setBusinessesById(nextBusinessMap);
      setLoading(false);
    };

    void loadDashboard();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCountdownNow(new Date());
    }, 60000);

    return () => {
      window.clearInterval(timer);
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
      Boolean(profile.hourly_rate_gbp),
      Boolean(profile.city),
      Boolean(profile.travel_radius_miles),
      availabilitySlots.length > 0,
      (profile.work_history?.length ?? 0) > 0,
    ];

    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [availabilitySlots.length, profile]);

  const acceptedJobs = useMemo(
    () => bookings.filter((booking) => booking.status === "accepted"),
    [bookings],
  );

  const paidBookings = useMemo(
    () =>
      bookings.filter(
        (booking) => paymentsByBookingId[booking.id]?.payout_status === "paid",
      ),
    [bookings, paymentsByBookingId],
  );

  const upcomingShifts = useMemo(
    () =>
      acceptedJobs
        .filter((booking) => !isPastBooking(booking))
        .slice(0, 3),
    [acceptedJobs],
  );

  const upcomingPayout = useMemo(
    () => getUpcomingPayout(bookings, paymentsByBookingId),
    [bookings, paymentsByBookingId],
  );

  const lastPaidPayout = useMemo(
    () => getLastPaidPayout(bookings, paymentsByBookingId),
    [bookings, paymentsByBookingId],
  );

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
        <div className="grid gap-4 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="panel-soft p-5 sm:p-6">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="mt-4 h-32 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="section-label">Worker Dashboard</p>
          <h1 className="mt-3 text-2xl font-semibold text-stone-900 sm:text-3xl">
            Manage incoming booking requests and confirmed shifts
          </h1>
        </div>
        <Link
          href="/dashboard/worker/availability"
          className="primary-btn w-full px-6 sm:w-auto"
        >
          Update availability
        </Link>
      </div>

      {isWorkerBlocked(reliability) ? (
        <div className="info-banner border border-red-400/30 bg-red-500/10 text-red-100">
          Your account is temporarily unable to take new shifts until {formatBlockedUntil(reliability?.blocked_until) ?? "a later date"}.
          Complete future shifts reliably to maintain good standing.
        </div>
      ) : reliability?.active_strikes ? (
        <div className="info-banner">
          Your reliability standing is currently {formatReliabilityStatus(reliability.reliability_status).toLowerCase()} with {reliability.active_strikes} active strike{reliability.active_strikes === 1 ? "" : "s"}.
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <section className="panel-soft p-5">
          <p className="text-sm font-medium text-stone-500">Completion</p>
          <p className="mt-2 text-3xl font-semibold text-stone-900">{completion}%</p>
        </section>
        <section className="panel-soft p-5">
          <p className="text-sm font-medium text-stone-500">Approval</p>
          <span className={`mt-3 inline-flex rounded-full px-3 py-1 text-sm font-medium ${statusStyles(profile?.verification_status ?? "pending")} ${profile?.verification_status === "verified" ? "verified-badge-inline" : ""}`}>
            {profile?.verification_status === "verified" ? (
              <>
                <span className="verified-tick">&#10003;</span>
                verified
              </>
            ) : (
              profile?.verification_status ?? "pending"
            )}
          </span>
        </section>
        <section className="panel-soft p-5">
          <p className="text-sm font-medium text-stone-500">Reliability</p>
          <div className={`mt-3 inline-flex rounded-full px-3 py-1 text-sm font-medium ${reliabilityStatusClass(reliability?.reliability_status ?? "good_standing")}`}>
            {formatReliabilityStatus(reliability?.reliability_status ?? "good_standing")}
          </div>
          <p className="mt-2 text-xs uppercase tracking-[0.16em] text-stone-500">
            {reliability?.active_strikes ?? 0} strikes | {reliability?.completed_shifts_count ?? 0} completed
          </p>
        </section>
        <section className="panel-soft p-5 sm:col-span-2 xl:col-span-3">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-sm font-medium text-stone-500">Upcoming payout</p>
              <p className="mt-2 text-2xl font-semibold text-stone-900">
                {upcomingPayout ? formatCurrency(upcomingPayout.payment.worker_payout_gbp) : "None yet"}
              </p>
              <p className="mt-2 text-sm text-stone-600">
                {upcomingPayout
                  ? `${businessesById[upcomingPayout.booking.business_id]?.name || "Business"} | ${formatPayoutStatus(upcomingPayout.payment.payout_status)}`
                  : "Your next approved shift payout will show here."}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-stone-500">Last payout</p>
              <p className="mt-2 text-2xl font-semibold text-stone-900">
                {lastPaidPayout ? formatCurrency(lastPaidPayout.payment.worker_payout_gbp) : "None yet"}
              </p>
              <p className="mt-2 text-sm text-stone-600">
                {lastPaidPayout
                  ? `${businessesById[lastPaidPayout.booking.business_id]?.name || "Business"} | paid`
                  : "Completed shifts move here once payout is sent."}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-stone-500">Paid shifts</p>
              <p className="mt-2 text-2xl font-semibold text-stone-900">{paidBookings.length}</p>
              <p className="mt-2 text-sm text-stone-600">
                Fast payout still follows confirmed shift completion and approval.
              </p>
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-4">
        <section className="panel-soft p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-stone-900">Upcoming shifts</h2>
            <span className="status-badge status-badge--rating">{upcomingShifts.length}</span>
          </div>
          <div className="mt-4 space-y-4">
            {upcomingShifts.length > 0 ? (
              upcomingShifts.map((booking) => (
                <WorkerBookingCard
                  key={booking.id}
                  booking={booking}
                  business={businessesById[booking.business_id]}
                  payment={paymentsByBookingId[booking.id]}
                  showDetailLink
                  countdownNow={countdownNow}
                />
              ))
            ) : (
              <WorkerBookingEmptyState
                title="No upcoming shifts"
                description="Your next accepted shifts will show up here so you can see what is coming up first."
              />
            )}
          </div>
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
              </p>
            </div>
            <div>
              <p className="text-sm text-stone-500">Location</p>
              <p className="mt-1 font-medium text-stone-900">
                {profile?.city ?? "No city"}{profile?.travel_radius_miles ? ` | ${profile.travel_radius_miles} mile radius` : ""}
              </p>
            </div>
            <div>
              <p className="text-sm text-stone-500">Experience</p>
              <p className="mt-1 font-medium text-stone-900">
                {profile?.years_experience ? `${profile.years_experience} years` : "No experience added"}
              </p>
            </div>
          </div>
        </section>

        <section className="panel-soft p-5 sm:p-6">
          <h2 className="text-xl font-semibold text-stone-900">Payments</h2>
          <div className="info-banner mt-4">
            Complete shifts, build trust, and get paid fast. Your completed shifts move through confirmation and payout automatically.
          </div>
        </section>
      </div>

      <AdminContactCard
        title="Need admin help?"
        description="If anything is unclear with shifts, profile checks, or payout status, message admin here."
        subjectPlaceholder="Issue with shift, profile, or payout"
      />
    </div>
  );
}
