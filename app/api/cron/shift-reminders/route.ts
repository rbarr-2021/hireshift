import { NextRequest, NextResponse } from "next/server";
import { processDueNotificationJobs } from "@/lib/notifications/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorised(request: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET?.trim();

  if (!expectedSecret) {
    return false;
  }

  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  const querySecret = request.nextUrl.searchParams.get("secret")?.trim() ?? null;

  return bearer === expectedSecret || querySecret === expectedSecret;
}

export async function GET(request: NextRequest) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await processDueNotificationJobs({ limit: 100 });
    return NextResponse.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected reminder processing error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
