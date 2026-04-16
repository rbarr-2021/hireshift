import { supabase } from "@/lib/supabase";
import { clearSessionHintCookie, setSessionHintCookie } from "@/lib/session-hint";
import type { UserRecord, UserRole } from "@/lib/models";

export type ResolvedAuthState = {
  authUser: NonNullable<Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"]>;
  appUser: UserRecord | null;
};

export async function resolveAuthState(): Promise<ResolvedAuthState | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    clearSessionHintCookie();
    return null;
  }

  setSessionHintCookie();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    await supabase.auth.signOut();
    clearSessionHintCookie();
    return null;
  }

  const { data: appUser } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<UserRecord>();

  return {
    authUser: user,
    appUser: appUser ?? null,
  };
}

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

export function getAppBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "http://localhost:3000";
}

export function getResetPasswordRedirectUrl() {
  return `${getAppBaseUrl()}/reset-password`;
}
