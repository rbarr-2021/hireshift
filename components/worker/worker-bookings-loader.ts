import type {
  BookingRecord,
  BusinessProfileRecord,
  PaymentRecord,
  UserRecord,
} from "@/lib/models";
import { supabase } from "@/lib/supabase";
import type { WorkerBookingBusinessSnapshot } from "@/components/worker/worker-booking-card";

export async function loadWorkerBookingsSnapshot(workerId: string) {
  const bookingsResult = await supabase
    .from("bookings")
    .select("*")
    .eq("worker_id", workerId)
    .order("shift_date", { ascending: true })
    .order("start_time", { ascending: true });

  const bookings = (bookingsResult.data as BookingRecord[] | null) ?? [];
  const bookingIds = bookings.map((booking) => booking.id);
  const businessIds = [...new Set(bookings.map((booking) => booking.business_id))];
  let businessesById: Record<string, WorkerBookingBusinessSnapshot> = {};
  let paymentsByBookingId: Record<string, PaymentRecord> = {};

  if (businessIds.length > 0) {
    const [businessUsersResult, businessProfilesResult] = await Promise.all([
      supabase.from("users").select("*").in("id", businessIds),
      supabase.from("business_profiles").select("*").in("user_id", businessIds),
    ]);

    const businessUsers = (businessUsersResult.data as UserRecord[] | null) ?? [];
    const businessProfiles =
      (businessProfilesResult.data as BusinessProfileRecord[] | null) ?? [];

    businessesById = businessIds.reduce<Record<string, WorkerBookingBusinessSnapshot>>(
      (accumulator, businessId) => {
        const nextUser = businessUsers.find((candidate) => candidate.id === businessId);
        const nextProfile = businessProfiles.find(
          (candidate) => candidate.user_id === businessId,
        );

        accumulator[businessId] = {
          name: nextProfile?.business_name || nextUser?.display_name || "Business",
          contact: nextProfile?.contact_name || nextUser?.email || "Business contact",
          location: [nextProfile?.address_line_1, nextProfile?.city]
            .filter(Boolean)
            .join(", "),
        };

        return accumulator;
      },
      {},
    );
  }

  if (bookingIds.length > 0) {
    const paymentsResult = await supabase
      .from("payments")
      .select("*")
      .in("booking_id", bookingIds);
    const payments = (paymentsResult.data as PaymentRecord[] | null) ?? [];
    paymentsByBookingId = payments.reduce<Record<string, PaymentRecord>>(
      (accumulator, payment) => {
        accumulator[payment.booking_id] = payment;
        return accumulator;
      },
      {},
    );
  }

  return {
    bookings,
    businessesById,
    paymentsByBookingId,
  };
}
