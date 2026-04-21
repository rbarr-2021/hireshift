"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { clearSessionHintCookie } from "@/lib/session-hint";

const adminLinks = [
  { href: "/admin", label: "Bookings", mobileLabel: "Bookings" },
  { href: "/admin/users", label: "All users", mobileLabel: "Users" },
  { href: "/admin/businesses", label: "Businesses", mobileLabel: "Biz" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const handleSignOut = async () => {
    setBusy(true);
    await supabase.auth.signOut();
    clearSessionHintCookie();
    router.replace("/login");
  };

  return (
    <div className="min-h-screen bg-black text-stone-900">
      <div className="mx-auto grid min-h-screen max-w-7xl gap-4 px-3 py-3 pb-24 sm:px-4 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-6 lg:px-6 lg:py-4 lg:pb-4">
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
                  {link.label}
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

      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/5 bg-black/88 px-4 py-3 backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center justify-around gap-2">
          {adminLinks.map((link) => {
            const active =
              pathname === link.href ||
              (link.href !== "/admin" && pathname.startsWith(link.href));

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex-1 rounded-2xl px-2 py-3 text-center text-[10px] font-semibold uppercase tracking-[0.12em] sm:px-3 sm:text-xs sm:tracking-[0.16em] ${
                  active ? "bg-stone-900 text-black" : "panel-soft text-stone-600"
                }`}
              >
                {link.mobileLabel}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
