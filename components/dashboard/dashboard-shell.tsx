"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
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
    router.replace("/login");
  };

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900">
      <div className="mx-auto grid min-h-screen max-w-7xl gap-6 px-4 py-4 lg:grid-cols-[260px_minmax(0,1fr)] lg:px-6">
        <aside className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
          <Link href="/" className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-700">
            HireShift
          </Link>
          <div className="mt-8 rounded-2xl bg-stone-100 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-stone-500">
              Account
            </p>
            <p className="mt-2 text-lg font-semibold text-stone-900">
              {user?.display_name || user?.email || "Pending setup"}
            </p>
            <p className="mt-1 text-sm capitalize text-stone-600">
              {user?.role || "Choose role"}
            </p>
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
                      : "bg-stone-100 text-stone-700 hover:bg-stone-200"
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
            className="mt-8 w-full rounded-2xl border border-stone-300 px-4 py-3 text-sm font-medium text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Signing out..." : "Sign out"}
          </button>
        </aside>
        <main className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
