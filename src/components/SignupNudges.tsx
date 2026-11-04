// The gentle "afterwards" of the easy sign-up (Steve, 2026-11-03: "email address and password and
// that's it. They can add the rest later").
//
// Nothing here ever blocks anyone. Two small, dismissible reminders, shown a little AFTER sign-up
// (not on the first screen they see) and only until done or dismissed:
//  - "Verify your email": the link went out in the background at sign-up; Resend while this
//    browser still holds the Firebase session. Disappears by itself once the link is tapped.
//  - "Add your name & photo": when the server made the name up from the email
//    (registration's data.needs_profile). Opens Account settings.
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useSession } from "../lib/session";
import { useT } from "../lib/i18n";
import { emailVerificationState, resendVerification } from "../lib/emailAuth";

const KEY = "bb.signupNudge";
const DISMISSED = "bb.signupNudge.dismissed.";
/** How long after sign-up before the reminders appear. */
const DELAY_MS = 2 * 60 * 1000;

interface Stored { uid: number; at: number; profile: boolean; email?: string }

function read(): Stored | null {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as Stored) : null;
    return v && typeof v.uid === "number" ? v : null;
  } catch { return null; }
}

function dismissed(uid: number, what: "email" | "profile"): boolean {
  try { return localStorage.getItem(`${DISMISSED}${uid}.${what}`) === "1"; } catch { return false; }
}

/** Called by the sign-in page with what the server and Firebase said. */
export function rememberSignupNudges(uid: number, { needsProfile, email }: { needsProfile: boolean; email?: string }) {
  try {
    const cur = read();
    const same = cur && cur.uid === uid;
    if (!needsProfile && !email) {
      if (same) localStorage.removeItem(KEY);
      return;
    }
    const next: Stored = { uid, at: same ? cur.at : Date.now(), profile: needsProfile, ...(email ? { email } : {}) };
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch { /* private mode: no reminders, nothing breaks */ }
}

export function SignupNudges() {
  const { t } = useT();
  const { user, isLoggedIn } = useSession();
  const { pathname } = useLocation();
  const [stored, setStored] = useState<Stored | null>(() => read());
  const [due, setDue] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [canResend, setCanResend] = useState(false);
  const [resent, setResent] = useState<"" | "sent" | "failed">("");
  const [, bump] = useState(0);
  const uid = user?.id;

  // Re-read when the member changes (a sign-in on this page writes it just before).
  useEffect(() => { setStored(read()); setResent(""); }, [uid]);

  useEffect(() => {
    if (!stored || stored.uid !== uid) { setDue(false); return; }
    const wait = stored.at + DELAY_MS - Date.now();
    if (wait <= 0) { setDue(true); return; }
    setDue(false);
    const timer = window.setTimeout(() => setDue(true), wait);
    return () => window.clearTimeout(timer);
  }, [stored, uid]);

  const email = stored?.uid === uid ? stored?.email : undefined;
  useEffect(() => {
    if (!due || !email || !uid || dismissed(uid, "email")) { setShowEmail(false); return; }
    let live = true;
    emailVerificationState(email).then((s) => {
      if (!live) return;
      if (s?.verified) {
        // Done: never mention it again.
        const cur = read();
        if (cur && cur.uid === uid) { delete cur.email; localStorage.setItem(KEY, JSON.stringify(cur)); }
        setShowEmail(false);
        return;
      }
      setCanResend(!!s);
      setShowEmail(true);
    }).catch(() => { if (live) { setCanResend(false); setShowEmail(true); } });
    return () => { live = false; };
  }, [due, email, uid]);

  if (!isLoggedIn || !uid || !due || !stored || stored.uid !== uid || pathname === "/login") return null;

  const nameIsMadeUp = !user?.fullname || !user?.profile_image || user.fullname === user.username;
  const showProfile = stored.profile && nameIsMadeUp && !dismissed(uid, "profile") && pathname !== "/settings/account";
  if (!showEmail && !showProfile) return null;

  function dismiss(what: "email" | "profile") {
    try { localStorage.setItem(`${DISMISSED}${uid}.${what}`, "1"); } catch { /* private mode */ }
    if (what === "email") setShowEmail(false);
    bump((n) => n + 1);
  }

  async function resend() {
    try { await resendVerification(); setResent("sent"); } catch { setResent("failed"); }
  }

  return (
    <div className="signup-nudges">
      {showEmail && email && (
        <div className="signup-nudge" role="status">
          <span className="signup-nudge-text">
            <b>{t("su_nudge_verify_title")}</b>
            <small>{resent === "sent" ? t("su_nudge_verify_resent", email) : resent === "failed" ? t("su_err_generic") : t("su_nudge_verify_text", email)}</small>
          </span>
          {canResend && resent !== "sent" && <button type="button" className="signup-nudge-btn" onClick={resend}>{t("su_nudge_resend")}</button>}
          <button type="button" className="signup-nudge-x" onClick={() => dismiss("email")} aria-label={t("su_nudge_dismiss")}>×</button>
        </div>
      )}
      {showProfile && (
        <div className="signup-nudge" role="status">
          <span className="signup-nudge-text">
            <b>{t("su_nudge_profile_title")}</b>
            <small>{t("su_nudge_profile_text")}</small>
          </span>
          <Link className="signup-nudge-btn" to="/settings/account">{t("su_nudge_profile_btn")}</Link>
          <button type="button" className="signup-nudge-x" onClick={() => dismiss("profile")} aria-label={t("su_nudge_dismiss")}>×</button>
        </div>
      )}
    </div>
  );
}
