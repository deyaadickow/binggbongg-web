// Steve, 2026-10-11: "Yes please start the direct messages on the web."
//
// One conversation. The same Firestore documents the phones read and write (see lib/dm.ts), so
// a message typed here lands in the other person's app and vice versa — this is not a separate
// web inbox.
//
// Design follows the chat page the phones got the same day: both sides black with a gold ring
// (mine full strength, theirs at half), gold lettering, a rule under every message, and the
// whole conversation inside the gold frame with the header and the message bar outside it.
//
// Translation is the same feature too — a globe picks the language YOU read in, and each
// message grows a dimmed second line. Per reader, nothing stored, the sender is never told.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Avatar, Loading, Notice } from "../components/Common";
import { post, type UserSummary } from "../lib/api";
import {
  conversationId, markConversationRead, observeMessages, sendMediaMessage, sendMessage,
  uploadChatMedia, type DmMessage,
} from "../lib/dm";
import { mediaUrl } from "../lib/api";
import { useSession } from "../lib/session";
import { TRANSLATION_LANGUAGES, translateChatMessage } from "../lib/translate";

function dayLabel(ms: number): string {
  const d = new Date(ms);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date(today.getTime() - 86400000);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export function ChatPage() {
  const { id } = useParams();
  const { user } = useSession();
  const myIdentity = user?.identity ?? "";

  const [partner, setPartner] = useState<UserSummary | null>(null);
  const [messages, setMessages] = useState<DmMessage[] | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // Steve, 2026-10-11: "Add photos and video to the messages." Picked, previewed with a
  // caption, then uploaded on send — so a mis-pick costs nothing and the caption travels with
  // it the way it does on the phones.
  const [pending, setPending] = useState<{ file: File; url: string; isVideo: boolean } | null>(null);
  const [progress, setProgress] = useState(0);
  const filePicker = useRef<HTMLInputElement | null>(null);

  // Translation: the language this conversation is READ in, plus one cached line per message.
  // A message mapped to "" is a resolved nothing-to-show (already in that language, or the
  // request failed) so it is never asked about twice — the same rule the phones follow.
  const [target, setTarget] = useState<string>("");
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const inFlight = useRef<Set<string>>(new Set());
  const bottom = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      try {
        const res = await post<UserSummary>("fetchUserDetails", { user_id: id, ...(user ? { my_user_id: user.id } : {}) });
        if (!res.status || !res.data) throw new Error(res.message ?? "Member not found.");
        setPartner(res.data);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [id, user]);

  const cid = useMemo(
    () => (myIdentity && partner?.identity ? conversationId(myIdentity, partner.identity) : ""),
    [myIdentity, partner?.identity],
  );

  useEffect(() => {
    if (!cid || !myIdentity) return;
    let stop: (() => void) | null = null;
    let dead = false;
    void observeMessages(
      cid,
      myIdentity,
      (rows) => { if (!dead) setMessages(rows); },
      (e) => { if (!dead) setError(e.message || "Couldn't load this conversation."); },
    ).then((unsub) => { if (dead) unsub(); else stop = unsub; })
     .catch((e) => { if (!dead) setError(String(e?.message ?? e)); });
    return () => { dead = true; stop?.(); };
  }, [cid, myIdentity]);

  // Opening a thread clears its unread flag, same as the phones.
  useEffect(() => {
    if (myIdentity && partner?.identity) void markConversationRead(myIdentity, partner.identity);
  }, [myIdentity, partner?.identity]);

  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [messages?.length]);

  // Switching language drops everything cached, so the previous language's lines never linger.
  useEffect(() => { setTranslations({}); inFlight.current.clear(); }, [target]);

  const wantTranslation = useCallback(
    (m: DmMessage) => {
      if (!target || !m.msg.trim()) return;
      if (m.id in translations || inFlight.current.has(m.id)) return;
      inFlight.current.add(m.id);
      const forLanguage = target;
      void translateChatMessage(m.msg, forLanguage).then((res) => {
        inFlight.current.delete(m.id);
        // The reader may have changed language while this was in the air.
        setTarget((current) => {
          if (current !== forLanguage) return current;
          const line = res?.translated?.trim() ?? "";
          const useful = line && line.toLowerCase() !== m.msg.trim().toLowerCase();
          setTranslations((prev) => ({ ...prev, [m.id]: useful ? line : "" }));
          return current;
        });
      });
    },
    [target, translations],
  );

  useEffect(() => { messages?.forEach(wantTranslation); }, [messages, wantTranslation]);

  function pick(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setError(null);
    setPending({ file, url: URL.createObjectURL(file), isVideo: file.type.startsWith("video/") });
  }

  function clearPending() {
    if (pending) URL.revokeObjectURL(pending.url);
    setPending(null);
    setProgress(0);
  }

  async function send() {
    if (!user || !partner || sending) return;
    if (!pending && !draft.trim()) return;
    setSending(true);
    setError(null);
    try {
      if (pending) {
        const { key, kind } = await uploadChatMedia(user.id, pending.file, setProgress);
        await sendMediaMessage(user, partner, key, kind, draft);
        clearPending();
      } else {
        await sendMessage(user, partner, draft);
      }
      setDraft("");
    } catch (e) {
      setError((e as Error).message || "Couldn't send that.");
    } finally {
      setSending(false);
      setProgress(0);
    }
  }

  if (!user) return <Notice>Sign in to send messages.</Notice>;
  if (!myIdentity) return <Notice error>Your session is missing its chat identity. Please sign out and sign in again.</Notice>;

  let lastDay = "";

  return (
    <div className="page dm-page">
      <div className="dm-header">
        <Link to="/messages" className="btn ghost small">←</Link>
        <Avatar user={partner} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="dm-row-name">{partner?.fullname ?? "…"}</div>
          {partner?.username && <div className="dm-handle">@{partner.username}</div>}
        </div>
        <label className="dm-translate" title="Translate this conversation">
          <span aria-hidden>🌐</span>
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">None</option>
            {TRANSLATION_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.native}</option>)}
          </select>
        </label>
      </div>

      {error && <Notice error>{error}</Notice>}

      <div className="dm-thread">
        {messages === null && !error && <Loading />}
        {messages?.length === 0 && <p className="muted center">No messages yet — say hello.</p>}
        {messages?.map((m) => {
          const mine = m.senderIdentity === myIdentity;
          const day = dayLabel(m.time);
          const showDay = day !== lastDay;
          lastDay = day;
          const second = translations[m.id];
          return (
            <div key={m.id}>
              {showDay && <div className="dm-day"><span>{day}</span></div>}
              <div className={`dm-msg-row ${mine ? "mine" : "theirs"}`}>
                <div className={`dm-bubble ${mine ? "mine" : "theirs"}`}>
                  {m.msgType === "image" && m.image && (
                    <a href={mediaUrl(m.image)} target="_blank" rel="noopener noreferrer">
                      <img className="dm-media" src={mediaUrl(m.image)} alt={m.msg || "Photo"} />
                    </a>
                  )}
                  {m.msgType === "video" && m.image && (
                    <video className="dm-media" src={mediaUrl(m.image)} controls preload="metadata" />
                  )}
                  {m.msg && <div className={m.msgType === "text" ? undefined : "dm-caption"}>{m.msg}</div>}
                  {second && <><div className="dm-bubble-rule" /><div className="dm-translated">{second}</div></>}
                </div>
                <span className="dm-time">
                  {new Date(m.time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </span>
              </div>
              <div className="dm-rule" />
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      {pending && (
        <div className="dm-pending">
          {pending.isVideo
            ? <video className="dm-pending-media" src={pending.url} muted playsInline />
            : <img className="dm-pending-media" src={pending.url} alt="" />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="dm-pending-name">{pending.file.name}</div>
            <div className="dm-pending-hint">
              {sending
                ? `Sending… ${Math.round(progress * 100)}%`
                : "Add a caption if you like, then Send."}
            </div>
          </div>
          <button className="btn ghost small" onClick={clearPending} disabled={sending}>Remove</button>
        </div>
      )}

      <div className="dm-composer">
        <input
          ref={filePicker}
          type="file"
          accept="image/*,video/*"
          hidden
          onChange={(e) => { pick(e.target.files); e.target.value = ""; }}
        />
        <button
          className="btn ghost dm-attach"
          title="Send a photo or a video"
          disabled={sending}
          onClick={() => filePicker.current?.click()}
        >+</button>
        <input
          className="input"
          placeholder={pending ? "Caption (optional)" : "Write Something"}
          value={draft}
          maxLength={1000}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void send(); }}
        />
        <button className="btn" disabled={(!draft.trim() && !pending) || sending} onClick={() => void send()}>Send</button>
      </div>
    </div>
  );
}
