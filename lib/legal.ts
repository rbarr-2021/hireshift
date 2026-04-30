import type { UserRecord } from "@/lib/models";

export const CURRENT_TERMS_VERSION = "2026-04-30";
export const CURRENT_PRIVACY_VERSION = "2026-04-30";
export const LEGAL_ACCEPTANCE_PATH = "/legal/accept";

export function requiresLegalAcceptance(user: UserRecord | null | undefined) {
  if (!user) {
    return false;
  }

  if (user.role !== "worker" && user.role !== "business") {
    return false;
  }

  return !(
    user.terms_accepted_at &&
    user.privacy_accepted_at &&
    user.terms_version === CURRENT_TERMS_VERSION &&
    user.privacy_version === CURRENT_PRIVACY_VERSION
  );
}
