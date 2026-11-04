import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { post, setAuthHeaders, type UserSummary } from "../lib/api";
import { useSession } from "../lib/session";
import { Notice, StoreBadges } from "../components/Common";
import { tt, useT, type StringKey } from "../lib/i18n";
import { chromeUrl, inAppBrowser, phoneOs, storeUrl } from "../lib/getApp";
import { authErrorCode, createEmailAccount, sendPasswordReset, signInEmail, type EmailProof } from "../lib/emailAuth";
import { rememberSignupNudges } from "../components/SignupNudges";

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

/** What every web sign-in sends besides who it is. A browser has no FCM registration, so it must
 *  not look like one: the backend keeps ONE shared push token per member, and a web sign-in that
 *  claimed to be a device used to overwrite the phone's real token — silently unregistering
 *  their phone from notifications. "web" is the agreed marker the backend checks for; device_type
 *  3 = web, where 1/2 are android/ios. */
const WEB_DEVICE = { device_token: "web", device_type: 3 } as const;

/** Only for a server that still insists on a name (before the easy-sign-up backend is live):
 *  the same thing Android sends, the email's local part. The new server makes its own. */
function nameFromEmail(email: string): string {
  return (email.split("@")[0] || "member").toLowerCase().replace(/[^a-z0-9_.]/g, "").slice(0, 20) || "member";
}

type Mode = "create" | "signin" | "reset";
type FieldErrors = { email?: StringKey; password?: StringKey };

/** Firebase's error codes in plain words, against the field they belong to (Steve's spec,
 *  2026-11-03: "Errors in plain words, right under the field"). */
function explain(code: string): { field?: keyof FieldErrors; key: StringKey } {
  switch (code) {
    case "auth/email-already-in-use": return { field: "email", key: "su_err_email_taken" };
    case "auth/invalid-email":
    case "auth/missing-email": return { field: "email", key: "su_err_bad_email" };
    case "auth/weak-password":
    case "auth/missing-password": return { field: "password", key: "su_err_short_password" };
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
    case "auth/wrong-password":
    case "auth/user-not-found": return { field: "password", key: "su_err_wrong_password" };
    case "auth/user-disabled": return { key: "su_err_disabled" };
    case "auth/too-many-requests": return { key: "su_err_too_many" };
    case "auth/network-request-failed": return { key: "su_err_network" };
    default: return { key: "su_err_generic" };
  }
}

const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

