export function buildOnboardingDraftKey(input: {
  form: "worker_setup" | "business_setup";
  userId?: string | null;
  email?: string | null;
}) {
  const identity =
    input.userId?.trim() ||
    input.email?.trim().toLowerCase() ||
    "anonymous";
  return `nexhyr:onboarding-draft:${input.form}:${identity}`;
}

export function readOnboardingDraft<T>(key: string): T | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeOnboardingDraft<T>(key: string, value: T) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage write failures
  }
}

export function clearOnboardingDraft(key: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore storage clear failures
  }
}
