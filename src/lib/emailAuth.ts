// Email + password sign-up and sign-in (Steve, 2026-11-03: "Make the signup as easy as possible,
// like email address and password and that's it").
//
// Why the website needs this: about 700 ad clicks (and 4,200 before that) brought almost no
// sign-ups. The ads open inside Facebook's and Instagram's own browser, and Google refuses to
// sign anyone in there ("disallowed_useragent"). Email and password need no pop-up and no
// redirect, so they work in that browser too.
//
// It is the SAME Firebase Auth project the phones use (binggbongg-prod), so an account made here
// signs in on Android and iPhone with the same email and password, and the other way round. The
// backend's `registration` checks the Firebase ID token for login_type 4 exactly as it does for
// the apps (GlobalFunction::verifyProviderToken: issuer, audience, sign_in_provider "password",
// and that the token's email IS the identity).
//
// A SEPARATE named Firebase app on purpose. The default app is signed in with a custom token for
// live chat and direct messages (lib/firebase.ts ensureFirebaseSignIn, which returns early when
// `currentUser` is set). Signing the email user into that same app would swap the identity the
// chat writes under.
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  indexedDBLocalPersistence,
  inMemoryPersistence,
  initializeAuth,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";

const APP_NAME = "bb-email-auth";
const config = {
  apiKey: "AIzaSyAZ-HZgUjNw6r-1hoYBbFXeZ-H4Xpuar5k",
  authDomain: "binggbongg-prod.firebaseapp.com",
  projectId: "binggbongg-prod",
  storageBucket: "binggbongg-prod.firebasestorage.app",
  messagingSenderId: "522535452362",
  appId: "1:522535452362:android:b534bd9925edca0345be33",
};

let authInstance: Auth | null = null;
function auth(): Auth {
  if (authInstance) return authInstance;
  const app: FirebaseApp = getApps().find((a) => a.name === APP_NAME) ?? initializeApp(config, APP_NAME);
  // Kept across reloads where the browser allows it, so the "Verify your email" reminder can
  // check later whether the link was tapped and resend it. In-memory is the last resort (some
  // in-app browsers refuse storage): sign-up still works, only the reminder has less to go on.
  authInstance = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence] });
  return authInstance;
}

export interface EmailProof {
  /** As Firebase stores it (lower-cased). This is the `identity` the apps send for login_type 4. */
  email: string;
  idToken: string;
  emailVerified: boolean;
  isNew: boolean;
}

async function proof(user: User, isNew: boolean): Promise<EmailProof> {
  // Forced refresh, like Android's getIdToken(true): the backend gets a token minted just now.
  const idToken = await user.getIdToken(true);
  return { email: user.email ?? "", idToken, emailVerified: user.emailVerified, isNew };
}

/** New account. The verification email goes out in the background and never holds anyone up. */
export async function createEmailAccount(email: string, password: string): Promise<EmailProof> {
  const cred = await createUserWithEmailAndPassword(auth(), email.trim(), password);
  void sendEmailVerification(cred.user).catch(() => { /* the reminder can resend it later */ });
  return proof(cred.user, true);
}

export async function signInEmail(email: string, password: string): Promise<EmailProof> {
  const cred = await signInWithEmailAndPassword(auth(), email.trim(), password);
  return proof(cred.user, false);
}

export async function sendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth(), email.trim());
}

/** For the reminder: is the Firebase user still around, and has the link been tapped since?
 *  `null` when this browser no longer holds the Firebase session (nothing to check or resend). */
export async function emailVerificationState(expectedEmail: string): Promise<{ verified: boolean } | null> {
  const a = auth();
  await a.authStateReady();
  const u = a.currentUser;
  if (!u || (u.email ?? "").toLowerCase() !== expectedEmail.toLowerCase()) return null;
  try { await u.reload(); } catch { /* offline: go by what we have */ }
  return { verified: !!a.currentUser?.emailVerified };
}

/** "I've verified" (2026-11-05): reload the Firebase user and, when the link HAS been tapped,
 *  mint a fresh ID token (it carries email_verified true only after the reload) for the
 *  server's confirmEmailVerified. `null` when this browser holds no Firebase email session. */
export async function freshVerifiedToken(expectedEmail?: string): Promise<{ verified: boolean; idToken?: string } | null> {
  const a = auth();
  await a.authStateReady();
  const u = a.currentUser;
  if (!u) return null;
  if (expectedEmail && (u.email ?? "").toLowerCase() !== expectedEmail.toLowerCase()) return null;
  await u.reload();
  const fresh = a.currentUser;
  if (!fresh?.emailVerified) return { verified: false };
  return { verified: true, idToken: await fresh.getIdToken(true) };
}

export async function resendVerification(): Promise<void> {
  const u = auth().currentUser;
  if (!u) throw new Error("no-firebase-user");
  await sendEmailVerification(u);
}

/** On the website's own Sign out, so the next person on this browser starts with nothing. */
export function signOutEmail(): void {
  if (!getApps().some((a) => a.name === APP_NAME)) return;
  void signOut(auth()).catch(() => undefined);
}

/** Firebase's error code, or "" for anything that isn't a Firebase error. */
export function authErrorCode(e: unknown): string {
  const code = (e as { code?: unknown })?.code;
  return typeof code === "string" ? code : "";
}
