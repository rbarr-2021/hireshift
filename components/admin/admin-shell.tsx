"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchWithSession } from "@/lib/route-client";
import { supabase } from "@/lib/supabase";
import { clearSessionHintCookie } from "@/lib/session-hint";

const adminLinks = [
  { href: "/admin", label: "Bookings", mobileLabel: "Bookings" },
  { href: "/admin/payments", label: "Payments / payouts", mobileLabel: "Pay" },
  { href: "/admin/users", label: "All users", mobileLabel: "Users" },
  { href: "/admin/businesses", label: "Businesses", mobileLabel: "Biz" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pendingReviews, setPendingReviews] = useState({
    all: 0,
    businesses: 0,
  });

  useEffect(() => {
    let active = true;

    const loadPendingReviews = async () => {
      try {
        const response = await fetchWithSession("/api/admin/users");
        const payload = (await response.json()) as {
          counts?: {
            pendingVerificationReviews?: number;
            pendingBusinessVerificationReviews?: number;
          };
        };

        if (!response.ok || !active) {
          return;
        }

        setPendingReviews({
          all: payload.counts?.pendingVerificationReviews ?? 0,
          businesses: payload.counts?.pendingBusinessVerificationReviews ?? 0,
        });
      } catch {
        if (active) {
          setPendingReviews({ all: 0, businesses: 0 });
        }
      }
    };

    void loadPendingReviews();

    return () => {
      active = false;
    };
  }, [pathname]);

  const handleSignOut = async () => {
    setBusy(true);
    await supabase.auth.signOut();
    clearSessionHintCookie();
    router.replace("/login");
  };

  return (
    <div className="min-h-screen bg-black text-stone-900">
      <div className="mx-auto grid min-h-screen max-w-7xl gap-4 px-3 py-3 pb-32 sm:px-4 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-6 lg:px-6 lg:py-4 lg:pb-4">
        <aside className="panel h-fit p-4 sm:p-5 lg:sticky lg:top-4 lg:p-6">
          <div className="flex items-start justify-between gap-3">
            <Link href="/admin" className="flex min-w-0 items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-stone-100 text-lg font-semibold text-stone-900">
                K
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-700">
                  KruVii
                </p>
                <p className="text-sm text-stone-600">Admin controls</p>
              </div>
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={busy}
              className="secondary-btn min-w-[88px] px-3 lg:hidden"
            >
              {busy ? "..." : "Log out"}
            </button>
          </div>

          <div className="mt-6 panel-soft p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-stone-500">
              Admin area
            </p>
            <p className="mt-2 text-lg font-semibold text-stone-900">
              Operations
            </p>
            <p className="mt-1 text-sm text-stone-600">
              Bookings, users, and trust controls.
            </p>
          </div>

          <nav className="mt-6 hidden space-y-2 lg:block">
            {adminLinks.map((link) => {
              const active =
                pathname === link.href ||
                (link.href !== "/admin" && pathname.startsWith(link.href));

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`block rounded-2xl px-4 py-3 text-sm font-medium transition ${
                    active
                      ? "bg-stone-900 text-white"
                      : "panel-soft text-stone-700 hover:bg-stone-200"
                  }`}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span>{link.label}</span>
                    {link.href === "/admin/users" && pendingReviews.all > 0 ? (
                      <span className="rounded-full bg-[#1DB954] px-2.5 py-0.5 text-xs font-semibold text-white">
                        {pendingReviews.all}
                      </span>
                    ) : null}
                    {link.href === "/admin/businesses" && pendingReviews.businesses > 0 ? (
                      <span className="rounded-full bg-[#1DB954] px-2.5 py-0.5 text-xs font-semibold text-white">
                        {pendingReviews.businesses}
                      </span>
                    ) : null}
                  </span>
                </Link>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={handleSignOut}
            disabled={busy}
            className="secondary-btn mt-8 hidden w-full disabled:cursor-not-allowed disabled:opacity-60 lg:inline-flex"
          >
            {busy ? "Signing out..." : "Log out"}
          </button>
        </aside>

        <main className="panel p-4 sm:p-6 lg:p-8">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[rgba(6,11,23,0.96)] backdrop-blur-xl lg:hidden">
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-5 bg-gradient-to-r from-[rgba(6,11,23,0.96)] to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-[rgba(6,11,23,0.96)] via-[rgba(6,11,23,0.86)] to-transparent" />
          <div className="pointer-events-none absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full border border-white/10 bg-black/35 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-stone-300">
            Swipe
          </div>
          <div className="mx-auto flex max-w-5xl items-center gap-1 overflow-x-auto px-2 pr-12 py-2">
          {adminLinks.map((link) => {
            const active =
              pathname === link.href ||
              (link.href !== "/admin" && pathname.startsWith(link.href));

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`min-w-[4.8rem] shrink-0 rounded-xl px-2 py-2.5 text-center text-[10px] font-semibold uppercase tracking-[0.1em] sm:min-w-[5.2rem] sm:px-3 sm:text-xs sm:tracking-[0.14em] ${
                  active ? "bg-stone-100 text-stone-900" : "text-stone-300 hover:bg-white/5"
                }`}
              >
                <span className="relative inline-flex items-center justify-center">
                  {link.mobileLabel}
                  {link.href === "/admin/users" && pendingReviews.all > 0 ? (
                    <span className="absolute -right-3 -top-2 rounded-full bg-[#1DB954] px-1.5 py-0.5 text-[9px] font-semibold text-white">
                      {pendingReviews.all}
                    </span>
                  ) : null}
                  {link.href === "/admin/businesses" && pendingReviews.businesses > 0 ? (
                    <span className="absolute -right-3 -top-2 rounded-full bg-[#1DB954] px-1.5 py-0.5 text-[9px] font-semibold text-white">
                      {pendingReviews.businesses}
                    </span>
                  ) : null}
                </span>
              </Link>
            );
          })}
          </div>
        </div>
      </nav>
    </div>
  );
}
