import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type VerifyType = "signup" | "recovery" | "invite" | "email_change" | "email";

function getSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function sanitiseNextPath(value: string | null, fallback: string) {
  if (!value) {
    return fallback;
  }

  const trimmed = value.trim();

  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return fallback;
  }

  if (trimmed === "/onboarding") {
    return "/role-select";
  }

  return trimmed;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as VerifyType | null;
  const nextPath = sanitiseNextPath(url.searchParams.get("next"), "/role-select");

  if (!tokenHash || !type) {
    return NextResponse.redirect(new URL("/login?error=confirmation_failed", url.origin));
  }

  try {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });

    if (error) {
      return NextResponse.redirect(new URL("/login?error=confirmation_failed", url.origin));
    }

    return NextResponse.redirect(new URL(nextPath, url.origin));
  } catch {
    return NextResponse.redirect(new URL("/login?error=confirmation_failed", url.origin));
  }
}
