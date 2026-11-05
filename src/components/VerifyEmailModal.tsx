// "Verify your email to continue" (Steve, 2026-11-05: "They can browse the entire app with out
// email verification. But as soon as they want to do anything on the app only then they will need
// to verify their email address"). Same card as iOS 76c164f and Android: black, everything in
// bright gold like the sign-up screen.
//
// Opened two ways (lib/verifyEmail.ts): the server answered reason "verify_email" to something
// the member did, or requireVerified() before an action the server cannot gate.
//
// Mounted once, inside SessionProvider. It also confirms SILENTLY when the member comes back to
// the tab after tapping the link in their email (focus / visibilitychange).
import { useCallback, useEffect, useRef, useState } from "react";
import { post } from "../lib/api";
import { useSession } from "../lib/session";
import { tt, useT } from "../lib/i18n";
import { freshVerifiedToken, resendVerification } from "../lib/emailAuth";
import { registerVerifyModal } from "../lib/verifyEmail";
import { showGoldAlert } from "./GoldToast";

const GOLD = "#FFDD55";

type ConfirmResult = "verified" | "not_yet" | "no_session" | { message: string };

export function VerifyEmailModal() {
  const { t } = useT();
  const { user, isLoggedIn, patchUser } = useSession();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"" | "check" | "resend">("");
  const userRef = useRef(user);
  userRef.current = user;

  useEffect(() => registerVerifyModal((e) => {
    setEmail(e || userRef.current?.identity || "");
    setNote("");
    setOpen(true);
  }), []);

  // Signed out (or someone else signed in): nothing to verify.
  useEffect(() => { if (!isLoggedIn) setOpen(false); }, [isLoggedIn, user?.id]);

  /** reload → getIdToken(true) → confirmEmailVerified → stored user no longer needs it. */
  const confirm = useCallback(async (): Promise<ConfirmResult> => {
    const me = userRef.current;
    if (!me) return "no_session";
    const state = await freshVerifiedToken();
    if (!state) return "no_session";
    if (!state.verified || !state.idToken) return "not_yet";
    const res = await post<unknown>("confirmEmailVerified", { user_id: me.id, provider_token: state.idToken });
    if (res.status) {
      patchUser({ needs_email_verification: false });
      return "verified";
    }
    if (res.reason === "not_verified_yet") return "not_yet";
    return { message: typeof res.message === "string" && res.message ? res.message : tt("ve_not_yet") };
  }, [patchUser]);

  // Back from the email app: if the link was tapped, finish quietly. No popup when it wasn't.
  const needs = isLoggedIn && user?.needs_email_verification === true;
  const checking = useRef(false);
  useEffect(() => {
    if (!needs) return;
    const check = () => {
      if (document.visibilityState !== "visible" || checking.current) return;
      checking.current = true;
      confirm()
        .then((r) => {
          if (r === "verified") {
            setOpen(false);
            showGoldAlert(tt("ve_thanks"));
          }
        })
        .catch(() => undefined)
        .finally(() => { checking.current = false; });
    };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [needs, confirm]);

  async function verified() {
    if (busy) return;
    setBusy("check");
    setNote("");
    try {
      const r = await confirm();
      if (r === "verified") {
        setOpen(false);
        showGoldAlert(tt("ve_thanks"));
      } else if (r === "not_yet") setNote(tt("ve_not_yet"));
      else if (r === "no_session") setNote(tt("ve_no_session"));
      else setNote(r.message);
    } catch {
      setNote(tt("su_err_generic"));
    } finally {
      setBusy("");
    }
  }

  async function resend() {
    if (busy) return;
    setBusy("resend");
    setNote("");
    try {
      await resendVerification();
      setNote(tt("ve_resent", email));
    } catch (e) {
      setNote((e as Error)?.message === "no-firebase-user" ? tt("ve_no_session") : tt("su_err_generic"));
    } finally {
      setBusy("");
    }
  }

  if (!open || !isLoggedIn) return null;

  const btn: React.CSSProperties = {
    width: "100%", minHeight: 48, borderRadius: 999, fontSize: 16, fontWeight: 800,
    fontFamily: "inherit", cursor: "pointer", boxSizing: "border-box",
  };

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="verify-email-title"
      style={{
        position: "fixed", inset: 0, zIndex: 65, background: "rgba(0,0,0,.6)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      <div
        style={{
          maxWidth: 420, width: "100%", background: "#000", border: "2px solid #D4AF37",
          borderRadius: 18, padding: "26px 20px 20px", textAlign: "center", color: GOLD,
          boxSizing: "border-box",
        }}
      >
        <div id="verify-email-title" style={{ fontSize: 21, fontWeight: 800, color: GOLD, marginBottom: 12 }}>
          {t("ve_title")}
        </div>
        <p style={{ margin: "0 0 16px", fontSize: 16, lineHeight: 1.45, color: GOLD, overflowWrap: "anywhere" }}>
          {t("ve_body", email)}
        </p>
        {note && (
          <p role="status" style={{ margin: "0 0 14px", fontSize: 15, lineHeight: 1.4, color: GOLD, fontWeight: 700, overflowWrap: "anywhere" }}>
            {note}
          </p>
        )}
        <div style={{ display: "grid", gap: 10 }}>
          <button
            type="button"
            onClick={verified}
            disabled={!!busy}
            autoFocus
            style={{ ...btn, background: GOLD, color: "#000", border: `2px solid ${GOLD}` }}
          >
            {busy === "check" ? t("ve_checking") : t("ve_done_btn")}
          </button>
          <button
            type="button"
            onClick={resend}
            disabled={!!busy}
            style={{ ...btn, background: "#000", color: GOLD, border: `2px solid ${GOLD}` }}
          >
            {t("ve_resend")}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            style={{ ...btn, background: "#000", color: GOLD, border: "2px solid #D4AF37", fontWeight: 700 }}
          >
            {t("ve_not_now")}
          </button>
        </div>
      </div>
    </div>
  );
}
