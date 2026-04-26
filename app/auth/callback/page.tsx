"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { NexHyrLogo } from "@/components/brand/nexhyr-logo";
import { supabase } from "@/lib/supabase";

function appendMessage(path: string, message: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}message=${encodeURIComponent(message)}`;
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Finishing your secure sign-in...");

  useEffect(() => {
    let active = true;

    const completeAuth = async () => {
      const params = new URLSearchParams(window.location.search);
      const rawNext = params.get("next");
      const resolvedNext =
        rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/login";
      const code = params.get("code");
      const tokenHash = params.get("token_hash");
      const type = params.get("type");

      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);

          if (error) {
            throw error;
          }
        } else if (tokenHash && type) {
          const { error } = await supabase.auth.verifyOtp({
            type: type as "signup" | "recovery" | "invite" | "email_change" | "email",
            token_hash: tokenHash,
          });

          if (error) {
            throw error;
          }
        }

        if (!active) {
          return;
        }

        setMessage("Email confirmed. Redirecting...");
        router.replace(appendMessage(resolvedNext, "verified-login"));
      } catch (error) {
        if (!active) {
          return;
        }

        console.error("[auth-callback] failed to complete verification", { error });
        setMessage("We could not complete verification automatically. Please log in.");
        router.replace(appendMessage("/login", "session-required"));
      }
    };

    void completeAuth();

    return () => {
      active = false;
    };
  }, [router]);

  return (
    <>
      <SiteHeader compact />
      <section className="public-shell flex items-center justify-center py-10">
        <div className="panel w-full max-w-md p-6 sm:p-8">
          <NexHyrLogo className="mb-5" />
          <p className="section-label">Secure callback</p>
          <h1 className="mt-4 text-2xl font-semibold text-stone-900">Confirming your email</h1>
          <p className="info-banner mt-6">{message}</p>
        </div>
      </section>
      <SiteFooter />
    </>
  );
}
