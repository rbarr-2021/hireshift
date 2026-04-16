"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthState } from "@/components/auth/auth-provider";
import {
  getRoleEntryPath,
  getRoleHome,
  hasSelectedRole,
} from "@/lib/auth-client";

export default function DashboardPage() {
  const router = useRouter();
  const { loading, hasSession, authUserId, appUser } = useAuthState();

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!hasSession || !authUserId || !appUser) {
      console.info("[auth] redirect decision", {
        reason: "dashboard-to-login",
        pathname: "/dashboard",
        hasSession,
        authUserId,
        role: appUser?.role ?? null,
      });
      router.replace("/login?message=session-required");
      return;
    }

    if (!hasSelectedRole(appUser)) {
      console.info("[auth] redirect decision", {
        reason: "dashboard-to-role-select",
        pathname: "/dashboard",
        hasSession,
        authUserId,
        role: appUser.role,
      });
      router.replace("/role-select");
      return;
    }

    if (!appUser.onboarding_complete) {
      const target = getRoleEntryPath(appUser.role, false);
      console.info("[auth] redirect decision", {
        reason: appUser.role === "worker" ? "dashboard-to-shifts" : "dashboard-to-onboarding",
        pathname: "/dashboard",
        hasSession,
        authUserId,
        role: appUser.role,
        target,
      });
      router.replace(target);
      return;
    }

    const target = getRoleHome(appUser.role);
    console.info("[auth] redirect decision", {
      reason: "dashboard-to-home",
      pathname: "/dashboard",
      hasSession,
      authUserId,
      role: appUser.role,
      target,
    });
    router.replace(target);
  }, [appUser, authUserId, hasSession, loading, router]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <p className="text-sm text-stone-600">Preparing your dashboard...</p>
    </div>
  );
}
