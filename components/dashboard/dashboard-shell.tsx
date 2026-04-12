"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { clearSessionHintCookie } from "@/lib/session-hint";
import type { UserRecord } from "@/lib/models";

const workerLinks = [
  { href: "/dashboard/worker", label: "Overview" },
  { href: "/dashboard/worker/profile", label: "Manage Profile" },
];

const businessLinks = [
  { href: "/dashboard/business", label: "Overview" },
  { href: "/dashboard/business/profile", label: "Manage Profile" },
  { href: "/dashboard/business/discover", label: "Discover Workers" },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<UserRecord | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;

    const loadUser = async () => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser || !active) {
        return;
      }

      const { data } = await supabase
        .from("users")
        .select("*")
        .eq("id", authUser.id)
        .maybeSingle<UserRecord>();

      if (active) {
        setUser(data ?? null);
      }
    };

    void loadUser();

    return () => {
      active = false;
    };
  }, []);

  const links = user?.role === "business" ? businessLinks : workerLinks;

  const handleSignOut = async () => {
    setBusy(true);
    await supabase.auth.signOut();
    clearSessionHintCookie();
    router.replace("/login");
  };

  return (
    <div className="min-h-screen bg-black text-stone-900">
      <div className="mx-auto grid min-h-screen max-w-7xl gap-6 px-4 py-4 pb-24 lg:grid-cols-[280px_minmax(0,1fr)] lg:px-6 lg:pb-4">
        <aside className="panel sticky top-4 h-fit p-6">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-stone-100 text-lg font-semibold text-stone-900">
              K
            </span>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-700">
                KruVo
              </p>
              <p className="text-sm text-stone-600">Crew operating system</p>
            </div>
          </Link>
          <div className="mt-8 panel-soft p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-stone-500">
              Account
            </p>
            <p className="mt-2 text-lg font-semibold text-stone-900">
              {user?.display_name || user?.email || "Pending setup"}
            </p>
            <p className="mt-1 text-sm capitalize text-stone-600">
              {user?.role || "Choose role"}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="status-badge status-badge--rating">Live profile</span>
              <span className="status-badge status-badge--ready">
                {user?.role === "business" ? "Ready to book" : "Ready for discovery"}
              </span>
            </div>
          </div>
          <nav className="mt-8 space-y-2">
            {links.map((link) => {
              const active = pathname === link.href;

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
            className="secondary-btn mt-8 w-full disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Signing out..." : "Sign out"}
          </button>
        </aside>
        <main className="panel p-6 lg:p-8">
          {children}
        </main>
      </div>
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/5 bg-black/88 px-4 py-3 backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center justify-around gap-2">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex-1 rounded-2xl px-3 py-3 text-center text-xs font-semibold uppercase tracking-[0.16em] ${
                  active ? "bg-stone-900 text-black" : "panel-soft text-stone-600"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
