import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { post, setAuthHeaders, type UserSummary } from "../lib/api";
import { useSession } from "../lib/session";
import { Notice, StoreBadges } from "../components/Common";
import { tt, useT  } from "../lib/i18n";

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

let gsiInitialised = false;

function decodeJwt(token: string): Record<string, string> {
  const payload = token.split(".")[1] ?? "";
  const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
  return JSON.parse(json);
}

export function LoginPage() {
  const { t } = useT();
  const { signIn, isLoggedIn } = useSession();
  const navigate = useNavigate();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Where to go after signing in. A signed-out tap on Gift or the heart sends the member here
  // with the video they were on; anything else lands on the feed as before.
  const routerLocation = useLocation();
  const from = (routerLocation.state as { from?: string } | null)?.from ?? "/";
  const devMode = new URLSearchParams(location.search).get("dev") === "1";
  const [devUserId, setDevUserId] = useState("");
  const [devToken, setDevToken] = useState("");

  useEffect(() => {
    if (isLoggedIn) navigate(from, { replace: true });
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
        // A browser has no FCM registration, so it must not look like one: the backend keeps
        // ONE shared push token per member, and a web sign-in that claimed to be a device used
        // to overwrite the phone's real token — silently unregistering their phone from
        // notifications. "web" is the agreed marker the backend checks for (the empty string
        // works too); device_type 3 = web, where 1/2 are android/ios.
        device_token: "web",
        device_type: 3,
        login_type: 1,
        username: email.split("@")[0],
        provider_token: credential,
      });
      if (!res.status || !res.data) throw new Error(res.message ?? tt("sign_in_was_refused"));
      const token = res.data.auth_token;
      if (!token) throw new Error(tt("no_session_token_came_back"));
      signIn({ ...res.data, auth_token: undefined }, token);
      navigate(from, { replace: true });
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
      // GIS warns if initialize() runs twice (React StrictMode mounts twice in dev) — once is enough.
      if (!gsiInitialised) {
        window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: (r) => register(r.credential) });
        gsiInitialised = true;
      }
      const width = Math.min(320, Math.max(200, (buttonRef.current.parentElement?.clientWidth ?? 320)));
      window.google.accounts.id.renderButton(buttonRef.current, { theme: "filled_black", size: "large", shape: "pill", width });
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
      if (!res.status || !res.data) throw new Error(res.message ?? tt("that_session_is_not_valid"));
      signIn({ ...res.data, auth_token: undefined }, devToken.trim());
      navigate(from, { replace: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="card pad login-box">
        <h1 className="card-title" style={{ fontSize: 22 }}>{t("sign_in_to_bingg_bongg")}</h1>
        <p className="soft" style={{ marginTop: 6 }}>{t("use_the_same_google_account_you_use_in_t")}</p>
        <div style={{ marginTop: 20, display: "flex", justifyContent: "center" }}>
          {GOOGLE_CLIENT_ID ? <div ref={buttonRef} /> : <Notice>{t("google_sign_in_isn_t_configured_on_this")}</Notice>}
        </div>
        {busy && <p className="muted center" style={{ marginTop: 12 }}>{t("signing_you_in")}</p>}
        {error && <div style={{ marginTop: 12 }}><Notice error>{error}</Notice></div>}

        {devMode && (
          <div style={{ marginTop: 24, display: "grid", gap: 8 }}>
            <div className="muted" style={{ fontSize: 12 }}>{t("developer_sign_in_with_an_existing_app_s")}</div>
            <input className="input" placeholder={t("user_id")} value={devUserId} onChange={(e) => setDevUserId(e.target.value)} />
            <input className="input" placeholder={t("session_token")} value={devToken} onChange={(e) => setDevToken(e.target.value)} />
            <button className="btn" onClick={devSignIn} disabled={busy || !devUserId || !devToken}>{t("use_this_session")}</button>
          </div>
        )}
      </div>
      <div style={{ marginTop: 24 }}><StoreBadges /></div>
    </div>
  );
}
