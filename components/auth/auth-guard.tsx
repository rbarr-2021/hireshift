"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { registerAuthListener, supabase } from "@/lib/supabase";
import {
  getRoleHome,
  getRoleSetupPath,
  hasSelectedRole,
  resolveAuthState,
} from "@/lib/auth-client";
import { clearSessionHintCookie } from "@/lib/session-hint";
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const redirectToLogin = useCallback(
    (reason: "verified-login" | "session-required") => {
      const next = new URLSearchParams({
        message: reason,
      });
      router.replace(`/login?${next.toString()}`);
    },
    [router],
  );

  useEffect(() => {
    let active = true;
    const timeout = window.setTimeout(() => {
      if (active) {
        if (pathname === "/role-select") {
          redirectToLogin("verified-login");
          return;
        }

        redirectToLogin("session-required");
      }
    }, 7000);

    const checkSession = async () => {
      try {
        const resolved = await resolveAuthState();

        if (!active) {
          return;
        }

        if (!resolved) {
          redirectToLogin(pathname === "/role-select" ? "verified-login" : "session-required");
          return;
        }

        const { appUser } = resolved;

        if (!appUser) {
          await supabase.auth.signOut();
          clearSessionHintCookie();
          redirectToLogin(pathname === "/role-select" ? "verified-login" : "session-required");
          return;
        }

        if (!hasSelectedRole(appUser)) {
          if (pathname === "/role-select") {
            setIsReady(true);
            return;
          }

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
    } catch (error) {
      const nextMessage =
        error instanceof Error
            ? error.message
            : "Unexpected auth guard error. Please sign in again.";
        clearSessionHintCookie();
        await supabase.auth.signOut();
        if (pathname === "/role-select") {
          redirectToLogin("verified-login");
          return;
        }

        setErrorMessage(nextMessage);
        redirectToLogin("session-required");
      }
    };

    void checkSession();

    const unsubscribeAuthListener = registerAuthListener("auth-guard", (event) => {
      if (event === "SIGNED_OUT") {
        clearSessionHintCookie();
        router.replace("/login");
      }
    });

    return () => {
      active = false;
      window.clearTimeout(timeout);
      unsubscribeAuthListener();
    };
  }, [allowedRoles, pathname, redirectToLogin, requireOnboarding, router]);

  if (errorMessage) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-6">
        <div className="panel w-full max-w-md p-8 text-center">
          <p className="text-sm uppercase tracking-[0.3em] text-stone-500">
            KruVo
          </p>
          <h1 className="mt-4 text-2xl font-semibold text-stone-900">
            We hit a session problem
          </h1>
          <p className="info-banner mt-4">{errorMessage}</p>
          <button
            type="button"
            onClick={() => router.replace("/login")}
            className="primary-btn mt-6 w-full"
          >
            Back to login
          </button>
        </div>
      </div>
    );
  }

  if (!isReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-6">
        <div className="panel w-full max-w-md p-8 text-center">
          <p className="text-sm uppercase tracking-[0.3em] text-stone-500">
            KruVo
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
