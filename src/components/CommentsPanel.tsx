import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  COMMENT_VOICES,
  addCommentOnPost,
  deleteComment,
  displayName,
  fetchPostComments,
  mediaUrl,
  type VideoComment,
} from "../lib/api";
import { useSession } from "../lib/session";
import { Avatar } from "./Common";
import { GoldSelect } from "./GoldSelect";
import { showGoldAlert } from "./GoldToast";
import { StickerPicker } from "./StickerPicker";
import type { Sticker } from "../lib/stickers";
import { currentLang } from "../lib/i18n";
import { TRANSLATION_LANGUAGES, translateChatMessage } from "../lib/translate";
import {
  COMMENT_MEDIA_MAX_SECONDS,
  VoiceRecorder,
  discardPending,
  formatDuration,
  preparePhoto,
  prepareVideo,
  uploadPending,
  type PendingMedia,
} from "../lib/commentMedia";
import { fetchCommentsSocial, isPinned, setCommentPinned, socialUser } from "../lib/social";
import { useT } from "../lib/i18n";

const PAGE = 20;

/**
 * Comments under a video — list, write, delete, hear, translate.
 *
 * Steve, 2026-10-21: "Yes add the web too." The web had NO comments at all before this: no list,
 * no box, nothing on a video, while both phones have had them since the app shipped. So this is
 * the whole feature, not just the spoken part.
 *
 * Three things ride along with it, matching the phones:
 *
 *  - **Spoken comments.** A voice picker next to the box; pick one and the server speaks the
 *    typed text with Google TTS and stores the mp3. Every comment that has one shows a bullseye
 *    to play it. Off by default — most comments are read, not heard — and the pick clears after
 *    each send, so it is a per-comment choice rather than a setting.
 *  - **Translation.** Steve, 2026-10-21: "Did we ever add translation to all comments?" — no, and
 *    this is it. Same endpoint the live chat and direct messages already use.
 *  - **Stickers.** A sticker comment from a phone is an image, not text. The web cannot SEND one
 *    yet (there is no sticker picker here), but it must SHOW one or those comments look blank.
 *  - **Photo / Video / Emoji / Voice message** (Steve, 2026-11-16, with a TikTok screenshot: "When
 *    leaving a comment, Give everyone the ability to upload a photo, upload a video, upload an
 *    imoji, upload a voice message."). A gold icon row under the box, like TikTok's. One
 *    attachment per comment; the server moderates it before the comment exists.
 */

/** Quick emoji that drop into the box where the cursor is. Stickers are one tap further. */
const QUICK_EMOJI = [
  "😀", "😂", "🤣", "😍", "🥰", "😘", "😎", "🤩", "🥳", "😇",
  "😅", "😭", "😢", "😡", "😱", "🤔", "🙄", "😴", "🤗", "🙏",
  "👍", "👏", "🙌", "💪", "🔥", "💯", "✨", "🎉", "❤️", "💛",
  "💔", "👀", "🎶", "🏆", "🌹", "🇵🇭", "🇺🇸", "🇮🇩", "😆", "🤭",
];

const GOLD = "var(--gold)";

/** The icons in the row. Plain strokes in gold, the same weight as the phones' row. */
function Icon({ name }: { name: "photo" | "video" | "emoji" | "mic" }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      {name === "photo" && (<>
        <rect x="3" y="4" width="18" height="16" rx="2.5" {...p} />
        <circle cx="9" cy="10" r="1.8" {...p} />
        <path d="M3.5 18l5.5-5.5 4 4 3-3 4.5 4.5" {...p} />
      </>)}
      {name === "video" && (<>
        <rect x="2.5" y="6" width="13.5" height="12" rx="2.5" {...p} />
        <path d="M16 10.5l5.5-3v9l-5.5-3z" {...p} />
      </>)}
      {name === "emoji" && (<>
        <circle cx="12" cy="12" r="9" {...p} />
        <path d="M8 14.5c1 1.4 2.4 2.1 4 2.1s3-.7 4-2.1" {...p} />
        <circle cx="9" cy="10" r=".9" fill="currentColor" />
        <circle cx="15" cy="10" r=".9" fill="currentColor" />
      </>)}
      {name === "mic" && (<>
        <rect x="9" y="3" width="6" height="11" rx="3" {...p} />
        <path d="M5.5 11.5a6.5 6.5 0 0013 0M12 18v3" {...p} />
      </>)}
    </svg>
  );
}

