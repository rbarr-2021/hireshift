import type {
  BookingRecord,
  WorkerReliabilityRecord,
  WorkerReliabilityStatus,
} from "@/lib/models";

export const RELIABILITY_RULES = {
  lateCancellationHours: 24,
  lateCancellationStrikeValue: 1,
  noShowStrikeValue: 2,
  warningStrikeThreshold: 1,
  strongWarningStrikeThreshold: 2,
  blockStrikeThreshold: 3,
  blockDurationDays: 7,
} as const;

function toDateTime(date: string, time: string) {
  return new Date(`${date}T${time}`);
}

export function getBookingStartDateTime(booking: Pick<BookingRecord, "shift_date" | "start_time">) {
  return toDateTime(booking.shift_date, booking.start_time);
}

export function getBookingEndDateTime(
  booking: Pick<BookingRecord, "shift_date" | "shift_end_date" | "end_time">,
) {
  return toDateTime(booking.shift_end_date ?? booking.shift_date, booking.end_time);
}

export function isLateCancellationWindow(
  booking: Pick<BookingRecord, "shift_date" | "start_time">,
  now = new Date(),
) {
  const shiftStart = getBookingStartDateTime(booking);
  const msUntilShift = shiftStart.getTime() - now.getTime();
  return msUntilShift < RELIABILITY_RULES.lateCancellationHours * 60 * 60 * 1000;
}

export function formatReliabilityStatus(status: WorkerReliabilityStatus) {
  const labels: Record<WorkerReliabilityStatus, string> = {
    good_standing: "Good standing",
    warned: "Reliability warning",
    temporarily_blocked: "Temporarily blocked",
  };

  return labels[status];
}

export function reliabilityStatusClass(status: WorkerReliabilityStatus) {
  const classes: Record<WorkerReliabilityStatus, string> = {
    good_standing: "status-badge status-badge--ready",
    warned: "status-badge",
    temporarily_blocked: "bg-red-100 text-red-900",
  };

  return classes[status];
}

export function isWorkerBlocked(summary: WorkerReliabilityRecord | null | undefined) {
  if (!summary?.blocked_until) {
    return false;
  }

  return new Date(summary.blocked_until).getTime() > Date.now();
}

export function formatBlockedUntil(blockedUntil: string | null | undefined) {
  if (!blockedUntil) {
    return null;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(blockedUntil));
}
