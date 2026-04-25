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
    action?:
      | "suspend"
      | "unsuspend"
      | "approve_verification"
      | "reject_verification";
    reason?: string;
  };

  if (!id || !body.action) {
    return NextResponse.json({ error: "Missing user action." }, { status: 400 });
  }

  if (id === actor.authUser.id && body.action === "suspend") {
    return NextResponse.json({ error: "You cannot suspend your own admin account." }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdminClient();

  if (body.action === "approve_verification" || body.action === "reject_verification") {
    const [workerProfileResult, businessProfileResult, workerDocumentsResult, businessDocumentsResult] =
      await Promise.all([
        supabaseAdmin
          .from("worker_profiles")
          .select("user_id, verification_status")
          .eq("user_id", id)
          .maybeSingle(),
        supabaseAdmin
          .from("business_profiles")
          .select("user_id, verification_status")
          .eq("user_id", id)
          .maybeSingle(),
        supabaseAdmin
          .from("worker_documents")
          .select("id")
          .eq("worker_id", id)
          .limit(1),
        supabaseAdmin
          .from("business_documents")
          .select("id")
          .eq("business_id", id)
          .limit(1),
      ]);

    const nextStatus = body.action === "approve_verification" ? "verified" : "rejected";

    if (workerProfileResult.data) {
      if (((workerDocumentsResult.data as { id: string }[] | null) ?? []).length === 0) {
        return NextResponse.json(
          { error: "This worker has not uploaded documents for review yet." },
          { status: 400 },
        );
      }

      const { error } = await supabaseAdmin
        .from("worker_profiles")
        .update({ verification_status: nextStatus })
        .eq("user_id", id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({ success: true, verification_status: nextStatus });
    }

    if (businessProfileResult.data) {
      if (((businessDocumentsResult.data as { id: string }[] | null) ?? []).length === 0) {
        return NextResponse.json(
          { error: "This business has not uploaded a document for review yet." },
          { status: 400 },
        );
      }

      const { error } = await supabaseAdmin
        .from("business_profiles")
        .update({ verification_status: nextStatus })
        .eq("user_id", id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({ success: true, verification_status: nextStatus });
    }

    return NextResponse.json({ error: "No profile found to review." }, { status: 404 });
  }

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
