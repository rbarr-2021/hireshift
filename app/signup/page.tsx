"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  getAppBaseUrl,
  getRoleHome,
  getRoleSetupPath,
  resolveAuthState,
} from "@/lib/auth-client";
import type { UserRecord } from "@/lib/models";

type SupabaseLikeError = {
  message?: string;
  details?: string | null;
  hint?: string | null;
  code?: string;
};

function formatSupabaseError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
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
      return parts.join(" | ");
    }
  }

  return "Unknown signup error.";
}

async function waitForAppUserRow(userId: string, attempts = 3, delayMs = 250) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .maybeSingle<UserRecord>();

    if (error) {
      return { data: null, error };
    }

    if (data) {
      return { data, error: null };
    }

    if (attempt < attempts - 1) {
      await new Promise((resolve) => window.setTimeout(resolve, delayMs));
    }
  }

  return { data: null, error: null };
}

export default function Signup() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const redirectIfSignedIn = async () => {
      const resolved = await resolveAuthState();

      if (!active || !resolved?.appUser?.role) {
        return;
      }

      router.replace(
        resolved.appUser.onboarding_complete
          ? getRoleHome(resolved.appUser.role)
          : getRoleSetupPath(resolved.appUser.role),
      );
    };

    void redirectIfSignedIn();

    return () => {
      active = false;
    };
  }, [router]);

  const getStrength = (value: string) => {
    if (value.length < 8) {
      return { label: "Weak", color: "bg-red-400", width: "33%" };
    }

    if (/^(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9])/.test(value)) {
      return { label: "Strong", color: "bg-emerald-500", width: "100%" };
    }

    return { label: "Medium", color: "bg-amber-400", width: "66%" };
  };

  const strength = getStrength(password);

  const handleSignup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);

    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    const resolved = await resolveAuthState();

    if (resolved?.authUser) {
      setMessage(
        "You already have an active session. Sign out first or use a private window before creating another account.",
      );
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${getAppBaseUrl()}/login`,
      },
    });

    setLoading(false);

    if (error) {
      console.error("[signup] signUp failed", {
        email,
        error,
      });

      const formattedError = formatSupabaseError(error);
      const nextMessage = formattedError.toLowerCase().includes("rate limit")
        ? "Too many attempts. Please wait a moment and try again."
        : formattedError;

      setMessage(nextMessage);
      return;
    }

    console.info("[signup] signUp response", {
      userId: data.user?.id ?? null,
      emailConfirmedAt: data.user?.email_confirmed_at ?? null,
      sessionPresent: Boolean(data.session),
    });

    if (data.session && data.user) {
      const { data: appUser, error: appUserError } = await waitForAppUserRow(
        data.user.id,
      );

      if (appUserError) {
        console.error("[signup] app user lookup failed after signup", {
          userId: data.user.id,
          error: appUserError,
        });
        setMessage(`Signup created your auth account, but loading your app profile failed: ${formatSupabaseError(appUserError)}`);
        return;
      }

      if (!appUser) {
        console.error("[signup] missing public.users row after signup", {
          userId: data.user.id,
          email: data.user.email,
          sessionPresent: Boolean(data.session),
        });
        await supabase.auth.signOut();
        setMessage(
          "Signup created your auth account, but the matching app user record was not available yet. Please try logging in once, and if this persists check the auth trigger and remove any orphaned public.users rows for deleted auth users.",
        );
        return;
      }

      router.push("/role-select");
      return;
    }

    setMessage(
      "Account created. Check your email to verify your address, then log in. If you already have orphaned rows in public.users from deleted auth accounts, clean those up first to avoid misleading state.",
    );
  };

  const isValid =
    email.length > 0 &&
    password.length >= 8 &&
    password === confirmPassword;

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-100 px-4 py-10">
      <form
        onSubmit={handleSignup}
        className="w-full max-w-md rounded-[2rem] border border-stone-200 bg-white p-8 shadow-sm"
      >
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-700">
          HireShift
        </p>
        <h1 className="mt-4 text-3xl font-semibold text-stone-900">
          Create your account
        </h1>
        <p className="mt-3 text-sm leading-6 text-stone-600">
          Start as a worker or business, then complete the tailored onboarding
          flow for your side of the marketplace.
        </p>

        {message ? (
          <p className="mt-6 rounded-2xl bg-stone-100 px-4 py-3 text-sm text-stone-700">
            {message}
          </p>
        ) : null}

        <div className="mt-6 space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="input"
            required
          />

          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="input pr-16"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              className="toggle-btn"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>

          {password ? (
            <div className="flex flex-col gap-1">
              <div className="h-2 w-full overflow-hidden rounded-full bg-stone-200">
                <div
                  className={`h-full ${strength.color} transition-all duration-300`}
                  style={{ width: strength.width }}
                />
              </div>
              <p className="text-xs text-stone-500">{strength.label} password</p>
            </div>
          ) : null}

          <input
            type={showPassword ? "text" : "password"}
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="input"
            required
          />

          {confirmPassword && password !== confirmPassword ? (
            <p className="text-xs text-red-500">Passwords do not match.</p>
          ) : null}

          <button
            type="submit"
            disabled={loading || !isValid}
            className="primary-btn w-full"
          >
            {loading ? "Creating account..." : "Create account"}
          </button>
        </div>

        <p className="mt-6 text-center text-sm text-stone-500">
          Already registered?{" "}
          <Link href="/login" className="font-medium text-stone-900 underline">
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}
