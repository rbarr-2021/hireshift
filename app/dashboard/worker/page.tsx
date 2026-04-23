"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  bookingStatusClass,
  formatTimeUntilBooking,
  formatBookingDate,
  formatBookingStatus,
  formatBookingTimeRange,
  isPastBooking,
} from "@/lib/bookings";
import { supabase } from "@/lib/supabase";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast-provider";
import { processOwnNotificationJobs } from "@/lib/notifications/client";
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
  formatPaymentStatus,
  formatPayoutStatus,
  getLastPaidPayout,
  getPayoutSupportCopy,
  getUpcomingPayout,
  getWorkerShiftStage,
  paymentStatusClass,
  payoutStatusClass,
} from "@/lib/payments";
import {
  formatBlockedUntil,
  formatReliabilityStatus,
  isLateCancellationWindow,
  isWorkerBlocked,
  reliabilityStatusClass,
} from "@/lib/reliability";

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

type BusinessSnapshot = {
  name: string;
  contact: string;
  location: string;
};

function BookingCard({
  booking,
  business,
  actions,
  payment,
  showDetailLink = false,
  countdownNow,
}: {
  booking: BookingRecord;
  business?: BusinessSnapshot;
  actions?: React.ReactNode;
  payment?: PaymentRecord | null;
  showDetailLink?: boolean;
  countdownNow?: Date;
}) {
  const shiftStage = getWorkerShiftStage(booking, payment ?? null);
  const countdownLabel = countdownNow
    ? formatTimeUntilBooking(booking, countdownNow)
    : "";

  return (
    <article className="panel-soft p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-base font-semibold text-stone-900">
            {business?.name || "Business request"}
          </p>
          <p className="mt-1 text-sm text-stone-600">
            {business?.contact || "Hospitality business"}
            {business?.location ? ` | ${business.location}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${bookingStatusClass(booking.status)}`}>
            {formatBookingStatus(booking.status)}
          </span>
          {payment ? (
            <span className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${paymentStatusClass(payment.status)}`}>
              {formatPaymentStatus(payment.status)}
            </span>
          ) : null}
          {payment ? (
            <span className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${payoutStatusClass(payment.payout_status)}`}>
              {formatPayoutStatus(payment.payout_status)}
            </span>
          ) : null}
        </div>
      </div>
      <div className="mt-4 grid gap-3 text-sm text-stone-600 sm:grid-cols-2">
        <p>
          <span className="font-medium text-stone-900">Shift:</span>{" "}
          {formatBookingDate(booking.shift_date)}
        </p>
        <p>
          <span className="font-medium text-stone-900">Time:</span>{" "}
          {formatBookingTimeRange(
            booking.start_time,
            booking.end_time,
            booking.shift_date,
            booking.shift_end_date,
          )}
        </p>
        <p>
          <span className="font-medium text-stone-900">Rate:</span>{" "}
          {formatCurrency(booking.hourly_rate_gbp)}/hr
        </p>
        <p>
          <span className="font-medium text-stone-900">Status:</span>{" "}
          {shiftStage}
        </p>
      </div>
      {countdownLabel ? (
        <div className="mt-4">
          <span className="status-badge status-badge--rating">{countdownLabel}</span>
        </div>
      ) : null}
      {payment ? (
        <p className="mt-4 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm leading-6 text-stone-500">
          {getPayoutSupportCopy(payment.payout_status)}
        </p>
      ) : null}
      {booking.notes ? (
        <p className="mt-4 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm leading-6 text-stone-500">
          {booking.notes}
        </p>
      ) : null}
      {actions || showDetailLink ? (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          {actions}
          {showDetailLink ? (
            <Link
              href={`/dashboard/worker/bookings/${booking.id}`}
              className="secondary-btn w-full px-5 sm:w-auto"
            >
              View details
            </Link>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function EmptyState({
  title,
  description,
  actionHref,
  actionLabel,
}: {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="mobile-empty-state">
      <h3 className="text-lg font-semibold text-stone-900">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-stone-600">{description}</p>
      {actionHref && actionLabel ? (
        <Link href={actionHref} className="primary-btn mt-5 px-6">
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}

export default function WorkerDashboardPage() {
  const { showToast } = useToast();
  const [profile, setProfile] = useState<WorkerProfileRecord | null>(null);
  const [availabilitySlots, setAvailabilitySlots] = useState<WorkerAvailabilitySlotRecord[]>([]);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [paymentsByBookingId, setPaymentsByBookingId] = useState<Record<string, PaymentRecord>>({});
  const [reliability, setReliability] = useState<WorkerReliabilityRecord | null>(null);
  const [businessesById, setBusinessesById] = useState<Record<string, BusinessSnapshot>>({});
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);
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
      let nextBusinessMap: Record<string, BusinessSnapshot> = {};
      let nextPaymentsByBookingId: Record<string, PaymentRecord> = {};

      if (businessIds.length > 0) {
        const [businessUsersResult, businessProfilesResult] = await Promise.all([
          supabase.from("users").select("*").in("id", businessIds),
          supabase.from("business_profiles").select("*").in("user_id", businessIds),
        ]);

        const businessUsers = (businessUsersResult.data as UserRecord[] | null) ?? [];
        const businessProfiles = (businessProfilesResult.data as BusinessProfileRecord[] | null) ?? [];

        nextBusinessMap = businessIds.reduce<Record<string, BusinessSnapshot>>((accumulator, businessId) => {
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

  const incomingRequests = useMemo(
    () => bookings.filter((booking) => booking.status === "pending"),
    [bookings],
  );

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

  const reloadBooking = async (bookingId: string) => {
    const { data } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", bookingId)
      .maybeSingle<BookingRecord>();

    return data ?? null;
  };

  const handleBookingResponse = async (bookingId: string, status: "accepted" | "declined") => {
    setActioningId(bookingId);
    console.info("[worker-bookings] update status", { bookingId, status });

    const { error } = await supabase.rpc("respond_to_booking_request", {
      target_booking_id: bookingId,
      next_status: status,
    });

    setActioningId(null);

    if (error) {
      const description = error?.message || "Unable to update the booking response.";
      console.error("[worker-bookings] update failed", { bookingId, status, error });
      showToast({
        title: "Booking update failed",
        description,
        tone: "error",
      });
      return;
    }

    const data = await reloadBooking(bookingId);

    if (!data) {
      showToast({
        title: "Booking updated",
        description: "Refresh the page to see the latest booking status.",
        tone: "success",
      });
      return;
    }

    setBookings((current) =>
      current.map((booking) => (booking.id === bookingId ? data : booking)),
    );
    showToast({
      title: status === "accepted" ? "Booking accepted" : "Booking declined",
      description:
        status === "accepted"
          ? "The business can now see this shift as confirmed."
          : "The business has been updated that you cannot take this shift.",
      tone: "success",
    });

    if (status === "accepted") {
      const notificationResult = await processOwnNotificationJobs();

      if (!notificationResult.ok) {
        console.warn("[worker-bookings] confirmation notification not sent", {
          bookingId,
          error: notificationResult.error,
        });
        showToast({
          title: "Booking accepted",
          description: "The shift was confirmed, but the confirmation email could not be sent right now.",
          tone: "info",
        });
      }
    }
  };

  const handleCancelBooking = async (booking: BookingRecord) => {
    const warningMessage = isLateCancellationWindow(booking)
      ? "Cancelling this shift now may affect your reliability standing. Continue?"
      : "Cancel this accepted shift?";

    if (typeof window !== "undefined" && !window.confirm(warningMessage)) {
      return;
    }

    setActioningId(booking.id);

    const { error } = await supabase.rpc("worker_cancel_booking", {
      target_booking_id: booking.id,
    });

    setActioningId(null);

    if (error) {
      showToast({
        title: "Cancellation failed",
        description: error.message,
        tone: "error",
      });
      return;
    }

    const refreshedBooking = await reloadBooking(booking.id);
    const refreshedReliability = await supabase
      .from("worker_reliability")
      .select("*")
      .eq("worker_id", booking.worker_id)
      .maybeSingle<WorkerReliabilityRecord>();

    if (refreshedBooking) {
      setBookings((current) =>
        current.map((item) => (item.id === booking.id ? refreshedBooking : item)),
      );
    }

    setReliability(refreshedReliability.data ?? null);
    showToast({
      title: isLateCancellationWindow(booking)
        ? "Late cancellation recorded"
        : "Shift cancelled",
      description: isLateCancellationWindow(booking)
        ? "This cancellation may affect your reliability standing."
        : "This shift has been released.",
      tone: isLateCancellationWindow(booking) ? "info" : "success",
    });
  };

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
          <p className="text-sm font-medium text-stone-500">Incoming requests</p>
          <p className="mt-2 text-3xl font-semibold text-stone-900">{incomingRequests.length}</p>
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
        <section className="panel-soft p-5 sm:col-span-2 xl:col-span-4">
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

      <div className="grid gap-4 xl:grid-cols-3">
        <section className="panel-soft p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-stone-900">Incoming requests</h2>
            <span className="status-badge">{incomingRequests.length}</span>
          </div>
          <div className="mt-4 space-y-4">
            {incomingRequests.length > 0 ? (
              incomingRequests.map((booking) => (
                <BookingCard
                  key={booking.id}
                  booking={booking}
                  business={businessesById[booking.business_id]}
                  payment={paymentsByBookingId[booking.id]}
                  showDetailLink
                  actions={
                    <>
                      <button
                        type="button"
                        onClick={() => void handleBookingResponse(booking.id, "accepted")}
                        disabled={actioningId === booking.id}
                        className="primary-btn w-full px-5 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                      >
                        {actioningId === booking.id ? "Updating..." : "Accept"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleBookingResponse(booking.id, "declined")}
                        disabled={actioningId === booking.id}
                        className="secondary-btn w-full px-5 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                      >
                        Decline
                      </button>
                    </>
                  }
                />
              ))
            ) : (
              <EmptyState
                title="No incoming requests"
                description="When businesses send shift requests, you will be able to accept or decline them here."
              />
            )}
          </div>
        </section>

        <section className="panel-soft p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-stone-900">Accepted jobs</h2>
            <span className="status-badge status-badge--ready">{acceptedJobs.length}</span>
          </div>
          <div className="mt-4 space-y-4">
            {acceptedJobs.length > 0 ? (
              acceptedJobs.map((booking) => (
                <BookingCard
                  key={booking.id}
                  booking={booking}
                  business={businessesById[booking.business_id]}
                  payment={paymentsByBookingId[booking.id]}
                  showDetailLink
                  actions={
                    !isPastBooking(booking) ? (
                      <button
                        type="button"
                        onClick={() => void handleCancelBooking(booking)}
                        disabled={actioningId === booking.id}
                        className="secondary-btn w-full px-5 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                      >
                        {actioningId === booking.id ? "Updating..." : "Cancel shift"}
                      </button>
                    ) : undefined
                  }
                />
              ))
            ) : (
              <EmptyState
                title="No accepted jobs yet"
                description="Accepted bookings will appear here so you can keep track of confirmed work."
              />
            )}
          </div>
        </section>

        <section className="panel-soft p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-stone-900">Upcoming shifts</h2>
            <span className="status-badge status-badge--rating">{upcomingShifts.length}</span>
          </div>
          <div className="mt-4 space-y-4">
            {upcomingShifts.length > 0 ? (
              upcomingShifts.map((booking) => (
                <BookingCard
                  key={booking.id}
                  booking={booking}
                  business={businessesById[booking.business_id]}
                  payment={paymentsByBookingId[booking.id]}
                  showDetailLink
                  countdownNow={countdownNow}
                />
              ))
            ) : (
              <EmptyState
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
    </div>
  );
}
