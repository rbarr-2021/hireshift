const MIN_E164_DIGITS = 8;
const MAX_E164_DIGITS = 15;

export function normaliseInternationalPhoneNumber(phone: string | null | undefined) {
  if (!phone) {
    return null;
  }

  const trimmed = phone.trim();

  if (!trimmed) {
    return null;
  }

  const compact = trimmed.replace(/[\s().-]/g, "");
  const normalisedPrefix = compact.startsWith("00") ? `+${compact.slice(2)}` : compact;
  const cleaned = normalisedPrefix.replace(/(?!^\+)[^\d]/g, "");

  if (!cleaned.startsWith("+")) {
    return null;
  }

  const digits = cleaned.slice(1);

  if (!/^\d+$/.test(digits)) {
    return null;
  }

  if (digits.length < MIN_E164_DIGITS || digits.length > MAX_E164_DIGITS) {
    return null;
  }

  if (digits.startsWith("0")) {
    return null;
  }

  return `+${digits}`;
}

export function isValidInternationalPhoneNumber(phone: string | null | undefined) {
  return Boolean(normaliseInternationalPhoneNumber(phone));
}
