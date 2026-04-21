import { NextRequest, NextResponse } from "next/server";
import type {
  BusinessProfileRecord,
  UserRecord,
  WorkerProfileRecord,
} from "@/lib/models";
import { getRouteActor, isAdminUser } from "@/lib/route-access";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AdminUserListItem = {
  user: UserRecord;
  workerProfile: WorkerProfileRecord | null;
  businessProfile: BusinessProfileRecord | null;
  displayLabel: string;
};

export async function GET(request: NextRequest) {
  const actor = await getRouteActor(request);

  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await isAdminUser(actor.authUser.id))) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const roleFilter = request.nextUrl.searchParams.get("role");
  const statusFilter = request.nextUrl.searchParams.get("status");
  const query = request.nextUrl.searchParams.get("query")?.trim().toLowerCase() ?? "";
  const supabaseAdmin = getSupabaseAdminClient();

  let usersQuery = supabaseAdmin
    .from("users")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (roleFilter === "worker" || roleFilter === "business") {
    usersQuery = usersQuery.eq("role", roleFilter);
  }

  if (statusFilter === "suspended") {
    usersQuery = usersQuery.not("suspended_at", "is", null);
  } else if (statusFilter === "active") {
    usersQuery = usersQuery.is("suspended_at", null);
  }

  const usersResult = await usersQuery.returns<UserRecord[]>();
  const users = usersResult.data ?? [];
  const userIds = users.map((user) => user.id);

  const [workerProfilesResult, businessProfilesResult] = await Promise.all([
    userIds.length
      ? supabaseAdmin.from("worker_profiles").select("*").in("user_id", userIds)
      : Promise.resolve({ data: [] as WorkerProfileRecord[] }),
    userIds.length
      ? supabaseAdmin.from("business_profiles").select("*").in("user_id", userIds)
      : Promise.resolve({ data: [] as BusinessProfileRecord[] }),
  ]);

  let items = users.map<AdminUserListItem>((user) => {
    const workerProfile =
      ((workerProfilesResult.data as WorkerProfileRecord[] | null) ?? []).find(
        (candidate) => candidate.user_id === user.id,
      ) ?? null;
    const businessProfile =
      ((businessProfilesResult.data as BusinessProfileRecord[] | null) ?? []).find(
        (candidate) => candidate.user_id === user.id,
      ) ?? null;

    return {
      user,
      workerProfile,
      businessProfile,
      displayLabel:
        user.display_name ||
        businessProfile?.business_name ||
        workerProfile?.job_role ||
        user.email ||
        "Unknown user",
    };
  });

  if (query) {
    items = items.filter((item) =>
      [
        item.user.email,
        item.user.display_name,
        item.user.role,
        item.workerProfile?.job_role,
        item.workerProfile?.city,
        item.businessProfile?.business_name,
        item.businessProfile?.city,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }

  return NextResponse.json({
    items,
    counts: {
      all: items.length,
      workers: items.filter((item) => item.user.role === "worker").length,
      businesses: items.filter((item) => item.user.role === "business").length,
      suspended: items.filter((item) => Boolean(item.user.suspended_at)).length,
    },
  });
}
