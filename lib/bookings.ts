import type { BookingRecord, BookingStatus } from "@/lib/models";

function buildDateTime(date: string, time: string) {
  return new Date(`${date}T${time}`);
}

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
  const shiftDate = new Date(
    `${booking.shift_end_date ?? booking.shift_date}T${booking.end_time}`,
  );
  return shiftDate.getTime() < Date.now();
}
