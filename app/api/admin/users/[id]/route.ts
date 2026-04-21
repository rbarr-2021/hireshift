import { NextRequest, NextResponse } from "next/server";
import { getRouteActor, isAdminUser } from "@/lib/route-access";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
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
  const body = (await request.json()) as {
    action?: "suspend" | "unsuspend";
    reason?: string;
  };

  if (!id || !body.action) {
    return NextResponse.json({ error: "Missing user action." }, { status: 400 });
  }

  if (id === actor.authUser.id && body.action === "suspend") {
    return NextResponse.json({ error: "You cannot suspend your own admin account." }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdminClient();
  const payload =
    body.action === "suspend"
      ? {
          suspended_at: new Date().toISOString(),
          suspended_reason: body.reason?.trim() || "Suspended by admin.",
        }
      : {
          suspended_at: null,
          suspended_reason: null,
        };

  const { data, error } = await supabaseAdmin
    .from("users")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || "Unable to update the user." },
      { status: 400 },
    );
  }

  return NextResponse.json({ user: data });
}

export async function DELETE(
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

  if (!id) {
    return NextResponse.json({ error: "Missing user id." }, { status: 400 });
  }

  if (id === actor.authUser.id) {
    return NextResponse.json({ error: "You cannot delete your own admin account." }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdminClient();
  const { error } = await supabaseAdmin.auth.admin.deleteUser(id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
