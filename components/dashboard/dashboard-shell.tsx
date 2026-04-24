"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { clearSessionHintCookie } from "@/lib/session-hint";
import type { UserRecord } from "@/lib/models";

const workerLinks = [
  { href: "/dashboard/worker", label: "Overview", mobileLabel: "Home" },
  { href: "/dashboard/worker/requests", label: "Incoming Requests", mobileLabel: "Requests" },
  { href: "/dashboard/worker/jobs", label: "Accepted Jobs", mobileLabel: "Jobs" },
  { href: "/dashboard/worker/payments", label: "Payments", mobileLabel: "Pay" },
  { href: "/shifts", label: "Browse Shifts", mobileLabel: "Shifts" },
  { href: "/dashboard/worker/availability", label: "Availability", mobileLabel: "Avail" },
  { href: "/dashboard/worker/settings", label: "Settings", mobileLabel: "Settings" },
];

const businessLinks = [
  { href: "/dashboard/business", label: "Overview", mobileLabel: "Home" },
  { href: "/dashboard/business/payments", label: "Payments", mobileLabel: "Pay" },
  { href: "/dashboard/business/shifts/new", label: "Post Shift", mobileLabel: "Post" },
  { href: "/dashboard/business/profile", label: "Manage Profile", mobileLabel: "Profile" },
  { href: "/dashboard/business/discover", label: "Discover Workers", mobileLabel: "Discover" },
  { href: "/dashboard/business/bookings", label: "Past Bookings", mobileLabel: "Past" },
];
const adminLink = { href: "/admin", label: "Admin", mobileLabel: "Admin" };

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<UserRecord | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [workerCounts, setWorkerCounts] = useState({
    requests: 0,
    accepted: 0,
  });

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

      const { data: adminAccess } = await supabase
        .from("admin_users")
        .select("user_id")
        .eq("user_id", authUser.id)
        .maybeSingle<{ user_id: string }>();

      if (data?.role === "worker") {
        const { data: workerBookings } = await supabase
          .from("bookings")
          .select("status")
          .eq("worker_id", authUser.id)
          .in("status", ["pending", "accepted"]);

        if (active) {
          const statuses = ((workerBookings as { status: string }[] | null) ?? []).map(
            (booking) => booking.status,
          );

          setWorkerCounts({
            requests: statuses.filter((status) => status === "pending").length,
            accepted: statuses.filter((status) => status === "accepted").length,
          });
        }
      }

      if (active) {
        setUser(data ?? null);
        setIsAdmin(Boolean(adminAccess));
      }
    };

    void loadUser();

    return () => {
      active = false;
    };
  }, []);

  const baseLinks = user?.role === "business" ? businessLinks : workerLinks;
  const links = isAdmin ? [...baseLinks, adminLink] : baseLinks;
  const getLinkCount = (href: string) => {
    if (href === "/dashboard/worker/requests") return workerCounts.requests;
    if (href === "/dashboard/worker/jobs") return workerCounts.accepted;
    return 0;
  };

  const handleSignOut = async () => {
    setBusy(true);
    await supabase.auth.signOut();
    clearSessionHintCookie();
    router.replace("/login");
  };

  return (
    <div className="min-h-screen bg-black text-stone-900">
      <div className="mx-auto grid min-h-screen max-w-7xl gap-4 px-3 py-3 pb-32 sm:px-4 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-6 lg:px-6 lg:py-4 lg:pb-4">
        <aside className="panel h-fit p-4 sm:p-5 lg:sticky lg:top-4 lg:p-6">
          <div className="flex items-start justify-between gap-3">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-stone-100 text-lg font-semibold text-stone-900">
              K
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-700">
                KruVii
              </p>
              <p className="text-sm text-stone-600">Crew operating system</p>
            </div>
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={busy}
            className="secondary-btn min-w-[88px] px-3 lg:hidden"
          >
            {busy ? "..." : "Sign out"}
          </button>
          </div>
          <div className="mt-6 panel-soft p-4">
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
          <nav className="mt-6 hidden space-y-2 lg:block">
            {links.map((link) => {
              const active =
                pathname === link.href ||
                (link.href === "/dashboard/business/payments" && pathname.startsWith("/dashboard/business/bookings"));
              const count = getLinkCount(link.href);

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition ${
                    active
                      ? "bg-stone-900 text-white"
                      : "panel-soft text-stone-700 hover:bg-stone-200"
                  }`}
                >
                  <span>{link.label}</span>
                  {count > 0 ? (
                    <span className={link.href === "/dashboard/worker/requests" ? "status-badge status-badge--rating" : "status-badge status-badge--ready"}>
                      {count}
                    </span>
                  ) : null}
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
            {busy ? "Signing out..." : "Sign out"}
          </button>
        </aside>
        <main className="panel p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
      <nav className="fixed inset-x-0 bottom-3 z-40 px-3 sm:px-4 lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center justify-around gap-2 rounded-[1.75rem] border border-white/10 bg-black/88 px-3 py-3 shadow-[0_18px_50px_rgba(0,0,0,0.38)] backdrop-blur-xl">
          {links.map((link) => {
            const active =
              pathname === link.href ||
              (link.href === "/dashboard/business/payments" && pathname.startsWith("/dashboard/business/bookings"));
            const count = getLinkCount(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`relative flex-1 rounded-2xl px-2 py-3 text-center text-[10px] font-semibold uppercase tracking-[0.12em] sm:px-3 sm:text-xs sm:tracking-[0.16em] ${
                  active ? "bg-stone-100 text-stone-900" : "bg-white/5 text-stone-300"
                }`}
              >
                {count > 0 ? (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-300 px-1.5 text-[10px] font-bold text-black">
                    {count}
                  </span>
                ) : null}
                {link.mobileLabel}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
