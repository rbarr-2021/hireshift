"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthState } from "@/components/auth/auth-provider";
import { supabase } from "@/lib/supabase";
import { SiteHeader } from "@/components/site/site-header";
import { useToast } from "@/components/ui/toast-provider";
import {
  getResetPasswordRedirectUrl,
  getRoleHome,
  getRoleSetupPath,
  hasSelectedRole,
  resolveAuthState,
} from "@/lib/auth-client";
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

  useEffect(() => {
    if (authLoading || !appUser) {
      return;
    }

    console.info("[auth] redirect decision", {
      reason: hasSelectedRole(appUser)
        ? appUser.onboarding_complete
          ? "login-to-dashboard"
          : "login-to-onboarding"
        : "login-to-role-select",
      pathname: "/login",
    });

    if (!hasSelectedRole(appUser)) {
        router.replace("/role-select");
        return;
    }

    router.replace(
      appUser.onboarding_complete
        ? getRoleHome(appUser.role)
        : getRoleSetupPath(appUser.role),
    );
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
    }
  }, []);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitLockRef.current || loading || authLoading) {
      console.info("[login] blocked duplicate submit", {
        loading,
        authLoading,
        locked: submitLockRef.current,
      });
      return;
    }

    submitLockRef.current = true;
    setLoading(true);
    setMessage(null);
    const attemptId = submitAttemptRef.current + 1;
    submitAttemptRef.current = attemptId;
    console.info("[login] submit fired", {
      attemptId,
      hasEmail: Boolean(email),
      passwordLength: password.length,
    });

    try {
      console.info("[login] starting signInWithPassword", { attemptId });
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      console.info("[login] signInWithPassword response", {
        attemptId,
        error: error?.message ?? null,
      });

      if (error) {
        setMessage(error.message);
        showToast({ title: "Login failed", description: error.message, tone: "error" });
        clearSessionHintCookie();
        return;
      }

      setSessionHintCookie();

      console.info("[login] resolving auth state", { attemptId });
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

      if (!hasSelectedRole(resolved.appUser)) {
        setMessage("Login successful. Choose whether you are looking for work or hiring staff.");
        showToast({
          title: "Choose your role",
          description: "Tell KruVo whether you are joining as a worker or a business.",
          tone: "success",
        });
        router.push("/role-select");
        return;
      }

      if (!resolved.appUser.onboarding_complete) {
        setMessage("Login successful. Continue your onboarding to unlock your dashboard.");
        showToast({
          title: "Continue onboarding",
          description: "Finish your setup to reach your dashboard.",
          tone: "success",
        });
        router.push(getRoleSetupPath(resolved.appUser.role));
        return;
      }

      setMessage("Login successful. Redirecting to your dashboard.");
      router.push(getRoleHome(resolved.appUser.role));
      showToast({ title: "Welcome back", description: "You're signed in and ready to go.", tone: "success" });
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : "Unexpected login error. Please try again.";
      console.error("[login] caught exception", { attemptId, error });
      clearSessionHintCookie();
      setMessage(nextMessage);
      showToast({
        title: "Unexpected login error",
        description: nextMessage,
        tone: "error",
      });
    } finally {
      console.info("[login] request settled", { attemptId });
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
        <p className="section-label">
          KruVo access
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
          New to KruVo?{" "}
          <Link href="/signup" className="font-medium text-stone-900 underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
    </>
  );
}
