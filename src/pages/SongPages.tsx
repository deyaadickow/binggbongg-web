// Bingg Bongg Song (Steve, 2026-11-16: "Build Bingg Bongg Song, 299 BBs, 3 free previews").
//
//   /bingg-bongg-song            Start: what it is, the price, "Make a song", My Songs
//   /bingg-bongg-song/new        Questions (?name=&occasion= prefill, e.g. from the Birthday Page)
//   /bingg-bongg-song/my         My Songs
//   /bingg-bongg-song/:id        The song, by its status: lyrics + preview -> making -> finished (or failed)
//   /bingg-bongg-song/:id/video  Make the video: the slideshow renderer with the song as the music
//   /song/:code                  The public share page, no sign-in
//
// Black and gold, the app's gold popups, GoldSelect for the language, the gold chevron back.
// See lib/song.ts for the calls (and the dev-only mock).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { PageTitle } from "../components/PageTitle";
import { Loading, Notice } from "../components/Common";
import { GoldSelect } from "../components/GoldSelect";
import { showGoldAlert, showGoldConfirm } from "../components/GoldToast";
import { LyricsPlayer, MusicNotes, SendSongSheet, SONG_GOLD_CARD } from "../components/SongBits";
import { useSession } from "../lib/session";
import { useT, type StringKey } from "../lib/i18n";
import {
  DEFAULT_SONG_OPTIONS, SongError, deleteSong, downloadUrl, fetchMySongs, fetchSharedSong, fetchSong, fetchSongOptions,
  lineIndexAt, safeFileName, songBuy, songLanguageFor, songMockMode, songPreview, songSaveLyrics, songWrite,
  type SharedSong, type Song, type SongAnswers, type SongOptions,
} from "../lib/song";
import { drawTextBlock, POST_H, POST_W, TEXT_FONTS } from "../lib/textPost";
import { drawKenBurns, fmt, loadAudioBuffer, loadScaledImage, pickMime, renderToMp4, type RenderResult } from "../lib/videoKit";
import { startMusic } from "../lib/music";

const BASE = "/bingg-bongg-song";
const POLL_MS = 2500;

const OCCASION_KEYS: Record<string, StringKey> = {
  birthday: "song_occ_birthday", anniversary: "song_occ_anniversary", love: "song_occ_love", thank_you: "song_occ_thank_you",
  sorry: "song_occ_sorry", wedding: "song_occ_wedding", mothers_day: "song_occ_mothers_day", fathers_day: "song_occ_fathers_day",
  friendship: "song_occ_friendship", get_well: "song_occ_get_well", graduation: "song_occ_graduation", just_because: "song_occ_just_because",
};
const RELATIONSHIPS: StringKey[] = [
  "song_rel_wife", "song_rel_husband", "song_rel_mom", "song_rel_dad", "song_rel_lola", "song_rel_best_friend",
  "song_rel_girlfriend", "song_rel_boyfriend", "song_rel_son", "song_rel_daughter", "song_rel_friend",
];
const STYLE_ICONS: Record<string, string> = {
  love_ballad: "💞", pop: "🎤", opm: "🎹", acoustic: "🎸", country: "🤠", rnb: "🎷",
  rock: "🤘", party: "🎉", gospel: "🙏", kids: "🧸", hiphop: "🎧", lullaby: "🌙",
};

const chip = (on: boolean): React.CSSProperties => ({
  padding: "9px 14px", borderRadius: 999, cursor: "pointer", fontWeight: 700, fontSize: 14, whiteSpace: "nowrap",
  border: "1.5px solid var(--gold-border)", background: on ? "var(--gold)" : "#000", color: on ? "#000" : "var(--gold)",
});
const label: React.CSSProperties = { color: "var(--gold)", fontWeight: 800, fontSize: 16, margin: "0 0 8px" };
const madeWithAi = (t: (k: StringKey) => string) => (
  <div style={{ textAlign: "center", marginTop: 10 }}>
    <span style={{ display: "inline-block", fontSize: 11, fontWeight: 800, letterSpacing: 0.5, color: "var(--gold)", border: "1px solid var(--gold-border)", borderRadius: 999, padding: "2px 10px" }}>
      ✦ {t("song_made_with_ai")}
    </span>
  </div>
);

/** The caller's id. On the dev server with the mock on, a guest counts as member 1 so every
 *  screen can be opened without signing in (lib/songMock.ts; never in production). */
function useSongMe(): number | null {
  const { user } = useSession();
  return user?.id ?? (songMockMode() ? 1 : null);
}

function SignInNotice() {
  const { t } = useT();
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <div className="card pad" style={{ textAlign: "center" }}>
      <p className="soft" style={{ marginTop: 0 }}>{t("song_sign_in")}</p>
      <button className="btn gold" onClick={() => navigate("/login", { state: { from: location.pathname + location.search } })}>{t("sign_in")}</button>
    </div>
  );
}

/** The server's reason codes, turned into the gold popups the spec asks for. Resolves true when
 *  the member chose to buy (from the "no free previews" popup). */
async function explainSongError(e: unknown, t: (k: StringKey, ...a: (string | number)[]) => string, navigate: (to: string) => void, price = 299): Promise<boolean> {
  if (e instanceof SongError && e.code === "no_free_previews") {
    return showGoldConfirm({ message: e.message, confirmLabel: t("song_get_full", price), cancelLabel: t("close") });
  }
  if (e instanceof SongError && e.code === "not_enough_coins") {
    const buy = await showGoldConfirm({ message: e.message, confirmLabel: t("buy_coins"), cancelLabel: t("close") });
    if (buy) navigate("/wallet");
    return false;
  }
  showGoldAlert((e as Error)?.message || t("song_something_wrong"));
  return false;
}

// ---- 1. Start ----------------------------------------------------------------------------------

