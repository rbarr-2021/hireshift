const MIN_E164_DIGITS = 8;
const MAX_E164_DIGITS = 15;
const UK_COUNTRY_CODE = "44";

export function normaliseInternationalPhoneNumber(phone: string | null | undefined) {
  if (!phone) {
    return null;
  }

  const trimmed = phone.trim();

  if (!trimmed) {
    return null;
  }

  const compact = trimmed.replace(/[\s().-]/g, "");
  const rawDigits = compact.replace(/\D/g, "");
  let cleaned = compact.startsWith("+")
    ? `+${compact.slice(1).replace(/\D/g, "")}`
    : rawDigits.startsWith("00")
      ? `+${rawDigits.slice(2)}`
      : compact;

  if (!cleaned.startsWith("+")) {
    if (rawDigits.startsWith(UK_COUNTRY_CODE)) {
      cleaned = `+${rawDigits}`;
    } else if (rawDigits.startsWith("0")) {
      cleaned = `+${UK_COUNTRY_CODE}${rawDigits.slice(1)}`;
    } else if (rawDigits.startsWith("7") && rawDigits.length === 10) {
      cleaned = `+${UK_COUNTRY_CODE}${rawDigits}`;
    }
  }

  cleaned = cleaned.replace(/(?!^\+)[^\d]/g, "");

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
