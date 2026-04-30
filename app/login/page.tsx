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
import { hasClientAdminAccess } from "@/lib/admin-access-client";
import {
  getResetPasswordRedirectUrl,
  getRoleEntryPath,
  hasSelectedRole,
  resolveAuthState,
  sanitiseAppRedirectPath,
} from "@/lib/auth-client";
import { clearPostAuthIntent, readPostAuthIntent } from "@/lib/post-auth-intent";
import { clearSessionHintCookie, setSessionHintCookie } from "@/lib/session-hint";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();
  const { loading: authLoading, appUser } = useAuthState();
  const { showToast } = useToast();
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
    if (authLoading || !appUser) {
      return;
    }

    const redirectTarget = getPendingRedirect();
    const isAdminUser = appUser.role === "admin";

    if (isAdminUser) {
      clearPostAuthIntent();
      router.replace("/admin");
      return;
    }

    if (!hasSelectedRole(appUser)) {
        router.replace(redirectTarget ? `/role-select?redirect=${encodeURIComponent(redirectTarget)}` : "/role-select");
        return;
    }

    clearPostAuthIntent();
    router.replace(getRoleEntryPath(appUser.role, appUser.onboarding_complete, redirectTarget));
  }, [appUser, authLoading, router]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const searchParams = new URLSearchParams(window.location.search);
    const nextMessage = searchParams.get("message");

    if (nextMessage === "verified-login") {
      setMessage("Your email has been verified. Please log in to continue.");
      return;
    }

    if (nextMessage === "session-required") {
      setMessage("Please log in to continue.");
      return;
    }

    if (nextMessage === "suspended") {
      setMessage("This account has been suspended. Contact NexHyr support for help.");
    }
  }, []);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitLockRef.current || loading || authLoading) {
      return;
    }

    submitLockRef.current = true;
    setLoading(true);
    setMessage(null);
    const attemptId = submitAttemptRef.current + 1;
    submitAttemptRef.current = attemptId;

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        const lower = error.message.toLowerCase();
        const nextMessage =
          lower.includes("email not confirmed") || lower.includes("email not verified")
            ? "Please confirm your email before continuing."
            : error.message;
        setMessage(nextMessage);
        showToast({ title: "Login failed", description: nextMessage, tone: "error" });
        clearSessionHintCookie();
        return;
      }

      setSessionHintCookie();
      const resolved = await resolveAuthState();

      if (!resolved?.appUser) {
        await supabase.auth.signOut();
        clearSessionHintCookie();
        setMessage("Your account record could not be found. Please sign in again.");
        showToast({
          title: "Account unavailable",
          description: "We could not find your matching app profile.",
          tone: "error",
        });
        router.push("/login");
        return;
      }

      if (resolved.appUser.suspended_at) {
        await supabase.auth.signOut();
        clearSessionHintCookie();
        const nextMessage =
          resolved.appUser.suspended_reason?.trim() ||
          "This account has been suspended. Contact NexHyr support for help.";
        setMessage(nextMessage);
        showToast({
          title: "Account suspended",
          description: nextMessage,
          tone: "error",
        });
        router.push("/login?message=suspended");
        return;
      }

      const adminAccess =
        resolved.appUser.role === "admin" || (await hasClientAdminAccess(resolved.appUser.id));

      if (adminAccess) {
        const redirectTarget = getPendingRedirect();
        setMessage("Login successful. Redirecting to admin.");
        clearPostAuthIntent();
        router.push(redirectTarget ?? "/admin");
        showToast({
          title: "Admin access granted",
          description: "You're signed in and ready to manage NexHyr.",
          tone: "success",
        });
        return;
      }

      if (!hasSelectedRole(resolved.appUser)) {
        const redirectTarget = getPendingRedirect();
        setMessage("Login successful. Choose whether you are looking for work or hiring staff.");
        showToast({
          title: "Choose your role",
          description: "Tell NexHyr whether you are joining as a worker or a business.",
          tone: "success",
        });
        router.push(
          redirectTarget
            ? `/role-select?redirect=${encodeURIComponent(redirectTarget)}`
            : "/role-select",
        );
        return;
      }

      const redirectTarget = getPendingRedirect();

      if (!resolved.appUser.onboarding_complete && resolved.appUser.role === "worker") {

        setMessage("Login successful. Browse shifts now, and complete your profile when you take your first one.");
        showToast({
          title: "Browse shifts",
          description: "You can explore available shifts before completing your worker profile.",
          tone: "success",
        });
        clearPostAuthIntent();
        router.push(getRoleEntryPath("worker", false, redirectTarget));
        return;
      }

      if (!resolved.appUser.onboarding_complete) {
        setMessage("Login successful. Continue your onboarding to unlock your dashboard.");
        showToast({
          title: "Continue onboarding",
          description: "Finish your setup to reach your dashboard.",
          tone: "success",
        });
        router.push(getRoleEntryPath(resolved.appUser.role, false, redirectTarget));
        return;
      }

      setMessage("Login successful. Redirecting to your dashboard.");
      clearPostAuthIntent();
      router.push(getRoleEntryPath(resolved.appUser.role, true, redirectTarget));
      showToast({ title: "Welcome back", description: "You're signed in and ready to go.", tone: "success" });
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : "Unexpected login error. Please try again.";
      clearSessionHintCookie();
      setMessage(nextMessage);
      showToast({
        title: "Unexpected login error",
        description: nextMessage,
        tone: "error",
      });
    } finally {
      submitLockRef.current = false;
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email) {
      setMessage("Enter your email first so we know where to send the reset link.");
      return;
    }

    setResetLoading(true);
    setMessage(null);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: getResetPasswordRedirectUrl(),
    });

    setResetLoading(false);

    setMessage(
      error ? error.message : "Password reset instructions have been sent to your email.",
    );
    showToast({
      title: error ? "Reset email failed" : "Reset email sent",
      description: error
        ? error.message
        : "Check your inbox for the secure recovery link.",
      tone: error ? "error" : "success",
    });
  };

  return (
    <>
      <SiteHeader compact />
      <div className="public-shell flex items-center justify-center py-10">
      <div className="panel w-full max-w-md p-5 sm:p-8">
        <NexHyrLogo className="mb-5" />
        <p className="section-label">
          NexHyr access
        </p>
        <h1 className="mt-4 text-2xl font-semibold text-stone-900 sm:text-3xl">Log in</h1>
        <p className="mt-3 text-sm leading-6 text-stone-600">
          Access your worker or business dashboard and continue onboarding where
          you left off.
        </p>

        {authLoading ? (
          <p className="info-banner mt-6">
            Restoring your session securely...
          </p>
        ) : null}

        <form onSubmit={handleLogin} className="mt-8 space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="input"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="input"
            required
          />
          <button type="submit" className="primary-btn w-full" disabled={loading || authLoading}>
            {loading ? "Logging in..." : "Log in"}
          </button>
        </form>

        {message ? (
          <p className="info-banner mt-4">
            {message}
          </p>
        ) : null}

        <button
          type="button"
          onClick={handleResetPassword}
          className="link-btn mt-5 w-full"
          disabled={resetLoading}
        >
          {resetLoading ? "Sending reset link..." : "Forgot password?"}
        </button>

        <p className="mt-6 text-center text-sm text-stone-500">
          New to NexHyr?{" "}
          <Link href="/signup" className="font-medium text-stone-900 underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
      <SiteFooter />
    </>
  );
}
