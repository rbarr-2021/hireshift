import { NextRequest, NextResponse } from "next/server";
import type { MessageRecord } from "@/lib/models";
import { isAdmin } from "@/lib/messages";
import { getRouteActor } from "@/lib/route-access";
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

  const isActorAdmin = await isAdmin(actor.authUser.id);
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

  if (!isActorAdmin && message.recipient_id !== actor.authUser.id) {
    return NextResponse.json({ error: "Only recipients can mark messages as read." }, { status: 403 });
  }

  const { data: updated } = await supabaseAdmin
    .from("messages")
    .update({
      status: "read",
      read_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single<MessageRecord>();

  return NextResponse.json({ success: true, item: updated });
}
