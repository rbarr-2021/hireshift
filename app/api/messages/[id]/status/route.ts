import { NextRequest, NextResponse } from "next/server";
import type { MessageRecord } from "@/lib/models";
import { isAdmin } from "@/lib/messages";
import { getRouteActor } from "@/lib/route-access";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_SUPPORT_STATUSES = new Set(["open", "reviewed", "closed"]);

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await getRouteActor(request);
  if (!actor) {
    return NextResponse.json({ error: "Please log in again." }, { status: 401 });
  }

  if (!(await isAdmin(actor.authUser.id))) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    support_status?: string | null;
  };
  const nextStatus = body.support_status?.trim().toLowerCase() || "";

  if (!VALID_SUPPORT_STATUSES.has(nextStatus)) {
    return NextResponse.json({ error: "Choose a valid status." }, { status: 400 });
  }

  const { id } = await context.params;
  const supabaseAdmin = getSupabaseAdminClient();
  const { data: message } = await supabaseAdmin
    .from("messages")
    .select("*")
    .eq("id", id)
    .maybeSingle<MessageRecord>();

  if (!message) {
    return NextResponse.json({ error: "Message not found." }, { status: 404 });
  }

  const nowIso = new Date().toISOString();
  const { data: updated, error } = await supabaseAdmin
    .from("messages")
    .update({
      support_status: nextStatus,
      support_reviewed_at: nextStatus === "open" ? null : nowIso,
      support_reviewed_by: nextStatus === "open" ? null : actor.authUser.id,
    })
    .eq("id", id)
    .select("*")
    .single<MessageRecord>();

  if (error || !updated) {
    return NextResponse.json({ error: "Unable to update status right now." }, { status: 500 });
  }

  return NextResponse.json({ success: true, item: updated });
}
