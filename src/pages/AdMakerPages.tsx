// Bingg Bongg Video Ad (Steve, 2026-11-17: "Just like Bingg Bongg Song I want to be able to create a
// 60 seconds video ads for members for 500 BBs").
//
//   /bingg-bongg-video-ad              Home: what it is, the price, the example ad, "Make my ad", My Video Ads
//   /bingg-bongg-video-ad/new          Questions (?ad=ID opens a saved draft)
//   /bingg-bongg-video-ad/my           My Video Ads
//   /bingg-bongg-video-ad/:id          The ad, by its status: making -> your ad (or failed)
//   /bingg-bongg-video-ad/:id/edit     Make changes: the questions again + "What should we change?"
//   /ad/:code                          The public ad page, no sign-in
//
// Same black-and-gold look as Bingg Bongg Song (pages/SongPages.tsx). See lib/adMaker.ts for the
// calls and the dev-only mock (?mockVideoAd=1).
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { PageTitle } from "../components/PageTitle";
import { Loading, Notice } from "../components/Common";
import { showGoldAlert, showGoldConfirm } from "../components/GoldToast";
import { SendSongSheet, SONG_GOLD_CARD } from "../components/SongBits";
import { useSession } from "../lib/session";
import { useT, type StringKey } from "../lib/i18n";
import { downloadUrl, safeFileName } from "../lib/song";
import {
  AdMakerError, DEFAULT_AD_OPTIONS, adLanguageFor, adMakerEdit, adMakerMake, adMakerSave, adMakerUploadMedia, adMockMode,
  deleteAdMakerAd, fetchAdMakerAd, fetchAdMakerOptions, fetchMyAdMakerAds, fetchSharedAdMakerAd,
  type AdAnswers, type AdMakerAd, type AdMakerOptions, type AdMedia, type SharedAd,
} from "../lib/adMaker";

const BASE = "/bingg-bongg-video-ad";
const POLL_MS = 5000;

const chip = (on: boolean): React.CSSProperties => ({
  padding: "9px 14px", borderRadius: 999, cursor: "pointer", fontWeight: 700, fontSize: 14, whiteSpace: "nowrap",
  border: "1.5px solid var(--gold-border)", background: on ? "var(--gold)" : "#000", color: on ? "#000" : "var(--gold)",
});
const qLabel: React.CSSProperties = { color: "var(--gold)", fontWeight: 800, fontSize: 16, margin: "0 0 8px", display: "flex", gap: 10, alignItems: "flex-start" };
const TONE_ICONS: Record<string, string> = { excited: "🔥", friendly: "😊", professional: "💼", funny: "😂" };

function QNum({ n }: { n: number }) {
  return <span style={{ flex: "0 0 26px", height: 26, borderRadius: "50%", background: "var(--gold)", color: "#000", fontWeight: 900, fontSize: 14, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{n}</span>;
}

const madeWithAi = (t: (k: StringKey) => string) => (
  <div style={{ textAlign: "center", marginTop: 10 }}>
    <span style={{ display: "inline-block", fontSize: 11, fontWeight: 800, letterSpacing: 0.5, color: "var(--gold)", border: "1px solid var(--gold-border)", borderRadius: 999, padding: "2px 10px" }}>
      ✦ {t("song_made_with_ai")}
    </span>
  </div>
);

/** The caller's id. On the dev server with the mock on, a guest counts as member 1 so every
 *  screen can be opened without signing in (lib/adMakerMock.ts; never in production). */
function useAdMe(): number | null {
  const { user } = useSession();
  return user?.id ?? (adMockMode() ? 1 : null);
}

/** The member's referral code = their username (the mock's member 1 is "juan"). */
function useMyCode(): string {
  const { user } = useSession();
  return user?.username || (adMockMode() ? "juan" : "");
}

function SignInNotice() {
  const { t } = useT();
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <div className="card pad" style={{ textAlign: "center" }}>
      <p className="soft" style={{ marginTop: 0 }}>{t("vad_sign_in")}</p>
      <button className="btn gold" onClick={() => navigate("/login", { state: { from: location.pathname + location.search } })}>{t("sign_in")}</button>
    </div>
  );
}

/** The server's reason codes, as the gold popups the spec asks for. */
async function explainAdError(e: unknown, t: (k: StringKey, ...a: (string | number)[]) => string, navigate: (to: string) => void) {
  if (e instanceof AdMakerError && e.code === "not_enough_coins") {
    const buy = await showGoldConfirm({ message: e.message, confirmLabel: t("vad_get_bbs"), cancelLabel: t("close") });
    if (buy) navigate("/wallet");
    return;
  }
  showGoldAlert((e as Error)?.message || t("song_something_wrong"));
}

/**
 * A 9:16 player: tap to play / pause, loops. Not autoplaying, so the sound is on from the first
 * tap (browsers only allow sound after one).
 */
function AdPlayer({ src, poster, maxWidth = 340 }: { src: string; poster?: string | null; maxWidth?: number }) {
  const { t } = useT();
  const v = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => () => { v.current?.pause(); }, []);
  function toggle() {
    const el = v.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => setFailed(true));
    else el.pause();
  }
  return (
    <div data-testid="ad-player" style={{ position: "relative", width: "100%", maxWidth, margin: "0 auto", aspectRatio: "9 / 16", borderRadius: 14, overflow: "hidden", border: "2px solid var(--gold-border)", background: "#000", cursor: "pointer" }}
      onClick={toggle} role="button" aria-label={playing ? t("song_pause") : t("song_play")}>
      <video ref={v} src={src} poster={poster ?? undefined} playsInline loop preload="metadata"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => setFailed(true)}
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", background: "#000" }} />
      {!playing && (
        <span aria-hidden style={{ position: "absolute", left: "50%", top: "50%", width: 72, height: 72, marginLeft: -36, marginTop: -36, borderRadius: "50%", border: "2px solid var(--gold-border)", background: "rgba(0,0,0,.65)", color: "var(--gold)", fontSize: 30, display: "flex", alignItems: "center", justifyContent: "center", paddingLeft: 5 }}>▶</span>
      )}
      {failed && <span style={{ position: "absolute", left: 8, right: 8, bottom: 8, textAlign: "center", color: "var(--gold)", background: "rgba(0,0,0,.75)", borderRadius: 8, padding: 6, fontSize: 13 }}>{t("vad_play_failed")}</span>}
    </div>
  );
}

