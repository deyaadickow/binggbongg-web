// Live chat lives in Firestore (same project + collections the phones use: liveChat/{room__hostId}/messages).
// The browser signs in with a Firebase custom token minted by the LiveKit token server for this session.
import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInWithCustomToken } from "firebase/auth";
import { addDoc, collection, getFirestore, limitToLast, onSnapshot, orderBy, query } from "firebase/firestore";
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
