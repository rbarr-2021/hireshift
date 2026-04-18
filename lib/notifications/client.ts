"use client";

import { supabase } from "@/lib/supabase";

type NotificationProcessingResult =
  | {
      ok: true;
      summary: {
        processed: number;
        sent: number;
        skipped: number;
        failed: number;
      };
    }
  | {
      ok: false;
      error: string;
    };

export async function processOwnNotificationJobs() {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const accessToken = session?.access_token;

    if (!accessToken) {
      return {
        ok: false,
        error: "No active session available for notification processing.",
      } satisfies NotificationProcessingResult;
    }

    const response = await fetch("/api/notification-jobs/process", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      processed?: number;
      sent?: number;
      skipped?: number;
      failed?: number;
    };

    if (!response.ok) {
      const errorMessage =
        payload.error || `Notification processing failed with status ${response.status}.`;
      console.warn("[notification-jobs] immediate processing failed", {
        status: response.status,
        error: errorMessage,
      });
      return {
        ok: false,
        error: errorMessage,
      } satisfies NotificationProcessingResult;
    }

    return {
      ok: true,
      summary: {
        processed: payload.processed ?? 0,
        sent: payload.sent ?? 0,
        skipped: payload.skipped ?? 0,
        failed: payload.failed ?? 0,
      },
    } satisfies NotificationProcessingResult;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown notification processing error.";

    console.warn("[notification-jobs] immediate processing skipped", {
      error: message,
    });
    return {
      ok: false,
      error: message,
    } satisfies NotificationProcessingResult;
  }
}
