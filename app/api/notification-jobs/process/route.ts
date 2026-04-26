import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { processDueNotificationJobs } from "@/lib/notifications/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getRequestScope(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  const cronSecret =
    process.env.CRON_SECRET?.trim() || process.env.NOTIFICATION_JOBS_CRON_SECRET?.trim();

  if (bearerToken && cronSecret && bearerToken === cronSecret) {
    return { scope: "all" as const };
  }

  if (!bearerToken) {
    return null;
  }

  const supabaseAdmin = getSupabaseAdminClient();
  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(bearerToken);

  if (error || !user) {
    return null;
  }

  return {
    scope: "self" as const,
    userId: user.id,
  };
}

export async function POST(request: NextRequest) {
  const requestScope = await getRequestScope(request);

  if (!requestScope) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await processDueNotificationJobs(
      requestScope.scope === "self"
        ? { recipientUserId: requestScope.userId, limit: 10 }
        : { limit: 25 },
    );

    return NextResponse.json(summary);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected notification processing failure.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
