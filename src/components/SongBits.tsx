// Shared pieces of Bingg Bongg Song (Steve, 2026-11-16): the player whose lyric lines light up in
// time with the singing, the dancing gold notes of the "making" screen, and the "Send to someone"
// sheet that hands the song's link to the member's own direct messages.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Avatar, Loading } from "./Common";
import { lineIndexAt, type SongLine } from "../lib/song";
import { observeConversations, type DmConversation } from "../lib/dm";
import { useSession } from "../lib/session";
import { useT } from "../lib/i18n";
import { fmt } from "../lib/videoKit";

export const SONG_GOLD_CARD: React.CSSProperties = { background: "#000", border: "1.5px solid var(--gold-border)", borderRadius: 16, padding: 16 };

/**
 * The song and its words. The line being sung is big and bright gold, the ones already sung go
 * dim, and the list keeps the current line in the middle of its own box (the page itself is never
 * scrolled under the member). Tapping a line jumps the song there.
 */
export function LyricsPlayer({ src, lines, autoPlay, onEnded, height = 300 }: {
  src: string; lines: SongLine[]; autoPlay?: boolean; onEnded?: () => void; height?: number;
}) {
  const { t } = useT();
  const audio = useRef<HTMLAudioElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [cur, setCur] = useState(-1);
  const [failed, setFailed] = useState(false);

  // Follow the playback ~30x a second while it plays (timeupdate alone is only ~4x).
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const step = () => {
      const a = audio.current;
      if (a) { setTime(a.currentTime); setCur(lineIndexAt(lines, a.currentTime)); }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, lines]);

  // Keep the line being sung in the middle of the box.
  useEffect(() => {
    const b = box.current;
    if (!b || cur < 0) return;
    const el = b.querySelector<HTMLElement>(`[data-line="${cur}"]`);
    if (el) b.scrollTo({ top: el.offsetTop - b.clientHeight / 2 + el.clientHeight / 2, behavior: "smooth" });
  }, [cur]);

  // Never leave a song playing behind a page that has gone.
  useEffect(() => () => { audio.current?.pause(); }, []);

  function toggle() {
    const a = audio.current;
    if (!a) return;
    if (a.paused) void a.play().catch(() => setFailed(true));
    else a.pause();
  }
  function seek(s: number) {
    const a = audio.current;
    if (!a) return;
    a.currentTime = s;
    setTime(s);
    setCur(lineIndexAt(lines, s));
  }

  return (
    <div data-testid="lyrics-player" data-current-line={cur} data-time={time.toFixed(2)}>
      <audio
        ref={audio}
        src={src}
        preload="auto"
        autoPlay={autoPlay}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCur(-1); onEnded?.(); }}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => { if (!playing) setTime(e.currentTarget.currentTime); }}
        onError={() => setFailed(true)}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button type="button" onClick={toggle} aria-label={playing ? t("song_pause") : t("song_play")}
          style={{ width: 58, height: 58, flex: "0 0 58px", borderRadius: "50%", border: "2px solid var(--gold-border)", background: "var(--gold)", color: "#000", fontSize: 24, fontWeight: 900, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {playing ? "❚❚" : "▶"}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <input type="range" min={0} max={dur || 1} step={0.1} value={Math.min(time, dur || 1)} onChange={(e) => seek(Number(e.target.value))}
            aria-label={t("song_position")} style={{ width: "100%", accentColor: "var(--gold)" }} />
          <div className="muted" style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
            <span>{fmt(time)}</span><span>{dur ? fmt(dur) : "–:––"}</span>
          </div>
        </div>
      </div>
      {failed && <p style={{ color: "#f55", fontSize: 13, margin: "8px 0 0" }}>{t("song_play_failed")}</p>}
      {lines.length > 0 && (
        <div ref={box} style={{ position: "relative", marginTop: 12, height, overflowY: "auto", padding: "8px 4px", borderTop: "1px solid #2a2a2a", scrollbarWidth: "thin" }}>
          {lines.map((l, i) => {
            const on = i === cur;
            const past = cur >= 0 ? i < cur : l.e <= time;
            return (
              <div key={i} data-line={i} onClick={() => seek(l.s)}
                style={{
                  cursor: "pointer", textAlign: "center", padding: "6px 8px", borderRadius: 10, lineHeight: 1.35,
                  transition: "color .2s, font-size .2s, background .2s",
                  color: on ? "var(--gold-bright)" : past ? "#7a6a2a" : "var(--gold)",
                  fontWeight: on ? 900 : 700, fontSize: on ? 21 : 16,
                  background: on ? "rgba(240,196,32,.12)" : "transparent",
                }}>
                {l.t}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Gold music notes floating up, for the screens where the song is being sung. */
export function MusicNotes() {
  return (
    <div aria-hidden style={{ position: "relative", height: 150, overflow: "hidden" }}>
      <style>{`
        @keyframes bbSongNote { 0% { transform: translateY(40px) scale(.7) rotate(-10deg); opacity: 0 }
          20% { opacity: 1 } 100% { transform: translateY(-130px) scale(1.15) rotate(12deg); opacity: 0 } }
        @keyframes bbSongPulse { 0%,100% { transform: scale(1) } 50% { transform: scale(1.08) } }
      `}</style>
      {["♪", "♫", "♬", "♩", "♪", "♫", "♬"].map((n, i) => (
        <span key={i} style={{
          position: "absolute", bottom: 0, left: `${8 + i * 13}%`, fontSize: 26 + (i % 3) * 10, color: i % 2 ? "var(--gold)" : "var(--gold-bright)",
          animation: `bbSongNote ${2.4 + (i % 4) * 0.5}s ease-in ${i * 0.35}s infinite`, textShadow: "0 0 12px rgba(240,196,32,.6)",
        }}>{n}</span>
      ))}
      <div style={{ position: "absolute", left: "50%", top: "50%", width: 74, height: 74, marginLeft: -37, marginTop: -37, borderRadius: "50%", border: "2px solid var(--gold-border)", background: "#000", color: "var(--gold)", fontSize: 38, display: "flex", alignItems: "center", justifyContent: "center", animation: "bbSongPulse 1.4s ease-in-out infinite" }}>♪</div>
    </div>
  );
}

/**
 * "Send to someone": the member's own conversations (the same inbox the Messages page reads);
 * picking one opens that chat with the song's link already typed. The device's share sheet sits
 * underneath for everything else.
 */
export function SendSongSheet({ text, url, title, onClose }: { text: string; url: string; title: string; onClose: () => void }) {
  const { t } = useT();
  const navigate = useNavigate();
  const { user } = useSession();
  const myIdentity = user?.identity ?? "";
  const [rows, setRows] = useState<DmConversation[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!myIdentity) return;
    let stop: (() => void) | null = null;
    let dead = false;
    void observeConversations(
      myIdentity,
      (r) => { if (!dead) setRows(r.filter((c) => c.partnerId > 0)); },
      (e) => { if (!dead) setError(e.message || t("song_send_load_failed")); },
    ).then((unsub) => { if (dead) unsub(); else stop = unsub; }).catch(() => { if (!dead) setError(t("song_send_load_failed")); });
    return () => { dead = true; stop?.(); };
  }, [myIdentity, t]);

  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return createPortal(
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 65, background: "rgba(0,0,0,.8)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...SONG_GOLD_CARD, width: "100%", maxWidth: 440, maxHeight: "86vh", display: "flex", flexDirection: "column" }}>
        <div style={{ fontWeight: 800, fontSize: 18, color: "var(--gold)", textAlign: "center", marginBottom: 10 }}>{t("song_send")}</div>
        <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
          {!user && <p className="muted" style={{ textAlign: "center" }}>{t("song_send_sign_in")}</p>}
          {user && !error && rows === null && <Loading />}
          {error && <p className="muted" style={{ textAlign: "center" }}>{error}</p>}
          {rows?.length === 0 && <p className="muted" style={{ textAlign: "center" }}>{t("song_send_no_chats")}</p>}
          {rows?.map((c) => (
            <button key={c.partnerIdentity} type="button" className="dm-row"
              onClick={() => navigate(`/messages/${c.partnerId}`, { state: { draft: text } })}
              style={{ width: "100%", background: "transparent", border: 0, borderBottom: "1px solid #2a2a2a", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 10, padding: "8px 4px" }}>
              <Avatar user={{ fullname: c.partnerName, profile_image: c.partnerImage }} />
              <span style={{ flex: 1, minWidth: 0, color: "var(--gold)", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.partnerName || c.partnerUsername || t("song_a_member")}
              </span>
              <span style={{ color: "var(--gold)" }}>›</span>
            </button>
          ))}
        </div>
        <div className="row" style={{ gap: 10, marginTop: 12 }}>
          <button className="btn ghost" style={{ flex: 1 }} onClick={onClose}>{t("close")}</button>
          {canShare && (
            <button className="btn gold" style={{ flex: 1 }} onClick={() => { void navigator.share({ title, text, url }).catch(() => undefined); }}>
              {t("song_share_other")}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