const iconBtn: React.CSSProperties = {
  width: 40, height: 40, borderRadius: 20, display: "inline-flex", alignItems: "center",
  justifyContent: "center", background: "transparent", border: "1px solid rgba(212,175,55,.35)",
  color: GOLD, cursor: "pointer", padding: 0, touchAction: "none",
};
export function CommentsPanel({ postId, totalComments, postOwnerId }: { postId: number; totalComments?: number; postOwnerId?: number }) {
  const { user, isLoggedIn } = useSession();
  const { t } = useT();
  // Pins and video replies (Steve, 2026-11-17) act for the member — on the dev server also the
  // mock's pretend member, whose actions only ever reach lib/socialMock.ts.
  const socialMe = socialUser(user);
  const isCreator = !!socialMe && postOwnerId !== undefined && Number(postOwnerId) === Number(socialMe.id);
  const navigate = useNavigate();
  const location = useLocation();

  const [comments, setComments] = useState<VideoComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [noMore, setNoMore] = useState(false);
  const [text, setText] = useState("");
  const [voice, setVoice] = useState("");
  const [sending, setSending] = useState(false);
  const [stickerPickerOpen, setStickerPickerOpen] = useState(false);
  const [count, setCount] = useState(totalComments ?? 0);

  // The attachment row.
  const [pending, setPending] = useState<PendingMedia | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [lightbox, setLightbox] = useState<{ type: "photo" | "video"; url: string } | null>(null);
  const [voiceProgress, setVoiceProgress] = useState(0);
  const photoInput = useRef<HTMLInputElement | null>(null);
  const videoInput = useRef<HTMLInputElement | null>(null);
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const recorder = useRef<VoiceRecorder | null>(null);
  const recTimer = useRef<number | null>(null);
  const pendingRef = useRef<PendingMedia | null>(null);
  pendingRef.current = pending;
  // Nothing left behind in memory, and no microphone left open, when the panel goes away.
  useEffect(() => () => {
    discardPending(pendingRef.current);
    recorder.current?.cancel();
    if (recTimer.current) window.clearInterval(recTimer.current);
  }, []);

  // Playback — ONE at a time on purpose: a list of comments all talking over each other is
  // unusable, and clicking the one that is playing stops it rather than restarting it.
  const [playingId, setPlayingId] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Translation, the same model as the live chat and direct messages on both phones: pick a
  // language and EVERY comment gets a translated line under it; "" is off, which is the default.
  // One lazy request per (comment, language), cached, in-flight-deduped and FAILING OPEN — a
  // failed translation leaves the comment as the single line it already was.
  //
  // A finished entry of "" is a resolved "nothing to show" (an error, or a comment already in
  // this language) and stops that comment being asked about again.
  const [target, setTarget] = useState<string>("");
  const [translations, setTranslations] = useState<Record<number, string>>({});
  const inFlight = useRef<Set<number>>(new Set());

  const stopVoice = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlayingId(null);
    setVoiceProgress(0);
  }, []);

  // Leaving the video must not leave a comment talking over the next one.
  useEffect(() => stopVoice, [stopVoice]);

  const load = useCallback(async (more: boolean) => {
    if (more) setLoadingMore(true); else setLoading(true);
    try {
      const start = more ? comments.length : 0;
      const rows = await fetchCommentsSocial(postId, start, PAGE, user?.id, () => fetchPostComments(postId, start, PAGE, user?.id));
      setNoMore(rows.length < PAGE);
      setComments((prev) => (more ? [...prev, ...rows] : rows));
    } catch {
      if (!more) setComments([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [postId, user?.id, comments.length]);

  // Only on the post changing — not on every list change, or adding a comment would refetch
  // the whole list and throw away the one just added.
  useEffect(() => {
    let alive = true;
    setComments([]);
    setTranslations({});
    inFlight.current = new Set();
    stopVoice();
    setLoading(true);
    fetchCommentsSocial(postId, 0, PAGE, user?.id, () => fetchPostComments(postId, 0, PAGE, user?.id))
      .then((rows) => { if (alive) { setComments(rows); setNoMore(rows.length < PAGE); } })
      .catch(() => { if (alive) setComments([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, user?.id]);

  useEffect(() => setCount(totalComments ?? 0), [totalComments, postId]);

  function requireLogin(): boolean {
    if (isLoggedIn && user) return true;
    navigate("/login", { state: { from: location.pathname + location.search } });
    return false;
  }

  async function send() {
    if (!requireLogin() || !user) return;
    const body = text.trim();
    if ((!body && !pending) || sending || recording) return;
    setSending(true);
    try {
      let media = null;
      if (pending) {
        setProgress("Uploading…");
        media = await uploadPending(user.id, pending, (f) => setProgress(`Uploading ${Math.round(f * 100)}%`));
        // The server checks the file before the comment exists; a video takes a little while.
        setProgress("Checking…");
      }
      const res = await addCommentOnPost({
        postId,
        userId: user.id,
        comment: body,
        voiceType: voice || null,
        // The viewer's own app language as a BARE code — the server resolves it to a full
        // locale. See addCommentOnPost in lib/api.
        language: currentLang(),
        media,
      });
      if (res.status && res.data) {
        setComments((prev) => [res.data as VideoComment, ...prev]);
        setCount((n) => n + 1);
        setText("");
        // The voice is a per-comment choice, not a saved setting.
        setVoice("");
        discardPending(pending);
        setPending(null);
      } else if (res.message) {
        // The server refuses to SPEAK a comment with a banned word in it, or one too long to
        // read out, and says so in its own words. The text stays in the box so it can be
        // reworded — before this the comment would just vanish.
        showGoldAlert(res.message);
      }
    } catch (e) {
      showGoldAlert(e instanceof Error && e.message ? e.message : "Couldn't add that comment.");
    } finally {
      setSending(false);
      setProgress("");
    }
  }

  function attach(next: PendingMedia) {
    discardPending(pending);
    setPending(next);
    setEmojiOpen(false);
  }

  async function onPickFile(kind: "photo" | "video", file?: File | null) {
    if (!file) return;
    try {
      attach(kind === "photo" ? await preparePhoto(file) : await prepareVideo(file));
    } catch (e) {
      showGoldAlert(e instanceof Error ? e.message : "Couldn't use that file.");
    }
  }

  function insertEmoji(emoji: string) {
    const el = textRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = (text.slice(0, start) + emoji + text.slice(end)).slice(0, 300);
    setText(next);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = Math.min(start + emoji.length, next.length);
      el.setSelectionRange(pos, pos);
    });
  }

  // HOLD the mic to record, let go to finish — the way TikTok and WhatsApp do it. Capped at a
  // minute: the recording stops itself there.
  async function startRecording() {
    if (!requireLogin() || sending || recording) return;
    if (!VoiceRecorder.supported()) {
      showGoldAlert("This browser can't record a voice message.");
      return;
    }
    stopVoice();
    const r = new VoiceRecorder();
    recorder.current = r;
    try {
      await r.start();
    } catch {
      recorder.current = null;
      showGoldAlert("Please allow the microphone to record a voice message.");
      return;
    }
    // Let go before the microphone was granted: nothing to keep.
    if (recorder.current !== r) { r.cancel(); return; }
    setRecording(true);
    setRecSeconds(0);
    recTimer.current = window.setInterval(() => {
      const t = r.elapsed;
      setRecSeconds(t);
      if (t >= COMMENT_MEDIA_MAX_SECONDS) void finishRecording();
    }, 200);
  }

  async function finishRecording() {
    const r = recorder.current;
    recorder.current = null;
    if (recTimer.current) { window.clearInterval(recTimer.current); recTimer.current = null; }
    setRecording(false);
    if (!r) return;
    try {
      const clip = await r.stop();
      if (clip) attach(clip);
      else showGoldAlert("Hold the mic to record a voice message.");
    } catch {
      showGoldAlert("Couldn't record that voice message.");
    }
  }

  function openLightbox(type: "photo" | "video", url?: string | null) {
    if (!url) return;
    stopVoice();
    // The video above keeps its place but goes quiet while this one plays.
    if (type === "video") document.querySelectorAll("video").forEach((v) => v.pause());
    setLightbox({ type, url });
  }

  /**
   * Steve, 2026-10-21: "Add the sticker picker to the web." Picking one sends it immediately —
   * no confirm step — the same as on the phones. A sticker has nothing to read out, so a picked
   * voice never applies to one.
   */
  async function sendSticker(sticker: Sticker) {
    setStickerPickerOpen(false);
    if (!requireLogin() || !user || sending) return;
    setSending(true);
    try {
      const res = await addCommentOnPost({
        postId,
        userId: user.id,
        comment: "",
        stickerUrl: sticker.file,
      });
      if (res.status && res.data) {
        setComments((prev) => [res.data as VideoComment, ...prev]);
        setCount((n) => n + 1);
      } else if (res.message) {
        showGoldAlert(res.message);
      }
    } catch {
      showGoldAlert("Couldn't send that sticker.");
    } finally {
      setSending(false);
    }
  }

  async function remove(c: VideoComment) {
    if (!user || c.id == null) return;
    const keep = comments;
    setComments((prev) => prev.filter((x) => x.id !== c.id));
    setCount((n) => Math.max(0, n - 1));
    try {
      await deleteComment(user.id, c.id);
    } catch {
      setComments(keep);
      setCount((n) => n + 1);
      showGoldAlert("Couldn't delete that comment.");
    }
  }

  /** The creator pins one comment to the top (one per video); unpinning leaves it where it is. */
  async function togglePin(c: VideoComment) {
    if (!socialMe) return;
    const pin = !isPinned(c);
    try {
      await setCommentPinned(socialMe.id, c.id, pin);
      setComments((prev) => {
        const rows = prev.map((x) => (x.id === c.id ? { ...x, is_pinned: pin ? 1 : 0 } : pin ? { ...x, is_pinned: 0 } : x) as VideoComment);
        if (!pin) return rows;
        const top = rows.find((x) => x.id === c.id)!;
        return [top, ...rows.filter((x) => x.id !== c.id)];
      });
      showGoldAlert(t(pin ? "soc_pinned_done" : "soc_unpinned_done"));
    } catch (e) {
      showGoldAlert((e as Error).message || t("something_went_wrong"));
    }
  }

  /** Reply to this comment with a video: the upload page, with the comment as a bubble. */
  function replyWithVideo(c: VideoComment) {
    if (!socialMe) { requireLogin(); return; }
    document.querySelectorAll("video").forEach((v) => v.pause());
    navigate("/upload", { state: { replyComment: {
      id: c.id, post_id: c.post_id ?? postId, comment: c.comment ?? "",
      user_name: c.user?.username ?? "", fullname: c.user?.fullname ?? "",
    } } });
  }

  function toggleVoice(c: VideoComment) {
    const src = c.media_type === "voice" ? c.media_url : c.voice_url;
    if (!src || c.id == null) return;
    if (playingId === c.id) { stopVoice(); return; }
    stopVoice();
    const audio = new Audio(src);
    audio.ontimeupdate = () => {
      const d = audio.duration && isFinite(audio.duration) ? audio.duration : (c.media_duration || 0);
      if (d > 0) setVoiceProgress(Math.min(1, audio.currentTime / d));
    };
    audio.onended = () => stopVoice();
    audio.onerror = () => { stopVoice(); showGoldAlert("That comment could not be played."); };
    audioRef.current = audio;
    setPlayingId(c.id);
    void audio.play().catch(() => { stopVoice(); showGoldAlert("That comment could not be played."); });
  }

  // Switching language must re-translate rather than leave the previous language on screen, so
  // everything cached is dropped, not kept.
  useEffect(() => {
    setTranslations({});
    inFlight.current = new Set();
  }, [target]);

  // Asks for whatever is on screen and not yet done. Runs when the language changes and when
  // more comments load, so "More comments" translates too.
  useEffect(() => {
    if (!target) return;
    let alive = true;
    for (const c of comments) {
      if (c.id == null || !c.comment) continue;
      const id = c.id;
      if (translations[id] !== undefined || inFlight.current.has(id)) continue;
      inFlight.current.add(id);
      const original = c.comment.trim();
      void translateChatMessage(original, target).then((res) => {
        if (!alive) return;
        inFlight.current.delete(id);
        const text = (res?.translated || "").trim();
        setTranslations((prev) => ({
          ...prev,
          // Blank when it failed or came back identical: resolved as nothing to show.
          [id]: text && text.toLowerCase() !== original.toLowerCase() ? text : "",
        }));
      });
    }
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, comments, translations]);

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="row" style={{ alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontWeight: 800, flex: 1 }}>
          {count > 0 ? `${count} ${count === 1 ? "comment" : "comments"}` : "Comments"}
        </div>
        {/* "Message Translation" — the same wording and the same language list both phones use. */}
        <GoldSelect
          value={target}
          onChange={setTarget}
          searchable
          ariaLabel="Message Translation"
          style={{ width: 200, flex: "0 0 auto" }}
          options={[
            { value: "", label: "◎ Translation: None" },
            ...TRANSLATION_LANGUAGES.map((l) => ({ value: l.code, label: `◎ ${l.native}` })),
          ]}
        />
      </div>

      {/* Write a comment. The voice picker sits beside the box, so it is visible BEFORE the
          comment is sent that it is going to be spoken out loud. */}
      <div className="row" style={{ gap: 8, alignItems: "flex-start" }}>
        <textarea
          ref={textRef}
          className="input"
          rows={2}
          placeholder={isLoggedIn ? "Type your comment here" : "Sign in to comment"}
          value={text}
          maxLength={300}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
          }}
          style={{ flex: 1, resize: "vertical" }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 148 }}>
          <GoldSelect
            value={voice}
            onChange={setVoice}
            ariaLabel="Read my comment out loud"
            options={[{ value: "", label: "Don't speak it" }, ...COMMENT_VOICES.map((v) => ({ value: v.key, label: v.label }))]}
          />
          <button className="btn" disabled={sending || recording || (!text.trim() && !pending)} onClick={() => void send()}>
            {sending ? (progress || (voice ? "Speaking…" : "Sending…")) : "Send"}
          </button>
        </div>
      </div>

      {/* The picked or recorded attachment, before it is sent. ✕ takes it off again. */}
      {pending && (
        <div
          className="row"
          style={{
            gap: 10, alignItems: "center", marginTop: 8, padding: 8, borderRadius: 12,
            border: "1px solid rgba(212,175,55,.45)", background: "#000", maxWidth: 420,
          }}
        >
          {pending.type === "voice" ? (
            <audio src={pending.previewUrl} controls style={{ height: 36, flex: 1, minWidth: 0 }} />
          ) : (
            <div style={{ position: "relative", flex: "0 0 auto" }}>
              <img src={pending.previewUrl} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, display: "block" }} />
              {pending.type === "video" && (
                <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: GOLD, fontSize: 22 }}>▶</span>
              )}
            </div>
          )}
          <div style={{ flex: pending.type === "voice" ? "0 0 auto" : 1, fontSize: 13, color: GOLD, fontWeight: 700 }}>
            {pending.type === "photo" && "Photo"}
            {pending.type === "video" && `Video · ${formatDuration(pending.duration)}`}
            {pending.type === "voice" && formatDuration(pending.duration)}
          </div>
          <button
            className="btn small ghost"
            title="Remove"
            disabled={sending}
            onClick={() => { discardPending(pending); setPending(null); }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Steve, 2026-11-16: the TikTok row under the comment box — Photo, Video, Emoji, Voice. */}
      <div className="row" style={{ gap: 10, alignItems: "center", marginTop: 8, position: "relative", flexWrap: "wrap" }}>
        <button style={iconBtn} title="Add a photo" aria-label="Add a photo" disabled={sending}
          onClick={() => { if (requireLogin()) photoInput.current?.click(); }}>
          <Icon name="photo" />
        </button>
        <button style={iconBtn} title="Add a video (up to 1 minute)" aria-label="Add a video" disabled={sending}
          onClick={() => { if (requireLogin()) videoInput.current?.click(); }}>
          <Icon name="video" />
        </button>
        <button
          style={{ ...iconBtn, ...(emojiOpen ? { background: GOLD, color: "#000" } : null) }}
          title="Emoji and stickers" aria-label="Emoji and stickers" disabled={sending}
          onClick={() => setEmojiOpen((o) => !o)}>
          <Icon name="emoji" />
        </button>
        <button
          style={{ ...iconBtn, ...(recording ? { background: "#c62828", color: "#fff", borderColor: "#c62828" } : null) }}
          title="Hold to record a voice message" aria-label="Hold to record a voice message" disabled={sending}
          onPointerDown={(e) => { e.preventDefault(); (e.target as Element).setPointerCapture?.(e.pointerId); void startRecording(); }}
          onPointerUp={() => void finishRecording()}
          onPointerCancel={() => void finishRecording()}
          onContextMenu={(e) => e.preventDefault()}>
          <Icon name="mic" />
        </button>
        {recording ? (
          <span style={{ color: GOLD, fontWeight: 700, fontSize: 13 }}>
            <span style={{ color: "#e53935" }}>●</span> Recording {formatDuration(recSeconds)} / {formatDuration(COMMENT_MEDIA_MAX_SECONDS)} — let go to finish
          </span>
        ) : (
          <span className="muted" style={{ fontSize: 12 }}>Hold the mic to record</span>
        )}

        {emojiOpen && (
          <div
            className="card"
            style={{
              position: "absolute", top: 46, left: 0, zIndex: 30, width: 320, maxWidth: "calc(100vw - 32px)",
              background: "#000", border: "1px solid rgba(212,175,55,.6)", padding: 10,
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 4 }}>
              {QUICK_EMOJI.map((em) => (
                <button key={em} onClick={() => insertEmoji(em)}
                  style={{ fontSize: 22, background: "transparent", border: 0, cursor: "pointer", padding: 4, lineHeight: 1 }}>
                  {em}
                </button>
              ))}
            </div>
            <button className="btn" style={{ width: "100%", marginTop: 8 }}
              onClick={() => { setEmojiOpen(false); if (requireLogin()) setStickerPickerOpen(true); }}>
              Stickers
            </button>
          </div>
        )}
        <input ref={photoInput} type="file" accept="image/*" style={{ display: "none" }}
          onChange={(e) => { void onPickFile("photo", e.target.files?.[0]); e.target.value = ""; }} />
        <input ref={videoInput} type="file" accept="video/mp4,video/quicktime,video/webm,video/*" style={{ display: "none" }}
          onChange={(e) => { void onPickFile("video", e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      {voice !== "" && (
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          This comment will be read out loud. Up to 300 characters.
        </div>
      )}

      {loading && <div className="muted" style={{ marginTop: 12 }}>Loading comments…</div>}
      {!loading && comments.length === 0 && (
        <div className="muted" style={{ marginTop: 12 }}>No comments yet. Be the first.</div>
      )}

      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
        {comments.map((c) => {
          const mine = !!user && c.user?.id === user.id;
          const notMine = !socialMe || Number(c.user?.id ?? c.user_id) !== Number(socialMe.id);
          const pinned = isPinned(c);
          const tr = c.id != null ? translations[c.id] : undefined;
          return (
            <div key={c.id} className="row" style={{ gap: 10, alignItems: "flex-start" }}>
              <Link to={`/profile/${c.user?.id ?? c.user_id}`}><Avatar user={c.user} /></Link>
              <div style={{ flex: 1, minWidth: 0 }}>
                {pinned && <div className="pinned-label">📌 {t("soc_pinned_by_creator")}</div>}
                <Link
                  to={`/profile/${c.user?.id ?? c.user_id}`}
                  style={{ fontWeight: 700, color: "var(--text)", fontSize: 13 }}
                >
                  {c.user?.username ? `@${c.user.username}` : displayName(c.user)}
                </Link>

                {c.comment && (
                  <div className="soft" style={{ fontSize: 14, wordBreak: "break-word" }}>
                    {c.comment}
                  </div>
                )}
                {/* Under the original rather than replacing it — the same way a translated line
                    appears in the live chat and in direct messages. Nothing is drawn until one
                    comes back, so there is no spinner and no placeholder. */}
                {tr && (
                  <div style={{ fontSize: 14, wordBreak: "break-word", color: "var(--gold)" }}>
                    {tr}
                  </div>
                )}
                {/* A sticker comment from a phone. The web cannot send one yet, but it has to
                    show one or the comment reads as empty. */}
                {c.sticker_url && (
                  <img
                    src={mediaUrl(c.sticker_url)}
                    alt="sticker"
                    style={{ width: 64, height: 64, objectFit: "contain", marginTop: 4 }}
                  />
                )}

                {/* Photo: tap to see it big. */}
                {c.media_type === "photo" && c.media_url && (
                  <img
                    src={c.media_url}
                    alt="photo comment"
                    onClick={() => openLightbox("photo", c.media_url)}
                    style={{
                      display: "block", marginTop: 6, maxWidth: 220, maxHeight: 280, width: "auto",
                      borderRadius: 10, cursor: "zoom-in", border: "1px solid rgba(212,175,55,.35)",
                    }}
                  />
                )}
                {/* Video: its still with a gold play button; tap to play it big, with sound. */}
                {c.media_type === "video" && c.media_url && (
                  <button
                    onClick={() => openLightbox("video", c.media_url)}
                    title="Play"
                    style={{
                      position: "relative", display: "block", marginTop: 6, padding: 0, border: "1px solid rgba(212,175,55,.35)",
                      borderRadius: 10, overflow: "hidden", background: "#000", cursor: "pointer",
                    }}
                  >
                    {c.media_thumbnail_url ? (
                      <img src={c.media_thumbnail_url} alt="video comment" style={{ display: "block", maxWidth: 220, maxHeight: 280 }} />
                    ) : (
                      <div style={{ width: 160, height: 220 }} />
                    )}
                    <span style={{
                      position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
                      width: 48, height: 48, borderRadius: 24, background: "rgba(0,0,0,.6)", border: `2px solid ${GOLD}`,
                      color: GOLD, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, paddingLeft: 3,
                    }}>▶</span>
                    {c.media_duration ? (
                      <span style={{
                        position: "absolute", right: 6, bottom: 6, background: "rgba(0,0,0,.7)", color: GOLD,
                        fontSize: 11, fontWeight: 700, borderRadius: 6, padding: "2px 6px",
                      }}>{formatDuration(c.media_duration)}</span>
                    ) : null}
                  </button>
                )}
                {/* Voice message: a gold pill — play/stop, progress, length. */}
                {c.media_type === "voice" && c.media_url && (
                  <button
                    onClick={() => toggleVoice(c)}
                    title={playingId === c.id ? "Stop" : "Play voice message"}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, marginTop: 6, padding: "6px 12px 6px 6px",
                      borderRadius: 22, border: `1px solid ${GOLD}`, background: "#000", color: GOLD, cursor: "pointer",
                      width: 220, maxWidth: "100%",
                    }}
                  >
                    <span style={{
                      width: 30, height: 30, borderRadius: 15, background: GOLD, color: "#000", flex: "0 0 auto",
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13,
                    }}>{playingId === c.id ? "❚❚" : "▶"}</span>
                    <span style={{ flex: 1, height: 4, borderRadius: 2, background: "rgba(212,175,55,.3)", position: "relative" }}>
                      <span style={{
                        position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 2, background: GOLD,
                        width: `${playingId === c.id ? Math.round(voiceProgress * 100) : 0}%`,
                      }} />
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{formatDuration(c.media_duration)}</span>
                  </button>
                )}

                <div className="row" style={{ gap: 8, marginTop: 4, alignItems: "center" }}>
                  {c.voice_url && c.media_type !== "voice" && (
                    <button
                      className="btn small"
                      title={playingId === c.id ? "Stop" : "Hear this comment"}
                      onClick={() => toggleVoice(c)}
                      style={playingId === c.id ? { background: "var(--gold)", color: "#000" } : undefined}
                    >
                      ◎
                    </button>
                  )}
                  {mine && (
                    <button className="btn small ghost" onClick={() => void remove(c)}>Delete</button>
                  )}
                  {isCreator && (
                    <button className="btn small ghost" onClick={() => void togglePin(c)}>📌 {t(pinned ? "soc_unpin" : "soc_pin")}</button>
                  )}
                  {notMine && (
                    <button className="btn small ghost" title={t("soc_reply_with_video")} aria-label={t("soc_reply_with_video")}
                      onClick={() => replyWithVideo(c)}>🎥 {t("soc_reply_with_video")}</button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,.92)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
          }}
        >
          <button
            className="btn small"
            onClick={() => setLightbox(null)}
            style={{ position: "absolute", top: 16, right: 16, zIndex: 1 }}
            aria-label="Close"
          >
            ✕
          </button>
          {lightbox.type === "photo" ? (
            <img src={lightbox.url} alt="" onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 8 }} />
          ) : (
            <video src={lightbox.url} controls autoPlay playsInline onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8, background: "#000" }} />
          )}
        </div>
      )}

      {stickerPickerOpen && (
        <StickerPicker onPick={(s) => void sendSticker(s)} onClose={() => setStickerPickerOpen(false)} />
      )}

      {!loading && !noMore && comments.length > 0 && (
        <button
          className="btn ghost"
          style={{ width: "100%", marginTop: 12 }}
          disabled={loadingMore}
          onClick={() => void load(true)}
        >
          {loadingMore ? "Loading…" : "More comments"}
        </button>
      )}
    </div>
  );
}
