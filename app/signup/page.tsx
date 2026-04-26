"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthState } from "@/components/auth/auth-provider";
import { supabase } from "@/lib/supabase";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { NexHyrLogo } from "@/components/brand/nexhyr-logo";
import { useToast } from "@/components/ui/toast-provider";
import {
  getAppBaseUrl,
  getRoleEntryPath,
  hasSelectedRole,
  resolveAuthState,
  sanitiseAppRedirectPath,
} from "@/lib/auth-client";
import { clearPostAuthIntent, readPostAuthIntent } from "@/lib/post-auth-intent";
import { clearSessionHintCookie, setSessionHintCookie } from "@/lib/session-hint";
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
  const { loading: authLoading, appUser } = useAuthState();
  const { showToast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const submitLockRef = useRef(false);
  const submitAttemptRef = useRef(0);

  const getPendingRedirect = () => {
    if (typeof window === "undefined") {
      return null;
    }

    const searchParams = new URLSearchParams(window.location.search);
    return sanitiseAppRedirectPath(searchParams.get("redirect")) ?? readPostAuthIntent();
  };

  useEffect(() => {
    if (cooldownSeconds <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setCooldownSeconds((current) => Math.max(0, current - 1));
    }, 1000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [cooldownSeconds]);

  useEffect(() => {
    if (authLoading || !appUser) {
      return;
    }

    const redirectTarget = getPendingRedirect();

    console.info("[auth] redirect decision", {
      reason: hasSelectedRole(appUser)
        ? appUser.onboarding_complete
          ? "signup-to-dashboard"
          : appUser.role === "worker"
            ? "signup-to-shifts"
            : "signup-to-onboarding"
        : "signup-to-role-select",
      pathname: "/signup",
      hasSession: true,
      authUserId: appUser.id,
      role: appUser.role,
    });

    if (!hasSelectedRole(appUser)) {
        router.replace(
          redirectTarget
            ? `/role-select?redirect=${encodeURIComponent(redirectTarget)}`
            : "/role-select",
        );
        return;
    }

    clearPostAuthIntent();
    router.replace(getRoleEntryPath(appUser.role, appUser.onboarding_complete, redirectTarget));
  }, [appUser, authLoading, router]);

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

    if (submitLockRef.current || loading || authLoading || cooldownSeconds > 0) {
      console.info("[signup] blocked duplicate submit", {
        loading,
        authLoading,
        cooldownSeconds,
        locked: submitLockRef.current,
      });
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      showToast({
        title: "Passwords do not match",
        description: "Please make sure both password fields match before continuing.",
        tone: "error",
      });
      return;
    }

    submitLockRef.current = true;
    setLoading(true);
    const attemptId = submitAttemptRef.current + 1;
    submitAttemptRef.current = attemptId;
    console.info("[signup] submit fired", {
      attemptId,
      hasEmail: Boolean(email),
      passwordLength: password.length,
      confirmPasswordLength: confirmPassword.length,
    });

    try {
      console.info("[signup] resolving current auth state", { attemptId });
      const resolved = await resolveAuthState();

      if (resolved?.authUser) {
        setMessage(
          "You already have an active session. Sign out first or use a private window before creating another account.",
        );
        showToast({
          title: "Already signed in",
          description: "Sign out first or use a private window before creating another account.",
          tone: "error",
        });
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${getAppBaseUrl()}/auth/callback?next=${encodeURIComponent("/login")}`,
        },
      });
      console.info("[signup] signUp response", {
        attemptId,
        hasUser: Boolean(data.user),
        hasSession: Boolean(data.session),
        error: error?.message ?? null,
      });

      if (error) {
        const formattedError = formatSupabaseError(error);
        const isRateLimited = formattedError.toLowerCase().includes("rate limit");
        const nextMessage = isRateLimited
          ? "Too many attempts. Please wait a moment and try again."
          : formattedError;

        if (isRateLimited) {
          setCooldownSeconds(30);
        }

        setMessage(nextMessage);
        showToast({
          title: isRateLimited ? "Rate limited" : "Signup failed",
          description: nextMessage,
          tone: "error",
        });
        clearSessionHintCookie();
        return;
      }

      if (data.session && data.user) {
        setSessionHintCookie();
        const { data: appUser, error: appUserError } = await waitForAppUserRow(
          data.user.id,
        );

        if (appUserError) {
          setMessage(`Signup created your auth account, but loading your app profile failed: ${formatSupabaseError(appUserError)}`);
          showToast({
            title: "Account needs attention",
            description: "Your auth user was created, but the app profile lookup failed.",
            tone: "error",
          });
          return;
        }

        if (!appUser) {
          await supabase.auth.signOut();
          setMessage(
            "Signup created your auth account, but the matching app user record was not available yet. Please try logging in once, and if this persists check the auth trigger and remove any orphaned public.users rows for deleted auth users.",
          );
          showToast({
            title: "Profile still syncing",
            description: "Try logging in once or check the app-user trigger if this persists.",
            tone: "info",
          });
          return;
        }

        showToast({
          title: "Account created",
          description: "Next up: choose whether you're looking for work or hiring staff.",
          tone: "success",
        });
        const redirectTarget = getPendingRedirect();
        router.push(
          redirectTarget
            ? `/role-select?redirect=${encodeURIComponent(redirectTarget)}`
            : "/role-select",
        );
        return;
      }

      setMessage(
        "Check your email to confirm your account, then log in.",
      );
      clearPostAuthIntent();
      clearSessionHintCookie();
      showToast({
        title: "Check your inbox",
        description: "Check your email to confirm your account before continuing.",
        tone: "success",
      });
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : "Unexpected signup error. Please try again.";
      console.error("[signup] caught exception", { attemptId, error });
      clearSessionHintCookie();
      setMessage(nextMessage);
      showToast({
        title: "Unexpected signup error",
        description: nextMessage,
        tone: "error",
      });
    } finally {
      console.info("[signup] request settled", { attemptId });
      submitLockRef.current = false;
      setLoading(false);
    }
  };

  const isValid =
    email.length > 0 &&
    password.length >= 8 &&
    password === confirmPassword;

  return (
    <>
      <SiteHeader compact />
    <div className="public-shell flex items-center justify-center py-10">
      <form
        onSubmit={handleSignup}
        className="panel w-full max-w-md p-5 sm:p-8"
      >
        <NexHyrLogo className="mb-5" />
        <p className="section-label">
          Join NexHyr
        </p>
        <h1 className="mt-4 text-2xl font-semibold text-stone-900 sm:text-3xl">
          Create your account
        </h1>
        <p className="mt-3 text-sm leading-6 text-stone-600">
          Start as a worker or business, then complete the tailored onboarding
          flow for your side of the marketplace.
        </p>

        {message ? (
          <p className="info-banner mt-6">
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
            disabled={loading || authLoading || cooldownSeconds > 0 || !isValid}
            className="primary-btn w-full"
          >
            {loading
              ? "Creating account..."
              : cooldownSeconds > 0
                ? `Try again in ${cooldownSeconds}s`
                : "Create account"}
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
      <SiteFooter />
    </>
  );
}
