import {
  createClient,
  type AuthChangeEvent,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";

declare global {
  var __kruvoSupabaseClient: SupabaseClient | undefined;
  var __kruvoSupabaseClientCreateCount: number | undefined;
  var __kruvoAuthListenerCount: number | undefined;
}

function createBrowserSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  globalThis.__kruvoSupabaseClientCreateCount =
    (globalThis.__kruvoSupabaseClientCreateCount ?? 0) + 1;

  console.info("[supabase] creating browser client", {
    createCount: globalThis.__kruvoSupabaseClientCreateCount,
  });

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
  label: string,
  callback: (event: AuthChangeEvent, session: Session | null) => void | Promise<void>,
) {
  globalThis.__kruvoAuthListenerCount = (globalThis.__kruvoAuthListenerCount ?? 0) + 1;
  const listenerId = globalThis.__kruvoAuthListenerCount;

  console.info("[supabase] auth listener registered", {
    label,
    listenerId,
  });

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event, session) => {
    console.info("[supabase] auth listener event", {
      label,
      listenerId,
      event,
      hasSession: Boolean(session),
    });

    void callback(event, session);
  });

  return () => {
    console.info("[supabase] auth listener unsubscribed", {
      label,
      listenerId,
    });
    subscription.unsubscribe();
  };
}
