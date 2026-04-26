"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { registerAuthListener, supabase } from "@/lib/supabase";
import { hasClientAdminAccess } from "@/lib/admin-access-client";
import { getRoleEntryPath, hasSelectedRole, resolveAuthState } from "@/lib/auth-client";
import { clearSessionHintCookie } from "@/lib/session-hint";
import { NexHyrLogo } from "@/components/brand/nexhyr-logo";
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
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[rgba(2,6,23,0.78)] backdrop-blur-2xl">
      <div className="public-section flex items-center justify-between gap-2 px-3 py-2.5 sm:gap-4 sm:px-0 sm:py-4">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <NexHyrLogo
            variant="mark"
            markClassName="h-9 w-9 rounded-[1.15rem] sm:h-11 sm:w-11 sm:rounded-2xl"
          />
          <div className="min-w-0">
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.24em] text-[#BFDBFE] sm:text-xs sm:tracking-[0.28em]">
              NexHyr
            </p>
            <p className="hidden text-sm text-stone-400 sm:block">
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
                {compact ? "Join NexHyr" : "Create account"}
              </Link>
            </>
          )}
        </nav>
        <div className="flex shrink-0 items-center gap-1.5 md:hidden">
          {user ? (
            <>
              <Link href={dashboardHref} className="secondary-btn min-h-10 min-w-[76px] rounded-[1.15rem] px-3 text-[13px]">
                {hasSelectedRole(user) ? "Dashboard" : "Role"}
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                disabled={busy}
                className="secondary-btn min-h-10 min-w-[76px] rounded-[1.15rem] px-3 text-[13px]"
              >
                {busy ? "..." : "Sign out"}
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="secondary-btn min-h-10 min-w-[72px] rounded-[1.15rem] px-3 text-[13px]">
                Log in
              </Link>
              <Link href="/signup" className="primary-btn min-h-10 min-w-[108px] rounded-[1.15rem] px-3 text-[13px]">
                Create account
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
