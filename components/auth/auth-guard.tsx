"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getRoleHome, getRoleSetupPath, resolveAuthState } from "@/lib/auth-client";
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
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let active = true;

    const checkSession = async () => {
      const resolved = await resolveAuthState();

      if (!active) {
        return;
      }

      if (!resolved) {
        router.replace("/login");
        return;
      }

      const { appUser } = resolved;

      if (!appUser) {
        await supabase.auth.signOut();
        router.replace("/login");
        return;
      }

      if (!appUser.role) {
        router.replace("/role-select");
        return;
      }

      if (allowedRoles && !allowedRoles.includes(appUser.role)) {
        router.replace(getRoleHome(appUser.role));
        return;
      }

      if (requireOnboarding && !appUser.onboarding_complete) {
        const onboardingPath = getRoleSetupPath(appUser.role);

        if (pathname !== onboardingPath) {
          router.replace(onboardingPath);
          return;
        }
      }

      setIsReady(true);
    };

    void checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        router.replace("/login");
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [allowedRoles, pathname, requireOnboarding, router]);

  if (!isReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-100 px-6">
        <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm uppercase tracking-[0.3em] text-stone-500">
            HireShift
          </p>
          <h1 className="mt-4 text-2xl font-semibold text-stone-900">
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