export function SongStartPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const me = useSongMe();
  const [opts, setOpts] = useState<SongOptions>(DEFAULT_SONG_OPTIONS);
  useEffect(() => { void fetchSongOptions().then(setOpts); }, []);
  return (
    <div className="page" style={{ maxWidth: 640 }}>
      <PageTitle backTo="/features">{t("song_title")}</PageTitle>
      <div style={{ ...SONG_GOLD_CARD, textAlign: "center", padding: "26px 18px" }}>
        <div style={{ fontSize: 54, lineHeight: 1, color: "var(--gold)" }}>♪</div>
        <h2 style={{ color: "var(--gold-bright)", fontSize: "clamp(24px, 6vw, 34px)", lineHeight: 1.2, margin: "12px 0 10px" }}>{t("song_tagline")}</h2>
        <p className="soft" style={{ fontSize: 16, margin: "0 0 16px" }}>{t("song_how")}</p>
        <div style={{ display: "inline-block", color: "#000", background: "var(--gold)", borderRadius: 999, padding: "6px 16px", fontWeight: 800, marginBottom: 20 }}>
          {t("song_price_line", opts.free_previews, opts.price_bbs)}
        </div>
        <button className="btn gold block" style={{ fontSize: 20, minHeight: 58, fontWeight: 900 }}
          onClick={() => (me ? navigate(`${BASE}/new`) : navigate("/login", { state: { from: `${BASE}/new` } }))}>
          ♪ {t("song_make")}
        </button>
        {me && <button className="btn block" style={{ marginTop: 10 }} onClick={() => navigate(`${BASE}/my`)}>{t("song_my_songs")}</button>}
        {madeWithAi(t)}
      </div>
      <div className="card pad" style={{ marginTop: 14 }}>
        {(["song_step_1", "song_step_2", "song_step_3", "song_step_4"] as StringKey[]).map((k, i) => (
          <div key={k} style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: i < 3 ? 12 : 0 }}>
            <span style={{ flex: "0 0 30px", height: 30, borderRadius: "50%", background: "var(--gold)", color: "#000", fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
            <span className="soft" style={{ paddingTop: 4 }}>{t(k, opts.price_bbs)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- 2. Questions ------------------------------------------------------------------------------

export function SongQuestionsPage() {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const me = useSongMe();
  const [params] = useSearchParams();
  const [opts, setOpts] = useState<SongOptions>(DEFAULT_SONG_OPTIONS);
  const [name, setName] = useState(() => (params.get("name") ?? "").slice(0, 60));
  const [rel, setRel] = useState("");
  const [relOwn, setRelOwn] = useState(false);
  const [occasion, setOccasion] = useState(() => {
    const o = params.get("occasion") ?? "";
    return OCCASION_KEYS[o] ? o : "";
  });
  const [memories, setMemories] = useState("");
  const [style, setStyle] = useState("love_ballad");
  const [voice, setVoice] = useState("female");
  const [language, setLanguage] = useState(() => songLanguageFor(lang, DEFAULT_SONG_OPTIONS));
  const [busy, setBusy] = useState(false);

  useEffect(() => { void fetchSongOptions().then(setOpts); }, []);

  async function write() {
    if (!me || busy) return;
    if (!name.trim()) { showGoldAlert(t("song_need_name")); return; }
    const a: SongAnswers = { recipient_name: name.trim(), relationship: rel.trim(), occasion: occasion || "just_because", memories: memories.trim(), style, voice, language };
    setBusy(true);
    try {
      const s = await songWrite(me, a);
      navigate(`${BASE}/${s.id}`, { replace: true });
    } catch (e) {
      setBusy(false);
      void explainSongError(e, t, navigate);
    }
  }

  if (!me) return <div className="page" style={{ maxWidth: 640 }}><PageTitle>{t("song_title")}</PageTitle><SignInNotice /></div>;

  if (busy) {
    return (
      <div className="page" style={{ maxWidth: 640 }}>
        <PageTitle>{t("song_title")}</PageTitle>
        <div style={{ ...SONG_GOLD_CARD, textAlign: "center" }}>
          <MusicNotes />
          <h2 style={{ color: "var(--gold-bright)", margin: "8px 0" }}>{t("song_writing")}</h2>
          <p className="soft">{t("song_writing_sub", name.trim())}</p>
        </div>
      </div>
    );
  }

  const relChips = RELATIONSHIPS.map((k) => t(k));
  return (
    <div className="page" style={{ maxWidth: 680 }}>
      <PageTitle>{t("song_title")}</PageTitle>
      <div style={SONG_GOLD_CARD}>
        <p style={label}>{t("song_q_name")}</p>
        <input className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={t("song_q_name_ph")} style={{ fontSize: 18 }} aria-label={t("song_q_name")} />

        <p style={{ ...label, marginTop: 20 }}>{t("song_q_who")}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {relChips.map((r) => (
            <button key={r} type="button" style={chip(!relOwn && rel === r)} onClick={() => { setRelOwn(false); setRel(rel === r && !relOwn ? "" : r); }}>{r}</button>
          ))}
          <button type="button" style={chip(relOwn)} onClick={() => { setRelOwn(true); setRel(""); }}>✎ {t("song_rel_own")}</button>
        </div>
        {relOwn && <input className="input" autoFocus value={rel} maxLength={60} onChange={(e) => setRel(e.target.value)} placeholder={t("song_rel_own_ph")} style={{ marginTop: 10 }} />}

        <p style={{ ...label, marginTop: 20 }}>{t("song_q_occasion")}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {opts.occasions.map((o) => (
            <button key={o} type="button" style={chip(occasion === o)} onClick={() => setOccasion(occasion === o ? "" : o)}>
              {OCCASION_KEYS[o] ? t(OCCASION_KEYS[o]) : o.replace(/_/g, " ")}
            </button>
          ))}
        </div>

        <p style={{ ...label, marginTop: 20 }}>{t("song_q_memories")}</p>
        <p className="muted" style={{ fontSize: 13, margin: "-4px 0 8px" }}>{t("song_q_memories_hint")}</p>
        <textarea className="input" value={memories} maxLength={1200} rows={5} onChange={(e) => setMemories(e.target.value)}
          placeholder={t("song_q_memories_ph")} style={{ padding: 12, resize: "vertical", minHeight: 120, lineHeight: 1.4 }} aria-label={t("song_q_memories")} />
        <div className="muted" style={{ textAlign: "right", fontSize: 12 }}>{memories.length} / 1200</div>

        <p style={{ ...label, marginTop: 16 }}>{t("song_q_style")}</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))", gap: 8 }}>
          {opts.styles.map((s) => {
            const on = style === s.key;
            return (
              <button key={s.key} type="button" onClick={() => setStyle(s.key)}
                style={{ padding: "12px 6px", borderRadius: 14, cursor: "pointer", border: on ? "2px solid var(--gold-bright)" : "1.5px solid var(--gold-border)", background: on ? "var(--gold)" : "#000", color: on ? "#000" : "var(--gold)", fontWeight: 800, fontSize: 14 }}>
                <div style={{ fontSize: 26, marginBottom: 4 }}>{STYLE_ICONS[s.key] ?? "♪"}</div>
                {s.label}
              </button>
            );
          })}
        </div>

        <p style={{ ...label, marginTop: 20 }}>{t("song_q_voice")}</p>
        <div style={{ display: "flex", gap: 10 }}>
          {opts.voices.map((v) => (
            <button key={v} type="button" style={{ ...chip(voice === v), flex: 1, padding: "12px 14px", fontSize: 16 }} onClick={() => setVoice(v)}>
              {v === "male" ? `👨 ${t("song_voice_male")}` : v === "female" ? `👩 ${t("song_voice_female")}` : v}
            </button>
          ))}
        </div>

        <p style={{ ...label, marginTop: 20 }}>{t("song_q_language")}</p>
        <GoldSelect value={language} onChange={setLanguage} searchable ariaLabel={t("song_q_language")}
          options={opts.languages.map((l) => ({ value: l.code, label: l.name }))} />

        <button className="btn gold block" style={{ marginTop: 24, fontSize: 19, minHeight: 56, fontWeight: 900 }} onClick={() => void write()} disabled={!name.trim()}>
          ✍️ {t("song_write_my_song")}
        </button>
        <p className="muted" style={{ textAlign: "center", fontSize: 12, marginBottom: 0 }}>{t("song_write_free")}</p>
      </div>
    </div>
  );
}

// ---- 3-5. The song, by its status ---------------------------------------------------------------

export function SongPage() {
  const { t } = useT();
  const { id } = useParams();
  const songId = Number(id);
  const me = useSongMe();
  const [song, setSong] = useState<Song | null>(null);
  const [error, setError] = useState("");
  const prevStatus = useRef<string>("");

  const load = useCallback(async () => {
    if (!me || !songId) return;
    try {
      const s = await fetchSong(me, songId);
      // A preview that failed goes back to "draft" and is not counted.
      if (prevStatus.current === "previewing" && s.status === "draft") showGoldAlert(t("song_preview_failed"));
      prevStatus.current = s.status;
      setSong(s);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [me, songId, t]);

  useEffect(() => { void load(); }, [load]);

  // Poll while the server is singing.
  const working = song?.status === "previewing" || song?.status === "making";
  useEffect(() => {
    if (!working) return;
    const h = window.setInterval(() => { void load(); }, POLL_MS);
    return () => window.clearInterval(h);
  }, [working, load]);

  const update = (s: Song) => { prevStatus.current = s.status; setSong(s); };

  if (!me) return <div className="page" style={{ maxWidth: 680 }}><PageTitle>{t("song_title")}</PageTitle><SignInNotice /></div>;
  return (
    <div className="page" style={{ maxWidth: 680 }}>
      <PageTitle backTo={`${BASE}/my`}>{t("song_title")}</PageTitle>
      {error && !song && <Notice error>{error}</Notice>}
      {!error && !song && <Loading />}
      {song && (song.status === "draft" || song.status === "previewing" || song.status === "preview_ready") && <LyricsView me={me} song={song} onSong={update} />}
      {song?.status === "making" && <MakingView song={song} />}
      {song?.status === "done" && <FinishedView song={song} />}
      {song?.status === "failed" && <FailedView me={me} song={song} onSong={update} />}
    </div>
  );
}

function ForName({ song }: { song: Song }) {
  const { t } = useT();
  return <div style={{ color: "var(--gold)", fontWeight: 800, textAlign: "center", fontSize: 15, marginBottom: 4 }}>♪ {t("song_for", song.recipient_name)}</div>;
}

function LyricsView({ me, song, onSong }: { me: number; song: Song; onSong: (s: Song) => void }) {
  const { t } = useT();
  const navigate = useNavigate();
  const [title, setTitle] = useState(song.title);
  const [lyrics, setLyrics] = useState(song.lyrics);
  const [busy, setBusy] = useState<"" | "save" | "rewrite" | "preview" | "buy">("");
  const dirty = title !== song.title || lyrics !== song.lyrics;
  const previewing = song.status === "previewing";

  // New words from the server (written again) replace the boxes.
  useEffect(() => { setTitle(song.title); setLyrics(song.lyrics); }, [song.id, song.title, song.lyrics]);

  async function saveIfNeeded(): Promise<Song | null> {
    if (!dirty) return song;
    if (!lyrics.trim()) { showGoldAlert(t("song_need_words")); return null; }
    const s = await songSaveLyrics(me, song.id, title.trim(), lyrics.trim());
    onSong(s);
    return s;
  }

  async function save() {
    setBusy("save");
    try { if (await saveIfNeeded()) showGoldAlert(t("song_saved")); } catch (e) { void explainSongError(e, t, navigate); } finally { setBusy(""); }
  }

  async function rewrite() {
    if (dirty && !(await showGoldConfirm({ message: t("song_rewrite_confirm"), confirmLabel: t("song_write_again"), cancelLabel: t("cancel") }))) return;
    setBusy("rewrite");
    try {
      onSong(await songWrite(me, {
        recipient_name: song.recipient_name, relationship: song.relationship ?? "", occasion: song.occasion ?? "just_because",
        memories: song.memories ?? "", style: song.style ?? "love_ballad", voice: song.voice ?? "female", language: song.language ?? "en",
      }, song.id));
    } catch (e) { void explainSongError(e, t, navigate); } finally { setBusy(""); }
  }

  async function buy() {
    if (!(await showGoldConfirm({ message: t("song_buy_confirm", song.price_bbs, song.recipient_name), confirmLabel: t("song_get_full", song.price_bbs), cancelLabel: t("cancel") }))) return;
    setBusy("buy");
    try {
      if (!(await saveIfNeeded())) return;
      onSong(await songBuy(me, song.id));
    } catch (e) { void explainSongError(e, t, navigate, song.price_bbs); } finally { setBusy(""); }
  }

  async function preview() {
    setBusy("preview");
    try {
      if (!(await saveIfNeeded())) return;
      onSong(await songPreview(me, song.id));
    } catch (e) {
      setBusy("");
      if (await explainSongError(e, t, navigate, song.price_bbs)) void buyNow();
      return;
    }
    setBusy("");
  }
  // From the "no free previews" popup the member already said yes to the price.
  async function buyNow() {
    setBusy("buy");
    try { onSong(await songBuy(me, song.id)); } catch (e) { void explainSongError(e, t, navigate, song.price_bbs); } finally { setBusy(""); }
  }

  const left = song.free_previews_left;
  return (
    <>
      <div style={SONG_GOLD_CARD}>
        <ForName song={song} />
        <input className="input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} aria-label={t("song_song_title")}
          style={{ fontSize: 20, fontWeight: 800, color: "var(--gold-bright)", textAlign: "center", marginBottom: 10 }} disabled={previewing} />
        <textarea className="input" value={lyrics} maxLength={3000} onChange={(e) => setLyrics(e.target.value)} aria-label={t("song_lyrics")}
          rows={14} style={{ padding: 14, lineHeight: 1.55, resize: "vertical", minHeight: 260, fontSize: 15 }} disabled={previewing} />
        <div className="row" style={{ gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          <button className="btn" style={{ flex: 1 }} disabled={!dirty || !!busy || previewing} onClick={() => void save()}>{busy === "save" ? t("ac_saving") : t("save")}</button>
          <button className="btn" style={{ flex: 1 }} disabled={!!busy || previewing} onClick={() => void rewrite()}>{busy === "rewrite" ? t("song_writing") : `↻ ${t("song_write_again")}`}</button>
        </div>
      </div>

      <div style={{ ...SONG_GOLD_CARD, marginTop: 14 }}>
        {previewing ? (
          <div style={{ textAlign: "center" }}>
            <MusicNotes />
            <h3 style={{ color: "var(--gold-bright)", margin: "6px 0" }}>{t("song_previewing", song.recipient_name)}</h3>
            <p className="muted" style={{ margin: 0 }}>{t("song_previewing_sub")}</p>
          </div>
        ) : (
          <>
            {song.status === "preview_ready" && song.preview_url && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ ...label, textAlign: "center" }}>🎧 {t("song_your_preview")}</div>
                <LyricsPlayer key={song.preview_url + song.previews_used} src={song.preview_url} lines={song.preview_lines} autoPlay height={220} />
              </div>
            )}
            <button className="btn gold block" style={{ fontSize: 18, minHeight: 58, fontWeight: 900 }} disabled={!!busy} onClick={() => void preview()}>
              {busy === "preview" ? t("song_starting") : left > 0 ? `🎧 ${t("song_hear_preview", left)}` : `🎧 ${t("song_no_previews_left")}`}
            </button>
          </>
        )}
        <button className="btn block" style={{ marginTop: 12, minHeight: 54, fontSize: 17, fontWeight: 900, borderWidth: 2, color: "var(--gold-bright)" }} disabled={!!busy} onClick={() => void buy()}>
          {busy === "buy" ? t("song_starting") : `♪ ${t("song_get_full", song.price_bbs)}`}
        </button>
        <p className="muted" style={{ textAlign: "center", fontSize: 12, marginBottom: 0 }}>{t("song_full_note")}</p>
        {madeWithAi(t)}
      </div>
    </>
  );
}

function MakingView({ song }: { song: Song }) {
  const { t } = useT();
  const navigate = useNavigate();
  const lines: string[] = [t("song_making_1"), t("song_making_2", song.recipient_name), t("song_making_3"), t("song_making_4", song.recipient_name)];
  const [i, setI] = useState(0);
  useEffect(() => {
    const h = window.setInterval(() => setI((n) => (n + 1) % 4), 4000);
    return () => window.clearInterval(h);
  }, []);
  return (
    <div style={{ ...SONG_GOLD_CARD, textAlign: "center", padding: "22px 16px" }}>
      <ForName song={song} />
      <MusicNotes />
      <h2 key={i} style={{ color: "var(--gold-bright)", margin: "8px 0 6px", minHeight: 64, animation: "bbSongFade .5s" }}>{lines[i]}</h2>
      <style>{"@keyframes bbSongFade { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }"}</style>
      <p className="soft" style={{ margin: "0 0 18px" }}>{t("song_making_sub")}</p>
      <button className="btn" onClick={() => navigate(`${BASE}/my`)}>{t("song_my_songs")}</button>
    </div>
  );
}

function FinishedView({ song }: { song: Song }) {
  const { t } = useT();
  const navigate = useNavigate();
  const [sending, setSending] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const share = song.share_url ?? "";
  const shareText = t("song_share_text", song.recipient_name, share);

  async function copy() {
    try { await navigator.clipboard.writeText(share); showGoldAlert(t("link_copied_paste_it_anywhere")); }
    catch { showGoldAlert(share); }
  }
  async function download() {
    if (!song.song_url) return;
    setDownloading(true);
    try { await downloadUrl(song.song_url, `${safeFileName(song.title || song.recipient_name)}.mp3`); } finally { setDownloading(false); }
  }

  const btn: React.CSSProperties = { minHeight: 52, fontSize: 16, fontWeight: 800 };
  return (
    <>
      <div style={SONG_GOLD_CARD}>
        <ForName song={song} />
        <h2 style={{ color: "var(--gold-bright)", textAlign: "center", margin: "4px 0 14px", fontSize: "clamp(22px, 5vw, 28px)" }}>{song.title}</h2>
        {song.song_url ? <LyricsPlayer src={song.song_url} lines={song.song_lines} height={300} /> : <Notice>{t("song_something_wrong")}</Notice>}
        {madeWithAi(t)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginTop: 14 }}>
        <button className="btn gold" style={{ ...btn, gridColumn: "1 / -1" }} onClick={() => navigate(`${BASE}/${song.id}/video`)}>🎬 {t("song_make_video")}</button>
        <button className="btn" style={btn} disabled={!share} onClick={() => setSending(true)}>💌 {t("song_send")}</button>
        <button className="btn" style={btn} disabled={!share} onClick={() => void copy()}>🔗 {t("copy_link")}</button>
        <button className="btn" style={btn} disabled={!song.song_url || downloading} onClick={() => void download()}>⬇️ {downloading ? t("snd_loading") : t("download")}</button>
        {song.post_id ? <button className="btn" style={btn} onClick={() => navigate(`/video/${song.post_id}`)}>▶ {t("song_see_video")}</button>
          : <button className="btn" style={btn} onClick={() => navigate(`${BASE}/my`)}>♪ {t("song_my_songs")}</button>}
      </div>
      {sending && <SendSongSheet text={shareText} url={share} title={song.title} onClose={() => setSending(false)} />}
    </>
  );
}

function FailedView({ me, song, onSong }: { me: number; song: Song; onSong: (s: Song) => void }) {
  const { t } = useT();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  async function again() {
    if (!(await showGoldConfirm({ message: t("song_buy_confirm", song.price_bbs, song.recipient_name), confirmLabel: t("song_get_full", song.price_bbs), cancelLabel: t("cancel") }))) return;
    setBusy(true);
    try { onSong(await songBuy(me, song.id)); } catch (e) { void explainSongError(e, t, navigate, song.price_bbs); } finally { setBusy(false); }
  }
  return (
    <div style={{ ...SONG_GOLD_CARD, textAlign: "center", padding: "24px 16px" }}>
      <ForName song={song} />
      <div style={{ fontSize: 44, margin: "6px 0" }}>🎵</div>
      <h2 style={{ color: "var(--gold-bright)", margin: "0 0 10px" }}>{t("song_failed_title")}</h2>
      <p className="soft" style={{ fontSize: 16 }}>{song.failure_reason || t("song_failed_text")}</p>
      {song.refunded && <p style={{ color: "var(--gold)", fontWeight: 800 }}>✓ {t("song_refunded", song.coins_charged || song.price_bbs)}</p>}
      <div className="row" style={{ gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: 14 }}>
        <button className="btn" onClick={() => navigate(`${BASE}/my`)}>{t("song_my_songs")}</button>
        <button className="btn gold" disabled={busy} onClick={() => void again()}>{busy ? t("song_starting") : `↻ ${t("song_try_again")}`}</button>
      </div>
    </div>
  );
}

// ---- 6. My Songs -------------------------------------------------------------------------------

const STATUS_KEYS: Record<string, StringKey> = {
  draft: "song_st_draft", previewing: "song_st_previewing", preview_ready: "song_st_preview_ready",
  making: "song_st_making", done: "song_st_done", failed: "song_st_failed",
};

export function MySongsPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const me = useSongMe();
  const [rows, setRows] = useState<Song[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    if (!me) return;
    fetchMySongs(me).then(setRows).catch((e) => setError((e as Error).message));
  }, [me]);
  useEffect(load, [load]);
  // Songs being sung move on by themselves.
  const working = rows?.some((s) => s.status === "making" || s.status === "previewing");
  useEffect(() => {
    if (!working) return;
    const h = window.setInterval(load, 4000);
    return () => window.clearInterval(h);
  }, [working, load]);

  async function remove(s: Song) {
    if (!me) return;
    if (!(await showGoldConfirm({ message: t("song_delete_confirm", s.title || s.recipient_name), confirmLabel: t("delete"), cancelLabel: t("cancel"), danger: true }))) return;
    try { await deleteSong(me, s.id); setRows((cur) => cur?.filter((x) => x.id !== s.id) ?? cur); } catch (e) { showGoldAlert((e as Error).message); }
  }

  if (!me) return <div className="page" style={{ maxWidth: 680 }}><PageTitle>{t("song_my_songs")}</PageTitle><SignInNotice /></div>;
  return (
    <div className="page" style={{ maxWidth: 680 }}>
      <PageTitle backTo={BASE}>{t("song_my_songs")}</PageTitle>
      <button className="btn gold block" style={{ marginBottom: 14, minHeight: 50, fontWeight: 900 }} onClick={() => navigate(`${BASE}/new`)}>♪ {t("song_make_new")}</button>
      {error && <Notice error>{error}</Notice>}
      {!error && rows === null && <Loading />}
      {rows?.length === 0 && <Notice>{t("song_none_yet")}</Notice>}
      {rows?.map((s) => (
        <div key={s.id} className="card" style={{ display: "flex", alignItems: "center", gap: 10, padding: 12, marginBottom: 8, background: "#000", borderColor: "var(--gold-border)" }}>
          <Link to={`${BASE}/${s.id}`} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ flex: "0 0 44px", height: 44, borderRadius: "50%", border: "1.5px solid var(--gold-border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: "var(--gold)" }}>♪</span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", color: "var(--gold-bright)", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title || t("song_for", s.recipient_name)}</span>
              <span className="muted" style={{ fontSize: 13 }}>{t("song_for", s.recipient_name)}{s.created_at ? ` · ${new Date(s.created_at).toLocaleDateString()}` : ""}</span>
            </span>
          </Link>
          <span style={{ fontSize: 11, fontWeight: 800, padding: "3px 9px", borderRadius: 999, whiteSpace: "nowrap", border: "1px solid var(--gold-border)", background: s.status === "done" ? "var(--gold)" : "#000", color: s.status === "done" ? "#000" : s.status === "failed" ? "#f77" : "var(--gold)" }}>
            {STATUS_KEYS[s.status] ? t(STATUS_KEYS[s.status]) : s.status}
          </span>
          <button type="button" aria-label={t("delete")} disabled={s.status === "making"} onClick={() => void remove(s)}
            style={{ width: 34, height: 34, flex: "0 0 34px", borderRadius: "50%", border: "1px solid var(--gold-border)", background: "#000", color: "var(--gold)", cursor: "pointer", opacity: s.status === "making" ? 0.4 : 1 }}>✕</button>
        </div>
      ))}
    </div>
  );
}

