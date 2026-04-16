"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthState } from "@/components/auth/auth-provider";
import {
  getRoleHome,
  getRoleSetupPath,
  hasSelectedRole,
} from "@/lib/auth-client";
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
      console.info("[auth] redirect decision", {
        reason: nextReason,
        pathname,
        hasSession,
        authUserId,
        role: null,
      });
      router.replace(`/login?message=${nextReason}`);
      return;
    }

    if (!appUser) {
      const nextReason = pathname === "/role-select" ? "verified-login" : "session-required";
      console.info("[auth] redirect decision", {
        reason: "missing-app-user",
        pathname,
        hasSession,
        authUserId,
        role: null,
      });
      router.replace(`/login?message=${nextReason}`);
      return;
    }

    if (!hasSelectedRole(appUser)) {
      if (pathname === "/role-select") {
        return;
      }

      console.info("[auth] redirect decision", {
        reason: "missing-role-selection",
        pathname,
        hasSession,
        authUserId,
        role: appUser.role,
      });
      router.replace("/role-select");
      return;
    }

    if (allowedRoles && !allowedRoles.includes(appUser.role)) {
      const target = getRoleHome(appUser.role);
      console.info("[auth] redirect decision", {
        reason: "role-mismatch",
        pathname,
        hasSession,
        authUserId,
        role: appUser.role,
        target,
      });
      router.replace(target);
      return;
    }

    if (requireOnboarding && !appUser.onboarding_complete) {
      const onboardingPath = getRoleSetupPath(appUser.role);

      if (pathname !== onboardingPath) {
        console.info("[auth] redirect decision", {
          reason: "onboarding-required",
          pathname,
          hasSession,
          authUserId,
          role: appUser.role,
          target: onboardingPath,
        });
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

  if (authLoading || !isAllowedPath) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-6">
        <div className="panel w-full max-w-md p-5 text-center sm:p-8">
          <p className="text-sm uppercase tracking-[0.3em] text-stone-500">
            KruVii
          </p>
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

  return <>{children}</>;
}
