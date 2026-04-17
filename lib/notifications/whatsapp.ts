import { formatBookingDate, formatBookingTimeRange } from "@/lib/bookings";
import { sendWhatsAppMessage, type WhatsAppSendResult } from "@/lib/notifications/provider";

type BookingNotificationContext = {
  workerPhone: string | null;
  workerWhatsAppOptIn: boolean;
  roleLabel: string | null;
  businessName: string;
  shiftDate: string;
  shiftEndDate: string | null;
  startTime: string;
  endTime: string;
  location: string;
};

function normalisePhoneNumber(phone: string | null) {
  if (!phone) {
    return null;
  }

  const cleaned = phone.replace(/[^\d+]/g, "");

  if (!cleaned.startsWith("+")) {
    return null;
  }

  return cleaned;
}

function shouldSkipWhatsApp(context: BookingNotificationContext) {
  if (!context.workerWhatsAppOptIn) {
    return "Worker has not opted into WhatsApp notifications.";
  }

  if (!normalisePhoneNumber(context.workerPhone)) {
    return "Worker phone number is missing or not in international format.";
  }

  return null;
}

function buildConfirmationMessage(context: BookingNotificationContext) {
  const role = context.roleLabel || "your role";
  return `You’re booked for ${role} at ${context.businessName} on ${formatBookingDate(
    context.shiftDate,
  )} at ${formatBookingTimeRange(
    context.startTime,
    context.endTime,
    context.shiftDate,
    context.shiftEndDate,
  )}. Nice one - another shift secured.`;
}

function buildReminderMessage(context: BookingNotificationContext) {
  return `Reminder: your shift at ${context.businessName} starts in 24 hours.`;
}

export async function sendBookingConfirmationWhatsApp(
  context: BookingNotificationContext,
): Promise<WhatsAppSendResult> {
  const skipReason = shouldSkipWhatsApp(context);

  if (skipReason) {
    return {
      status: "skipped",
      reason: skipReason,
    };
  }

  return sendWhatsAppMessage({
    to: normalisePhoneNumber(context.workerPhone)!,
    body: buildConfirmationMessage(context),
  });
}

export async function sendBookingReminderWhatsApp(
  context: BookingNotificationContext,
): Promise<WhatsAppSendResult> {
  const skipReason = shouldSkipWhatsApp(context);

  if (skipReason) {
    return {
      status: "skipped",
      reason: skipReason,
    };
  }

  return sendWhatsAppMessage({
    to: normalisePhoneNumber(context.workerPhone)!,
    body: buildReminderMessage(context),
  });
}
