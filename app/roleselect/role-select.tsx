"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthState } from "@/components/auth/auth-provider";
import { NexHyrLogo } from "@/components/brand/nexhyr-logo";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/toast-provider";
import { hasClientAdminAccess } from "@/lib/admin-access-client";
import {
  getRoleEntryPath,
  hasSelectedRole,
  sanitiseAppRedirectPath,
} from "@/lib/auth-client";
import { clearPostAuthIntent, readPostAuthIntent } from "@/lib/post-auth-intent";
import type { UserRecord, UserRole } from "@/lib/models";
import { LEGAL_ACCEPTANCE_PATH, requiresLegalAcceptance } from "@/lib/legal";

type SupabaseLikeError = {
  message?: string;
  details?: string | null;
  hint?: string | null;
  code?: string;
};

function formatSupabaseError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      code: undefined,
    };
  }

  if (error && typeof error === "object") {
    const candidate = error as SupabaseLikeError;
    const parts = [
      candidate.message,
      candidate.details ?? undefined,
      candidate.hint ?? undefined,
      candidate.code ? `code: ${candidate.code}` : undefined,
    ].filter(Boolean);

    if (parts.length > 0) {
      return {
        message: parts.join(" | "),
        code: candidate.code,
      };
    }
  }

  return {
    message: "We could not load your role selection right now.",
    code: undefined,
  };
}

function formatRoleSelectError(error: unknown) {
  const nextError = formatSupabaseError(error);

  if (
    nextError.message.includes("role_selected") &&
    nextError.message.toLowerCase().includes("schema cache")
  ) {
    return {
      title: "Database update required",
      message:
        "Your database is missing the role selection field. Run the latest Supabase migration, then try again.",
    };
  }

  return {
    title: "Role selection unavailable",
    message: nextError.message,
  };
}

async function getOrCreateAppUserRow(authUser: { id: string; email?: string | null }) {
  const selectResult = await supabase
    .from("users")
    .select("id, email, role, role_selected, onboarding_complete")
    .eq("id", authUser.id)
    .maybeSingle<UserRecord>();

  if (selectResult.error) {
    throw selectResult.error;
  }

  if (selectResult.data) {
    return selectResult.data;
  }

  const recoveryPayload = {
    id: authUser.id,
    email: authUser.email ?? null,
    role: "worker" as const,
    role_selected: false,
    onboarding_complete: false,
  };

  const insertResult = await supabase
    .from("users")
    .insert(recoveryPayload)
    .select("id, email, role, role_selected, onboarding_complete")
    .single<UserRecord>();

  if (insertResult.error) {
    throw insertResult.error;
  }

  return insertResult.data;
}

