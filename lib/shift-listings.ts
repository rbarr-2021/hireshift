import type { ShiftListingRecord } from "@/lib/models";

export function deriveShiftEndDate(
  shiftDate: string,
  startTime: string,
  endTime: string,
) {
  if (!shiftDate || !startTime || !endTime) {
    return shiftDate;
  }

  if (endTime > startTime) {
    return shiftDate;
  }

  const startDate = new Date(`${shiftDate}T12:00:00`);
  startDate.setDate(startDate.getDate() + 1);
  return startDate.toISOString().slice(0, 10);
}

export function getRemainingShiftPositions(listing: ShiftListingRecord) {
  return Math.max(0, listing.open_positions - listing.claimed_positions);
}

export function formatShiftListingStatus(status: ShiftListingRecord["status"]) {
  const labels: Record<ShiftListingRecord["status"], string> = {
    open: "Open",
    claimed: "Claimed",
    cancelled: "Cancelled",
  };

  return labels[status];
}

export function shiftListingStatusClass(status: ShiftListingRecord["status"]) {
  const classes: Record<ShiftListingRecord["status"], string> = {
    open: "status-badge status-badge--ready",
    claimed: "status-badge status-badge--rating",
    cancelled: "bg-stone-200 text-stone-700",
  };

  return classes[status];
}

export function matchesShiftFilters(input: {
  listing: ShiftListingRecord;
  query: string;
  date: string;
  location: string;
  maxRate: string;
}) {
  const { listing, query, date, location, maxRate } = input;

  if (listing.status !== "open") {
    return false;
  }

  if (query.trim()) {
    const normalisedQuery = query.trim().toLowerCase();
    const searchable = [
      listing.role_label,
      listing.title ?? "",
      listing.description ?? "",
      listing.location,
      listing.city ?? "",
    ]
      .join(" ")
      .toLowerCase();

    if (!searchable.includes(normalisedQuery)) {
      return false;
    }
  }

  if (date && listing.shift_date !== date) {
    return false;
  }

  if (location.trim()) {
    const nextLocation = location.trim().toLowerCase();
    const searchableLocation = [listing.location, listing.city ?? ""]
      .join(" ")
      .toLowerCase();

    if (!searchableLocation.includes(nextLocation)) {
      return false;
    }
  }

  if (maxRate && listing.hourly_rate_gbp > Number(maxRate)) {
    return false;
  }

  return true;
}
