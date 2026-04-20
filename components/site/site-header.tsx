"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { registerAuthListener, supabase } from "@/lib/supabase";
import { hasClientAdminAccess } from "@/lib/admin-access-client";
import { getRoleEntryPath, hasSelectedRole, resolveAuthState } from "@/lib/auth-client";
import { clearSessionHintCookie } from "@/lib/session-hint";
import type { UserRecord } from "@/lib/models";

type SiteHeaderProps = {
  compact?: boolean;
};

export function SiteHeader({ compact = false }: SiteHeaderProps) {
  const router = useRouter();
  const [user, setUser] = useState<UserRecord | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;

    const loadUser = async () => {
      const resolved = await resolveAuthState();

      if (!active) {
        return;
      }

      setUser(resolved?.appUser ?? null);
      setIsAdmin(
        resolved?.appUser ? await hasClientAdminAccess(resolved.appUser.id) : false,
      );
    };

    void loadUser();

    const unsubscribeAuthListener = registerAuthListener("site-header", async (event) => {
      if (event === "SIGNED_OUT") {
        clearSessionHintCookie();
        if (active) {
          setUser(null);
          setIsAdmin(false);
        }
        return;
      }

      const resolved = await resolveAuthState();
      if (active) {
        setUser(resolved?.appUser ?? null);
        setIsAdmin(
          resolved?.appUser ? await hasClientAdminAccess(resolved.appUser.id) : false,
        );
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
    isAdmin
      ? "/admin"
      : user && hasSelectedRole(user)
      ? getRoleEntryPath(user.role, user.onboarding_complete)
      : "/role-select";

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-black/72 backdrop-blur-xl">
      <div className="public-section flex items-center justify-between gap-3 py-3 sm:gap-4 sm:py-4">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-stone-100 text-base font-semibold text-stone-900 sm:h-11 sm:w-11 sm:text-lg">
            K
          </span>
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-500 sm:text-xs sm:tracking-[0.28em]">
              KruVii
            </p>
            <p className="hidden text-sm text-stone-600 sm:block">
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
                {compact ? "Join KruVii" : "Create account"}
              </Link>
            </>
          )}
        </nav>
        <div className="flex shrink-0 items-center gap-2 md:hidden">
          {user ? (
            <>
              <Link href={dashboardHref} className="secondary-btn min-w-[96px] px-3">
                {hasSelectedRole(user) ? "Dashboard" : "Role"}
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                disabled={busy}
                className="secondary-btn min-w-[96px] px-3"
              >
                {busy ? "..." : "Log out"}
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="secondary-btn min-w-[84px] px-3">
                Log in
              </Link>
              <Link href="/signup" className="primary-btn min-w-[84px] px-3">
                Join
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
