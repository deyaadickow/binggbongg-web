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
import { Link, useLocation, useParams } from "react-router-dom";
import { Avatar, Loading, Notice } from "../components/Common";
import { post, type UserSummary } from "../lib/api";
import {
  conversationId, DM_MAX_VOICE_SECONDS, fetchDmStatus, markConversationRead, noteDmSent, observeMessages, pickVoiceMime,
  sendMediaMessage, sendMessage, sendVoiceMessage, uploadChatMedia, uploadVoiceMessage, type DmMessage, type DmStatus,
} from "../lib/dm";
import { displayName } from "../lib/api";
import { mediaUrl } from "../lib/api";
import { useSession } from "../lib/session";
import { memberLabel, trackPage } from "../lib/pageTracker";
import { TRANSLATION_LANGUAGES, translateChatMessage } from "../lib/translate";
import { tt, useT  } from "../lib/i18n";
import { requireVerified } from "../lib/verifyEmail";

function dayLabel(ms: number): string {
  const d = new Date(ms);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date(today.getTime() - 86400000);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

/** 0:07 — minutes and zero-padded seconds, the way the phones show a voice message's length. */
function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Only one voice message plays at a time, across every bubble on the page.
let playingVoice: HTMLAudioElement | null = null;

/** A voice message: gold play/pause circle, a thin gold progress bar and the length. */
function VoiceBubble({ src, duration }: { src: string; duration?: number }) {
  const { t } = useT();
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  // A browser recording (WebM) often reports its length as Infinity, so the stored duration
  // wins; the element's own figure is only a fallback for rows written without one.
  const [known, setKnown] = useState<number | undefined>(duration);
  const total = duration ?? known ?? 0;

  useEffect(() => () => {
    if (playingVoice === audio.current) playingVoice = null;
    audio.current?.pause();
  }, []);

  function toggle() {
    const el = audio.current;
    if (!el) return;
    if (!el.paused) { el.pause(); return; }
    if (playingVoice && playingVoice !== el) playingVoice.pause();
    playingVoice = el;
    void el.play().catch(() => setPlaying(false));
  }

  const fraction = total > 0 ? Math.min(1, at / total) : 0;
  return (
    <div className="dm-voice">
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setAt(0); if (audio.current) audio.current.currentTime = 0; }}
        onTimeUpdate={(e) => setAt(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (Number.isFinite(d) && d > 0) setKnown(d); }}
      />
      <button type="button" className="dm-voice-play" onClick={toggle} aria-label={playing ? t("vm_pause") : t("vm_play")}>
        {playing ? (
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" /><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
        )}
      </button>
      <div className="dm-voice-track"><div className="dm-voice-fill" style={{ width: `${fraction * 100}%` }} /></div>
      <span className="dm-voice-len">{clock(playing || at > 0 ? at : total)}</span>
    </div>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
      <path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function SendArrow() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden><path d="M3 20l18-8L3 4v6l12 2-12 2z" fill="currentColor" /></svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChatPage() {
  const { t } = useT();
  const { id } = useParams();
  const { user } = useSession();
  const myIdentity = user?.identity ?? "";

  const [partner, setPartner] = useState<UserSummary | null>(null);
  const [messages, setMessages] = useState<DmMessage[] | null>(null);
  // A link handed over by another page to send here — Bingg Bongg Song's "Send to someone"
  // (2026-11-16) opens the chat with the song's link already typed; the member presses Send.
  const location = useLocation();
  const [draft, setDraft] = useState(() => {
    const d = (location.state as { draft?: unknown } | null)?.draft;
    return typeof d === "string" ? d : "";
  });
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

  // Message limits (Steve, 2026-11-09): one message until they reply, and nothing at all when
  // they've switched messages off or stopped you. The server decides; null = not asked yet.
  const [dmStatus, setDmStatus] = useState<DmStatus | null>(null);

  // Voice messages (Steve, 2026-11-18: "Add a voice message to send to all chats."). Tap the
  // mic to start, tap the gold arrow to send, the trash to throw it away. Stops itself at 60 s.
  const [rec, setRec] = useState<{ started: number; elapsed: number; stopped: boolean } | null>(null);
  const [micNote, setMicNote] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const recStream = useRef<MediaStream | null>(null);
  const recBlob = useRef<Promise<Blob> | null>(null);
  const recStoppedAt = useRef<number | null>(null);

  function releaseMic() {
    recStream.current?.getTracks().forEach((tr) => tr.stop());
    recStream.current = null;
  }

  function stopRecorder() {
    const r = recorder.current;
    if (r && r.state !== "inactive") r.stop();
    if (recStoppedAt.current === null) recStoppedAt.current = Date.now();
    releaseMic();
  }

  // Leaving the page (or the conversation) never leaves the microphone on.
  useEffect(() => () => { stopRecorder(); recorder.current = null; }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setRec(null); setMicNote(null); }, [id]);

  // The running clock, and the 60-second stop.
  useEffect(() => {
    if (!rec || rec.stopped) return;
    const tick = window.setInterval(() => {
      setRec((cur) => {
        if (!cur || cur.stopped) return cur;
        const elapsed = (Date.now() - cur.started) / 1000;
        if (elapsed >= DM_MAX_VOICE_SECONDS) {
          stopRecorder();
          return { ...cur, elapsed: DM_MAX_VOICE_SECONDS, stopped: true };
        }
        return { ...cur, elapsed };
      });
    }, 200);
    return () => window.clearInterval(tick);
  }, [rec?.started, rec?.stopped]); // eslint-disable-line react-hooks/exhaustive-deps

  async function startRecording() {
    if (sending || rec) return;
    setError(null);
    setMicNote(null);
    // A refusal gets a plain note and nothing more — never a "please allow" or "are you sure"
    // after the member has said no.
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMicNote(t("vm_mic_unavailable"));
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setMicNote(t("vm_mic_unavailable"));
      return;
    }
    const mime = pickVoiceMime();
    let r: MediaRecorder;
    try {
      r = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch {
      stream.getTracks().forEach((tr) => tr.stop());
      setMicNote(t("vm_mic_unavailable"));
      return;
    }
    const chunks: Blob[] = [];
    r.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recBlob.current = new Promise<Blob>((resolve) => {
      r.onstop = () => resolve(new Blob(chunks, { type: (r.mimeType || mime || "audio/webm").split(";")[0] }));
    });
    recorder.current = r;
    recStream.current = stream;
    recStoppedAt.current = null;
    r.start(250);
    setRec({ started: Date.now(), elapsed: 0, stopped: false });
  }

  function cancelRecording() {
    stopRecorder();
    recorder.current = null;
    recBlob.current = null;
    setRec(null);
  }

  async function sendRecording() {
    if (!rec || !user || !partner || sending) return;
    const started = rec.started;
    stopRecorder();
    const seconds = Math.min(DM_MAX_VOICE_SECONDS, ((recStoppedAt.current ?? Date.now()) - started) / 1000);
    const pendingBlob = recBlob.current;
    recorder.current = null;
    recBlob.current = null;
    // Under a second is a slip of the finger, not a message.
    if (!pendingBlob || seconds < 1) { setRec(null); return; }
    if (dmStatus && !dmStatus.can_send) { setRec(null); return; }
    if (!requireVerified()) { setRec(null); return; }
    setRec({ ...rec, elapsed: seconds, stopped: true });
    setSending(true);
    setError(null);
    try {
      const blob = await pendingBlob;
      const key = await uploadVoiceMessage(user.id, blob, setProgress);
      await sendVoiceMessage(user, partner, key, seconds);
      void noteDmSent(user.id, partner.id).then(setDmStatus);
    } catch (e) {
      setError((e as Error).message || "Couldn't send that.");
    } finally {
      setSending(false);
      setProgress(0);
      setRec(null);
    }
  }

  useEffect(() => {
    if (!id) return;
    void (async () => {
      try {
        const res = await post<UserSummary>("fetchUserDetails", { user_id: id, ...(user ? { my_user_id: user.id } : {}) });
        if (!res.status || !res.data) throw new Error(res.message ?? tt("member_not_found"));
        setPartner(res.data);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [id, user]);

  // Page history: who this chat was with — and nothing else. Never the messages. Checked against
  // the URL, since going from one chat to another keeps the previous partner for a moment.
  useEffect(() => {
    if (id && partner && String(partner.id) === String(id)) trackPage("chat", "member", id, memberLabel(partner));
  }, [id, partner?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Has the other member ever written in this thread? Sent to the server as a hint, and a flip
  // from false to true (they reply while the thread is open) asks again, which unlocks the bar.
  const theyReplied = useMemo(
    () => !!partner?.identity && !!messages?.some((m) => m.senderIdentity === partner.identity),
    [messages, partner?.identity],
  );
  const historyLoaded = messages !== null;
  useEffect(() => {
    if (!user || !partner || String(partner.id) !== String(id) || !historyLoaded) return;
    let alive = true;
    void fetchDmStatus(user.id, partner.id, theyReplied).then((s) => { if (alive) setDmStatus(s); });
    return () => { alive = false; };
  }, [user?.id, partner?.id, id, historyLoaded, theyReplied]); // eslint-disable-line react-hooks/exhaustive-deps

  // A different conversation starts unknown again.
  useEffect(() => { setDmStatus(null); }, [id]);

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
    if (dmStatus && !dmStatus.can_send) return;
    // Direct messages go straight to Firestore, so the server cannot ask for the email (2026-11-05).
    if (!requireVerified()) return;
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
      // The server counts the send and answers with what is allowed next (wait_reply after a
      // first message). Its own failure leaves the bar open — see lib/dm.ts.
      void noteDmSent(user.id, partner.id).then(setDmStatus);
    } catch (e) {
      setError((e as Error).message || "Couldn't send that.");
    } finally {
      setSending(false);
      setProgress(0);
    }
  }

  if (!user) return <Notice>{t("sign_in_to_send_messages")}</Notice>;
  if (!myIdentity) return <Notice error>{t("your_session_is_missing_its_chat_identit")}</Notice>;

  let lastDay = "";

  const partnerName = displayName(partner);
  const locked = !!dmStatus && !dmStatus.can_send;
  // messages_off and blocked read the SAME — a member is never told they were stopped.
  const notice = !dmStatus ? null
    : dmStatus.reason === "wait_reply" && locked ? t("dm_wait_reply", partnerName)
    : (dmStatus.reason === "messages_off" || dmStatus.reason === "blocked" || dmStatus.reason === "no_user") && locked
      ? t("dm_not_accepting", partnerName)
    : dmStatus.reason === "first_message" && !locked ? t("dm_first_hint", partnerName)
    : null;

  return (
    <div className="page dm-page">
      <div className="dm-header">
        <Link to="/messages" className="btn ghost small">←</Link>
        <Avatar user={partner} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="dm-row-name">{partner?.fullname ?? "…"}</div>
          {partner?.username && <div className="dm-handle">@{partner.username}</div>}
        </div>
        <label className="dm-translate" title={t("translate_this_conversation")}>
          <span aria-hidden>🌐</span>
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">{t("none")}</option>
            {TRANSLATION_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.native}</option>)}
          </select>
        </label>
      </div>

      {error && <Notice error>{error}</Notice>}

      <div className="dm-thread">
        {messages === null && !error && <Loading />}
        {messages?.length === 0 && <p className="muted center">{t("no_messages_yet_say_hello")}</p>}
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
                  {m.msgType === "audio" && m.image && <VoiceBubble src={mediaUrl(m.image)} duration={m.duration} />}
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
          <button className="btn ghost small" onClick={clearPending} disabled={sending}>{t("remove")}</button>
        </div>
      )}

      {notice && <div className={`dm-limit${locked ? " locked" : ""}`} role="status">{notice}</div>}
      {micNote && <div className="dm-limit" role="status">{micNote}</div>}

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
          title={t("send_a_photo_or_a_video")}
          disabled={sending || locked || !!rec}
          onClick={() => filePicker.current?.click()}
        >+</button>
        {rec ? (
          <>
            <div className="dm-rec" role="status" aria-live="polite">
              <span className={`dm-rec-dot${rec.stopped ? " still" : ""}`} aria-hidden />
              <span className="dm-rec-time">
                {sending ? `${clock(rec.elapsed)} · ${Math.round(progress * 100)}%` : `${clock(rec.elapsed)} / ${clock(DM_MAX_VOICE_SECONDS)}`}
              </span>
            </div>
            <button type="button" className="dm-round ghost" onClick={cancelRecording} disabled={sending} aria-label={t("vm_discard")} title={t("vm_discard")}>
              <TrashIcon />
            </button>
            <button type="button" className="dm-round" onClick={() => void sendRecording()} disabled={sending} aria-label={t("vm_send")} title={t("vm_send")}>
              <SendArrow />
            </button>
          </>
        ) : (<>
        <input
          className="input"
          placeholder={pending ? "Caption (optional)" : "Write Something"}
          value={draft}
          maxLength={1000}
          disabled={locked}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void send(); }}
        />
        {!draft.trim() && !pending ? (
          <button type="button" className="dm-round" disabled={sending || locked} onClick={() => void startRecording()} aria-label={t("vm_record")} title={t("vm_record")}>
            <MicIcon />
          </button>
        ) : (
          <button className="btn" disabled={(!draft.trim() && !pending) || sending || locked} onClick={() => void send()}>{t("send")}</button>
        )}
        </>)}
      </div>
    </div>
  );
}
