"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthState } from "@/components/auth/auth-provider";
import { hasClientAdminAccess } from "@/lib/admin-access-client";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { loading: authLoading, hasSession, authUserId } = useAuthState();
  const [adminLoading, setAdminLoading] = useState(true);
  const [hasAdminAccess, setHasAdminAccess] = useState(false);

  useEffect(() => {
    let active = true;

    const checkAdminAccess = async () => {
      if (authLoading) {
        return;
      }

      if (!hasSession || !authUserId) {
        router.replace("/login?message=session-required");
        return;
      }

      if (!active) {
        return;
      }

      const adminAccess = await hasClientAdminAccess(authUserId);

      if (!active) {
        return;
      }

      if (!adminAccess) {
        router.replace("/dashboard");
        return;
      }

      setHasAdminAccess(true);
      setAdminLoading(false);
    };

    void checkAdminAccess();

    return () => {
      active = false;
    };
  }, [authLoading, authUserId, hasSession, router]);

  if (authLoading || adminLoading || !hasAdminAccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-6">
        <div className="panel w-full max-w-md p-5 text-center sm:p-8">
          <p className="text-sm uppercase tracking-[0.3em] text-stone-500">
            NexHyr
          </p>
          <h1 className="mt-4 text-xl font-semibold text-stone-900 sm:text-2xl">
            Loading admin access
          </h1>
          <p className="mt-3 text-sm text-stone-600">
            Checking your secure admin permissions.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
