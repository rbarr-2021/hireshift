"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { registerAuthListener, supabase } from "@/lib/supabase";
import { getRoleHome, getRoleSetupPath, hasSelectedRole, resolveAuthState } from "@/lib/auth-client";
import { clearSessionHintCookie } from "@/lib/session-hint";
import type { UserRecord } from "@/lib/models";

type SiteHeaderProps = {
  compact?: boolean;
};

export function SiteHeader({ compact = false }: SiteHeaderProps) {
  const router = useRouter();
  const [user, setUser] = useState<UserRecord | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;

    const loadUser = async () => {
      const resolved = await resolveAuthState();

      if (!active) {
        return;
      }

      setUser(resolved?.appUser ?? null);
    };

    void loadUser();

    const unsubscribeAuthListener = registerAuthListener("site-header", async (event) => {
      if (event === "SIGNED_OUT") {
        clearSessionHintCookie();
        if (active) {
          setUser(null);
        }
        return;
      }

      const resolved = await resolveAuthState();
      if (active) {
        setUser(resolved?.appUser ?? null);
      }
    });

    return () => {
      active = false;
      unsubscribeAuthListener();
    };
  }, []);

  const handleLogout = async () => {
    setBusy(true);
    await supabase.auth.signOut();
    clearSessionHintCookie();
    router.replace("/login");
  };

  const dashboardHref =
    user && hasSelectedRole(user)
      ? user.onboarding_complete
        ? getRoleHome(user.role)
        : getRoleSetupPath(user.role)
      : "/role-select";

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-black/72 backdrop-blur-xl">
      <div className="public-section flex items-center justify-between gap-4 py-4">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-stone-100 text-lg font-semibold text-stone-900">
            K
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-stone-500">
              KruVo
            </p>
            <p className="text-sm text-stone-600">
              Hospitality crew marketplace
            </p>
          </div>
        </Link>

        <nav className="hidden items-center gap-2 md:flex">
          {user ? (
            <>
              <Link href={dashboardHref} className="secondary-btn px-5">
                {hasSelectedRole(user) ? "Open dashboard" : "Choose role"}
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                disabled={busy}
                className="secondary-btn px-5"
              >
                {busy ? "Signing out..." : "Log out"}
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="secondary-btn px-5">
                Log in
              </Link>
              <Link href="/signup" className="primary-btn px-5">
                {compact ? "Join KruVo" : "Create account"}
              </Link>
            </>
          )}
        </nav>
        <div className="flex items-center gap-2 md:hidden">
          {user ? (
            <>
              <Link href={dashboardHref} className="secondary-btn px-4">
                {hasSelectedRole(user) ? "Dashboard" : "Role"}
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                disabled={busy}
                className="secondary-btn px-4"
              >
                {busy ? "..." : "Log out"}
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="secondary-btn px-4">
                Log in
              </Link>
              <Link href="/signup" className="primary-btn px-4">
                Join
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
