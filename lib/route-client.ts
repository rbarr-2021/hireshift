"use client";

import { supabase } from "@/lib/supabase";

async function getAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.access_token) {
    return session.access_token;
  }

  await supabase.auth.refreshSession().catch(() => null);

  const {
    data: { session: refreshedSession },
  } = await supabase.auth.getSession();

  return refreshedSession?.access_token ?? null;
}

export async function fetchWithSession(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  const accessToken = await getAccessToken();

  if (!accessToken) {
    throw new Error("No active session available.");
  }

  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);

  const firstResponse = await fetch(input, {
    ...init,
    headers,
  });

  if (firstResponse.status !== 401) {
    return firstResponse;
  }

  await supabase.auth.refreshSession().catch(() => null);
  const retryToken = await getAccessToken();

  if (!retryToken) {
    return firstResponse;
  }

  const retryHeaders = new Headers(init?.headers);
  retryHeaders.set("Authorization", `Bearer ${retryToken}`);

  return fetch(input, {
    ...init,
    headers: retryHeaders,
  });
}
