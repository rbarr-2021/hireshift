"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { SiteHeader } from "@/components/site/site-header";
import { useToast } from "@/components/ui/toast-provider";
import { clearSessionHintCookie } from "@/lib/session-hint";

function extractRecoveryTokens() {
  if (typeof window === "undefined") {
    return {
      accessToken: null,
      refreshToken: null,
      type: null,
      code: null,
      errorDescription: null,
    };
  }

  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const searchParams = new URLSearchParams(window.location.search);

  return {
    accessToken: hashParams.get("access_token"),
    refreshToken: hashParams.get("refresh_token"),
    type: hashParams.get("type") ?? searchParams.get("type"),
    code: searchParams.get("code"),
    errorDescription:
      hashParams.get("error_description") ??
      searchParams.get("error_description") ??
      hashParams.get("error") ??
      searchParams.get("error"),
  };
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const recoveryContext = useMemo(() => extractRecoveryTokens(), []);

  useEffect(() => {
    let active = true;

    const initialiseRecovery = async () => {
      if (recoveryContext.errorDescription) {
        setMessage(recoveryContext.errorDescription);
        return;
      }

      const { data: listener } = supabase.auth.onAuthStateChange((event) => {
        if (!active) {
          return;
        }

        if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
          setReady(true);
        }
      });

      try {
        if (
          recoveryContext.type === "recovery" &&
          recoveryContext.accessToken &&
          recoveryContext.refreshToken
        ) {
          const { error } = await supabase.auth.setSession({
            access_token: recoveryContext.accessToken,
            refresh_token: recoveryContext.refreshToken,
          });

          if (error) {
            throw error;
          }

          if (!active) {
            return;
          }

          setReady(true);

          if (typeof window !== "undefined" && window.location.hash) {
            window.history.replaceState({}, document.title, window.location.pathname);
          }

          return;
        }

        if (recoveryContext.code) {
          const { error } = await supabase.auth.exchangeCodeForSession(
            recoveryContext.code,
          );

          if (error) {
            throw error;
          }

          if (!active) {
            return;
          }

          setReady(true);
          return;
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!active) {
          return;
        }

        if (session) {
          setReady(true);
        } else {
          setMessage(
            "This password reset link is invalid or has expired. Request a new one from the login page.",
          );
        }
      } catch (error) {
        const nextMessage =
          error instanceof Error
            ? error.message
            : "We could not verify your password reset link.";
        setMessage(nextMessage);
      }

      return () => {
        listener.subscription.unsubscribe();
      };
    };

    const cleanupPromise = initialiseRecovery();

    return () => {
      active = false;
      void cleanupPromise.then((cleanup) => cleanup?.());
    };
  }, [recoveryContext]);

  const handleReset = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (password.length < 8) {
      setMessage("Use at least 8 characters for your new password.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Your new password and confirmation do not match.");
      return;
    }

    setLoading(true);
    setMessage(null);

    const { error } = await supabase.auth.updateUser({ password });

    setLoading(false);

    if (error) {
      setMessage(error.message);
      showToast({ title: "Password update failed", description: error.message, tone: "error" });
      return;
    }

    setMessage("Your password has been updated. You can now log in with the new password.");
    showToast({
      title: "Password updated",
      description: "You can now log in with your new password.",
      tone: "success",
    });
    await supabase.auth.signOut();
    clearSessionHintCookie();
    setTimeout(() => {
      router.replace("/login");
    }, 1200);
  };

  return (
    <>
      <SiteHeader compact />
    <div className="public-shell flex items-center justify-center py-10">
      <div className="panel w-full max-w-md p-8">
        <p className="section-label">
          Secure recovery
        </p>
        <h1 className="mt-4 text-3xl font-semibold text-stone-900">
          Reset password
        </h1>
        <p className="mt-3 text-sm leading-6 text-stone-600">
          Set a new password for your worker or business account.
        </p>

        <form onSubmit={handleReset} className="mt-8 space-y-4">
          <input
            type="password"
            placeholder="New password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="input"
            minLength={8}
            required
            disabled={!ready || loading}
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="input"
            minLength={8}
            required
            disabled={!ready || loading}
          />
          <button
            type="submit"
            className="primary-btn w-full"
            disabled={!ready || loading}
          >
            {loading ? "Updating password..." : "Set new password"}
          </button>
        </form>

        {message ? (
          <p className="info-banner mt-4">
            {message}
          </p>
        ) : null}

        {!ready && !message ? (
          <p className="info-banner mt-4">
            Verifying your recovery link...
          </p>
        ) : null}

        <p className="mt-6 text-center text-sm text-stone-500">
          Need a new email?{" "}
          <Link href="/login" className="font-medium text-stone-900 underline">
            Back to login
          </Link>
        </p>
      </div>
    </div>
    </>
  );
}
