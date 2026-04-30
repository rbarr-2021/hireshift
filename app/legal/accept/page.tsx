"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { useAuthState } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toast-provider";
import { getRoleEntryPath, hasSelectedRole, sanitiseAppRedirectPath } from "@/lib/auth-client";
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  LEGAL_ACCEPTANCE_PATH,
  requiresLegalAcceptance,
} from "@/lib/legal";
import { supabase } from "@/lib/supabase";

export default function LegalAcceptancePage() {
  const router = useRouter();
  const { appUser, loading, refreshAuthState } = useAuthState();
  const { showToast } = useToast();
  const [agree, setAgree] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [redirectTarget, setRedirectTarget] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const requested = sanitiseAppRedirectPath(
      new URLSearchParams(window.location.search).get("redirect"),
    );
    if (requested && requested !== LEGAL_ACCEPTANCE_PATH) {
      setRedirectTarget(requested);
    }
  }, []);

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!appUser) {
      router.replace("/login?message=session-required");
      return;
    }

    if (!requiresLegalAcceptance(appUser)) {
      const next =
        redirectTarget ??
        (hasSelectedRole(appUser)
          ? getRoleEntryPath(appUser.role, appUser.onboarding_complete)
          : "/role-select");
      router.replace(next);
    }
  }, [appUser, loading, redirectTarget, router]);

  const handleAccept = async () => {
    if (!agree) {
      setMessage("Please confirm acceptance before continuing.");
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login?message=session-required");
        return;
      }

      const acceptedAt = new Date().toISOString();
      const { error } = await supabase
        .from("users")
        .update({
          terms_accepted_at: acceptedAt,
          terms_version: CURRENT_TERMS_VERSION,
          privacy_accepted_at: acceptedAt,
          privacy_version: CURRENT_PRIVACY_VERSION,
        })
        .eq("id", user.id);

      if (error) {
        throw error;
      }

      const nextUser = await refreshAuthState();
      showToast({
        title: "Accepted",
        description: "Thanks. Your legal acceptance has been saved.",
        tone: "success",
      });

      if (!nextUser) {
        router.replace("/login?message=session-required");
        return;
      }

      const next =
        redirectTarget ??
        (hasSelectedRole(nextUser)
          ? getRoleEntryPath(nextUser.role, nextUser.onboarding_complete)
          : "/role-select");
      router.replace(next);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save acceptance right now.");
      showToast({
        title: "Acceptance failed",
        description: "Please try again.",
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SiteHeader compact />
      <main className="public-shell py-10">
        <section className="panel mx-auto w-full max-w-2xl p-6 sm:p-8">
          <p className="section-label">Legal acceptance</p>
          <h1 className="mt-4 text-2xl font-semibold text-stone-900 sm:text-3xl">
            Please accept Terms and Privacy
          </h1>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            Before continuing, confirm you accept the current NexHyr legal terms.
          </p>

          <label className="mt-6 flex items-start gap-3 rounded-2xl border border-white/10 bg-black/30 p-4">
            <input
              type="checkbox"
              checked={agree}
              onChange={(event) => setAgree(event.target.checked)}
              className="mt-1 h-4 w-4"
            />
            <span className="text-sm leading-6 text-stone-700">
              I agree to the NexHyr{" "}
              <Link href="/terms" className="underline" target="_blank" rel="noreferrer">
                Terms & Conditions
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="underline" target="_blank" rel="noreferrer">
                Privacy Policy
              </Link>
              .
            </span>
          </label>

          {message ? <p className="info-banner mt-4">{message}</p> : null}

          <button
            type="button"
            onClick={handleAccept}
            disabled={saving || !agree}
            className="primary-btn mt-6 w-full disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving..." : "Accept and continue"}
          </button>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
