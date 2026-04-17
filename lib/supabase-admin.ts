import { createClient, type SupabaseClient } from "@supabase/supabase-js";

declare global {
  var __kruviiSupabaseAdminClient: SupabaseClient | undefined;
}

function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing Supabase admin environment variables.");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function getSupabaseAdminClient() {
  return (
    globalThis.__kruviiSupabaseAdminClient ??
    (globalThis.__kruviiSupabaseAdminClient = createSupabaseAdminClient())
  );
}
