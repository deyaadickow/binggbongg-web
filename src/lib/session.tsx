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
      if (res.status && res.data) {
        const fresh = { ...res.data, auth_token: undefined };
        // Same data, same object: every page that keys an effect on `user` would otherwise
        // reload for nothing on each refresh.
        setUser((cur) => (cur && JSON.stringify(cur) === JSON.stringify(fresh) ? cur : fresh));
      }
    } catch (e) {
      if ((e as { status?: number }).status === 401) signOut();
    }
  }, [user, signOut]);

  // Fill in the profile (name, avatar, balances) on every app load — a stored session may
  // hold only the id, and balances change while the tab is closed — AND whenever the signed-in
  // member changes. Steve, 2026-10-15: "it tells me to buy coins and I already have over 12k
  // coins." This used to run only on load; a sign-in made inside the page (the Gift button
  // now sends a signed-out member to Sign in and straight back) set the session from the
  // sign-in response, which carries no wallet, and nothing fetched it until a reload.
  // Keyed on the id, not the object: refresh() itself replaces the object.
  useEffect(() => {
    if (user && token) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, token]);

  const value = useMemo<Session>(() => ({ user, token, isLoggedIn: !!(user && token), signIn, signOut, refresh }), [user, token, signIn, signOut, refresh]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession outside SessionProvider");
  return ctx;
}
