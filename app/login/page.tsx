"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  getResetPasswordRedirectUrl,
  getRoleHome,
  getRoleSetupPath,
  resolveAuthState,
} from "@/lib/auth-client";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

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
      setLoading(false);
      return;
    }

    const resolved = await resolveAuthState();

    setLoading(false);

    if (!resolved?.appUser) {
      await supabase.auth.signOut();
      setMessage("Your account record could not be found. Please sign in again.");
      router.push("/login");
      return;
    }

    if (!resolved.appUser.role) {
      router.push("/role-select");
      return;
    }

    if (!resolved.appUser.onboarding_complete) {
      router.push(getRoleSetupPath(resolved.appUser.role));
      return;
    }

    router.push(getRoleHome(resolved.appUser.role));
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
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-100 px-4 py-10">
      <div className="w-full max-w-md rounded-[2rem] border border-stone-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-700">
          HireShift
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
          <p className="mt-4 rounded-2xl bg-stone-100 px-4 py-3 text-sm text-stone-700">
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
          New to HireShift?{" "}
          <Link href="/signup" className="font-medium text-stone-900 underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
