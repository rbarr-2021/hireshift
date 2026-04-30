import { formatBookingDate, formatBookingTimeRange } from "@/lib/bookings";
import { sendEmail, type EmailSendResult } from "@/lib/email/send-email";

type BookingEmailContext = {
  bookingId?: string | null;
  userId?: string | null;
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

type BookingBusinessEmailContext = {
  bookingId?: string | null;
  userId?: string | null;
  businessEmail: string | null;
  businessContactName: string | null;
  workerName: string | null;
  roleLabel: string | null;
  businessName: string;
  shiftDate: string;
  shiftEndDate: string | null;
  startTime: string;
  endTime: string;
  location: string;
};

type PaymentReceivedEmailContext = {
  bookingId: string;
  workerUserId: string;
  workerEmail: string | null;
  workerName: string | null;
  businessName: string;
  shiftDate: string;
  payoutAmountGbp: number;
};

type HoursApprovedEmailContext = {
  bookingId: string;
  workerUserId: string;
  workerEmail: string | null;
  workerName: string | null;
  businessName: string;
  shiftDate: string;
  approvedHours: number;
};

function shouldSkipEmail(email: string | null) {
  if (!email?.trim()) {
    return "Recipient email is missing.";
  }

  return null;
}

function buildGreeting(name: string | null) {
  return name?.trim() ? `Hi ${name.trim()},` : "Hi,";
}

function buildConfirmationWorkerSubject() {
  return "Your NexHyr shift is confirmed";
}

function buildConfirmationWorkerText(context: BookingEmailContext) {
  const role = context.roleLabel || "your role";

  return [
    buildGreeting(context.workerName),
    "",
    `Your shift is confirmed at ${context.businessName}.`,
    `Role: ${role}`,
    `Date: ${formatBookingDate(context.shiftDate)}`,
    `Time: ${formatBookingTimeRange(
      context.startTime,
      context.endTime,
      context.shiftDate,
      context.shiftEndDate,
    )}`,
    `Location: ${context.location}`,
    "",
    "View shift in NexHyr.",
  ].join("\n");
}

function buildConfirmationWorkerHtml(context: BookingEmailContext) {
  const role = context.roleLabel || "your role";

  return `
    <p style="margin:0 0 12px;">${buildGreeting(context.workerName)}</p>
    <p style="margin:0 0 12px;">Your shift is confirmed at <strong>${context.businessName}</strong>.</p>
    <p style="margin:0 0 8px;"><strong>Role:</strong> ${role}</p>
    <p style="margin:0 0 8px;"><strong>Date:</strong> ${formatBookingDate(context.shiftDate)}</p>
    <p style="margin:0 0 8px;"><strong>Time:</strong> ${formatBookingTimeRange(
      context.startTime,
      context.endTime,
      context.shiftDate,
      context.shiftEndDate,
    )}</p>
    <p style="margin:0 0 16px;"><strong>Location:</strong> ${context.location}</p>
    <p style="margin:0;">View shift in NexHyr.</p>
  `;
}

function buildConfirmationBusinessSubject() {
  return "Your NexHyr booking is confirmed";
}

function buildConfirmationBusinessText(context: BookingBusinessEmailContext) {
  const worker = context.workerName?.trim() || "Worker";
  const role = context.roleLabel || "Role";

  return [
    buildGreeting(context.businessContactName),
    "",
    `Your booking is confirmed with ${worker}.`,
    `Role: ${role}`,
    `Date: ${formatBookingDate(context.shiftDate)}`,
    `Time: ${formatBookingTimeRange(
      context.startTime,
      context.endTime,
      context.shiftDate,
      context.shiftEndDate,
    )}`,
    `Location: ${context.location}`,
    "",
    "View booking in NexHyr.",
  ].join("\n");
}

function buildConfirmationBusinessHtml(context: BookingBusinessEmailContext) {
  const worker = context.workerName?.trim() || "Worker";
  const role = context.roleLabel || "Role";

  return `
    <p style="margin:0 0 12px;">${buildGreeting(context.businessContactName)}</p>
    <p style="margin:0 0 12px;">Your booking is confirmed with <strong>${worker}</strong>.</p>
    <p style="margin:0 0 8px;"><strong>Role:</strong> ${role}</p>
    <p style="margin:0 0 8px;"><strong>Date:</strong> ${formatBookingDate(context.shiftDate)}</p>
    <p style="margin:0 0 8px;"><strong>Time:</strong> ${formatBookingTimeRange(
      context.startTime,
      context.endTime,
      context.shiftDate,
      context.shiftEndDate,
    )}</p>
    <p style="margin:0 0 16px;"><strong>Location:</strong> ${context.location}</p>
    <p style="margin:0;">View booking in NexHyr.</p>
  `;
}

function buildReminderSubject() {
  return "Your NexHyr shift starts tomorrow";
}

function buildWorkerReminderText(context: BookingEmailContext) {
  return [
    buildGreeting(context.workerName),
    "",
    `Reminder: your shift at ${context.businessName} starts in 24 hours.`,
    `Date: ${formatBookingDate(context.shiftDate)}`,
    `Time: ${formatBookingTimeRange(
      context.startTime,
      context.endTime,
      context.shiftDate,
      context.shiftEndDate,
    )}`,
    `Location: ${context.location}`,
    "",
    "Please arrive prepared and on time.",
  ].join("\n");
}

function buildWorkerReminderHtml(context: BookingEmailContext) {
  return `
    <p style="margin:0 0 12px;">${buildGreeting(context.workerName)}</p>
    <p style="margin:0 0 12px;">Reminder: your shift at <strong>${context.businessName}</strong> starts in 24 hours.</p>
    <p style="margin:0 0 8px;"><strong>Date:</strong> ${formatBookingDate(context.shiftDate)}</p>
    <p style="margin:0 0 8px;"><strong>Time:</strong> ${formatBookingTimeRange(
      context.startTime,
      context.endTime,
      context.shiftDate,
      context.shiftEndDate,
    )}</p>
    <p style="margin:0 0 16px;"><strong>Location:</strong> ${context.location}</p>
    <p style="margin:0;">Please arrive prepared and on time.</p>
  `;
}

function buildBusinessReminderText(context: BookingBusinessEmailContext) {
  const worker = context.workerName?.trim() || "Worker";

  return [
    buildGreeting(context.businessContactName),
    "",
    `Reminder: ${worker} is due in 24 hours for your shift.`,
    `Date: ${formatBookingDate(context.shiftDate)}`,
    `Time: ${formatBookingTimeRange(
      context.startTime,
      context.endTime,
      context.shiftDate,
      context.shiftEndDate,
    )}`,
    `Location: ${context.location}`,
    "",
    "View booking in NexHyr.",
  ].join("\n");
}

function buildBusinessReminderHtml(context: BookingBusinessEmailContext) {
  const worker = context.workerName?.trim() || "Worker";

  return `
    <p style="margin:0 0 12px;">${buildGreeting(context.businessContactName)}</p>
    <p style="margin:0 0 12px;">Reminder: <strong>${worker}</strong> is due in 24 hours for your shift.</p>
    <p style="margin:0 0 8px;"><strong>Date:</strong> ${formatBookingDate(context.shiftDate)}</p>
    <p style="margin:0 0 8px;"><strong>Time:</strong> ${formatBookingTimeRange(
      context.startTime,
      context.endTime,
      context.shiftDate,
      context.shiftEndDate,
    )}</p>
    <p style="margin:0 0 16px;"><strong>Location:</strong> ${context.location}</p>
    <p style="margin:0;">View booking in NexHyr.</p>
  `;
}

function buildPaymentReceivedSubject() {
  return "You’ve been paid for your NexHyr shift";
}

function buildPaymentReceivedText(context: PaymentReceivedEmailContext) {
  return [
    buildGreeting(context.workerName),
    "",
    `You’ve been paid GBP ${context.payoutAmountGbp.toFixed(2)} for your shift at ${context.businessName}.`,
    `Shift date: ${formatBookingDate(context.shiftDate)}`,
    "",
    "Your payout is being sent through Stripe and can take a short time to appear in your bank.",
    "",
    "View earnings in your NexHyr dashboard.",
  ].join("\n");
}

function buildPaymentReceivedHtml(context: PaymentReceivedEmailContext) {
  return `
    <p style="margin:0 0 12px;">${buildGreeting(context.workerName)}</p>
    <p style="margin:0 0 12px;">You’ve been paid <strong>GBP ${context.payoutAmountGbp.toFixed(2)}</strong> for your shift at <strong>${context.businessName}</strong>.</p>
    <p style="margin:0 0 8px;"><strong>Shift date:</strong> ${formatBookingDate(context.shiftDate)}</p>
    <p style="margin:0 0 16px;">Your payout is being sent through Stripe and can take a short time to appear in your bank.</p>
    <p style="margin:0;">View earnings in your NexHyr dashboard.</p>
  `;
}

function buildHoursApprovedSubject() {
  return "Hours approved for your NexHyr shift";
}

function buildHoursApprovedText(context: HoursApprovedEmailContext) {
  return [
    buildGreeting(context.workerName),
    "",
    `Your hours have been approved for your shift at ${context.businessName}.`,
    `Shift date: ${formatBookingDate(context.shiftDate)}`,
    `Approved hours: ${context.approvedHours.toFixed(2)}`,
    "",
    "Your payout is now being processed.",
  ].join("\n");
}

function buildHoursApprovedHtml(context: HoursApprovedEmailContext) {
  return `
    <p style="margin:0 0 12px;">${buildGreeting(context.workerName)}</p>
    <p style="margin:0 0 12px;">Your hours have been approved for your shift at <strong>${context.businessName}</strong>.</p>
    <p style="margin:0 0 8px;"><strong>Shift date:</strong> ${formatBookingDate(context.shiftDate)}</p>
    <p style="margin:0 0 16px;"><strong>Approved hours:</strong> ${context.approvedHours.toFixed(2)}</p>
    <p style="margin:0;">Your payout is now being processed.</p>
  `;
}

export async function sendBookingConfirmationEmail(
  context: BookingEmailContext,
): Promise<EmailSendResult> {
  const skipReason = shouldSkipEmail(context.workerEmail);

  if (skipReason) {
    return {
      status: "skipped",
      reason: skipReason,
    };
  }

  return sendEmail({
    to: context.workerEmail!,
    subject: buildConfirmationWorkerSubject(),
    text: buildConfirmationWorkerText(context),
    html: buildConfirmationWorkerHtml(context),
    type: "booking_confirmed_worker",
    bookingId: context.bookingId ?? null,
    userId: context.userId ?? null,
  });
}

export async function sendBookingConfirmationBusinessEmail(
  context: BookingBusinessEmailContext,
): Promise<EmailSendResult> {
  const skipReason = shouldSkipEmail(context.businessEmail);

  if (skipReason) {
    return {
      status: "skipped",
      reason: skipReason,
    };
  }

  return sendEmail({
    to: context.businessEmail!,
    subject: buildConfirmationBusinessSubject(),
    text: buildConfirmationBusinessText(context),
    html: buildConfirmationBusinessHtml(context),
    type: "booking_confirmed_business",
    bookingId: context.bookingId ?? null,
    userId: context.userId ?? null,
  });
}

export async function sendBookingReminderEmail(
  context: BookingEmailContext,
): Promise<EmailSendResult> {
  const skipReason = shouldSkipEmail(context.workerEmail);

  if (skipReason) {
    return {
      status: "skipped",
      reason: skipReason,
    };
  }

  return sendEmail({
    to: context.workerEmail!,
    subject: buildReminderSubject(),
    text: buildWorkerReminderText(context),
    html: buildWorkerReminderHtml(context),
    type: "shift_reminder_24h_worker",
    bookingId: context.bookingId ?? null,
    userId: context.userId ?? null,
  });
}

export async function sendBookingReminderBusinessEmail(
  context: BookingBusinessEmailContext,
): Promise<EmailSendResult> {
  const skipReason = shouldSkipEmail(context.businessEmail);

  if (skipReason) {
    return {
      status: "skipped",
      reason: skipReason,
    };
  }

  return sendEmail({
    to: context.businessEmail!,
    subject: buildReminderSubject(),
    text: buildBusinessReminderText(context),
    html: buildBusinessReminderHtml(context),
    type: "shift_reminder_24h_business",
    bookingId: context.bookingId ?? null,
    userId: context.userId ?? null,
  });
}

export async function sendPaymentReceivedWorkerEmail(
  context: PaymentReceivedEmailContext,
): Promise<EmailSendResult> {
  const skipReason = shouldSkipEmail(context.workerEmail);

  if (skipReason) {
    return {
      status: "skipped",
      reason: skipReason,
    };
  }

  return sendEmail({
    to: context.workerEmail!,
    subject: buildPaymentReceivedSubject(),
    text: buildPaymentReceivedText(context),
    html: buildPaymentReceivedHtml(context),
    type: "payment_received_worker",
    bookingId: context.bookingId,
    userId: context.workerUserId,
  });
}

export async function sendHoursApprovedWorkerEmail(
  context: HoursApprovedEmailContext,
): Promise<EmailSendResult> {
  const skipReason = shouldSkipEmail(context.workerEmail);

  if (skipReason) {
    return {
      status: "skipped",
      reason: skipReason,
    };
  }

  return sendEmail({
    to: context.workerEmail!,
    subject: buildHoursApprovedSubject(),
    text: buildHoursApprovedText(context),
    html: buildHoursApprovedHtml(context),
    type: "hours_approved_worker",
    bookingId: context.bookingId,
    userId: context.workerUserId,
  });
}
