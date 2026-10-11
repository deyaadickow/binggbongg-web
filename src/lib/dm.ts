// Direct messages on the web — Steve, 2026-10-11: "Yes please start the direct messages on
// the web." The phones have had one-to-one chat since long before the web existed; this is the
// same conversation, not a new one, so every path and field name below is taken from the apps'
// own code rather than invented:
//
//   messages   chat/{conversationId}/chat/{timeMillis}
//   pointers   userchatlist/{ownerIdentity}/userlist/{otherIdentity}
//   id         conversationId = the two identities sorted and concatenated, no separator
//
// (Android: ChattingActivity.makeConversationId / Const.F_CHAT / Const.F_USER_CHATS_LIST;
// iOS: ChattingViewModel. The Firestore rules in bingg-bongg-advertising/firestore.rules are
// written against exactly these shapes.)
//
// Auth: the same Firebase custom token the live chat already uses (ensureFirebaseSignIn). The
// rules key everything off its `identity` claim, so a browser that has not been through
// signInWithCustomToken is denied rather than erroring.
import { getFirestore, collection, doc, limit, onSnapshot, orderBy, query, setDoc, where } from "firebase/firestore";
import { ensureFirebaseSignIn, firebaseApp } from "./firebase";
import type { UserSummary } from "./api";

/** Both apps sort the two identities and concatenate them with NO separator. Do not "improve"
 *  this — it has to match character for character or the web opens a different conversation. */
export function conversationId(a: string, b: string): string {
  return [a, b].sort().join("");
}

/** The participant blob both apps embed in every message and every pointer document
 *  (Android's SenderUser). `age` really is the string "1" on both phones. */
export function senderUser(u: UserSummary & { identity?: string }, isNew: boolean) {
  return {
    date: Date.now(),
    is_new_msg: isNew,
    selected: true,
    is_verified: (u.is_verified ?? 0) === 2,
    user_id: u.id,
    user_name: u.username ?? "",
    full_name: u.fullname ?? "",
    user_image: u.profile_image ?? "",
    user_identity: u.identity ?? "",
    age: "1",
  };
}

export interface DmMessage {
  id: string;
  msg: string;
  msgType: string;
  image: string;
  time: number;
  senderIdentity: string;
}

export interface DmConversation {
  partnerIdentity: string;
  partnerId: number;
  partnerName: string;
  partnerUsername: string;
  partnerImage: string;
  lastMsg: string;
  time: number;
  unread: boolean;
}

/** The caller's own inbox bucket, newest first. Reads only `userchatlist/{me}/...`, which is
 *  the only bucket the rules let anyone read. */
export async function observeConversations(
  myIdentity: string,
  onChange: (rows: DmConversation[]) => void,
  onError: (e: Error) => void,
): Promise<() => void> {
  await ensureFirebaseSignIn();
  const db = getFirestore(firebaseApp());
  const q = query(collection(db, "userchatlist", myIdentity, "userlist"), orderBy("time", "desc"), limit(100));
  return onSnapshot(
    q,
    (snap) => {
      onChange(
        snap.docs
          .map((d) => {
            const v = d.data() as Record<string, any>;
            if (v.isDeleted === true) return null;
            const u = (v.user ?? {}) as Record<string, any>;
            return {
              partnerIdentity: String(u.user_identity ?? d.id),
              partnerId: Number(u.user_id ?? 0),
              partnerName: String(u.full_name ?? ""),
              partnerUsername: String(u.user_name ?? ""),
              partnerImage: String(u.user_image ?? ""),
              lastMsg: String(v.lastMsg ?? ""),
              time: Number(v.time ?? 0),
              unread: v.newMsg === true,
            } as DmConversation;
          })
          .filter((r): r is DmConversation => r !== null),
      );
    },
    (e) => onError(e as Error),
  );
}

/** One conversation's messages, oldest-first for display.
 *
 *  The `whereArrayContains` is not optional decoration — the read rule only allows a message
 *  while the caller's identity is still in `not_deleted_identities`, and a query without that
 *  filter is rejected outright rather than silently filtered. Both apps' queries carry it for
 *  the same reason. */
export async function observeMessages(
  cid: string,
  myIdentity: string,
  onChange: (rows: DmMessage[]) => void,
  onError: (e: Error) => void,
): Promise<() => void> {
  await ensureFirebaseSignIn();
  const db = getFirestore(firebaseApp());
  const q = query(
    collection(db, "chat", cid, "chat"),
    where("not_deleted_identities", "array-contains", myIdentity),
    orderBy("id", "desc"),
    limit(60),
  );
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => {
        const v = d.data() as Record<string, any>;
        return {
          id: String(v.id ?? d.id),
          msg: String(v.msg ?? ""),
          msgType: String(v.msgType ?? "text"),
          image: String(v.image ?? ""),
          // Written as a double by both apps; a string has been seen in older rows.
          time: Number(v.time ?? 0),
          senderIdentity: String(v.senderUser?.user_identity ?? ""),
        } as DmMessage;
      });
      // Queried newest-first because that is the shape the index and the rules expect;
      // displayed oldest-first.
      onChange(rows.reverse());
    },
    (e) => onError(e as Error),
  );
}

/** Send one text message, writing all three documents the phones write: the message itself and
 *  BOTH pointer documents, so the conversation appears in each side's inbox with the right
 *  unread state. `merge` rather than the apps' set-or-update branch — same result, and it does
 *  not need to know first whether the pointer already exists. */
export async function sendMessage(
  me: UserSummary & { identity?: string },
  partner: UserSummary & { identity?: string },
  text: string,
): Promise<void> {
  const myIdentity = me.identity ?? "";
  const theirIdentity = partner.identity ?? "";
  if (!myIdentity || !theirIdentity) throw new Error("Missing identity");
  const body = text.trim();
  if (!body) return;

  await ensureFirebaseSignIn();
  const db = getFirestore(firebaseApp());
  const cid = conversationId(myIdentity, theirIdentity);
  const time = Date.now();
  const timeStr = String(time);

  await setDoc(doc(db, "chat", cid, "chat", timeStr), {
    id: timeStr,
    msg: body,
    msgType: "text",
    image: "",
    time,
    senderUser: senderUser(me, true),
    not_deleted_identities: [myIdentity, theirIdentity],
  });

  await setDoc(
    doc(db, "userchatlist", myIdentity, "userlist", theirIdentity),
    { user: senderUser(partner, false), conversationId: cid, newMsg: false, isDeleted: false, time, lastMsg: body },
    { merge: true },
  );
  await setDoc(
    doc(db, "userchatlist", theirIdentity, "userlist", myIdentity),
    { user: senderUser(me, true), conversationId: cid, newMsg: true, isDeleted: false, time, lastMsg: body },
    { merge: true },
  );
}

/** Clears the unread flag on the reader's own pointer — what the phones do on opening a thread. */
export async function markConversationRead(myIdentity: string, theirIdentity: string): Promise<void> {
  await ensureFirebaseSignIn();
  const db = getFirestore(firebaseApp());
  await setDoc(doc(db, "userchatlist", myIdentity, "userlist", theirIdentity), { newMsg: false }, { merge: true }).catch(
    () => {},
  );
}
