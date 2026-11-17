// The sign-up wall (Steve, 2026-11-17):
//   "Everyone must signup after they install the app and get 100 Free BBs to play with."
//   "If they install and don't signup they are not allowed to go in the app."
//   "The signup will be vary minimal, Email, Password, Referral. and that's it. With email
//    verification of cource."
//
// Signed out on any page that is not public (lib/publicRoutes.ts): the sign-up screen fills the
// whole window, at that page's own address, with nothing behind it and no way past. Signing in
// opens the page they asked for.
//
// Signed in but the email is not verified yet (an email + password account the server marks
// needs_email_verification): "Check your email" instead of the app, until it is. Google sign-ins
// are verified by Google and go straight in. The server's own gate (AuthorizeUser) is unchanged.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { post } from "../lib/api";
import { useSession } from "../lib/session";
import { tt, useT } from "../lib/i18n";
import { freshVerifiedToken } from "../lib/emailAuth";
import { isPublicPath, isVerifyExempt } from "../lib/publicRoutes";
import { LoginPage } from "../pages/LoginPage";

export function SignupWall({ children }: { children: ReactNode }) {
  const { pathname, search } = useLocation();
  const { isLoggedIn, user } = useSession();

  if (isLoggedIn) {
    if (user?.needs_email_verification === true && !isVerifyExempt(pathname)) return <CheckEmailScreen />;
    return <>{children}</>;
  }
  if (isPublicPath(pathname)) return <>{children}</>;
  // /login keeps its own "where to go next" (router state from a page that sent them here).
  const isLogin = pathname.replace(/\/+$/, "") === "/login";
  return (
    <div className="signup-wall">
      <LoginPage wall from={isLogin ? undefined : pathname + search} />
    </div>
  );
}

type ConfirmResult = "verified" | "not_yet" | "no_session" | { message: string };

/** reload the Firebase user → fresh ID token → confirmEmailVerified. Shared with VerifyEmailModal. */
export async function confirmEmailNow(userId: number): Promise<ConfirmResult> {
  const state = await freshVerifiedToken();
  if (!state) return "no_session";
  if (!state.verified || !state.idToken) return "not_yet";
  const res = await post<unknown>("confirmEmailVerified", { user_id: userId, provider_token: state.idToken });
  if (res.status) return "verified";
  if (res.reason === "not_verified_yet") return "not_yet";
  return { message: typeof res.message === "string" && res.message ? res.message : tt("ve_not_yet") };
}

/** "Check your email": the address, I've verified, Resend email, Use a different email. */
function CheckEmailScreen() {
  const { t } = useT();
  const { user, patchUser, signOut, refresh } = useSession();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"" | "check" | "resend">("");
  const email = user?.identity ?? "";
  const userId = user?.id ?? 0;

  useEffect(() => {
    document.body.classList.add("signup-black");
    return () => document.body.classList.remove("signup-black");
  }, []);

  const done = useCallback(() => {
    patchUser({ needs_email_verification: false });
    // Fresh row from the server: the 100 free BBs land on verification.
    void refresh();
  }, [patchUser, refresh]);

  // Back from the email app after tapping the link: let them in without a second tap.
  const checking = useRef(false);
  useEffect(() => {
    if (!userId) return;
    const check = () => {
      if (document.visibilityState !== "visible" || checking.current) return;
      checking.current = true;
      confirmEmailNow(userId)
        .then((r) => { if (r === "verified") done(); })
        .catch(() => undefined)
        .finally(() => { checking.current = false; });
    };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [userId, done]);

  async function verified() {
    if (busy || !userId) return;
    setBusy("check");
    setNote("");
    try {
      const r = await confirmEmailNow(userId);
      if (r === "verified") done();
      else if (r === "not_yet") setNote(tt("ve_not_yet"));
      else if (r === "no_session") setNote(tt("ce_no_session"));
      else setNote(r.message);
    } catch {
      setNote(tt("su_err_generic"));
    } finally {
      setBusy("");
    }
  }

  /** Our own email (Amazon SES, binggbongg.com) — Firebase's never reached Yahoo inboxes. */
  async function resend() {
    if (busy || !userId) return;
    setBusy("resend");
    setNote("");
    try {
      const res = await post<unknown>("resendVerificationEmail", { user_id: userId });
      if (res.status && (res as { email_verified?: unknown }).email_verified === true) { done(); return; }
      setNote(res.status ? tt("ve_resent", email) : tt("ce_resend_wait"));
    } catch {
      setNote(tt("su_err_generic"));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="signup-wall">
      <div className="page signup-page ce-page">
        <div className="signup-hero">
          <img className="signup-wordmark" src="/logo_horizontal.png" alt="Bingg Bongg" width={640} height={220} />
        </div>
        <div className="ce-card" role="main" aria-labelledby="ce-title">
          <svg className="ce-ico" viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" />
          </svg>
          <h1 id="ce-title" className="signup-title">{t("ce_title")}</h1>
          <p className="ce-body">{t("ce_body")}</p>
          <p className="ce-email">{email}</p>
          <p className="ce-spam">{t("ce_spam")}</p>
          {note && <div className="signup-info" role="status">{note}</div>}
          <button type="button" className="signup-cta" onClick={verified} disabled={!!busy}>
            {busy === "check" ? t("ve_checking") : t("ve_done_btn")}
          </button>
          <button type="button" className="ce-btn" onClick={resend} disabled={!!busy}>
            {busy === "resend" ? t("su_sending") : t("ve_resend")}
          </button>
          <button type="button" className="signup-inline-link ce-different" onClick={signOut}>{t("ce_different")}</button>
        </div>
      </div>
    </div>
  );
}
