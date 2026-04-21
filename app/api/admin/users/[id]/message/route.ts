import { NextRequest, NextResponse } from "next/server";
import { sendEmailMessage } from "@/lib/notifications/provider";
import type { UserRecord } from "@/lib/models";
import { getRouteActor, isAdminUser } from "@/lib/route-access";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await getRouteActor(request);

  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await isAdminUser(actor.authUser.id))) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { id } = await context.params;
  const body = (await request.json()) as { subject?: string; message?: string };
  const subject = body.subject?.trim() ?? "";
  const message = body.message?.trim() ?? "";

  if (!subject || !message) {
    return NextResponse.json({ error: "Subject and message are required." }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdminClient();
  const { data: user } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("id", id)
    .maybeSingle<UserRecord>();

  if (!user?.email) {
    return NextResponse.json({ error: "This user does not have an email address." }, { status: 400 });
  }

  const result = await sendEmailMessage({
    to: user.email,
    subject,
    text: message,
  });

  if (result.status !== "sent") {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
