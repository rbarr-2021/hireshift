import type {
  BookingRecord,
  BusinessProfileRecord,
  MarketplaceUserRecord,
  PaymentRecord,
  WorkerProfileRecord,
} from "@/lib/models";
import { formatBookingLifecycleLabel, formatPaymentStatus } from "@/lib/payments";

export type AdminBookingSummary = {
  booking: BookingRecord;
  payment: PaymentRecord | null;
  workerName: string;
  businessName: string;
  lifecycleLabel: string;
  paymentLabel: string;
};

export function buildAdminBookingSummaries(input: {
  bookings: BookingRecord[];
  payments: PaymentRecord[];
  workerUsers: MarketplaceUserRecord[];
  workerProfiles: WorkerProfileRecord[];
  businessUsers: MarketplaceUserRecord[];
  businessProfiles: BusinessProfileRecord[];
}) {
  return input.bookings.map<AdminBookingSummary>((booking) => {
    const payment =
      input.payments.find((candidate) => candidate.booking_id === booking.id) ?? null;
    const workerUser = input.workerUsers.find((candidate) => candidate.id === booking.worker_id);
    const workerProfile = input.workerProfiles.find(
      (candidate) => candidate.user_id === booking.worker_id,
    );
    const businessUser = input.businessUsers.find(
      (candidate) => candidate.id === booking.business_id,
    );
    const businessProfile = input.businessProfiles.find(
      (candidate) => candidate.user_id === booking.business_id,
    );

    return {
      booking,
      payment,
      workerName:
        workerUser?.display_name || workerProfile?.job_role || "Worker",
      businessName:
        businessProfile?.business_name || businessUser?.display_name || "Business",
      lifecycleLabel: formatBookingLifecycleLabel(booking, payment),
      paymentLabel: payment ? formatPaymentStatus(payment.status) : "Unpaid",
    };
  });
}

