"use client";

import { supabase } from "@/lib/supabase";

export async function fetchWithSession(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const accessToken = session?.access_token;

  if (!accessToken) {
    throw new Error("No active session available.");
  }

  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);

  return fetch(input, {
    ...init,
    headers,
  });
}

