import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { post, setAuthHeaders, type UserSummary } from "./api";

interface Session {
  user: UserSummary | null;
  token: string | null;
  isLoggedIn: boolean;
  signIn: (user: UserSummary, token: string) => void;
  signOut: () => void;
  refresh: () => Promise<void>;
}

const STORAGE_KEY = "bb.session";
const SessionContext = createContext<Session | null>(null);

function load(): { user: UserSummary; token: string } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as { user: UserSummary; token: string }) : null;
    // Install the headers right here, synchronously: a page's own effect (e.g. the wallet
    // refreshing balances) runs BEFORE this provider's effect, and must not fire unauthenticated.
    if (parsed?.user?.id && parsed.token) setAuthHeaders(parsed.token, parsed.user.id);
    return parsed;
  } catch {
    return null;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const initial = load();
  const [user, setUser] = useState<UserSummary | null>(initial?.user ?? null);
  const [token, setToken] = useState<string | null>(initial?.token ?? null);

  useEffect(() => {
    setAuthHeaders(token, user?.id ?? null);
    try {
      if (user && token) localStorage.setItem(STORAGE_KEY, JSON.stringify({ user, token }));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* private mode */
    }
  }, [user, token]);

  const signIn = useCallback((u: UserSummary, t: string) => {
    setAuthHeaders(t, u.id);
    setUser(u);
    setToken(t);
  }, []);

  const signOut = useCallback(() => {
    setAuthHeaders(null, null);
    setUser(null);
    setToken(null);
  }, []);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const res = await post<UserSummary>("fetchMyUserDetails", { my_user_id: user.id });
      if (res.status && res.data) setUser({ ...res.data, auth_token: undefined });
    } catch (e) {
      if ((e as { status?: number }).status === 401) signOut();
    }
  }, [user, signOut]);

  const value = useMemo<Session>(() => ({ user, token, isLoggedIn: !!(user && token), signIn, signOut, refresh }), [user, token, signIn, signOut, refresh]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession outside SessionProvider");
  return ctx;
}