// ---- Make the video ----------------------------------------------------------------------------

const MIN_PHOTOS = 2;
const MAX_PHOTOS = 35;
const FADE = 0.6;
interface Photo { id: number; bmp: ImageBitmap; thumb: string }
let nextPhotoId = 1;
const LYRIC_STYLE = { font: TEXT_FONTS[0], color: "#FFFFFF", align: "center" as const };

/**
 * The Photo slideshow renderer with the finished song as the music: photos from the gallery
 * (Ken-Burns + crossfade), the song's own timed lines on screen in the automatic-caption plate,
 * the whole song long. The mp4 goes to the normal upload screen with post_kind=song, and after the
 * upload the post is linked to the song (songAttachPost).
 */
export function SongVideoPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const { id } = useParams();
  const songId = Number(id);
  const me = useSongMe();
  const [song, setSong] = useState<Song | null>(null);
  const [audio, setAudio] = useState<AudioBuffer | null>(null);
  const [audioError, setAudioError] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [adding, setAdding] = useState(false);
  const [phase, setPhase] = useState<"edit" | "render" | "done">("edit");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<RenderResult | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const photosRef = useRef(photos);
  photosRef.current = photos;
  const [mime] = useState(pickMime);

  useEffect(() => {
    if (!me || !songId) return;
    fetchSong(me, songId).then(setSong).catch((e) => setAudioError((e as Error).message));
  }, [me, songId]);

  // The song's samples: exact start, exact length.
  useEffect(() => {
    if (!song?.song_url) return;
    let dead = false;
    const ac = new OfflineAudioContext(2, 44100, 44100);
    loadAudioBuffer(ac, song.song_url).then((b) => { if (!dead) setAudio(b); }).catch(() => { if (!dead) setAudioError(t("song_audio_failed")); });
    return () => { dead = true; };
  }, [song?.song_url, t]);

  useEffect(() => () => {
    abortRef.current?.abort();
    photosRef.current.forEach((p) => { p.bmp.close(); URL.revokeObjectURL(p.thumb); });
  }, []);

  const total = audio?.duration ?? song?.duration ?? 0;
  const per = photos.length ? total / photos.length : total;

  async function addFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    const room = MAX_PHOTOS - photosRef.current.length;
    if (list.length > room) showGoldAlert(t("ss_max", MAX_PHOTOS));
    setAdding(true);
    try {
      for (const f of list.slice(0, Math.max(0, room))) {
        try {
          const bmp = await loadScaledImage(f, POST_W * 1.2, POST_H * 1.2);
          setPhotos((cur) => [...cur, { id: nextPhotoId++, bmp, thumb: URL.createObjectURL(f) }]);
        } catch { /* not an image this browser can read: skipped */ }
      }
    } finally { setAdding(false); }
  }
  if (import.meta.env.DEV) (window as unknown as { __bbSongVideoAdd?: (f: File[]) => Promise<void> }).__bbSongVideoAdd = (f) => addFiles(f);

  function move(i: number, d: number) {
    setPhotos((cur) => {
      const j = i + d;
      if (j < 0 || j >= cur.length) return cur;
      const nx = cur.slice();
      [nx[i], nx[j]] = [nx[j], nx[i]];
      return nx;
    });
  }
  function remove(i: number) {
    setPhotos((cur) => {
      const gone = cur[i];
      if (gone) { gone.bmp.close(); URL.revokeObjectURL(gone.thumb); }
      return cur.filter((_, j) => j !== i);
    });
  }

  const draw = useCallback((ctx: CanvasRenderingContext2D, time: number, list: Photo[]) => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, POST_W, POST_H);
    if (list.length) {
      const each = total / list.length || 1;
      const i = Math.min(list.length - 1, Math.floor(time / each));
      const local = time - i * each;
      drawKenBurns(ctx, list[i].bmp, i, local + FADE, each + FADE, POST_W, POST_H);
      if (i + 1 < list.length && local > each - FADE) {
        ctx.save();
        ctx.globalAlpha = (local - (each - FADE)) / FADE;
        drawKenBurns(ctx, list[i + 1].bmp, i + 1, local - (each - FADE), each + FADE, POST_W, POST_H);
        ctx.restore();
      }
    } else {
      ctx.fillStyle = "#D4AF37";
      ctx.font = "700 40px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(t("ss_add_photos_hint"), POST_W / 2, POST_H / 2);
    }
    if (!song) return;
    // The label every AI song carries, small at the top.
    ctx.save();
    ctx.font = "800 26px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const tag = `♪ ${t("song_title")} · ${t("song_made_with_ai")}`;
    const w = ctx.measureText(tag).width + 36;
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.beginPath();
    ctx.roundRect((POST_W - w) / 2, 52, w, 48, 24);
    ctx.fill();
    ctx.fillStyle = "#F0C420";
    ctx.fillText(tag, POST_W / 2, 77);
    ctx.restore();
    const lines = song.song_lines;
    const first = lines[0]?.s ?? 4;
    if (time < first - 0.3) {
      // Before the singing starts: the title and who it is for.
      const appear = Math.min(1, time / 0.8);
      drawTextBlock(ctx, song.title, { ...LYRIC_STYLE, color: "#FFDD55" }, { x: 60, y: POST_H / 2 - 230, w: POST_W - 120, h: 260 }, 78, appear, true);
      drawTextBlock(ctx, t("song_for", song.recipient_name), LYRIC_STYLE, { x: 60, y: POST_H / 2 + 60, w: POST_W - 120, h: 110 }, 52, appear, true);
      return;
    }
    const li = lineIndexAt(lines, time);
    if (li >= 0) {
      const l = lines[li];
      const appear = Math.min(1, (time - l.s) / 0.25);
      drawTextBlock(ctx, l.t, LYRIC_STYLE, { x: 50, y: POST_H - 470, w: POST_W - 100, h: 230 }, 58, appear, true);
    }
  }, [song, total, t]);

  // Live preview, looping (silent; the finished video carries the song).
  useEffect(() => {
    if (phase !== "edit") return;
    let raf = 0;
    const started = performance.now();
    const frame = () => {
      const c = canvasRef.current;
      if (c && total > 0) draw(c.getContext("2d")!, ((performance.now() - started) / 1000) % total, photos);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [phase, draw, total, photos]);

  async function render() {
    if (photos.length < MIN_PHOTOS) { showGoldAlert(t("ss_min", MIN_PHOTOS)); return; }
    const canvas = canvasRef.current;
    if (!canvas || !audio) return;
    const list = photos.slice();
    setPhase("render");
    setProgress(0);
    const ab = new AbortController();
    abortRef.current = ab;
    try {
      const r = await renderToMp4({
        canvas, duration: audio.duration, name: "bingg-bongg-song", thumbAt: Math.min(12, audio.duration / 4), signal: ab.signal,
        videoBitsPerSecond: 3_000_000,
        draw: (ctx, time) => draw(ctx, time, list),
        onStart: (ac, dest) => { startMusic(ac, audio, dest, 1); },
        onProgress: setProgress,
      });
      if (import.meta.env.DEV) (window as unknown as { __bbRender?: RenderResult }).__bbRender = r;
      setResult(r);
      setPhase("done");
    } catch (e) {
      setPhase("edit");
      if ((e as Error).name !== "AbortError") showGoldAlert((e as Error).message);
    }
  }

  function next() {
    if (!result || !song) return;
    navigate("/upload", { state: { greenScreen: { file: result.file, duration: result.duration, thumb: result.thumb }, postKind: "song", songId: song.id } });
  }

  if (!me) return <div className="page" style={{ maxWidth: 520 }}><PageTitle>{t("song_make_video")}</PageTitle><SignInNotice /></div>;
  if (!mime) return <div className="page" style={{ maxWidth: 520 }}><PageTitle>{t("song_make_video")}</PageTitle><Notice>{t("vk_unsupported")}</Notice></div>;
  if (song && song.status !== "done") return <div className="page" style={{ maxWidth: 520 }}><PageTitle>{t("song_make_video")}</PageTitle><Notice>{t("song_video_needs_full")}</Notice></div>;

  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <PageTitle backTo={`${BASE}/${songId}`}>{t("song_make_video")}</PageTitle>
      {audioError && <Notice error>{audioError}</Notice>}
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ flex: "0 1 320px", width: "100%", maxWidth: 340, margin: "0 auto" }}>
          <div style={{ position: "relative", aspectRatio: "9 / 16", borderRadius: 14, overflow: "hidden", border: "2px solid var(--gold-border)", background: "#000" }}>
            <canvas ref={canvasRef} width={POST_W} height={POST_H} style={{ width: "100%", height: "100%", display: phase === "done" ? "none" : "block" }} />
            {phase === "done" && result && <video src={result.url} controls playsInline style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }} />}
          </div>
          <div className="muted" style={{ textAlign: "center", fontSize: 12, marginTop: 6 }}>
            {total > 0 ? t("song_video_summary", photos.length, per.toFixed(1), fmt(total)) : t("snd_loading")}
          </div>
          {phase === "render" && (
            <div style={{ marginTop: 10 }}>
              <div className="muted" style={{ fontSize: 13, marginBottom: 6, textAlign: "center" }}>{t("vk_making_video", Math.round(progress * 100))}</div>
              <div style={{ height: 8, background: "var(--panel)", borderRadius: 999, overflow: "hidden" }}>
                <div style={{ width: `${Math.round(progress * 100)}%`, height: "100%", background: "var(--gold-border)" }} />
              </div>
              <p className="muted" style={{ fontSize: 12, textAlign: "center" }}>{t("song_video_keep_open")}</p>
              <div style={{ textAlign: "center" }}><button className="btn ghost small" onClick={() => abortRef.current?.abort()}>{t("vk_cancel")}</button></div>
            </div>
          )}
          {phase === "done" && result && (
            <div className="row" style={{ justifyContent: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              <button className="btn ghost" onClick={() => { URL.revokeObjectURL(result.url); setResult(null); setPhase("edit"); }}>{t("vk_edit_again")}</button>
              <button className="btn" onClick={() => { const a = document.createElement("a"); a.href = result.url; a.download = `${safeFileName(song?.title ?? "")}.mp4`; a.click(); }}>⬇️ {t("download")}</button>
              <button className="btn gold" onClick={next}>{t("vk_next")}</button>
            </div>
          )}
        </div>

        <div style={{ flex: "1 1 360px", minWidth: 0, display: phase === "edit" ? "block" : "none" }}>
          <div className="card pad" style={{ marginBottom: 12 }}>
            <p className="soft" style={{ marginTop: 0 }}>{t("song_video_intro")}</p>
            <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }}
              onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ""; }} />
            <div className="row" style={{ alignItems: "center", gap: 10, marginBottom: photos.length ? 10 : 0 }}>
              <div className="soft" style={{ flex: 1, fontSize: 13 }}>{t("ss_photos_count", photos.length, MAX_PHOTOS)}</div>
              <button className="btn small gold" disabled={adding || photos.length >= MAX_PHOTOS} onClick={() => fileRef.current?.click()}>
                {adding ? t("snd_loading") : t("ss_add_photos")}
              </button>
            </div>
            {photos.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(78px, 1fr))", gap: 8 }}>
                {photos.map((p, i) => (
                  <div key={p.id} style={{ position: "relative", aspectRatio: "9 / 16", borderRadius: 8, overflow: "hidden", border: "1.5px solid var(--gold-border)", background: `#000 url(${JSON.stringify(p.thumb)}) center / cover` }}>
                    <span style={{ position: "absolute", top: 3, left: 5, color: "#000", background: "var(--gold)", borderRadius: 6, fontSize: 11, fontWeight: 800, padding: "0 5px" }}>{i + 1}</span>
                    <button type="button" onClick={() => remove(i)} aria-label={t("vk_remove")}
                      style={{ position: "absolute", top: 3, right: 3, width: 22, height: 22, borderRadius: "50%", border: "1px solid var(--gold-border)", background: "#000", color: "var(--gold)", cursor: "pointer", fontSize: 12, padding: 0 }}>✕</button>
                    <div style={{ position: "absolute", bottom: 3, left: 0, right: 0, display: "flex", justifyContent: "space-between", padding: "0 3px" }}>
                      <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t("vk_move_left")}
                        style={{ width: 24, height: 24, borderRadius: "50%", border: "1px solid var(--gold-border)", background: "#000", color: "var(--gold)", cursor: "pointer", padding: 0, opacity: i === 0 ? 0.4 : 1 }}>‹</button>
                      <button type="button" disabled={i === photos.length - 1} onClick={() => move(i, 1)} aria-label={t("vk_move_right")}
                        style={{ width: 24, height: 24, borderRadius: "50%", border: "1px solid var(--gold-border)", background: "#000", color: "var(--gold)", cursor: "pointer", padding: 0, opacity: i === photos.length - 1 ? 0.4 : 1 }}>›</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button className="btn block gold" style={{ minHeight: 52, fontWeight: 900 }} onClick={() => void render()} disabled={!audio || adding || photos.length < MIN_PHOTOS}>
            🎬 {audio ? t("vk_make_video") : t("snd_loading")}
          </button>
          {photos.length < MIN_PHOTOS && <p className="muted" style={{ textAlign: "center", fontSize: 12 }}>{t("ss_min", MIN_PHOTOS)}</p>}
        </div>
      </div>
    </div>
  );
}

