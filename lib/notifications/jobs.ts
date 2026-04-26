import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  sendBookingConfirmationEmail,
  sendBookingConfirmationBusinessEmail,
  sendBookingReminderEmail,
  sendBookingReminderBusinessEmail,
} from "@/lib/notifications/email";
import {
  sendBookingConfirmationWhatsApp,
  sendBookingReminderWhatsApp,
} from "@/lib/notifications/whatsapp";

type NotificationJobRow = {
  id: string;
  booking_id: string;
  recipient_user_id: string;
  job_type: "booking_confirmation" | "booking_reminder_24h";
  channel: "whatsapp" | "email";
  status: "pending" | "processing" | "sent" | "skipped" | "failed" | "cancelled";
  scheduled_for: string;
  attempts: number;
  metadata: Record<string, unknown> | null;
};

type BookingRow = {
  id: string;
  worker_id: string;
  business_id: string;
  shift_date: string;
  shift_end_date: string | null;
  shift_listing_id: string | null;
  start_time: string;
  end_time: string;
  location: string;
  status: string;
};

type UserRow = {
  id: string;
  phone: string | null;
  whatsapp_opt_in: boolean;
  email: string | null;
  display_name: string | null;
};

type BusinessProfileRow = {
  user_id: string;
  business_name: string;
  contact_name: string | null;
};

type WorkerProfileRow = {
  user_id: string;
  job_role: string | null;
};

type ShiftListingSummary = {
  id: string;
  role_label: string;
  title: string | null;
};

