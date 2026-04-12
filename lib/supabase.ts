import {
  createClient,
  type AuthChangeEvent,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";

declare global {
  var __kruvoSupabaseClient: SupabaseClient | undefined;
}

function createBrowserSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

export const supabase =
  globalThis.__kruvoSupabaseClient ??
  (globalThis.__kruvoSupabaseClient = createBrowserSupabaseClient());

export function registerAuthListener(
  _label: string,
  callback: (event: AuthChangeEvent, session: Session | null) => void | Promise<void>,
) {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event, session) => void callback(event, session));

  return () => {
    subscription.unsubscribe();
  };
}
