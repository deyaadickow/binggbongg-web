import type React from "react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { post, setAuthHeaders, type UserSummary } from "../lib/api";
import { useSession } from "../lib/session";
import { Notice, StoreBadges } from "../components/Common";
import { tt, useT, type StringKey } from "../lib/i18n";
import { chromeUrl, inAppBrowser, phoneOs, storeUrl } from "../lib/getApp";
import { authErrorCode, createEmailAccount, sendPasswordReset, signInEmail, type EmailProof } from "../lib/emailAuth";
import { rememberSignupNudges } from "../components/SignupNudges";
import { showGoldAlert } from "../components/GoldToast";
import { cleanCode, forgetInviteCode, rememberedInviteCode } from "../lib/invite";

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

/** The directory's "Bingg Bongg Features Videos" tile (FeaturesPage). */
const FEATURE_VIDEOS = "/feature-videos";
const LANDED = "bb.newSignupLanding.";
/** True the first time only, per member, so the welcome page is never forced on them again. */
function firstLanding(uid: number): boolean {
  try {
    if (localStorage.getItem(LANDED + uid) === "1") return false;
    localStorage.setItem(LANDED + uid, "1");
  } catch { /* private mode: is_new is true only once anyway */ }
  return true;
}


/* Gold line icons for the sign-up page (inline so they need no requests and take currentColor). */
const svg = (d: React.ReactNode) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
const ICON_LIVE = svg(<><circle cx="12" cy="12" r="3" /><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14" /></>);
const ICON_BATTLE = svg(<><path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2" /><path d="M9.5 17.5 21 6V3h-3L6.5 14.5M11 19l-6-6M8 16l-4 4M5 21l-2-2" /></>);
const ICON_GAMES = svg(<><rect x="2" y="7" width="20" height="11" rx="5" /><path d="M7 11v3M5.5 12.5h3" /><circle cx="15.5" cy="12" r="1" /><circle cx="18" cy="13.5" r="1" /></>);
const ICON_FRIENDS = svg(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><circle cx="17" cy="9" r="2.5" /><path d="M17 14.5a5 5 0 0 1 4.5 5" /></>);
const ICON_MAIL = svg(<><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" /></>);
const ICON_LOCK = svg(<><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></>);
const ICON_EYE = svg(<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>);
const ICON_EYE_OFF = svg(<><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 5.4-1.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>);

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
  // Invite link (Steve, 2026-11-12): "We also should add an optional referral code at signup." Filled in from
  // ?ref= or from the invite page this browser opened; only ever sent with a NEW account (the server ignores it
  // for anyone who already has one).
  const [referral, setReferral] = useState(() => cleanCode(new URLSearchParams(location.search).get("ref")) || rememberedInviteCode());
  const referralParam = () => (cleanCode(referral) ? { referral_code: cleanCode(referral) } : {});

  useEffect(() => {
    if (isLoggedIn) navigate(landingRef.current ?? from, { replace: true });
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

  // Set when a brand-new member is being sent to the Features Videos page, so the "already
  // signed in" effect above doesn't send them back to `from` on the same render.
  const landingRef = useRef<string | null>(null);

  function referralOutcome(res: { referral_applied?: unknown; referral_error?: unknown }) {
    if (res.referral_applied === true) forgetInviteCode();
    else if (res.referral_applied === false && typeof res.referral_error === "string") showGoldAlert(tt("su_referral_not_added", res.referral_error));
  }

  function finish(data: UserSummary & { needs_profile?: boolean }, token: string, extra: { email?: string; emailVerified?: boolean; isNew?: boolean } = {}) {
    const needsProfile = data.needs_profile === true;
    rememberSignupNudges(data.id, { needsProfile, email: extra.emailVerified === false ? extra.email : undefined });
    const { needs_profile: _ignored, ...user } = data;
    void _ignored;
    signIn({ ...user, auth_token: undefined }, token);
    // Steve, 2026-11-05: "Make Bingg Bongg Featured videos the first landing page for new signups
    // so they can see how wonderful this app is." Only on the sign-up itself (registration's
    // is_new), and once per member on this browser.
    const to = extra.isNew === true && firstLanding(data.id) ? FEATURE_VIDEOS : from;
    landingRef.current = to;
    navigate(to, { replace: true });
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
        ...referralParam(),
      });
      if (!res.status || !res.data) throw new Error(res.message ?? tt("sign_in_was_refused"));
      referralOutcome(res as never);
      const token = res.data.auth_token;
      if (!token) throw new Error(tt("no_session_token_came_back"));
      finish(res.data, token, { isNew: res.is_new === true });
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
    const base = { identity: p.email, email: p.email, ...WEB_DEVICE, login_type: 4, provider_token: p.idToken, ...referralParam() };
    let res = await post<UserSummary & { needs_profile?: boolean }>("registration", { ...base, fullname: "", username: "" });
    // A server from before the easy sign-up still requires both fields: answer it once with what
    // Android sends. The new server never takes this branch.
    if (!res.status && /fullname|username/i.test(String(res.message ?? ""))) {
      const name = nameFromEmail(p.email);
      res = await post<UserSummary & { needs_profile?: boolean }>("registration", { ...base, fullname: name, username: name });
    }
    if (!res.status || !res.data) throw new Error(res.message ?? tt("sign_in_was_refused"));
    referralOutcome(res as never);
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
    finish(res.data, token, { email: p.email, emailVerified: p.emailVerified, isNew: res.is_new === true });
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
      {/* Redesign (Steve, 2026-11-08: "redesign all the pages"): no box any more — the whole
          screen is the page. The big gold logo, what the app is in four icons, then one tap to
          switch between Create account and Sign in. */}
      <div className="signup-hero">
        <img className="signup-wordmark" src="/logo_horizontal.png" alt="Bingg Bongg" width={640} height={220} />
        <div className="signup-feats" aria-hidden="true">
          <span><i>{ICON_LIVE}</i>{t("su_feat_live")}</span>
          <span><i>{ICON_BATTLE}</i>{t("su_feat_battles")}</span>
          <span><i>{ICON_GAMES}</i>{t("su_feat_games")}</span>
          <span><i>{ICON_FRIENDS}</i>{t("su_feat_friends")}</span>
        </div>
      </div>
      <form className="signup-card" onSubmit={submit} noValidate>
        {mode !== "reset" && (
          <div className="signup-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={mode === "create"} className={mode === "create" ? "on" : ""} onClick={() => switchMode("create")}>{t("su_create_account")}</button>
            <button type="button" role="tab" aria-selected={mode === "signin"} className={mode === "signin" ? "on" : ""} onClick={() => switchMode("signin")}>{t("sign_in")}</button>
          </div>
        )}
        <h1 className="signup-title">{title}</h1>
        <p className="signup-sub">{subtitle}</p>

        <label className="signup-label" htmlFor="su-email">{t("su_email")}</label>
        <div className="signup-field">
        <i className="signup-ico">{ICON_MAIL}</i>
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
        </div>
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
            <div className="signup-pw signup-field">
              <i className="signup-ico">{ICON_LOCK}</i>
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
              <button type="button" className="signup-eye" onClick={() => setShowPassword((s) => !s)} aria-pressed={showPassword} aria-label={showPassword ? t("su_hide") : t("su_show")}>
                {showPassword ? ICON_EYE_OFF : ICON_EYE}
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

        {mode === "create" && (
          <>
            <label className="signup-label" htmlFor="su-referral">{t("su_referral_code")}</label>
            <div className="signup-field">
              <i className="signup-ico" aria-hidden style={{ fontStyle: "normal", fontWeight: 900 }}>@</i>
              <input
                id="su-referral"
                className="signup-input"
                type="text"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder={t("su_referral_placeholder")}
                value={referral}
                onChange={(e) => setReferral(e.target.value)}
              />
            </div>
          </>
        )}

        <button type="submit" className="signup-cta" disabled={busy}>{cta}{!busy && <span className="signup-cta-arrow" aria-hidden="true">→</span>}</button>
        {mode === "create" && <p className="signup-free">{t("su_free_fast")}</p>}

        {error && <div className="signup-form-err" role="alert">{error}</div>}
        {info && <div className="signup-info" role="status">{info}</div>}

        <div className="signup-switch">
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