// ---- 1. Home -----------------------------------------------------------------------------------

export function AdStartPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const me = useAdMe();
  const [opts, setOpts] = useState<AdMakerOptions | null>(null);
  useEffect(() => { void fetchAdMakerOptions().then(setOpts); }, []);
  const o = opts ?? DEFAULT_AD_OPTIONS;
  const ex = opts?.example ?? null;
  return (
    <div className="page" style={{ maxWidth: 640 }}>
      <PageTitle backTo="/features">{t("vad_title")}</PageTitle>
      <div style={{ ...SONG_GOLD_CARD, textAlign: "center", padding: "26px 18px" }}>
        <div style={{ fontSize: 50, lineHeight: 1 }}>🎬</div>
        <h2 style={{ color: "var(--gold-bright)", fontSize: "clamp(22px, 6vw, 30px)", lineHeight: 1.2, margin: "12px 0 12px" }}>{t("vad_line_1", o.max_seconds)}</h2>
        <p className="soft" style={{ fontSize: 16, margin: "0 0 6px" }}>{t("vad_line_2", o.price_bbs, o.free_edits)}</p>
        <p className="soft" style={{ fontSize: 16, margin: "0 0 20px" }}>{t("vad_line_3")}</p>
        <button className="btn gold block" style={{ fontSize: 20, minHeight: 58, fontWeight: 900 }}
          onClick={() => (me ? navigate(`${BASE}/new`) : navigate("/login", { state: { from: `${BASE}/new` } }))}>
          🎬 {t("vad_make")}
        </button>
        {me && <button className="btn block" style={{ marginTop: 10 }} onClick={() => navigate(`${BASE}/my`)}>{t("vad_my_ads")}</button>}
      </div>

      <div style={{ ...SONG_GOLD_CARD, marginTop: 14 }} data-testid="example-ad">
        <div style={{ color: "var(--gold-bright)", fontWeight: 900, fontSize: 19, textAlign: "center", marginBottom: 12 }}>{t("vad_example")}</div>
        {opts === null ? <Loading /> : ex?.video_url ? (
          <>
            <AdPlayer src={ex.video_url} poster={ex.thumbnail} maxWidth={300} />
            {ex.choices.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ color: "var(--gold)", fontWeight: 800, marginBottom: 8 }}>{t("vad_what_they_chose")}</div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {ex.choices.map((c, i) => (
                    <li key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 8 }}>
                      <span aria-hidden style={{ flex: "0 0 10px", height: 10, borderRadius: "50%", background: "var(--gold)", marginTop: 7 }} />
                      <span style={{ color: "var(--gold)" }}>{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {madeWithAi(t)}
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "26px 8px", border: "1.5px dashed var(--gold-border)", borderRadius: 12, color: "var(--gold)", fontWeight: 700 }}>
            {t("vad_example_soon")}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- 2. Questions (also Make changes) -----------------------------------------------------------

interface Pick extends AdMedia { local?: string; uploading?: boolean; tmp?: number }
let tmpId = 1;

export function AdQuestionsPage({ edit = false }: { edit?: boolean }) {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const me = useAdMe();
  const code = useMyCode();
  const { id } = useParams();
  const [params] = useSearchParams();
  const startId = edit ? Number(id) : Number(params.get("ad") ?? 0);
  const [opts, setOpts] = useState<AdMakerOptions>(DEFAULT_AD_OPTIONS);
  const [adId, setAdId] = useState<number>(startId || 0);
  const [loaded, setLoaded] = useState<AdMakerAd | null>(null);
  const [loadError, setLoadError] = useState("");
  const [change, setChange] = useState("");
  const [mention, setMention] = useState("");
  const [media, setMedia] = useState<Pick[]>([]);
  const [parts, setParts] = useState<string[]>([]);
  const [tone, setTone] = useState("excited");
  const [voice, setVoice] = useState("female");
  const [language, setLanguage] = useState(() => adLanguageFor(lang, DEFAULT_AD_OPTIONS));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { void fetchAdMakerOptions().then(setOpts); }, []);

  // A saved draft, or the ad being changed: every answer as it was.
  useEffect(() => {
    if (!me || !startId) return;
    fetchAdMakerAd(me, startId).then((a) => {
      setLoaded(a);
      setMention(a.mention); setNotes(a.notes); setParts(a.parts); setTone(a.tone || "excited");
      setVoice(a.voice || "female"); setLanguage(a.language || "en"); setMedia(a.media);
    }).catch((e) => setLoadError((e as Error).message));
  }, [me, startId]);

  const uploading = media.some((m) => m.uploading);
  const maxMedia = opts.max_media;

  async function addFiles(files: FileList) {
    if (!me) return;
    const list = Array.from(files).filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
    const room = maxMedia - media.length;
    if (list.length > room) showGoldAlert(t("vad_max_media", maxMedia));
    for (const f of list.slice(0, Math.max(0, room))) {
      const tmp = tmpId++;
      const local = URL.createObjectURL(f);
      setMedia((cur) => [...cur, { type: f.type.startsWith("video/") ? "video" : "image", key: "", url: "", local, uploading: true, tmp }]);
      adMakerUploadMedia(me, f)
        .then((m) => setMedia((cur) => cur.map((x) => (x.tmp === tmp ? { ...m, local, tmp } : x))))
        .catch((e) => {
          setMedia((cur) => cur.filter((x) => x.tmp !== tmp));
          URL.revokeObjectURL(local);
          showGoldAlert((e as Error).message || t("vad_upload_failed"));
        });
    }
  }
  if (import.meta.env.DEV) (window as unknown as { __bbAdAdd?: (f: FileList) => Promise<void> }).__bbAdAdd = (f) => addFiles(f);

  function removeMedia(i: number) {
    setMedia((cur) => {
      const gone = cur[i];
      if (gone?.local) URL.revokeObjectURL(gone.local);
      return cur.filter((_, j) => j !== i);
    });
  }

  const answers = (): AdAnswers => ({
    mention: mention.trim(), notes: notes.trim(), parts, media: media.filter((m) => m.key).map((m) => ({ type: m.type, key: m.key })),
    tone, voice, language,
  });

  async function make() {
    if (!me || busy) return;
    if (uploading) { showGoldAlert(t("vad_wait_uploads")); return; }
    if (!mention.trim() && !parts.length) { showGoldAlert(t("vad_need_something")); return; }
    if (!(await showGoldConfirm({ message: t("vad_confirm", opts.price_bbs), confirmLabel: t("vad_go_ahead"), cancelLabel: t("cancel") }))) return;
    setBusy(true);
    try {
      const draft = await adMakerSave(me, answers(), adId || undefined);
      setAdId(draft.id);
      const made = await adMakerMake(me, draft.id);
      navigate(`${BASE}/${made.id}`, { replace: true });
    } catch (e) {
      setBusy(false);
      void explainAdError(e, t, navigate);
    }
  }

  async function makeChanges() {
    if (!me || busy || !loaded) return;
    if (uploading) { showGoldAlert(t("vad_wait_uploads")); return; }
    if (!change.trim()) { showGoldAlert(t("vad_need_change")); return; }
    setBusy(true);
    try {
      const a = await adMakerEdit(me, loaded.id, change.trim(), answers());
      navigate(`${BASE}/${a.id}`, { replace: true });
    } catch (e) {
      setBusy(false);
      void explainAdError(e, t, navigate);
    }
  }

  const title = edit ? t("vad_make_changes") : t("vad_title");
  if (!me) return <div className="page" style={{ maxWidth: 680 }}><PageTitle>{title}</PageTitle><SignInNotice /></div>;
  if (startId && loadError) return <div className="page" style={{ maxWidth: 680 }}><PageTitle>{title}</PageTitle><Notice error>{loadError}</Notice></div>;
  if (startId && !loaded) return <div className="page" style={{ maxWidth: 680 }}><PageTitle>{title}</PageTitle><Loading /></div>;
  if (edit && loaded && loaded.edits_left <= 0) {
    return (
      <div className="page" style={{ maxWidth: 680 }}>
        <PageTitle backTo={`${BASE}/${loaded.id}`}>{title}</PageTitle>
        <div style={{ ...SONG_GOLD_CARD, textAlign: "center" }}><p style={{ color: "var(--gold)", fontWeight: 800 }}>{t("vad_no_changes_left")}</p></div>
      </div>
    );
  }

  let n = 0;
  return (
    <div className="page" style={{ maxWidth: 680 }}>
      <PageTitle backTo={edit && loaded ? `${BASE}/${loaded.id}` : BASE}>{title}</PageTitle>
      <div style={SONG_GOLD_CARD}>
        {edit && loaded && (
          <>
            <div style={{ color: "var(--gold)", fontWeight: 800, textAlign: "center", marginBottom: 12 }}>{t("vad_changes_left", loaded.edits_left, opts.free_edits)}</div>
            <p style={qLabel}><QNum n={++n} /><span>{t("vad_q_change")}</span></p>
            <textarea className="input" value={change} maxLength={800} rows={3} autoFocus onChange={(e) => setChange(e.target.value)}
              placeholder={t("vad_q_change_ph")} aria-label={t("vad_q_change")} style={{ padding: 12, resize: "vertical", minHeight: 90, lineHeight: 1.4 }} />
            <div style={{ height: 20 }} />
          </>
        )}

        <p style={qLabel}><QNum n={++n} /><span>{t("vad_q_say")}</span></p>
        <textarea className="input" value={mention} maxLength={1500} rows={4} onChange={(e) => setMention(e.target.value)}
          placeholder={t("vad_q_say_ph")} aria-label={t("vad_q_say")} style={{ padding: 12, resize: "vertical", minHeight: 110, lineHeight: 1.4 }} />

        <p style={{ ...qLabel, marginTop: 20 }}><QNum n={++n} /><span>{t("vad_q_media", maxMedia)}</span></p>
        <input ref={fileRef} type="file" accept="image/*,video/*" multiple style={{ display: "none" }}
          onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ""; }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))", gap: 8 }} data-testid="ad-media">
          {media.map((m, i) => {
            const src = m.local || m.url;
            return (
              <div key={m.key || `t${m.tmp}`} style={{ position: "relative", aspectRatio: "1 / 1", borderRadius: 10, overflow: "hidden", border: "1.5px solid var(--gold-border)", background: "#000" }}>
                {m.type === "video"
                  ? <video src={src} muted playsInline preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                {m.type === "video" && <span style={{ position: "absolute", left: 4, bottom: 4, fontSize: 11, color: "#000", background: "var(--gold)", borderRadius: 6, padding: "0 5px", fontWeight: 800 }}>▶</span>}
                {m.uploading && (
                  <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span className="va-spin" aria-label={t("vad_uploading")} />
                  </div>
                )}
                {!m.uploading && (
                  <button type="button" onClick={() => removeMedia(i)} aria-label={t("vk_remove")}
                    style={{ position: "absolute", top: 4, right: 4, width: 24, height: 24, borderRadius: "50%", border: "1px solid var(--gold-border)", background: "#000", color: "var(--gold)", cursor: "pointer", fontSize: 12, padding: 0 }}>✕</button>
                )}
              </div>
            );
          })}
          {media.length < maxMedia && (
            <button type="button" onClick={() => fileRef.current?.click()} aria-label={t("vad_add_media")}
              style={{ aspectRatio: "1 / 1", borderRadius: 10, border: "1.5px dashed var(--gold-border)", background: "#000", color: "var(--gold)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, fontWeight: 800, fontSize: 13 }}>
              <span style={{ fontSize: 26 }}>📷</span>{t("vad_add")}
            </button>
          )}
        </div>
        <style>{"@keyframes vaSpin { to { transform: rotate(360deg) } } .va-spin { width: 28px; height: 28px; border-radius: 50%; border: 3px solid rgba(240,196,32,.25); border-top-color: var(--gold); animation: vaSpin .8s linear infinite; display: inline-block }"}</style>

        <p style={{ ...qLabel, marginTop: 20 }}><QNum n={++n} /><span>{t("vad_q_parts")}</span></p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {opts.parts.map((p) => {
            const on = parts.includes(p.key);
            return (
              <button key={p.key} type="button" title={p.about} style={chip(on)} aria-pressed={on}
                onClick={() => setParts((cur) => (on ? cur.filter((k) => k !== p.key) : [...cur, p.key]))}>
                {on ? "✓ " : ""}{p.label}
              </button>
            );
          })}
        </div>

        <p style={{ ...qLabel, marginTop: 20 }}><QNum n={++n} /><span>{t("vad_q_sound")}</span></p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {opts.tones.map((x) => (
            <button key={x.key} type="button" style={chip(tone === x.key)} onClick={() => setTone(x.key)}>{TONE_ICONS[x.key] ?? "🎙"} {x.label}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          {opts.voices.map((v) => (
            <button key={v} type="button" style={{ ...chip(voice === v), flex: 1, padding: "12px 14px", fontSize: 16 }} onClick={() => setVoice(v)}>
              {v === "male" ? `👨 ${t("vad_voice_man")}` : v === "female" ? `👩 ${t("vad_voice_woman")}` : v}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          {opts.languages.map((l) => (
            <button key={l.code} type="button" style={chip(language === l.code)} onClick={() => setLanguage(l.code)}>{l.name}</button>
          ))}
        </div>

        <p style={{ ...qLabel, marginTop: 20 }}><QNum n={++n} /><span>{t("vad_q_notes")}</span></p>
        <textarea className="input" value={notes} maxLength={1000} rows={3} onChange={(e) => setNotes(e.target.value)}
          placeholder={t("vad_q_notes_ph")} aria-label={t("vad_q_notes")} style={{ padding: 12, resize: "vertical", minHeight: 90, lineHeight: 1.4 }} />

        <div style={{ marginTop: 20, border: "1.5px solid var(--gold-border)", borderRadius: 12, padding: "12px 14px", color: "var(--gold)", lineHeight: 1.45 }}>
          ⏱ {t("vad_note", opts.max_seconds, code || t("vad_your_username"))}
        </div>

        {edit ? (
          <button className="btn gold block" style={{ marginTop: 20, fontSize: 19, minHeight: 56, fontWeight: 900 }} disabled={busy || !change.trim()} onClick={() => void makeChanges()}>
            {busy ? t("song_starting") : `✎ ${t("vad_send_changes")}`}
          </button>
        ) : (
          <button className="btn gold block" style={{ marginTop: 20, fontSize: 19, minHeight: 56, fontWeight: 900 }} disabled={busy} onClick={() => void make()}>
            {busy ? t("song_starting") : `🎬 ${t("vad_make_for", opts.price_bbs)}`}
          </button>
        )}
        {edit && <p className="muted" style={{ textAlign: "center", fontSize: 12, marginBottom: 0 }}>{t("vad_changes_free")}</p>}
      </div>
    </div>
  );
}

// ---- 3-4. The ad, by its status ----------------------------------------------------------------

export function AdPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const { id } = useParams();
  const adId = Number(id);
  const me = useAdMe();
  const [ad, setAd] = useState<AdMakerAd | null>(null);
  const [error, setError] = useState("");
  const prevStatus = useRef<string>("");
  const prevEdits = useRef(0);

  const load = useCallback(async () => {
    if (!me || !adId) return;
    try {
      const a = await fetchAdMakerAd(me, adId);
      if ((prevStatus.current === "making" || prevStatus.current === "remaking") && a.status === "failed") {
        showGoldAlert(a.failure_reason || t("vad_failed_text"));
      }
      // A change that failed goes back to "done" with the old video; the server gives the change back.
      if (prevStatus.current === "remaking" && a.status === "done" && a.edits_used < prevEdits.current) showGoldAlert(t("vad_change_failed"));
      prevStatus.current = a.status;
      prevEdits.current = a.edits_used;
      setAd(a);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [me, adId, t]);

  useEffect(() => { void load(); }, [load]);
  // Arriving from the long questions page: start at the top, not halfway down.
  useEffect(() => { window.scrollTo(0, 0); }, [adId]);

  const working = ad?.status === "making" || ad?.status === "remaking";
  useEffect(() => {
    if (!working) return;
    const h = window.setInterval(() => { void load(); }, POLL_MS);
    return () => window.clearInterval(h);
  }, [working, load]);

  // A draft is still the questions.
  useEffect(() => {
    if (ad?.status === "draft") navigate(`${BASE}/new?ad=${ad.id}`, { replace: true });
  }, [ad?.status, ad?.id, navigate]);

  if (!me) return <div className="page" style={{ maxWidth: 680 }}><PageTitle>{t("vad_title")}</PageTitle><SignInNotice /></div>;
  const showAd = ad && (ad.status === "done" || (ad.status === "remaking" && ad.video_url));
  return (
    <div className="page" style={{ maxWidth: 680 }}>
      <PageTitle backTo={`${BASE}/my`}>{showAd ? t("vad_your_ad") : t("vad_title")}</PageTitle>
      {error && !ad && <Notice error>{error}</Notice>}
      {!error && !ad && <Loading />}
      {ad && (ad.status === "making" || (ad.status === "remaking" && !ad.video_url)) && <MakingView />}
      {showAd && <YourAdView ad={ad} />}
      {ad?.status === "failed" && <FailedView ad={ad} />}
    </div>
  );
}

function MakingView() {
  const { t } = useT();
  const navigate = useNavigate();
  return (
    <div style={{ ...SONG_GOLD_CARD, textAlign: "center", padding: "34px 18px" }} data-testid="ad-making">
      <style>{"@keyframes vaSpin { to { transform: rotate(360deg) } } @keyframes vaPulse { 0%,100% { transform: scale(1) } 50% { transform: scale(1.08) } }"}</style>
      <div style={{ position: "relative", width: 120, height: 120, margin: "0 auto 18px" }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "6px solid rgba(240,196,32,.18)", borderTopColor: "var(--gold)", animation: "vaSpin 1s linear infinite" }} />
        <div style={{ position: "absolute", inset: 22, borderRadius: "50%", border: "2px solid var(--gold-border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 38, animation: "vaPulse 1.4s ease-in-out infinite" }}>🎬</div>
      </div>
      <h2 style={{ color: "var(--gold-bright)", margin: "0 0 10px" }}>{t("vad_making")}</h2>
      <p className="soft" style={{ margin: "0 0 20px", fontSize: 16 }}>{t("vad_making_sub")}</p>
      <button className="btn" onClick={() => navigate(`${BASE}/my`)}>{t("vad_my_ads")}</button>
    </div>
  );
}

function YourAdView({ ad }: { ad: AdMakerAd }) {
  const { t } = useT();
  const navigate = useNavigate();
  const me = useAdMe();
  const [sending, setSending] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [posting, setPosting] = useState(false);
  const share = ad.share_url ?? "";
  const remaking = ad.status === "remaking";
  const total = ad.edits_used + ad.edits_left || 3;
  const shareText = t("vad_share_text", ad.referral_code ?? "", share);

  async function doShare() {
    if (!share) return;
    if (typeof navigator.share === "function") {
      try { await navigator.share({ title: ad.title || t("vad_title"), text: shareText, url: share }); return; } catch { /* cancelled: fine */ return; }
    }
    try { await navigator.clipboard.writeText(share); showGoldAlert(t("link_copied_paste_it_anywhere")); } catch { showGoldAlert(share); }
  }
  async function download() {
    if (!ad.video_url) return;
    setDownloading(true);
    try { await downloadUrl(ad.video_url, `${safeFileName(ad.title || "bingg-bongg-video-ad")}.mp4`); } finally { setDownloading(false); }
  }
  // The same post flow as a Bingg Bongg Song's video: the file goes to the normal upload screen,
  // and after the upload the post is linked to the ad (adMakerAttachPost, in UploadVideoPage).
  async function postIt() {
    if (!ad.video_url || !me) return;
    setPosting(true);
    try {
      const res = await fetch(ad.video_url, { mode: "cors", cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const file = new File([blob], `${safeFileName(ad.title || "bingg-bongg-video-ad")}.mp4`, { type: blob.type || "video/mp4" });
      navigate("/upload", { state: { greenScreen: { file, duration: ad.duration ?? 60, thumb: null }, adMakerId: ad.id } });
    } catch {
      showGoldAlert(t("vad_post_failed"));
    } finally {
      setPosting(false);
    }
  }

  const btn: React.CSSProperties = { minHeight: 52, fontSize: 16, fontWeight: 800 };
  return (
    <>
      <div style={SONG_GOLD_CARD}>
        {remaking && (
          <div data-testid="ad-remaking" style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center", border: "1.5px solid var(--gold-border)", borderRadius: 12, padding: "10px 12px", marginBottom: 12, color: "var(--gold-bright)", fontWeight: 800 }}>
            <span className="va-spin" style={{ width: 20, height: 20 }} />{t("vad_making_changes")}
            <style>{"@keyframes vaSpin { to { transform: rotate(360deg) } } .va-spin { width: 20px; height: 20px; border-radius: 50%; border: 3px solid rgba(240,196,32,.25); border-top-color: var(--gold); animation: vaSpin .8s linear infinite; display: inline-block; flex: none }"}</style>
          </div>
        )}
        {ad.video_url ? <AdPlayer src={ad.video_url} poster={ad.thumbnail} /> : <Notice>{t("song_something_wrong")}</Notice>}
        {ad.title && <h2 style={{ color: "var(--gold-bright)", textAlign: "center", margin: "14px 0 6px", fontSize: "clamp(20px, 5vw, 26px)", wordBreak: "break-word" }}>{ad.title}</h2>}
        <div style={{ textAlign: "center", color: "var(--gold)", fontWeight: 800 }}>{t("vad_changes_left", ad.edits_left, total)}</div>
        {madeWithAi(t)}
      </div>

      {ad.script.length > 0 && (
        <div style={{ ...SONG_GOLD_CARD, marginTop: 14 }}>
          <div style={{ color: "var(--gold-bright)", fontWeight: 900, fontSize: 17, marginBottom: 10 }}>{t("vad_script")}</div>
          {ad.script.map((l, i) => {
            const isCode = i === ad.script.length - 1 || l.show === "code";
            return (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0", borderTop: i ? "1px solid #2a2a2a" : 0 }}>
                <span style={{ flex: "0 0 24px", color: "var(--gold)", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{i + 1}.</span>
                <span style={{ flex: 1, color: isCode ? "var(--gold-bright)" : "var(--gold)", fontWeight: isCode ? 800 : 500, lineHeight: 1.4 }}>{l.say}</span>
                {isCode && <span style={{ flex: "none", fontSize: 11, fontWeight: 800, color: "#000", background: "var(--gold)", borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap" }}>{t("vad_your_code")}</span>}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginTop: 14 }}>
        <button className="btn gold" style={{ ...btn, gridColumn: "1 / -1" }} disabled={remaking || ad.edits_left <= 0}
          onClick={() => navigate(`${BASE}/${ad.id}/edit`)}>
          {ad.edits_left <= 0 ? t("vad_no_changes_left") : `✎ ${t("vad_make_changes")}`}
        </button>
        {ad.post_id
          ? <button className="btn" style={btn} onClick={() => navigate(`/video/${ad.post_id}`)}>▶ {t("song_see_video")}</button>
          : <button className="btn" style={btn} disabled={remaking || posting || !ad.video_url} onClick={() => void postIt()}>📤 {posting ? t("snd_loading") : t("vad_post")}</button>}
        <button className="btn" style={btn} disabled={!share} onClick={() => void doShare()}>🔗 {t("vad_share")}</button>
        <button className="btn" style={btn} disabled={!share} onClick={() => setSending(true)}>💌 {t("song_send")}</button>
        <button className="btn" style={btn} disabled={!ad.video_url || downloading} onClick={() => void download()}>⬇️ {downloading ? t("snd_loading") : t("download")}</button>
      </div>
      {sending && <SendSongSheet text={shareText} url={share} title={ad.title || t("vad_title")} onClose={() => setSending(false)} />}
    </>
  );
}

function FailedView({ ad }: { ad: AdMakerAd }) {
  const { t } = useT();
  const navigate = useNavigate();
  return (
    <div style={{ ...SONG_GOLD_CARD, textAlign: "center", padding: "24px 16px" }}>
      <div style={{ fontSize: 44, margin: "6px 0" }}>🎬</div>
      <h2 style={{ color: "var(--gold-bright)", margin: "0 0 10px" }}>{t("vad_failed_title")}</h2>
      <p className="soft" style={{ fontSize: 16 }}>{ad.failure_reason || t("vad_failed_text")}</p>
      {ad.refunded && <p style={{ color: "var(--gold)", fontWeight: 800 }}>✓ {t("song_refunded", ad.coins_charged || ad.price_bbs)}</p>}
      <div className="row" style={{ gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: 14 }}>
        <button className="btn" onClick={() => navigate(`${BASE}/my`)}>{t("vad_my_ads")}</button>
        <button className="btn gold" onClick={() => navigate(`${BASE}/new?ad=${ad.id}`)}>↻ {t("song_try_again")}</button>
      </div>
    </div>
  );
}

// ---- 5. My Video Ads ---------------------------------------------------------------------------

const STATUS_KEYS: Record<string, StringKey> = {
  draft: "vad_st_draft", making: "vad_st_making", remaking: "vad_st_remaking", done: "vad_st_done", failed: "vad_st_failed",
};

export function MyAdsPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const me = useAdMe();
  const [rows, setRows] = useState<AdMakerAd[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    if (!me) return;
    fetchMyAdMakerAds(me).then(setRows).catch((e) => setError((e as Error).message));
  }, [me]);
  useEffect(load, [load]);
  const working = rows?.some((a) => a.status === "making" || a.status === "remaking");
  useEffect(() => {
    if (!working) return;
    const h = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(h);
  }, [working, load]);

  async function remove(a: AdMakerAd) {
    if (!me) return;
    if (!(await showGoldConfirm({ message: t("vad_delete_confirm", a.title || (a.mention.length > 40 ? a.mention.slice(0, 40) + "…" : a.mention) || t("vad_st_draft")), confirmLabel: t("delete"), cancelLabel: t("cancel"), danger: true }))) return;
    try { await deleteAdMakerAd(me, a.id); setRows((cur) => cur?.filter((x) => x.id !== a.id) ?? cur); } catch (e) { showGoldAlert((e as Error).message); }
  }

  if (!me) return <div className="page" style={{ maxWidth: 680 }}><PageTitle>{t("vad_my_ads")}</PageTitle><SignInNotice /></div>;
  return (
    <div className="page" style={{ maxWidth: 680 }}>
      <PageTitle backTo={BASE}>{t("vad_my_ads")}</PageTitle>
      <button className="btn gold block" style={{ marginBottom: 14, minHeight: 50, fontWeight: 900 }} onClick={() => navigate(`${BASE}/new`)}>🎬 {t("vad_make_new")}</button>
      {error && <Notice error>{error}</Notice>}
      {!error && rows === null && <Loading />}
      {rows?.length === 0 && <Notice>{t("vad_none_yet")}</Notice>}
      {rows?.map((a) => {
        const to = a.status === "draft" ? `${BASE}/new?ad=${a.id}` : `${BASE}/${a.id}`;
        const busy = a.status === "making" || a.status === "remaking";
        return (
          <div key={a.id} className="card" style={{ display: "flex", alignItems: "center", gap: 10, padding: 10, marginBottom: 8, background: "#000", borderColor: "var(--gold-border)" }}>
            <Link to={to} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ flex: "0 0 46px", height: 72, borderRadius: 8, border: "1.5px solid var(--gold-border)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, background: a.thumbnail ? `#000 url(${JSON.stringify(a.thumbnail)}) center / cover` : "#000" }}>
                {a.thumbnail ? "" : "🎬"}
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", color: "var(--gold-bright)", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title || a.mention || t("vad_st_draft")}</span>
                <span className="muted" style={{ fontSize: 13 }}>{a.created_at ? new Date(a.created_at).toLocaleDateString() : ""}</span>
              </span>
            </Link>
            <span style={{ fontSize: 11, fontWeight: 800, padding: "3px 9px", borderRadius: 999, whiteSpace: "nowrap", border: "1px solid var(--gold-border)", background: a.status === "done" ? "var(--gold)" : "#000", color: a.status === "done" ? "#000" : a.status === "failed" ? "#f77" : "var(--gold)" }}>
              {STATUS_KEYS[a.status] ? t(STATUS_KEYS[a.status]) : a.status}
            </span>
            <button type="button" aria-label={t("delete")} disabled={busy} onClick={() => void remove(a)}
              style={{ width: 34, height: 34, flex: "0 0 34px", borderRadius: "50%", border: "1px solid var(--gold-border)", background: "#000", color: "var(--gold)", cursor: "pointer", opacity: busy ? 0.4 : 1 }}>✕</button>
          </div>
        );
      })}
    </div>
  );
}

// ---- The public ad page ------------------------------------------------------------------------

export function SharedAdPage() {
  const { t } = useT();
  const { code } = useParams();
  const navigate = useNavigate();
  const [ad, setAd] = useState<SharedAd | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!code) return;
    fetchSharedAdMakerAd(code).then(setAd).catch((e) => setError((e as Error).message || t("vad_not_available")));
  }, [code, t]);
  const name = ad?.from?.fullname || ad?.from?.username || "";
  const refCode = ad?.referral_code || "";

  return (
    <div className="page" style={{ maxWidth: 560 }}>
      {error && <div style={{ ...SONG_GOLD_CARD, textAlign: "center" }}><p style={{ color: "var(--gold)", fontSize: 18 }}>{t("vad_not_available")}</p></div>}
      {!error && !ad && <Loading />}
      {ad && (
        <div style={{ ...SONG_GOLD_CARD, padding: "20px 14px" }}>
          {ad.title && <h1 style={{ color: "var(--gold-bright)", textAlign: "center", fontSize: "clamp(22px, 6vw, 30px)", lineHeight: 1.2, margin: "0 0 14px", wordBreak: "break-word" }}>{ad.title}</h1>}
          {ad.video_url ? <AdPlayer src={ad.video_url} poster={ad.thumbnail} /> : <Notice>{t("vad_not_available")}</Notice>}
          {refCode && (
            <>
              <p style={{ color: "var(--gold)", textAlign: "center", fontSize: 18, fontWeight: 800, margin: "16px 0 4px", lineHeight: 1.35 }}>
                {name ? t("vad_join_name", name, refCode) : t("vad_join", refCode)}
              </p>
              <button className="btn gold block" style={{ marginTop: 12, minHeight: 56, fontSize: 18, fontWeight: 900 }} onClick={() => navigate(`/invite/${encodeURIComponent(refCode)}`)}>
                {t("vad_sign_up_code", refCode)}
              </button>
            </>
          )}
          {madeWithAi(t)}
        </div>
      )}
      <button className="btn block" style={{ marginTop: 14, minHeight: 50, fontWeight: 800 }} onClick={() => navigate(BASE)}>
        🎬 {t("vad_make_your_own")}
      </button>
    </div>
  );
}
