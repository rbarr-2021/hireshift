"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { UserRecord } from "@/lib/models";

type AuthGuardProps = {
  children: React.ReactNode;
  requireOnboarding?: boolean;
};

export function AuthGuard({
  children,
  requireOnboarding = false,
}: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let active = true;

    const checkSession = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!active) {
        return;
      }

      if (!user) {
        router.replace("/login");
        return;
      }

      if (!requireOnboarding) {
        setIsReady(true);
        return;
      }

      const { data: appUser } = await supabase
        .from("users")
        .select("role, onboarding_complete")
        .eq("id", user.id)
        .maybeSingle<UserRecord>();

      if (!active) {
        return;
      }

      if (!appUser?.role) {
        router.replace("/role-select");
        return;
      }

      if (!appUser.onboarding_complete) {
        const onboardingPath =
          appUser.role === "worker"
            ? "/profile/setup/worker"
            : "/profile/setup/business";

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
  }, [pathname, requireOnboarding, router]);

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
            Checking your session and getting the right dashboard ready.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
