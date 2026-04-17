"use client";

import { supabase } from "@/lib/supabase";

export async function processOwnNotificationJobs() {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const accessToken = session?.access_token;

    if (!accessToken) {
      return;
    }

    await fetch("/api/notification-jobs/process", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  } catch (error) {
    console.warn("[notification-jobs] immediate processing skipped", {
      error: error instanceof Error ? error.message : "Unknown notification processing error.",
    });
  }
}
