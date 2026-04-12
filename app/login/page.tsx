"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  const { showToast } = useToast();

  useEffect(() => {
    let active = true;

    const redirectIfSignedIn = async () => {
      const resolved = await resolveAuthState();

      if (!active || !resolved?.appUser) {
        return;
      }

      if (!hasSelectedRole(resolved.appUser)) {
        router.replace("/role-select");
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

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
      showToast({ title: "Login failed", description: error.message, tone: "error" });
      clearSessionHintCookie();
      setLoading(false);
      return;
    }

    setSessionHintCookie();

    const resolved = await resolveAuthState();

    setLoading(false);

    if (!resolved?.appUser) {
      await supabase.auth.signOut();
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
      router.push("/role-select");
      return;
    }

    if (!resolved.appUser.onboarding_complete) {
      router.push(getRoleSetupPath(resolved.appUser.role));
      return;
    }

    router.push(getRoleHome(resolved.appUser.role));
    showToast({ title: "Welcome back", description: "You're signed in and ready to go.", tone: "success" });
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
      <div className="panel w-full max-w-md p-8">
        <p className="section-label">
          KruVo access
        </p>
        <h1 className="mt-4 text-3xl font-semibold text-stone-900">Log in</h1>
        <p className="mt-3 text-sm leading-6 text-stone-600">
          Access your worker or business dashboard and continue onboarding where
          you left off.
        </p>

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
          <button type="submit" className="primary-btn w-full" disabled={loading}>
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
