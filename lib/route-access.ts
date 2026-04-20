import type { NextRequest } from "next/server";
import type { AdminUserRecord, UserRecord } from "@/lib/models";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export type RouteActor = {
  authUser: {
    id: string;
    email: string | null;
  };
  appUser: UserRecord;
};

function getBearerToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  return authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
}

export async function getRouteActor(request: NextRequest): Promise<RouteActor | null> {
  const bearerToken = getBearerToken(request);

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

  const { data: appUser } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<UserRecord>();

  if (!appUser) {
    return null;
  }

  return {
    authUser: {
      id: user.id,
      email: user.email ?? null,
    },
    appUser,
  };
}

export async function isAdminUser(userId: string) {
  const supabaseAdmin = getSupabaseAdminClient();
  const { data } = await supabaseAdmin
    .from("admin_users")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle<AdminUserRecord>();

  return Boolean(data);
}

