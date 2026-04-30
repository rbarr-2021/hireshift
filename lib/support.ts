type SupportContext = {
  accountType?: "worker" | "business" | "admin" | "unknown";
  bookingId?: string | null;
  roleLabel?: string | null;
  shiftDate?: string | null;
};

function normaliseWhatsAppNumber(input: string | undefined) {
  if (!input) {
    return null;
  }

  const cleaned = input.replace(/\D/g, "");
  return cleaned.length >= 8 ? cleaned : null;
}

export function getSupportWhatsAppNumber() {
  return normaliseWhatsAppNumber(process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP_NUMBER);
}

export function getSupportEmail() {
  return process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "support@nexhyr.co.uk";
}

export function buildSupportMessage(context?: SupportContext) {
  const accountType = context?.accountType ?? "unknown";
  const hasBooking = Boolean(context?.bookingId);

  if (hasBooking) {
    return [
      "Hi NexHyr Support, I need help with a booking.",
      "",
      `Booking: ${context?.bookingId ?? "N/A"}`,
      `Role: ${context?.roleLabel ?? "N/A"}`,
      `Date: ${context?.shiftDate ?? "N/A"}`,
      `Account type: ${accountType}`,
      "Issue:",
    ].join("\n");
  }

  return [
    "Hi NexHyr Support, I need help with my account.",
    "",
    `Account type: ${accountType}`,
    "Issue:",
  ].join("\n");
}

export function buildWhatsAppSupportUrl(context?: SupportContext) {
  const number = getSupportWhatsAppNumber();

  if (!number) {
    return null;
  }

  const text = encodeURIComponent(buildSupportMessage(context));
  return `https://wa.me/${number}?text=${text}`;
}

export function buildSupportMailtoUrl(context?: SupportContext) {
  const email = getSupportEmail();
  const subject = context?.bookingId
    ? "NexHyr booking support"
    : "NexHyr account support";
  const body = encodeURIComponent(buildSupportMessage(context));
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${body}`;
}