async function claimJob(job: NotificationJobRow) {
  const supabaseAdmin = getSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("notification_jobs")
    .update({
      status: "processing",
      locked_at: new Date().toISOString(),
      attempts: job.attempts + 1,
    })
    .eq("id", job.id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle<NotificationJobRow>();

  if (error) {
    throw error;
  }

  return data;
}

async function markJob(
  jobId: string,
  existingMetadata: Record<string, unknown> | null | undefined,
  status: "sent" | "skipped" | "failed",
  details: {
    providerMessageId?: string | null;
    reason?: string;
    lastError?: string;
  } = {},
) {
  const supabaseAdmin = getSupabaseAdminClient();
  const metadataUpdate: Record<string, unknown> = {
    ...(existingMetadata ?? {}),
  };

  if (details.providerMessageId) {
    metadataUpdate.provider_message_id = details.providerMessageId;
  }

  if (details.reason) {
    metadataUpdate.reason = details.reason;
  }

  const { error } = await supabaseAdmin
    .from("notification_jobs")
    .update({
      status,
      locked_at: null,
      processed_at: new Date().toISOString(),
      last_error: details.lastError ?? null,
      metadata: metadataUpdate,
    })
    .eq("id", jobId);

  if (error) {
    throw error;
  }
}

export async function processDueNotificationJobs(options?: {
  recipientUserId?: string;
  limit?: number;
}) {
  const supabaseAdmin = getSupabaseAdminClient();
  let jobsQuery = supabaseAdmin
    .from("notification_jobs")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(options?.limit ?? 25);

  if (options?.recipientUserId) {
    jobsQuery = jobsQuery.eq("recipient_user_id", options.recipientUserId);
  }

  const { data: jobs, error } = await jobsQuery;

  if (error) {
    throw new Error(`Unable to load notification jobs: ${error.message}`);
  }

  const summary = {
    processed: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
  };

  for (const rawJob of (jobs as NotificationJobRow[] | null) ?? []) {
    const claimedJob = await claimJob(rawJob);

    if (!claimedJob) {
      continue;
    }

    summary.processed += 1;

      try {
      const [{ data: booking, error: bookingError }, { data: recipient, error: recipientError }] =
        await Promise.all([
          supabaseAdmin
            .from("bookings")
            .select("*")
            .eq("id", claimedJob.booking_id)
            .maybeSingle<BookingRow>(),
          supabaseAdmin
            .from("users")
            .select("id,phone,whatsapp_opt_in,email,display_name")
            .eq("id", claimedJob.recipient_user_id)
            .maybeSingle<UserRow>(),
        ]);

      if (bookingError) {
        throw bookingError;
      }

      if (recipientError) {
        throw recipientError;
      }

      if (!booking || booking.status === "cancelled") {
        await markJob(claimedJob.id, claimedJob.metadata, "skipped", {
          reason: "Booking is no longer active.",
        });
        summary.skipped += 1;
        continue;
      }

      const [businessProfileResult, businessUserResult, workerUserResult, workerProfileResult, shiftListingResult] = await Promise.all([
        supabaseAdmin
          .from("business_profiles")
          .select("user_id,business_name,contact_name")
          .eq("user_id", booking.business_id)
          .maybeSingle<BusinessProfileRow>(),
        supabaseAdmin
          .from("users")
          .select("id,phone,whatsapp_opt_in,email,display_name")
          .eq("id", booking.business_id)
          .maybeSingle<UserRow>(),
        supabaseAdmin
          .from("users")
          .select("id,phone,whatsapp_opt_in,email,display_name")
          .eq("id", booking.worker_id)
          .maybeSingle<UserRow>(),
        supabaseAdmin
          .from("worker_profiles")
          .select("user_id,job_role")
          .eq("user_id", booking.worker_id)
          .maybeSingle<WorkerProfileRow>(),
        booking.shift_listing_id
          ? supabaseAdmin
              .from("shift_listings")
              .select("id,role_label,title")
              .eq("id", booking.shift_listing_id)
              .maybeSingle<ShiftListingSummary>()
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (businessProfileResult.error) {
        throw businessProfileResult.error;
      }

      if (businessUserResult.error) {
        throw businessUserResult.error;
      }

      if (workerUserResult.error) {
        throw workerUserResult.error;
      }

      if (workerProfileResult.error) {
        throw workerProfileResult.error;
      }

      if (shiftListingResult.error) {
        throw shiftListingResult.error;
      }

      const roleLabel =
        shiftListingResult.data?.title ||
        shiftListingResult.data?.role_label ||
        workerProfileResult.data?.job_role ||
        null;

      const workerContext = {
        bookingId: booking.id,
        userId: booking.worker_id,
        workerEmail: workerUserResult.data?.email ?? null,
        workerName: workerUserResult.data?.display_name ?? null,
        roleLabel,
        businessName: businessProfileResult.data?.business_name ?? "NexHyr business",
        shiftDate: booking.shift_date,
        shiftEndDate: booking.shift_end_date,
        startTime: booking.start_time,
        endTime: booking.end_time,
        location: booking.location,
      };
      const businessContext = {
        bookingId: booking.id,
        userId: booking.business_id,
        businessEmail: businessUserResult.data?.email ?? null,
        businessContactName:
          businessProfileResult.data?.contact_name ?? businessUserResult.data?.display_name ?? null,
        workerName: workerUserResult.data?.display_name ?? null,
        roleLabel,
        businessName: businessProfileResult.data?.business_name ?? "NexHyr business",
        shiftDate: booking.shift_date,
        shiftEndDate: booking.shift_end_date,
        startTime: booking.start_time,
        endTime: booking.end_time,
        location: booking.location,
      };

      const isWorkerRecipient = claimedJob.recipient_user_id === booking.worker_id;

      const result =
        claimedJob.channel === "whatsapp"
          ? claimedJob.job_type === "booking_confirmation"
            ? await sendBookingConfirmationWhatsApp({
                workerPhone: recipient?.phone ?? null,
                workerWhatsAppOptIn: recipient?.whatsapp_opt_in ?? false,
                roleLabel,
                businessName: businessProfileResult.data?.business_name ?? "NexHyr business",
                shiftDate: booking.shift_date,
                shiftEndDate: booking.shift_end_date,
                startTime: booking.start_time,
                endTime: booking.end_time,
                location: booking.location,
              })
            : await sendBookingReminderWhatsApp({
                workerPhone: recipient?.phone ?? null,
                workerWhatsAppOptIn: recipient?.whatsapp_opt_in ?? false,
                roleLabel,
                businessName: businessProfileResult.data?.business_name ?? "NexHyr business",
                shiftDate: booking.shift_date,
                shiftEndDate: booking.shift_end_date,
                startTime: booking.start_time,
                endTime: booking.end_time,
                location: booking.location,
              })
          : claimedJob.job_type === "booking_confirmation"
            ? isWorkerRecipient
              ? await sendBookingConfirmationEmail(workerContext)
              : await sendBookingConfirmationBusinessEmail(businessContext)
            : isWorkerRecipient
              ? await sendBookingReminderEmail(workerContext)
              : await sendBookingReminderBusinessEmail(businessContext);

      if (result.status === "skipped") {
        await markJob(claimedJob.id, claimedJob.metadata, "skipped", {
          reason: result.reason,
        });
        summary.skipped += 1;
        continue;
      }

      if (claimedJob.channel === "email" && isWorkerRecipient) {
        if (claimedJob.job_type === "booking_confirmation") {
          await sendBookingConfirmationBusinessEmail(businessContext);
        } else if (claimedJob.job_type === "booking_reminder_24h") {
          await sendBookingReminderBusinessEmail(businessContext);
        }
      }

      await markJob(claimedJob.id, claimedJob.metadata, "sent", {
        providerMessageId: result.providerMessageId,
      });
      summary.sent += 1;
    } catch (jobError) {
      const message =
        jobError instanceof Error ? jobError.message : "Unexpected notification job failure.";

      console.error("[notification-jobs] processing failed", {
        jobId: claimedJob.id,
        jobType: claimedJob.job_type,
        message,
      });

      await markJob(claimedJob.id, claimedJob.metadata, "failed", {
        lastError: message,
      });
      summary.failed += 1;
    }
  }

  return summary;
}
