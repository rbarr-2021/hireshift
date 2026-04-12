"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  getRoleHome,
  getRoleSetupPath,
  hasSelectedRole,
  resolveAuthState,
} from "@/lib/auth-client";

export default function DashboardPage() {
  const router = useRouter();

  useEffect(() => {
    const routeUser = async () => {
      const resolved = await resolveAuthState();

      if (!resolved) {
        router.replace("/login");
        return;
      }

      const { appUser } = resolved;

      if (!hasSelectedRole(appUser)) {
        router.replace("/role-select");
        return;
      }

      if (!appUser.onboarding_complete) {
        router.replace(getRoleSetupPath(appUser.role));
        return;
      }

      router.replace(getRoleHome(appUser.role));
    };

    void routeUser();
  }, [router]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <p className="text-sm text-stone-600">Preparing your dashboard...</p>
    </div>
  );
}
