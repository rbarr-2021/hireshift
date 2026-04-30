"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { registerAuthListener, supabase } from "@/lib/supabase";
import { clearSessionHintCookie, setSessionHintCookie } from "@/lib/session-hint";
import type { UserRecord } from "@/lib/models";

type AuthContextValue = {
  loading: boolean;
  hasSession: boolean;
  authUserId: string | null;
  appUser: UserRecord | null;
  refreshAuthState: () => Promise<UserRecord | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function loadAppUser(userId: string) {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .maybeSingle<UserRecord>();

  if (error) {
    throw error;
  }

  return data ?? null;
}

async function clearSuspendedSession() {
  await supabase.auth.signOut();
  clearSessionHintCookie();
}

async function restoreSessionFromUrl() {
  if (typeof window === "undefined") {
    return;
  }

  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const searchParams = new URLSearchParams(window.location.search);
  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");
  const code = searchParams.get("code");

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) {
      throw error;
    }

    window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
    return;
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      throw error;
    }

    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete("code");
    nextUrl.searchParams.delete("type");
    window.history.replaceState({}, document.title, `${nextUrl.pathname}${nextUrl.search}`);
    return;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [appUser, setAppUser] = useState<UserRecord | null>(null);

  const refreshAuthState = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setHasSession(false);
      setAuthUserId(null);
      setAppUser(null);
      clearSessionHintCookie();
      return null;
    }

    setSessionHintCookie();
    setHasSession(true);

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      setAuthUserId(null);
      setAppUser(null);
      clearSessionHintCookie();
      return null;
    }

    const nextAppUser = await loadAppUser(user.id);

    if (nextAppUser?.suspended_at) {
      await clearSuspendedSession();
      setHasSession(false);
      setAuthUserId(null);
      setAppUser(null);
      return null;
    }

    setAuthUserId(user.id);
    setAppUser(nextAppUser);
    return nextAppUser;
  };

  useEffect(() => {
    let active = true;

    const bootstrapAuth = async () => {
      try {
        await restoreSessionFromUrl();
        await refreshAuthState();
      } catch (error) {
        clearSessionHintCookie();
        if (active) {
          setAuthUserId(null);
          setAppUser(null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void bootstrapAuth();

    const unsubscribe = registerAuthListener("auth-provider", async (event, session) => {
      if (!active) {
        return;
      }

      if (!session) {
        clearSessionHintCookie();
        setHasSession(false);
        setAuthUserId(null);
        setAppUser(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setHasSession(true);

      try {
        await refreshAuthState();
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      loading,
      hasSession,
      authUserId,
      appUser,
      refreshAuthState,
    }),
    [appUser, authUserId, hasSession, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthState() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuthState must be used inside AuthProvider.");
  }

  return context;
}
