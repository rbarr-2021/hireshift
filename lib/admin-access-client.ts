import { supabase } from "@/lib/supabase";

export async function hasClientAdminAccess(userId: string) {
  const [{ data: adminRow }, { data: appUserRoleRow }] = await Promise.all([
    supabase
      .from("admin_users")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle<{ user_id: string }>(),
    supabase
      .from("users")
      .select("role")
      .eq("id", userId)
      .maybeSingle<{ role: string | null }>(),
  ]);

  return Boolean(adminRow || appUserRoleRow?.role === "admin");
}