// ---- The public share page ---------------------------------------------------------------------

export function SharedSongPage() {
  const { t } = useT();
  const { code } = useParams();
  const navigate = useNavigate();
  const [song, setSong] = useState<SharedSong | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!code) return;
    fetchSharedSong(code).then(setSong).catch((e) => setError((e as Error).message || t("song_not_available")));
  }, [code, t]);
  const from = useMemo(() => song?.from?.fullname || (song?.from?.username ? `@${song.from.username}` : ""), [song]);

  return (
    <div className="page" style={{ maxWidth: 620 }}>
      {error && <div style={{ ...SONG_GOLD_CARD, textAlign: "center" }}><p style={{ color: "var(--gold)", fontSize: 18 }}>{t("song_not_available")}</p></div>}
      {!error && !song && <Loading />}
      {song && (
        <div style={{ ...SONG_GOLD_CARD, padding: "22px 14px" }}>
          <div style={{ textAlign: "center", fontSize: 44, color: "var(--gold)", lineHeight: 1 }}>♪</div>
          <h1 style={{ color: "var(--gold-bright)", textAlign: "center", fontSize: "clamp(28px, 8vw, 40px)", lineHeight: 1.15, margin: "10px 0 6px", wordBreak: "break-word" }}>
            {t("song_for", song.recipient_name)}
          </h1>
          {from && (
            <div style={{ textAlign: "center", color: "var(--gold)", fontSize: 16, marginBottom: 4 }}>
              {song.from?.id ? <Link to={`/profile/${song.from.id}`}>{t("song_from", from)}</Link> : t("song_from", from)}
            </div>
          )}
          {song.title && <div className="soft" style={{ textAlign: "center", fontStyle: "italic", marginBottom: 14 }}>“{song.title}”</div>}
          {song.song_url ? <LyricsPlayer src={song.song_url} lines={song.song_lines} height={320} /> : <Notice>{t("song_not_available")}</Notice>}
          {madeWithAi(t)}
        </div>
      )}
      <button className="btn gold block" style={{ marginTop: 16, minHeight: 56, fontSize: 18, fontWeight: 900 }} onClick={() => navigate(BASE)}>
        ♪ {t("song_make_your_own")}
      </button>
    </div>
  );
}
