import { isPastBooking } from "@/lib/bookings";
import type {
  BookingRecord,
  MarketplaceUserRecord,
  WorkerProfileRecord,
} from "@/lib/models";
import type { WorkerSnapshot } from "@/components/business/business-booking-card";

export function buildWorkerSnapshots(input: {
  workerIds: string[];
  workerUsers: MarketplaceUserRecord[];
  workerProfiles: WorkerProfileRecord[];
}) {
  return input.workerIds.reduce<Record<string, WorkerSnapshot>>((accumulator, workerId) => {
    const nextUser = input.workerUsers.find((candidate) => candidate.id === workerId);
    const nextProfile = input.workerProfiles.find((candidate) => candidate.user_id === workerId);

    accumulator[workerId] = {
      name: nextUser?.display_name || nextProfile?.job_role || "Worker",
      role: nextProfile?.job_role || "Hospitality worker",
      city: nextProfile?.city || "",
    };

    return accumulator;
  }, {});
}

export function getPastBusinessBookings(bookings: BookingRecord[]) {
  return bookings.filter(
    (booking) =>
      booking.status === "completed" ||
      booking.status === "no_show" ||
      booking.status === "cancelled" ||
      booking.status === "declined" ||
      isPastBooking(booking),
  );
}
