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
import { currentLang } from "../lib/i18n";
import { TRANSLATION_LANGUAGES, translateChatMessage } from "../lib/translate";

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
 */
export function CommentsPanel({ postId, totalComments }: { postId: number; totalComments?: number }) {
  const { user, isLoggedIn } = useSession();
  const navigate = useNavigate();
  const location = useLocation();

  const [comments, setComments] = useState<VideoComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [noMore, setNoMore] = useState(false);
  const [text, setText] = useState("");
  const [voice, setVoice] = useState("");
  const [sending, setSending] = useState(false);
  const [count, setCount] = useState(totalComments ?? 0);

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
  }, []);

  // Leaving the video must not leave a comment talking over the next one.
  useEffect(() => stopVoice, [stopVoice]);

  const load = useCallback(async (more: boolean) => {
    if (more) setLoadingMore(true); else setLoading(true);
    try {
      const start = more ? comments.length : 0;
      const rows = await fetchPostComments(postId, start, PAGE, user?.id);
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
    fetchPostComments(postId, 0, PAGE, user?.id)
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
    if (!body || sending) return;
    setSending(true);
    try {
      const res = await addCommentOnPost({
        postId,
        userId: user.id,
        comment: body,
        voiceType: voice || null,
        // The viewer's own app language as a BARE code — the server resolves it to a full
        // locale. See addCommentOnPost in lib/api.
        language: currentLang(),
      });
      if (res.status && res.data) {
        setComments((prev) => [res.data as VideoComment, ...prev]);
        setCount((n) => n + 1);
        setText("");
        // The voice is a per-comment choice, not a saved setting.
        setVoice("");
      } else if (res.message) {
        // The server refuses to SPEAK a comment with a banned word in it, or one too long to
        // read out, and says so in its own words. The text stays in the box so it can be
        // reworded — before this the comment would just vanish.
        showGoldAlert(res.message);
      }
    } catch {
      showGoldAlert("Couldn't add that comment.");
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

  function toggleVoice(c: VideoComment) {
    if (!c.voice_url || c.id == null) return;
    if (playingId === c.id) { stopVoice(); return; }
    stopVoice();
    const audio = new Audio(c.voice_url);
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
          style={{ minWidth: 170 }}
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
          <button className="btn" disabled={sending || !text.trim()} onClick={() => void send()}>
            {sending ? (voice ? "Speaking…" : "Sending…") : "Send"}
          </button>
        </div>
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
          const tr = c.id != null ? translations[c.id] : undefined;
          return (
            <div key={c.id} className="row" style={{ gap: 10, alignItems: "flex-start" }}>
              <Link to={`/profile/${c.user?.id ?? c.user_id}`}><Avatar user={c.user} /></Link>
              <div style={{ flex: 1, minWidth: 0 }}>
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

                <div className="row" style={{ gap: 8, marginTop: 4, alignItems: "center" }}>
                  {c.voice_url && (
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
                </div>
              </div>
            </div>
          );
        })}
      </div>

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
