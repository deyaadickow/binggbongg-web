// Browse first, verify before doing anything (Steve, 2026-11-05: "They can browse the entire app
// with out email verification. But as soon as they want to do anything on the app only then they
// will need to verify their email address and do everything normal as everyone else.").
//
// The server (backend 14ff9c2) gates every "doing" route for an email/password member whose
// Firebase email is not verified yet: it answers HTTP 200
//   {"status": false, "reason": "verify_email", "message": "...", "email": "..."}
// and the member's own row carries `needs_email_verification`.
//
// This file is plain state with no React and no API import, so lib/api.ts can call into it
// without a cycle. The modal itself is components/VerifyEmailModal.tsx, which registers here.

let needs = false;
let knownEmail = "";

/** Kept in step with the session's user (session.tsx). */
export function setVerifyState(needsVerification: boolean, email: string) {
  needs = needsVerification;
  if (email) knownEmail = email;
}

export function needsEmailVerification(): boolean {
  return needs;
}

type Opener = (email: string) => void;
let opener: Opener | null = null;

/** The mounted modal registers itself; returns the unregister function. */
export function registerVerifyModal(fn: Opener): () => void {
  opener = fn;
  return () => { if (opener === fn) opener = null; };
}

export function showVerifyModal(email?: string) {
  if (email) knownEmail = email;
  opener?.(knownEmail);
}

/**
 * The pre-check, BEFORE an action the server cannot gate (direct messages and live chat go
 * straight to Firestore) or one where failing late is unkind (going live, uploading, buying
 * coins before any payment page). Returns false and shows the modal when the member still has
 * to verify; true otherwise.
 */
export function requireVerified(): boolean {
  if (!needs) return true;
  showVerifyModal();
  return false;
}

/** Calls the app makes by itself (timers, page loads, heartbeats). Never a modal for these: the
 *  member did nothing, so a popup would come out of nowhere. */
const AUTOMATIC = new Set([
  "rewardUserDailyCheckIn",
  "updateUserCallStatus",
  "logPageViews",
  "markWatchingLive",
  "saveTextToVoiceSettings",
  "updateMyTimezone",
  "fetchDailyFortune",
  "finalizeBattle",
  "finalizeSeriesRound",
  "finalize2v2Battle",
  "endTapGameSession",
  "endColourBallSession",
  "chatBattleHeartbeat",
  "countryBattleDayHeartbeat",
  "reportPostWatch",
  "recordAdLinkEvent",
  "recordVideoAdImpression",
  "recordVideoAdClick",
  "leaveLiveRoom",
  "logOut",
]);

const QUIET_MS = 30_000;
let lastShown = 0;

/** From lib/api.ts post(): the server said "verify your email first". Returns true when the
 *  response was handled here (the caller should then see it as a plain failure, no message). */
export function onVerifyEmailResponse(endpoint: string, body: { email?: unknown }): boolean {
  needs = true;
  if (typeof body.email === "string" && body.email) knownEmail = body.email;
  if (AUTOMATIC.has(endpoint)) return false;
  const now = Date.now();
  if (now - lastShown >= QUIET_MS) {
    lastShown = now;
    showVerifyModal();
  }
  return true;
}