export function LoginPage() {
  const { t } = useT();
  const { signIn, isLoggedIn } = useSession();
  const navigate = useNavigate();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Where to go after signing in. A signed-out tap on Gift or the heart sends the member here
  // with the video they were on; anything else lands on the feed as before.
  const routerLocation = useLocation();
  const from = (routerLocation.state as { from?: string } | null)?.from ?? "/";
  const devMode = new URLSearchParams(location.search).get("dev") === "1";
  const [devUserId, setDevUserId] = useState("");
  const [devToken, setDevToken] = useState("");
  // Inside Facebook's or Instagram's browser Google refuses to sign anyone in. Email and password
  // work there, so that is the way in; the Google button is swapped for "get the app".
  const inApp = inAppBrowser() && !devMode;
  const os = phoneOs();

  // Steve, 2026-11-03: "email address and password and that's it." Create account first —
  // nearly everyone who lands here from an ad is new.
  const initialMode: Mode = new URLSearchParams(location.search).get("mode") === "signin" ? "signin" : "create";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  useEffect(() => {
    if (isLoggedIn) navigate(from, { replace: true });
  }, [isLoggedIn, navigate]);

  // "Black background and gold text" (Steve): the cosmic backdrop is switched off on this page.
  useEffect(() => {
    document.body.classList.add("signup-black");
    return () => document.body.classList.remove("signup-black");
  }, []);

  function switchMode(next: Mode) {
    setMode(next);
    setFieldErrors({});
    setError(null);
    setInfo(null);
  }

  function finish(data: UserSummary & { needs_profile?: boolean }, token: string, extra: { email?: string; emailVerified?: boolean } = {}) {
    const needsProfile = data.needs_profile === true;
    rememberSignupNudges(data.id, { needsProfile, email: extra.emailVerified === false ? extra.email : undefined });
    const { needs_profile: _ignored, ...user } = data;
    void _ignored;
    signIn({ ...user, auth_token: undefined }, token);
    navigate(from, { replace: true });
  }

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
        ...WEB_DEVICE,
        login_type: 1,
        username: email.split("@")[0],
        provider_token: credential,
      });
      if (!res.status || !res.data) throw new Error(res.message ?? tt("sign_in_was_refused"));
      const token = res.data.auth_token;
      if (!token) throw new Error(tt("no_session_token_came_back"));
      finish(res.data, token);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** login_type 4, sent the way the apps send it: identity = the email Firebase holds, and the
   *  Firebase ID token as the proof. Name and username are left blank — the server makes them
   *  from the email (spec of 2026-11-03), and the member can change them whenever they like. */
  async function registerEmail(p: EmailProof) {
    const base = { identity: p.email, email: p.email, ...WEB_DEVICE, login_type: 4, provider_token: p.idToken };
    let res = await post<UserSummary & { needs_profile?: boolean }>("registration", { ...base, fullname: "", username: "" });
    // A server from before the easy sign-up still requires both fields: answer it once with what
    // Android sends. The new server never takes this branch.
    if (!res.status && /fullname|username/i.test(String(res.message ?? ""))) {
      const name = nameFromEmail(p.email);
      res = await post<UserSummary & { needs_profile?: boolean }>("registration", { ...base, fullname: name, username: name });
    }
    if (!res.status || !res.data) throw new Error(res.message ?? tt("sign_in_was_refused"));
    const token = res.data.auth_token;
    if (!token) {
      // The server held the session back until the email is verified (the old enforce rule, or
      // an address that already belongs to a Google/Apple member). Say what to do, plainly.
      if ((res as { email_verified?: unknown }).email_verified === false) {
        setInfo(tt("su_verify_first", p.email));
        return;
      }
      throw new Error(tt("no_session_token_came_back"));
    }
    finish(res.data, token, { email: p.email, emailVerified: p.emailVerified });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const errs: FieldErrors = {};
    if (!looksLikeEmail(email)) errs.email = "su_err_bad_email";
    if (mode !== "reset" && password.length < 6) errs.password = "su_err_short_password";
    setFieldErrors(errs);
    if (errs.email || errs.password) return;

    setBusy(true);
    try {
      if (mode === "reset") {
        await sendPasswordReset(email);
        setInfo(tt("su_reset_sent", email.trim()));
        return;
      }
      let p: EmailProof;
      if (mode === "create") {
        try {
          p = await createEmailAccount(email, password);
        } catch (err) {
          // Already a member? Try the password they just typed before telling them anything —
          // someone who forgot they joined gets straight in.
          if (authErrorCode(err) !== "auth/email-already-in-use") throw err;
          try {
            p = await signInEmail(email, password);
          } catch {
            setMode("signin");
            throw err;
          }
        }
      } else {
        p = await signInEmail(email, password);
      }
      await registerEmail(p);
    } catch (err) {
      const code = authErrorCode(err);
      if (!code) { setError((err as Error).message || tt("su_err_generic")); return; }
      const { field, key } = explain(code);
      if (field) setFieldErrors({ [field]: key });
      else setError(tt(key));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || inApp) return;
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
      window.google.accounts.id.renderButton(buttonRef.current, { theme: "filled_black", size: "large", shape: "pill", width, text: "continue_with" });
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

  const title = mode === "create" ? t("su_title_create") : mode === "signin" ? t("su_title_signin") : t("su_title_reset");
  const subtitle = mode === "create" ? t("su_sub_create") : mode === "signin" ? t("su_sub_signin") : t("su_sub_reset");
  const cta = busy
    ? (mode === "reset" ? t("su_sending") : t("signing_you_in"))
    : mode === "create" ? t("su_create_account") : mode === "signin" ? t("sign_in") : t("su_send_reset");

  return (
    <div className="page signup-page">
      <form className="signup-card" onSubmit={submit} noValidate>
        <img className="signup-logo" src="/logo_round.png" alt="" width={64} height={64} />
        <h1 className="signup-title">{title}</h1>
        <p className="signup-sub">{subtitle}</p>

        <label className="signup-label" htmlFor="su-email">{t("su_email")}</label>
        <input
          id="su-email"
          className={`signup-input${fieldErrors.email ? " bad" : ""}`}
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={t("su_email_placeholder")}
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: undefined })); }}
          aria-invalid={!!fieldErrors.email}
          aria-describedby={fieldErrors.email ? "su-email-err" : undefined}
        />
        {fieldErrors.email && (
          <div id="su-email-err" className="signup-field-err" role="alert">
            {t(fieldErrors.email)}
            {fieldErrors.email === "su_err_email_taken" && mode !== "signin" && (
              <> <button type="button" className="signup-inline-link" onClick={() => switchMode("signin")}>{t("sign_in")}</button></>
            )}
          </div>
        )}

        {mode !== "reset" && (
          <>
            <label className="signup-label" htmlFor="su-password">{t("su_password")}</label>
            <div className="signup-pw">
              <input
                id="su-password"
                className={`signup-input${fieldErrors.password ? " bad" : ""}`}
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "create" ? "new-password" : "current-password"}
                placeholder={mode === "create" ? t("su_password_placeholder") : ""}
                value={password}
                onChange={(e) => { setPassword(e.target.value); if (fieldErrors.password) setFieldErrors((f) => ({ ...f, password: undefined })); }}
                aria-invalid={!!fieldErrors.password}
                aria-describedby={fieldErrors.password ? "su-password-err" : undefined}
              />
              <button type="button" className="signup-eye" onClick={() => setShowPassword((s) => !s)} aria-pressed={showPassword}>
                {showPassword ? t("su_hide") : t("su_show")}
              </button>
            </div>
            {fieldErrors.password && (
              <div id="su-password-err" className="signup-field-err" role="alert">
                {t(fieldErrors.password)}
                {fieldErrors.password === "su_err_wrong_password" && (
                  <> <button type="button" className="signup-inline-link" onClick={() => switchMode("reset")}>{t("su_forgot")}</button></>
                )}
              </div>
            )}
            {mode === "signin" && !fieldErrors.password && (
              <button type="button" className="signup-forgot" onClick={() => switchMode("reset")}>{t("su_forgot")}</button>
            )}
          </>
        )}

        <button type="submit" className="signup-cta" disabled={busy}>{cta}</button>

        {error && <div className="signup-form-err" role="alert">{error}</div>}
        {info && <div className="signup-info" role="status">{info}</div>}

        <div className="signup-switch">
          {mode === "create" && <>{t("su_have_account")} <button type="button" className="signup-inline-link" onClick={() => switchMode("signin")}>{t("sign_in")}</button></>}
          {mode === "signin" && <>{t("su_new_here")} <button type="button" className="signup-inline-link" onClick={() => switchMode("create")}>{t("su_create_account")}</button></>}
          {mode === "reset" && <button type="button" className="signup-inline-link" onClick={() => switchMode("signin")}>{t("su_back_to_signin")}</button>}
        </div>

        {mode !== "reset" && (
          <>
            <div className="signup-or"><span>{t("su_or")}</span></div>
            {inApp ? (
              // Google cannot work in this browser; the app can.
              <div className="signup-secondary">
                {os !== "ios" && <a className="signup-alt" href={storeUrl("login", "android")}>▶ {t("lp_cta_play")}</a>}
                {os !== "android" && <a className="signup-alt" href={storeUrl("login", "ios")}> {t("lp_cta_ios")}</a>}
                {os === "android" && <a className="signup-small-link" href={chromeUrl()}>{t("su_google_in_chrome")}</a>}
                {os === "ios" && <p className="signup-hint">{t("ga_ios_hint")}</p>}
              </div>
            ) : (
              <div className="signup-secondary">
                {GOOGLE_CLIENT_ID ? <div ref={buttonRef} className="signup-google" /> : <Notice>{t("google_sign_in_isn_t_configured_on_this")}</Notice>}
              </div>
            )}
          </>
        )}

        {devMode && (
          <div style={{ marginTop: 24, display: "grid", gap: 8 }}>
            <div className="muted" style={{ fontSize: 12 }}>{t("developer_sign_in_with_an_existing_app_s")}</div>
            <input className="input" placeholder={t("user_id")} value={devUserId} onChange={(e) => setDevUserId(e.target.value)} />
            <input className="input" placeholder={t("session_token")} value={devToken} onChange={(e) => setDevToken(e.target.value)} />
            <button type="button" className="btn" onClick={devSignIn} disabled={busy || !devUserId || !devToken}>{t("use_this_session")}</button>
          </div>
        )}
      </form>
      {!inApp && <div className="signup-badges"><StoreBadges /></div>}
    </div>
  );
}
