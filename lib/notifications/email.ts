import { formatBookingDate, formatBookingTimeRange } from "@/lib/bookings";
import { sendEmailMessage, type EmailSendResult } from "@/lib/notifications/provider";

type BookingEmailContext = {
  workerEmail: string | null;
  workerName: string | null;
  roleLabel: string | null;
  businessName: string;
  shiftDate: string;
  shiftEndDate: string | null;
  startTime: string;
  endTime: string;
  location: string;
};

function shouldSkipEmail(context: BookingEmailContext) {
  if (!context.workerEmail?.trim()) {
    return "Worker email is missing.";
  }

  return null;
}

function buildGreeting(context: BookingEmailContext) {
  return context.workerName?.trim() ? `Hi ${context.workerName.trim()},` : "Hi,";
}

function buildConfirmationSubject(context: BookingEmailContext) {
  return `Booking confirmed: ${context.businessName} on ${formatBookingDate(context.shiftDate)}`;
}

function buildConfirmationText(context: BookingEmailContext) {
  const role = context.roleLabel || "your role";

  return [
    buildGreeting(context),
    "",
    `You're booked for ${role} at ${context.businessName} on ${formatBookingDate(
      context.shiftDate,
    )} at ${formatBookingTimeRange(
      context.startTime,
      context.endTime,
      context.shiftDate,
      context.shiftEndDate,
    )}. Nice one - another shift secured.`,
    "",
    `Location: ${context.location}`,
    "",
    "See you on shift,",
    "NexHyr",
  ].join("\n");
}

function buildReminderSubject(context: BookingEmailContext) {
  return `Reminder: your shift at ${context.businessName} starts in 24 hours`;
}

function buildReminderText(context: BookingEmailContext) {
  return [
    buildGreeting(context),
    "",
    `Reminder: your shift at ${context.businessName} starts in 24 hours.`,
    "",
    `Date: ${formatBookingDate(context.shiftDate)}`,
    `Time: ${formatBookingTimeRange(
      context.startTime,
      context.endTime,
      context.shiftDate,
      context.shiftEndDate,
    )}`,
    `Location: ${context.location}`,
    "",
    "Good luck,",
    "NexHyr",
  ].join("\n");
}

export async function sendBookingConfirmationEmail(
  context: BookingEmailContext,
): Promise<EmailSendResult> {
  const skipReason = shouldSkipEmail(context);

  if (skipReason) {
    return {
      status: "skipped",
      reason: skipReason,
    };
  }

  return sendEmailMessage({
    to: context.workerEmail!,
    subject: buildConfirmationSubject(context),
    text: buildConfirmationText(context),
  });
}

export async function sendBookingReminderEmail(
  context: BookingEmailContext,
): Promise<EmailSendResult> {
  const skipReason = shouldSkipEmail(context);

  if (skipReason) {
    return {
      status: "skipped",
      reason: skipReason,
    };
  }

  return sendEmailMessage({
    to: context.workerEmail!,
    subject: buildReminderSubject(context),
    text: buildReminderText(context),
  });
}
