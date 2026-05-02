"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthState } from "@/components/auth/auth-provider";
import { NexHyrLogo } from "@/components/brand/nexhyr-logo";
import {
  getRoleHome,
  getRoleSetupPath,
  hasSelectedRole,
} from "@/lib/auth-client";
import { LEGAL_ACCEPTANCE_PATH, requiresLegalAcceptance } from "@/lib/legal";
import type { UserRole } from "@/lib/models";

type AuthGuardProps = {
  children: React.ReactNode;
  requireOnboarding?: boolean;
  allowedRoles?: UserRole[];
};

export function AuthGuard({
  children,
  requireOnboarding = false,
  allowedRoles,
}: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { loading: authLoading, hasSession, authUserId, appUser } = useAuthState();

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!hasSession || !authUserId) {
      const nextReason = pathname === "/role-select" ? "verified-login" : "session-required";
      router.replace(`/login?message=${nextReason}`);
      return;
    }

    if (!appUser) {
      const nextReason = pathname === "/role-select" ? "verified-login" : "session-required";
      router.replace(`/login?message=${nextReason}`);
      return;
    }

    if (!hasSelectedRole(appUser)) {
      if (pathname === "/role-select") {
        return;
      }

      router.replace("/role-select");
      return;
    }

    if (requiresLegalAcceptance(appUser) && pathname !== LEGAL_ACCEPTANCE_PATH) {
      const redirect = encodeURIComponent(pathname);
      router.replace(`${LEGAL_ACCEPTANCE_PATH}?redirect=${redirect}`);
      return;
    }

    if (allowedRoles && !allowedRoles.includes(appUser.role)) {
      const target = getRoleHome(appUser.role);
      router.replace(target);
      return;
    }

    if (requireOnboarding && !appUser.onboarding_complete) {
      const onboardingPath = getRoleSetupPath(appUser.role);

      if (pathname !== onboardingPath) {
        router.replace(onboardingPath);
        return;
      }
    }

  }, [allowedRoles, appUser, authLoading, authUserId, hasSession, pathname, requireOnboarding, router]);

  const isAllowedPath =
    Boolean(hasSession && authUserId && appUser) &&
    (!hasSelectedRole(appUser)
      ? pathname === "/role-select"
      : (!allowedRoles || allowedRoles.includes(appUser.role)) &&
        (!requireOnboarding || appUser.onboarding_complete || pathname === getRoleSetupPath(appUser.role)));

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-6">
        <div className="panel w-full max-w-md p-5 text-center sm:p-8">
          <NexHyrLogo className="justify-center" />
          <h1 className="mt-4 text-xl font-semibold text-stone-900 sm:text-2xl">
            Loading your workspace
          </h1>
          <p className="mt-3 text-sm text-stone-600">
            Checking your session, role, and access rules.
          </p>
        </div>
      </div>
    );
  }

  if (!isAllowedPath) {
    return null;
  }

  return <>{children}</>;
}
