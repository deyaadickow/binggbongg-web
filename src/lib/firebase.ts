// Live chat lives in Firestore (same project + collections the phones use: liveChat/{room__hostId}/messages).
// The browser signs in with a Firebase custom token minted by the LiveKit token server for this session.
import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInWithCustomToken } from "firebase/auth";
import { addDoc, collection, getFirestore, limit, limitToLast, onSnapshot, orderBy, query, setDoc, type DocumentReference } from "firebase/firestore";
import { tokenServer } from "./api";

const config = {
  apiKey: "AIzaSyAZ-HZgUjNw6r-1hoYBbFXeZ-H4Xpuar5k",
  projectId: "binggbongg-prod",
  storageBucket: "binggbongg-prod.firebasestorage.app",
  messagingSenderId: "522535452362",
  appId: "1:522535452362:android:b534bd9925edca0345be33",
};

function app() {
  return getApps()[0] ?? initializeApp(config);
}

/** The same initialised app the live chat uses — direct messages (lib/dm.ts) need it too, and
 *  initialising a second one would mean a second auth session. */
export function firebaseApp() {
  return app();
}

let signedIn: Promise<void> | null = null;
export function ensureFirebaseSignIn(): Promise<void> {
  if (!signedIn) {
    signedIn = (async () => {
      const auth = getAuth(app());
      if (auth.currentUser) return;
      const res = await tokenServer<{ token: string }>("firebase-token", { method: "POST", body: {} });
      await signInWithCustomToken(auth, res.token);
    })().catch((e) => {
      signedIn = null;
      throw e;
    });
  }
  return signedIn;
}

export interface ChatMessage {
  id: string;
  senderUserId: number;
  senderName: string;
  message: string;
  sentAt: number;
  senderProfileImage?: string;
  stickerUrl?: string;
}

export function chatChannel(roomName: string, hostUserId: number) {
  return `${roomName}__${hostUserId}`;
}

export function observeChat(channel: string, onMessages: (m: ChatMessage[]) => void, onError: (e: Error) => void) {
  const db = getFirestore(app());
  const q = query(collection(db, "liveChat", channel, "messages"), orderBy("sentAt", "asc"), limitToLast(200));
  return onSnapshot(
    q,
    (snap) => {
      onMessages(
        snap.docs
          .map((d) => {
            const v = d.data();
            if (typeof v.senderUserId !== "number" || typeof v.message !== "string") return null;
            return {
              id: d.id,
              senderUserId: v.senderUserId,
              senderName: String(v.senderName ?? ""),
              message: v.message,
              sentAt: Number(v.sentAt ?? 0),
              senderProfileImage: v.senderProfileImage ? String(v.senderProfileImage) : undefined,
              stickerUrl: v.stickerUrl ? String(v.stickerUrl) : undefined,
            } as ChatMessage;
          })
          .filter((m): m is ChatMessage => m !== null),
      );
    },
    (e) => onError(e),
  );
}

export async function sendChat(channel: string, senderUserId: number, senderName: string, text: string, senderProfileImage = "") {
  const trimmed = text.trim();
  if (!trimmed) return;
  const db = getFirestore(app());
  await addDoc(collection(db, "liveChat", channel, "messages"), {
    senderUserId,
    senderName,
    message: trimmed,
    sentAt: Date.now(),
    senderProfileImage,
  });
}

/** Live captions (the phones' LiveCaptionsManager): a host whose "Captions" switch is on writes each
 *  utterance to liveCaptions/{room}__{hostId}/segments, updated in place while it is spoken. The
 *  newest one is the line to show. Returns the unsubscribe. */
export function observeLiveCaption(roomName: string, speakerUserId: number, onLine: (text: string, isFinal: boolean, updatedAt: number) => void): () => void {
  const db = getFirestore(app());
  const q = query(collection(db, "liveCaptions", `${roomName}__${speakerUserId}`, "segments"), orderBy("updatedAt", "desc"), limit(1));
  return onSnapshot(q, (snap) => {
    const d = snap.docs[0]?.data();
    if (d && typeof d.text === "string") onLine(d.text, d.isFinal !== false, Number(d.updatedAt) || 0);
  }, () => undefined);
}

/** The speaker's side of live captions (the phones' LiveCaptionsManager.updateSegment): one
 *  document per utterance, created on its first words and updated in place until it is final. */
export function liveCaptionWriter(roomName: string, speakerUserId: number) {
  const segments = collection(getFirestore(app()), "liveCaptions", `${roomName}__${speakerUserId}`, "segments");
  let current: Promise<DocumentReference | null> | null = null;
  return {
    update(text: string, isFinal: boolean) {
      const trimmed = text.trim();
      if (!trimmed) return;
      const now = Date.now();
      if (!current) {
        const made = addDoc(segments, { text: trimmed, isFinal, startedAt: now, updatedAt: now }).catch(() => null);
        current = isFinal ? null : made;
        return;
      }
      const ref = current;
      if (isFinal) current = null;
      void ref.then((r) => (r ? setDoc(r, { text: trimmed, isFinal, updatedAt: now }, { merge: true }) : undefined)).catch(() => undefined);
    },
    /** Captions switched off mid-sentence: the next words start a new line. */
    reset() { current = null; },
  };
}
