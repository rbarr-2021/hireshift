import { supabase } from "@/lib/supabase";
import type { UserRecord, UserRole } from "@/lib/models";

export type ResolvedAuthState = {
  authUser: NonNullable<Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"]>;
  appUser: UserRecord | null;
};

export async function resolveAuthState(): Promise<ResolvedAuthState | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return null;
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    await supabase.auth.signOut();
    return null;
  }

  const { data: appUser } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<UserRecord>();

  return {
    authUser: user,
    appUser: appUser ?? null,
  };
}

export function getRoleHome(role: UserRole) {
  return role === "worker" ? "/dashboard/worker" : "/dashboard/business";
}

export function getRoleSetupPath(role: UserRole) {
  return role === "worker" ? "/profile/setup/worker" : "/profile/setup/business";
}
