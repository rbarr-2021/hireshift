"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { UserRecord, UserRole } from "@/lib/models";

export default function RoleSelect() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const loadExistingRole = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const { data } = await supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .maybeSingle<UserRecord>();

      setRole(data?.role ?? null);
    };

    void loadExistingRole();
  }, [router]);

  const handleContinue = async () => {
    if (!role) {
      setMessage("Choose whether you're joining as a worker or a business.");
      return;
    }

    setLoading(true);
    setMessage(null);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setLoading(false);
      setMessage(userError?.message || "You need to log in before continuing.");
      return;
    }

    const { error } = await supabase
      .from("users")
      .update({ role, onboarding_complete: false })
      .eq("id", user.id);

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    router.push(
      role === "business" ? "/profile/setup/business" : "/profile/setup/worker",
    );
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-100 px-4 py-10">
      <div className="w-full max-w-3xl rounded-[2rem] border border-stone-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-700">
          Role selection
        </p>
        <h1 className="mt-4 text-3xl font-semibold text-stone-900">
          Which side of HireShift are you on?
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
          Your choice shapes the rest of onboarding and the dashboard experience.
          You can change this later in the database if the product needs an admin
          override.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <button
            type="button"
            onClick={() => setRole("worker")}
            className={`rounded-[1.5rem] border p-6 text-left transition ${
              role === "worker"
                ? "border-stone-900 bg-stone-900 text-white"
                : "border-stone-200 bg-stone-50 text-stone-900 hover:border-stone-400"
            }`}
          >
            <p className="text-lg font-semibold">Worker</p>
            <p className="mt-2 text-sm leading-6 opacity-80">
              Create a hospitality profile, set your rate and travel radius, and
              get ready to accept temporary shifts.
            </p>
          </button>
          <button
            type="button"
            onClick={() => setRole("business")}
            className={`rounded-[1.5rem] border p-6 text-left transition ${
              role === "business"
                ? "border-amber-500 bg-amber-400 text-stone-900"
                : "border-stone-200 bg-stone-50 text-stone-900 hover:border-stone-400"
            }`}
          >
            <p className="text-lg font-semibold">Business</p>
            <p className="mt-2 text-sm leading-6 opacity-80">
              Set up your venue details so you can search, book, and manage
              temporary hospitality staff.
            </p>
          </button>
        </div>

        {message ? (
          <p className="mt-6 rounded-2xl bg-stone-100 px-4 py-3 text-sm text-stone-700">
            {message}
          </p>
        ) : null}

        <button
          type="button"
          onClick={handleContinue}
          className="primary-btn mt-8 w-full md:w-auto md:px-8"
          disabled={loading || !role}
        >
          {loading ? "Saving role..." : "Continue to onboarding"}
        </button>
      </div>
    </div>
  );
}
