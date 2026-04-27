import { NextRequest, NextResponse } from "next/server";
import type { UserRecord } from "@/lib/models";
import { sendEmailMessage } from "@/lib/notifications/provider";
import { getRouteActor } from "@/lib/route-access";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normaliseText(value: string | undefined, maxLength: number) {
  return (value ?? "").trim().slice(0, maxLength);
}

export async function POST(request: NextRequest) {
  try {
    const actor = await getRouteActor(request);

    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (actor.appUser.role !== "worker" && actor.appUser.role !== "business") {
      return NextResponse.json({ error: "Only worker and business accounts can message admin." }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as { subject?: string; message?: string };
    const subject = normaliseText(body.subject, 120);
    const message = normaliseText(body.message, 2000);

    if (!subject || !message) {
      return NextResponse.json({ error: "Subject and message are required." }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdminClient();
    const { data: adminRows } = await supabaseAdmin
      .from("admin_users")
      .select("user_id")
      .returns<Array<{ user_id: string }>>();

    const adminIds = (adminRows ?? []).map((row) => row.user_id);

    let adminUsers: UserRecord[] = [];

    if (adminIds.length > 0) {
      const { data } = await supabaseAdmin
        .from("users")
        .select("*")
        .in("id", adminIds)
        .returns<UserRecord[]>();
      adminUsers = data ?? [];
    } else {
      const { data } = await supabaseAdmin
        .from("users")
        .select("*")
        .eq("role", "admin")
        .returns<UserRecord[]>();
      adminUsers = data ?? [];
    }

    const recipients = [
      ...new Set(
        adminUsers
          .map((user) => user.email?.trim().toLowerCase())
          .filter((email): email is string => Boolean(email)),
      ),
    ];

    if (recipients.length === 0) {
      return NextResponse.json({ error: "No admin recipient is configured yet." }, { status: 400 });
    }

    const actorLabel = actor.appUser.display_name?.trim() || actor.authUser.email || actor.authUser.id;
    const actorEmail = actor.authUser.email ?? actor.appUser.email ?? "Unknown";
    const actorRole = actor.appUser.role;
    const composedSubject = `[NexHyr ${actorRole}] ${subject}`;
    const composedBody = [
      `From: ${actorLabel}`,
      `Role: ${actorRole}`,
      `Email: ${actorEmail}`,
      "",
      message,
    ].join("\n");

    const sendResults = await Promise.all(
      recipients.map((recipient) =>
        sendEmailMessage({
          to: recipient,
          subject: composedSubject,
          text: composedBody,
        }),
      ),
    );

    const sentCount = sendResults.filter((result) => result.status === "sent").length;

    if (sentCount === 0) {
      return NextResponse.json(
        {
          error:
            sendResults.find((result) => result.status === "skipped")?.reason ||
            "Admin email could not be sent.",
        },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true, sentCount });
  } catch (error) {
    console.error("[support-admin-message]", error);
    return NextResponse.json(
      { error: "Unable to send your message right now." },
      { status: 500 },
    );
  }
}