export default function RoleSelect() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();
  const { loading: authLoading, hasSession, authUserId, refreshAuthState } = useAuthState();
  const { showToast } = useToast();

  const getPendingRedirect = () => {
    if (typeof window === "undefined") {
      return null;
    }

    const searchParams = new URLSearchParams(window.location.search);
    return sanitiseAppRedirectPath(searchParams.get("redirect")) ?? readPostAuthIntent();
  };

  useEffect(() => {
    if (authLoading) {
      return;
    }

    let active = true;

    const loadExistingRole = async () => {
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) {
          throw authError;
        }

        if (!user) {
          router.replace("/login?message=verified-login");
          return;
        }

        const data = await getOrCreateAppUserRow(user);

        if (!active) {
          return;
        }

        const adminAccess = await hasClientAdminAccess(user.id);

        if (!active) {
          return;
        }

        if (adminAccess) {
          router.replace("/admin");
          return;
        }

        if (hasSelectedRole(data) && data.role) {
          if (requiresLegalAcceptance(data)) {
            router.replace(LEGAL_ACCEPTANCE_PATH);
            return;
          }

          const target = getRoleEntryPath(
            data.role,
            data.onboarding_complete,
            getPendingRedirect(),
          );
          router.replace(target);
          return;
        }

        setRole(data.role_selected ? data.role : null);
      } catch (error) {
        const nextError = formatRoleSelectError(error);
        if (active) {
          setMessage(nextError.message);
          showToast({
            title: nextError.title,
            description: nextError.message,
            tone: "error",
          });
        }
      } finally {
        if (active) {
          setBootstrapping(false);
        }
      }
    };

    void loadExistingRole();

    return () => {
      active = false;
    };
  }, [authLoading, authUserId, hasSession, router, showToast]);

  const handleContinue = async () => {
    if (!role) {
      setMessage("Choose whether you're joining as a worker or a business.");
      showToast({ title: "Choose a role", description: "Pick worker or business before continuing.", tone: "info" });
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
      showToast({
        title: "Login required",
        description: userError?.message || "You need to log in before continuing.",
        tone: "error",
      });
      return;
    }

    const { error } = await supabase
      .from("users")
      .update({ role, role_selected: true, onboarding_complete: false })
      .eq("id", user.id);

    setLoading(false);

    if (error) {
      const nextError = formatRoleSelectError(error);
      setMessage(nextError.message);
      showToast({ title: nextError.title, description: nextError.message, tone: "error" });
      return;
    }

    await refreshAuthState();

    showToast({
      title: "Role selected",
      description:
        role === "business"
          ? "Business onboarding is ready."
          : "You can browse shifts now and complete your worker profile when you take your first one.",
      tone: "success",
    });

    const redirectTarget =
      role === "worker" ? getPendingRedirect() : null;
    const target =
      role === "business"
        ? "/profile/setup/business"
        : getRoleEntryPath("worker", false, redirectTarget);

    if (role === "worker") {
      clearPostAuthIntent();
    }
    router.push(target);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-4 py-10">
      <div className="panel w-full max-w-3xl p-5 sm:p-8">
        <NexHyrLogo className="mb-5" />
        <p className="section-label">
          Choose your path
        </p>
        <h1 className="mt-4 text-2xl font-semibold text-stone-900 sm:text-3xl">
          Choose your account
        </h1>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <button
            type="button"
            onClick={() => setRole("worker")}
            className={`rounded-[1.5rem] border p-5 text-left transition sm:p-6 ${
              role === "worker"
                ? "border-stone-900 bg-stone-900 text-white"
                : "border-stone-200 bg-stone-50 text-stone-900 hover:border-stone-400"
            }`}
          >
            <p className="text-2xl font-black uppercase tracking-[0.08em] sm:text-3xl">Worker</p>
            <p className="mt-3 text-lg font-semibold opacity-90">Find shifts</p>
            <p className="mt-2 text-sm opacity-80">Select here</p>
          </button>
          <button
            type="button"
            onClick={() => setRole("business")}
            className={`rounded-[1.5rem] border p-5 text-left transition sm:p-6 ${
              role === "business"
                ? "border-amber-500 bg-amber-400 text-stone-900"
                : "border-stone-200 bg-stone-50 text-stone-900 hover:border-stone-400"
            }`}
          >
            <p className="text-2xl font-black uppercase tracking-[0.08em] sm:text-3xl">Business</p>
            <p className="mt-3 text-lg font-semibold opacity-90">Book staff</p>
            <p className="mt-2 text-sm opacity-80">Select here</p>
          </button>
        </div>

        {message ? (
          <p className="info-banner mt-6">
            {message}
          </p>
        ) : null}

        <div className="mt-8 hidden md:block">
          <button
            type="button"
            onClick={handleContinue}
            className="primary-btn w-full md:w-auto md:px-8"
            disabled={bootstrapping || loading || !role}
          >
            {bootstrapping
                ? "Loading role step..."
              : loading
                ? "Saving role..."
                : role === "worker"
                  ? "Continue to shifts"
                  : "Continue to onboarding"}
          </button>
        </div>
        <div className="mobile-sticky-bar bottom-3 md:hidden">
          <button
            type="button"
            onClick={handleContinue}
            className="primary-btn w-full"
            disabled={bootstrapping || loading || !role}
          >
            {bootstrapping
              ? "Loading role step..."
              : loading
                ? "Saving role..."
                : role === "worker"
                  ? "Continue to shifts"
                  : "Continue to onboarding"}
          </button>
        </div>
      </div>
    </div>
  );
}
