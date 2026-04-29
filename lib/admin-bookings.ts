import type {
  BookingRecord,
  BusinessProfileRecord,
  MarketplaceUserRecord,
  PaymentEventRecord,
  PaymentRecord,
  WorkerProfileRecord,
} from "@/lib/models";
import {
  formatBookingLifecycleLabel,
  getAdminNextActionLabel,
  formatPaymentStatus,
  formatPayoutStatus,
} from "@/lib/payments";

export type AdminBookingSummary = {
  booking: BookingRecord;
  payment: PaymentRecord | null;
  workerName: string;
  businessName: string;
  workerPayoutReady: boolean;
  workerStripeAccountLinked: boolean;
  lifecycleLabel: string;
  paymentLabel: string;
  payoutLabel: string;
  nextActionLabel: string;
  paymentEvents: PaymentEventRecord[];
};

export function buildAdminBookingSummaries(input: {
  bookings: BookingRecord[];
  payments: PaymentRecord[];
  paymentEvents: PaymentEventRecord[];
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

    const paymentEvents = payment
      ? input.paymentEvents
          .filter((candidate) => candidate.payment_id === payment.id)
          .sort(
            (left, right) =>
              Date.parse(right.created_at) - Date.parse(left.created_at),
          )
      : [];

    return {
      booking,
      payment,
      workerName:
        workerUser?.display_name || workerProfile?.job_role || "Worker",
      businessName:
        businessProfile?.business_name || businessUser?.display_name || "Business",
      workerPayoutReady: Boolean(
        workerProfile?.stripe_connect_account_id &&
          workerProfile.stripe_connect_details_submitted &&
          workerProfile.stripe_connect_payouts_enabled,
      ),
      workerStripeAccountLinked: Boolean(workerProfile?.stripe_connect_account_id),
      lifecycleLabel: formatBookingLifecycleLabel(booking, payment),
      paymentLabel: payment ? formatPaymentStatus(payment.status) : "Unpaid",
      payoutLabel: payment ? formatPayoutStatus(payment.payout_status) : "Pending confirmation",
      nextActionLabel: getAdminNextActionLabel({
        payment,
        attendanceStatus: booking.attendance_status,
        approvedHours: booking.business_hours_approved,
        workerProfile: workerProfile ?? null,
      }),
      paymentEvents,
    };
  });
}
