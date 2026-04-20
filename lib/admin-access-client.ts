import { supabase } from "@/lib/supabase";

export async function hasClientAdminAccess(userId: string) {
  const { data } = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle<{ user_id: string }>();

  return Boolean(data);
}
