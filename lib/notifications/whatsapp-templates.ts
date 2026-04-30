type ShiftMessageContext = {
  workerName?: string | null;
  businessName: string;
  shiftDate: string;
  startTime: string;
};

function greeting(name?: string | null) {
  return name?.trim() ? `Hi ${name.trim()},` : "Hi,";
}

export function buildWhatsAppBookingConfirmedMessage(context: ShiftMessageContext) {
  return `${greeting(context.workerName)} your shift is confirmed at ${context.businessName} on ${context.shiftDate} at ${context.startTime}.`;
}

export function buildWhatsAppShiftReminderMessage(context: ShiftMessageContext) {
  return `${greeting(context.workerName)} reminder: your shift at ${context.businessName} starts in 24 hours (${context.shiftDate}, ${context.startTime}).`;
}

export function buildWhatsAppShiftStartingSoonMessage(context: ShiftMessageContext) {
  return `${greeting(context.workerName)} your shift at ${context.businessName} starts soon (${context.startTime}).`;
}

export function buildWhatsAppPayoutProcessingMessage(context: {
  workerName?: string | null;
  businessName: string;
}) {
  return `${greeting(context.workerName)} your hours at ${context.businessName} are approved and your payout is being processed.`;
}

export function buildWhatsAppPayoutCompletedMessage(context: {
  workerName?: string | null;
  amountGbp: number;
}) {
  return `${greeting(context.workerName)} you've been paid GBP ${context.amountGbp.toFixed(2)} for your completed shift.`;
}
