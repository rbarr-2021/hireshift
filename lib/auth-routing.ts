import type { UserRecord, UserRole } from "./models";

export function hasSelectedRole(
  appUser: UserRecord | null | undefined,
): appUser is UserRecord & { role: UserRole; role_selected: true } {
  return Boolean(appUser?.role && appUser.role_selected);
}

export function getRoleHome(role: UserRole) {
  return role === "worker" ? "/dashboard/worker" : "/dashboard/business";
}

export function getWorkerBrowsePath() {
  return "/shifts";
}

export function getRoleSetupPath(role: UserRole) {
  return role === "worker" ? "/profile/setup/worker" : "/profile/setup/business";
}

export function sanitiseAppRedirectPath(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return null;
  }

  return trimmed;
}

export function getRoleEntryPath(
  role: UserRole,
  onboardingComplete: boolean,
  redirectTo?: string | null,
) {
  const nextRedirect = sanitiseAppRedirectPath(redirectTo);

  if (nextRedirect) {
    return nextRedirect;
  }

  if (role === "worker") {
    return onboardingComplete ? getRoleHome(role) : getWorkerBrowsePath();
  }

  return onboardingComplete ? getRoleHome(role) : getRoleSetupPath(role);
}
