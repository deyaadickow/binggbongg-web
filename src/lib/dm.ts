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

/** What the phones put in the pointer doc's `lastMsg` for a media message — the inbox shows
 *  this instead of an empty line. Taken from Android's strings: ic_text_image / ic_text_video. */
const MEDIA_LAST_MSG: Record<string, string> = { image: "\u{1F4F7} image", video: "\u{1F3A5} video" };

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
          // A relative S3 key ("uploads/…") on a media message, "" on a text one.
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
async function write(
  me: UserSummary & { identity?: string },
  partner: UserSummary & { identity?: string },
  opts: { msg: string; msgType: "text" | "image" | "video"; image: string },
): Promise<void> {
  const myIdentity = me.identity ?? "";
  const theirIdentity = partner.identity ?? "";
  if (!myIdentity || !theirIdentity) throw new Error(tt("missing_identity"));

  await ensureFirebaseSignIn();
  const db = getFirestore(firebaseApp());
  const cid = conversationId(myIdentity, theirIdentity);
  const time = Date.now();
  const timeStr = String(time);

  await setDoc(doc(db, "chat", cid, "chat", timeStr), {
    id: timeStr,
    msg: opts.msg,
    msgType: opts.msgType,
    image: opts.image,
    time,
    senderUser: senderUser(me, true),
    not_deleted_identities: [myIdentity, theirIdentity],
  });

  // The phones put a label in lastMsg for media, not the caption, so a photo with no words
  // still reads as something in the inbox.
  const lastMsg = opts.msgType === "text" ? opts.msg : MEDIA_LAST_MSG[opts.msgType] ?? opts.msg;

  await setDoc(
    doc(db, "userchatlist", myIdentity, "userlist", theirIdentity),
    { user: senderUser(partner, false), conversationId: cid, newMsg: false, isDeleted: false, time, lastMsg },
    { merge: true },
  );
  await setDoc(
    doc(db, "userchatlist", theirIdentity, "userlist", myIdentity),
    { user: senderUser(me, true), conversationId: cid, newMsg: true, isDeleted: false, time, lastMsg },
    { merge: true },
  );
}

export async function sendMessage(
  me: UserSummary & { identity?: string },
  partner: UserSummary & { identity?: string },
  text: string,
): Promise<void> {
  const body = text.trim();
  if (!body) return;
  await write(me, partner, { msg: body, msgType: "text", image: "" });
}

/** A photo or a video, already uploaded. [key] is the S3 key the upload came back with
 *  ("uploads/…"), which is exactly what the phones store in `image`. */
export async function sendMediaMessage(
  me: UserSummary & { identity?: string },
  partner: UserSummary & { identity?: string },
  key: string,
  kind: "image" | "video",
  caption: string,
): Promise<void> {
  if (!key) throw new Error(tt("nothing_uploaded"));
  await write(me, partner, { msg: caption.trim(), msgType: kind, image: key });
}

/** Clears the unread flag on the reader's own pointer — what the phones do on opening a thread. */
export async function markConversationRead(myIdentity: string, theirIdentity: string): Promise<void> {
  await ensureFirebaseSignIn();
  const db = getFirestore(firebaseApp());
  await setDoc(doc(db, "userchatlist", myIdentity, "userlist", theirIdentity), { newMsg: false }, { merge: true }).catch(
    () => {},
  );
}

// ---------------------------------------------------------------------------------------
// Sending a photo or a video — Steve, 2026-10-11: "Add photos and video to the messages."
//
// Three steps, the same ones every other upload on the web takes (lib/upload.ts): ask the
// backend for a pre-signed S3 slot, PUT the bytes, then write the message pointing at the key
// it landed under. The browser never holds an AWS credential.
//
// PLUS the gate: moderateChatMedia. Steve, 2026-10-11: "Gate the chat media on the backend for
// all three." Chat media was the last unscanned upload surface in the app, on every platform,
// because it never touches the server — the client gets a pre-signed S3 url, PUTs the bytes,
// and writes the message into Firestore. The backend endpoint is now the chokepoint between
// those two steps: same PhotoDNA + Hive helpers every other upload uses, and on a flag it
// DELETES the object from S3 rather than leaving it in the bucket.
//
// Fails OPEN on a network error, so moderation being down never blocks a legitimate message —
// but NOT on a flag, which is refused.

import { createUploadUrls, putToSignedUrl, videoThumbnail } from "./upload";
import { post } from "./api";
import { tt } from "./i18n";

export const DM_MAX_IMAGE_BYTES = 12 * 1024 * 1024;
export const DM_MAX_VIDEO_BYTES = 80 * 1024 * 1024;

/** Asks the backend's gate about an upload. Throws with the server's own wording when it is
 *  refused; returns quietly when it is allowed OR when the check could not be made at all. */
async function assertAllowed(userId: number, key: string, kind: "image" | "video", thumbKey?: string): Promise<void> {
  let res;
  try {
    res = await post<unknown>("moderateChatMedia", {
      user_id: userId,
      key,
      kind,
      ...(thumbKey ? { thumb_key: thumbKey } : {}),
    });
  } catch {
    return; // Fails open — see this section's own note.
  }
  // `flagged` sits at the top level of the response, beside `status`, not inside `data`.
  const body = res as unknown as { flagged?: boolean; message?: string };
  if (body.flagged === true) {
    throw new Error(body.message || "That can't be sent.");
  }
}

export interface MediaUploadResult {
  key: string;
  kind: "image" | "video";
}

/**
 * Uploads one picked file and returns the key to attach to a message.
 *
 * For a video the moderation check runs against its first frame, grabbed in the browser and
 * uploaded alongside it — Hive's image endpoint needs something it can fetch, and a frame is a
 * proportionate check for a chat clip. A thumbnail that cannot be produced (an odd codec, a
 * blocked canvas) is not treated as a failure; the video just goes unchecked, same as on the
 * phones.
 */
export async function uploadChatMedia(
  userId: number,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<MediaUploadResult> {
  const isVideo = file.type.startsWith("video/");
  const kind: "image" | "video" = isVideo ? "video" : "image";
  const limit = isVideo ? DM_MAX_VIDEO_BYTES : DM_MAX_IMAGE_BYTES;
  if (file.size > limit) {
    throw new Error(isVideo ? "That video is too large to send." : "That photo is too large to send.");
  }

  const [slot] = await createUploadUrls(userId, [{ file_name: file.name, content_type: file.type || "application/octet-stream" }]);
  if (!slot) throw new Error(tt("couldn_t_prepare_the_upload"));
  await putToSignedUrl(slot, file, onProgress);

  // A video goes up with a still from its first frame: PhotoDNA hashes stills only, so the
  // frame is what gives a clip the cheaper, stronger half of the check. The backend takes both
  // keys and checks the thumbnail first, exactly as it does for a posted video.
  let thumbKey: string | undefined;
  if (isVideo) {
    try {
      const frame = await videoThumbnail(file);
      const thumbName = `${slot.file_name.replace(/\.[^.]+$/, "")}-frame.jpg`;
      const [thumbSlot] = await createUploadUrls(userId, [{ file_name: thumbName, content_type: "image/jpeg" }]);
      if (thumbSlot) {
        await putToSignedUrl(thumbSlot, new File([frame], thumbName, { type: "image/jpeg" }));
        thumbKey = thumbSlot.key;
      }
    } catch {
      // No frame to be had (an odd codec, a blocked canvas) — the clip itself is still checked.
    }
  }

  await assertAllowed(userId, slot.key, kind, thumbKey);

  return { key: slot.key, kind };
}
