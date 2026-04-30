import type {
  ArrivalConfirmationStatus,
  AttendanceStatus,
  BookingRecord,
  BookingStatus,
  PaymentRecord,
} from "@/lib/models";

function buildDateTime(date: string, time: string) {
  return new Date(`${date}T${time}`);
}

const SHIFT_START_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

const SHIFT_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const SHIFT_START_LEGACY_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const SHIFT_DAY_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

export function formatBookingStatus(status: BookingStatus) {
  const labels: Record<BookingStatus, string> = {
    pending: "Pending",
    accepted: "Accepted",
    declined: "Declined",
    completed: "Completed",
    cancelled: "Cancelled",
    no_show: "No-show",
  };

  return labels[status];
}

export function bookingStatusClass(status: BookingStatus) {
  const classes: Record<BookingStatus, string> = {
    pending: "status-badge",
    accepted: "status-badge status-badge--ready",
    declined: "bg-red-100 text-red-900",
    completed: "status-badge status-badge--rating",
    cancelled: "bg-stone-200 text-stone-700",
    no_show: "bg-red-100 text-red-900",
  };

  return classes[status];
}

export function formatBookingDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

export function formatBookingTimeRange(
  startTime: string,
  endTime: string,
  shiftDate?: string | null,
  shiftEndDate?: string | null,
) {
  const suffix =
    shiftDate && shiftEndDate && shiftEndDate > shiftDate ? " (next day)" : "";
  return `${startTime.slice(0, 5)} - ${endTime.slice(0, 5)}${suffix}`;
}

export function formatShiftStartLabel(
  booking: Pick<BookingRecord, "shift_date" | "start_time">,
) {
  const start = getBookingStartDateTime(booking);
  const dayLabel = SHIFT_START_FORMATTER.format(start);
  const timeLabel = SHIFT_TIME_FORMATTER.format(start);

  if (dayLabel && timeLabel) {
    return `Starts ${dayLabel} at ${timeLabel}`;
  }

  return `Starts ${SHIFT_START_LEGACY_FORMATTER.format(start)}`;
}

export function formatShiftDateTimeRange(
  booking: Pick<BookingRecord, "shift_date" | "start_time" | "end_time">,
) {
  const dayLabel = SHIFT_DAY_FORMATTER.format(
    new Date(`${booking.shift_date}T12:00:00`),
  );
  return `${dayLabel}, ${booking.start_time.slice(0, 5)}–${booking.end_time.slice(0, 5)}`;
}

export function calculateBookingDurationHours(
  startTime: string,
  endTime: string,
  shiftDate?: string | null,
  shiftEndDate?: string | null,
) {
  if (shiftDate && shiftEndDate) {
    const start = buildDateTime(shiftDate, startTime);
    const end = buildDateTime(shiftEndDate, endTime);
    const durationMinutes = (end.getTime() - start.getTime()) / 60000;

    if (Number.isNaN(durationMinutes) || durationMinutes <= 0) {
      return 0;
    }

    return durationMinutes / 60;
  }

  const [startHours, startMinutes] = startTime.split(":").map(Number);
  const [endHours, endMinutes] = endTime.split(":").map(Number);
  const startTotalMinutes = startHours * 60 + startMinutes;
  const endTotalMinutes = endHours * 60 + endMinutes;

  if (Number.isNaN(startTotalMinutes) || Number.isNaN(endTotalMinutes)) {
    return 0;
  }

  const durationMinutes = endTotalMinutes - startTotalMinutes;

  if (durationMinutes <= 0) {
    return 0;
  }

  return durationMinutes / 60;
}

export function isPastBooking(booking: BookingRecord) {
  return getBookingEndDateTime(booking).getTime() < Date.now();
}

export function getBookingStartDateTime(
  booking: Pick<BookingRecord, "shift_date" | "start_time">,
) {
  return new Date(`${booking.shift_date}T${booking.start_time}`);
}

export function getBookingEndDateTime(
  booking: Pick<BookingRecord, "shift_date" | "shift_end_date" | "end_time">,
) {
  return new Date(`${booking.shift_end_date ?? booking.shift_date}T${booking.end_time}`);
}

export function formatAttendanceTimestamp(timestamp?: string | null) {
  if (!timestamp) {
    return null;
  }

  const parsed = new Date(timestamp);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

export function calculateHoursBetweenTimestamps(
  startedAt: string | null | undefined,
  endedAt: string | null | undefined,
) {
  if (!startedAt || !endedAt) {
    return null;
  }

  const started = new Date(startedAt);
  const ended = new Date(endedAt);
  const durationMinutes = (ended.getTime() - started.getTime()) / 60000;

  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return null;
  }

  return Math.round((durationMinutes / 60) * 100) / 100;
}

export function formatHoursValue(hours: number | null | undefined) {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) {
    return null;
  }

  const rounded = Math.round(hours * 100) / 100;
  return `${rounded.toFixed(2)}h`;
}

export function getCheckInWindow(
  booking: Pick<BookingRecord, "shift_date" | "start_time">,
) {
  const shiftStart = getBookingStartDateTime(booking);
  const opensAt = new Date(shiftStart.getTime() - 15 * 60 * 1000);
  const closesAt = new Date(shiftStart.getTime() + 30 * 60 * 1000);

  return { opensAt, closesAt, shiftStart };
}

export function isWithinCheckInWindow(
  booking: Pick<BookingRecord, "shift_date" | "start_time">,
  now = new Date(),
) {
  const { opensAt, closesAt } = getCheckInWindow(booking);
  return now >= opensAt && now <= closesAt;
}

export function formatAttendanceStatusLabel(status: AttendanceStatus) {
  const labels: Record<AttendanceStatus, string> = {
    not_started: "Not started",
    checked_in: "Checked in",
    checked_out: "Checked out",
    pending_approval: "Awaiting business approval",
    approved: "Hours approved",
    disputed: "Attendance disputed",
    adjusted: "Hours adjusted",
  };

  return labels[status];
}

export function formatArrivalConfirmationStatusLabel(
  status: ArrivalConfirmationStatus,
) {
  const labels: Record<ArrivalConfirmationStatus, string> = {
    not_checked_in: "Worker not checked in yet",
    worker_checked_in: "Worker checked in",
    business_confirmed: "Arrival confirmed",
    issue_reported: "Arrival issue reported",
  };

  return labels[status];
}

export function formatTimeUntilBooking(
  booking: Pick<BookingRecord, "shift_date" | "start_time">,
  _now = new Date(),
) {
  return formatShiftStartLabel(booking);
}

export function isBookingCancellationLocked(
  booking: BookingRecord,
  payment?: PaymentRecord | null,
) {
  if (
    booking.status === "completed" ||
    booking.status === "cancelled" ||
    booking.status === "declined" ||
    booking.status === "no_show"
  ) {
    return true;
  }

  if (
    booking.attendance_status === "approved" ||
    booking.attendance_status === "adjusted" ||
    booking.attendance_status === "disputed"
  ) {
    return true;
  }

  if (!payment) {
    return false;
  }

  if (
    payment.payout_status === "completed" ||
    payment.payout_status === "paid" ||
    payment.payout_status === "in_progress" ||
    payment.payout_status === "on_hold" ||
    payment.payout_status === "disputed"
  ) {
    return true;
  }

  if (payment.settlement_status === "settled") {
    return true;
  }

  return payment.status === "refunded" || payment.status === "disputed";
}

export function canCancelBooking(
  booking: BookingRecord,
  payment?: PaymentRecord | null,
) {
  return booking.status === "accepted" && !isBookingCancellationLocked(booking, payment);
}
