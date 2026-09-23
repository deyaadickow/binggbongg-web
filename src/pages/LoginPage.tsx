import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { post, setAuthHeaders, type UserSummary } from "../lib/api";
import { useSession } from "../lib/session";
import { Notice } from "../components/Common";

// Google Identity Services. The web client id must be added to the backend's
// GOOGLE_SIGNIN_CLIENT_IDS (registration verifies the ID token) — see README.
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: { client_id: string; callback: (r: { credential: string }) => void }) => void;
          renderButton: (el: HTMLElement, cfg: Record<string, unknown>) => void;
        };
      };
    };
  }
}

function decodeJwt(token: string): Record<string, string> {
  const payload = token.split(".")[1] ?? "";
  const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
  return JSON.parse(json);
}

export function LoginPage() {
  const { signIn, isLoggedIn } = useSession();
  const navigate = useNavigate();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const devMode = new URLSearchParams(location.search).get("dev") === "1";
  const [devUserId, setDevUserId] = useState("");
  const [devToken, setDevToken] = useState("");

  useEffect(() => {
    if (isLoggedIn) navigate("/", { replace: true });
  }, [isLoggedIn, navigate]);

  async function register(credential: string) {
    setBusy(true);
    setError(null);
    try {
      const claims = decodeJwt(credential);
      const email = claims.email ?? "";
      const name = claims.name ?? email.split("@")[0];
      const res = await post<UserSummary>("registration", {
        fullname: name,
        identity: email,
        email,
        device_token: "web",
        device_type: 1,
        login_type: 1,
        username: email.split("@")[0],
        provider_token: credential,
      });
      if (!res.status || !res.data) throw new Error(res.message ?? "Sign-in was refused.");
      const token = res.data.auth_token;
      if (!token) throw new Error("No session token came back.");
      signIn({ ...res.data, auth_token: undefined }, token);
      navigate("/", { replace: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => {
      if (!window.google || !buttonRef.current) return;
      window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: (r) => register(r.credential) });
      window.google.accounts.id.renderButton(buttonRef.current, { theme: "filled_black", size: "large", shape: "pill", width: 320 });
    };
    document.head.appendChild(script);
    return () => {
      script.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function devSignIn() {
    setBusy(true);
    setError(null);
    try {
      const id = Number(devUserId);
      setAuthHeaders(devToken.trim(), id);
      const res = await post<UserSummary>("fetchMyUserDetails", { my_user_id: id });
      if (!res.status || !res.data) throw new Error(res.message ?? "That session is not valid.");
      signIn({ ...res.data, auth_token: undefined }, devToken.trim());
      navigate("/", { replace: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="card pad login-box">
        <h1 className="card-title" style={{ fontSize: 22 }}>Sign in to Bingg Bongg</h1>
        <p className="soft" style={{ marginTop: 6 }}>Use the same Google account you use in the app. Your coins, followers and videos are all here.</p>
        <div style={{ marginTop: 20, display: "flex", justifyContent: "center" }}>
          {GOOGLE_CLIENT_ID ? <div ref={buttonRef} /> : <Notice>Google sign-in isn't configured on this site yet.</Notice>}
        </div>
        {busy && <p className="muted center" style={{ marginTop: 12 }}>Signing you in…</p>}
        {error && <div style={{ marginTop: 12 }}><Notice error>{error}</Notice></div>}

        {devMode && (
          <div style={{ marginTop: 24, display: "grid", gap: 8 }}>
            <div className="muted" style={{ fontSize: 12 }}>Developer sign-in with an existing app session</div>
            <input className="input" placeholder="User id" value={devUserId} onChange={(e) => setDevUserId(e.target.value)} />
            <input className="input" placeholder="Session token" value={devToken} onChange={(e) => setDevToken(e.target.value)} />
            <button className="btn" onClick={devSignIn} disabled={busy || !devUserId || !devToken}>Use this session</button>
          </div>
        )}
      </div>
    </div>
  );
}
