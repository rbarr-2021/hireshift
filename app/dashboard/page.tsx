"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { UserRecord } from "@/lib/models";

export default function DashboardPage() {
  const router = useRouter();

  useEffect(() => {
    const routeUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const { data } = await supabase
        .from("users")
        .select("role, onboarding_complete")
        .eq("id", user.id)
        .maybeSingle<UserRecord>();

      if (!data?.role) {
        router.replace("/role-select");
        return;
      }

      if (!data.onboarding_complete) {
        router.replace(
          data.role === "worker"
            ? "/profile/setup/worker"
            : "/profile/setup/business",
        );
        return;
      }

      router.replace(
        data.role === "worker" ? "/dashboard/worker" : "/dashboard/business",
      );
    };

    void routeUser();
  }, [router]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <p className="text-sm text-stone-600">Preparing your dashboard...</p>
    </div>
  );
}
