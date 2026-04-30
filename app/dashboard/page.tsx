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
      router.replace("/login?message=session-required");
      return;
    }

    if (appUser.role === "admin") {
      router.replace("/admin");
      return;
    }

    if (!hasSelectedRole(appUser)) {
      router.replace("/role-select");
      return;
    }

    if (!appUser.onboarding_complete) {
      const target = getRoleEntryPath(appUser.role, false);
      router.replace(target);
      return;
    }

    const target = getRoleHome(appUser.role);
    router.replace(target);
  }, [appUser, authUserId, hasSession, loading, router]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <p className="text-sm text-stone-600">Preparing your dashboard...</p>
    </div>
  );
}
