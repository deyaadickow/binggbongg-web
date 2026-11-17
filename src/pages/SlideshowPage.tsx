// Photo slideshow (Steve, 2026-11-16: "Build all three on all 3 platforms" — TikTok's photo
// mode). 2-35 photos, reordered, a few seconds each or fitted to the music, a slow Ken-Burns zoom
// and a crossfade between photos, music from the sound picker (shown straight away) and optional
// words on top. Rendered here into a 720x1280 mp4 and posted with post_kind=slideshow, so every
// feed simply plays it.
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useT } from "../lib/i18n";
import { PageTitle } from "../components/PageTitle";
import { Notice } from "../components/Common";
import { SoundPicker } from "../components/SoundPicker";
import { showGoldAlert } from "../components/GoldToast";
import { loadTextBehindFonts } from "../lib/textBehind";
import { drawTextBlock, POST_H, POST_W, TEXT_COLORS, TEXT_FONTS } from "../lib/textPost";
import { drawKenBurns, loadScaledImage, pickMime, renderToMp4, type RenderResult } from "../lib/videoKit";
import { startMusic, useMusic } from "../lib/music";
import { useSession } from "../lib/session";

const MIN_PHOTOS = 2;
const MAX_PHOTOS = 35;
const FADE = 0.5;

interface Photo { id: number; bmp: ImageBitmap; thumb: string }
let nextId = 1;

const chip = (on: boolean): React.CSSProperties => ({
  padding: "8px 12px", borderRadius: 999, cursor: "pointer", fontWeight: 700, fontSize: 13, whiteSpace: "nowrap",
  border: "1.5px solid var(--gold-border)", background: on ? "var(--gold)" : "#000", color: on ? "#000" : "var(--gold)",
});

/** Photo i, `local` seconds into its own slot of `per` seconds (lib/videoKit drawKenBurns). */
function drawPhoto(ctx: CanvasRenderingContext2D, p: Photo, i: number, local: number, per: number) {
  drawKenBurns(ctx, p.bmp, i, local, per + FADE, POST_W, POST_H);
}

export function SlideshowPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const { isLoggedIn } = useSession();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [adding, setAdding] = useState(false);
  const [per, setPer] = useState(2.5);
  const [fit, setFit] = useState(false);
  const [words, setWords] = useState("");
  const [wordsPos, setWordsPos] = useState<"top" | "middle" | "bottom">("bottom");
  const [fontKey, setFontKey] = useState("classic");
  const [color, setColor] = useState("#FFFFFF");
  // Music is strongly suggested: the picker opens as the page does.
  const [pickerOpen, setPickerOpen] = useState(true);
  const { music, loading: musicLoading, error: musicError, choose, clear } = useMusic();
  const [phase, setPhase] = useState<"edit" | "render" | "done">("edit");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<RenderResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [mime] = useState(pickMime);
  const photosRef = useRef(photos);
  photosRef.current = photos;

  useEffect(() => { void loadTextBehindFonts(); }, []);
  useEffect(() => () => {
    abortRef.current?.abort();
    photosRef.current.forEach((p) => { p.bmp.close(); URL.revokeObjectURL(p.thumb); });
  }, []);

  /** Seconds per photo: chosen, or (fit to the music) the music shared out, snapped to whole beats. */
  const secondsEach = useMemo(() => {
    if (!fit || !music || photos.length < 1) return per;
    let s = Math.max(1, Math.min(5, music.buffer.duration / photos.length));
    if (music.period > 0.2) s = Math.max(music.period, Math.round(s / music.period) * music.period);
    return Math.max(1, Math.min(5, s));
  }, [fit, music, photos.length, per]);
  const total = Math.max(1, photos.length) * secondsEach;

  async function addFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    const room = MAX_PHOTOS - photosRef.current.length;
    if (list.length > room) showGoldAlert(t("ss_max", MAX_PHOTOS));
    setAdding(true);
    try {
      for (const f of list.slice(0, Math.max(0, room))) {
        try {
          const bmp = await loadScaledImage(f, POST_W * 1.2, POST_H * 1.2);
          const thumb = URL.createObjectURL(f);
          setPhotos((cur) => [...cur, { id: nextId++, bmp, thumb }]);
        } catch { /* not an image this browser can read: skipped */ }
      }
    } finally {
      setAdding(false);
    }
  }
  if (import.meta.env.DEV) (window as unknown as { __bbSlideshowAdd?: (f: File[]) => Promise<void> }).__bbSlideshowAdd = (f) => addFiles(f);

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

  const font = TEXT_FONTS.find((f) => f.key === fontKey) ?? TEXT_FONTS[0];
  const draw = (ctx: CanvasRenderingContext2D, time: number, list: Photo[] = photos) => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, POST_W, POST_H);
    if (!list.length) {
      ctx.fillStyle = "#D4AF37";
      ctx.font = "700 40px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(t("ss_add_photos_hint"), POST_W / 2, POST_H / 2);
      return;
    }
    const i = Math.min(list.length - 1, Math.floor(time / secondsEach));
    const local = time - i * secondsEach;
    drawPhoto(ctx, list[i], i, local + FADE, secondsEach);
    // Crossfade: the next photo comes up over the last FADE seconds of this one.
    if (i + 1 < list.length && local > secondsEach - FADE) {
      ctx.save();
      ctx.globalAlpha = (local - (secondsEach - FADE)) / FADE;
      drawPhoto(ctx, list[i + 1], i + 1, local - (secondsEach - FADE), secondsEach);
      ctx.restore();
    }
    if (words.trim()) {
      const box = wordsPos === "top" ? { x: 50, y: 110, w: POST_W - 100, h: 300 }
        : wordsPos === "middle" ? { x: 50, y: POST_H / 2 - 170, w: POST_W - 100, h: 340 }
        : { x: 50, y: POST_H - 430, w: POST_W - 100, h: 300 };
      drawTextBlock(ctx, words, { font, color, align: "center" }, box, 72, Math.min(1, time / 0.6), true);
    }
  };

  // Live preview, looping the whole show.
  useEffect(() => {
    if (phase !== "edit") return;
    let raf = 0;
    const started = performance.now();
    const frame = () => {
      const c = canvasRef.current;
      if (c) draw(c.getContext("2d")!, ((performance.now() - started) / 1000) % (total + 0.5));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  });

  async function render() {
    if (photos.length < MIN_PHOTOS) { showGoldAlert(t("ss_min", MIN_PHOTOS)); return; }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const list = photos.slice();
    setPhase("render");
    setProgress(0);
    const ab = new AbortController();
    abortRef.current = ab;
    try {
      const r = await renderToMp4({
        canvas, duration: total, name: "slideshow", thumbAt: Math.min(1, total / 3), signal: ab.signal,
        draw: (ctx, time) => draw(ctx, time, list),
        onStart: (ac, dest) => { if (music) startMusic(ac, music.buffer, dest, 1, total); },
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
    if (!result) return;
    if (!isLoggedIn) { navigate("/login", { state: { from: "/slideshow" } }); return; }
    navigate("/upload", {
      state: {
        greenScreen: { file: result.file, duration: result.duration, thumb: result.thumb },
        postKind: "slideshow",
        ...(music?.sound.id ? { remix: { soundId: music.sound.id, soundTitle: music.sound.title ?? "" } } : {}),
      },
    });
  }

  if (!mime) {
    return <div className="page" style={{ maxWidth: 520 }}><PageTitle backTo="/upload">{t("ss_title")}</PageTitle><Notice>{t("vk_unsupported")}</Notice></div>;
  }

  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <PageTitle backTo="/upload">{t("ss_title")}</PageTitle>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ flex: "0 1 320px", width: "100%", maxWidth: 340, margin: "0 auto" }}>
          <div style={{ position: "relative", aspectRatio: "9 / 16", borderRadius: 14, overflow: "hidden", border: "2px solid var(--gold-border)", background: "#000" }}>
            <canvas ref={canvasRef} width={POST_W} height={POST_H} style={{ width: "100%", height: "100%", display: phase === "done" ? "none" : "block" }} />
            {phase === "done" && result && <video src={result.url} controls autoPlay playsInline style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }} />}
          </div>
          <div className="muted" style={{ textAlign: "center", fontSize: 12, marginTop: 6 }}>
            {t("ss_summary", photos.length, secondsEach.toFixed(1), Math.round(photos.length * secondsEach))}
          </div>
          {phase === "render" && (
            <div style={{ marginTop: 10 }}>
              <div className="muted" style={{ fontSize: 13, marginBottom: 6, textAlign: "center" }}>{t("vk_making_video", Math.round(progress * 100))}</div>
              <div style={{ height: 8, background: "var(--panel)", borderRadius: 999, overflow: "hidden" }}>
                <div style={{ width: `${Math.round(progress * 100)}%`, height: "100%", background: "var(--gold-border)" }} />
              </div>
              <div style={{ textAlign: "center", marginTop: 8 }}><button className="btn ghost small" onClick={() => abortRef.current?.abort()}>{t("vk_cancel")}</button></div>
            </div>
          )}
          {phase === "done" && (
            <div className="row" style={{ justifyContent: "center", gap: 10, marginTop: 12 }}>
              <button className="btn ghost" onClick={() => { if (result) URL.revokeObjectURL(result.url); setResult(null); setPhase("edit"); }}>{t("vk_edit_again")}</button>
              <button className="btn gold" onClick={next}>{t("vk_next")}</button>
            </div>
          )}
        </div>

        <div style={{ flex: "1 1 360px", minWidth: 0, display: phase === "edit" ? "block" : "none" }}>
          <div className="card pad" style={{ marginBottom: 12 }}>
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

          <div className="card pad" style={{ marginBottom: 12 }}>
            <div className="row" style={{ alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0, color: "var(--gold)", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {musicLoading ? t("snd_loading") : music ? `♪ ${music.sound.title || t("snd_untitled")}` : t("vk_no_music")}
              </div>
              {music && <button className="btn small ghost" onClick={() => { clear(); setFit(false); }}>{t("vk_remove")}</button>}
              <button className="btn small gold" onClick={() => setPickerOpen(true)}>{music ? t("vk_change_sound") : t("vk_add_sound")}</button>
            </div>
            {musicError && <p style={{ color: "#f55", fontSize: 13, margin: "6px 0 0" }}>{musicError}</p>}
            <label className="row" style={{ alignItems: "center", marginTop: 12, cursor: music ? "pointer" : "default", opacity: music ? 1 : 0.5 }}>
              <div style={{ flex: 1, fontWeight: 700 }}>{t("ss_fit_music")}</div>
              <input type="checkbox" className="switch" disabled={!music} checked={fit && !!music} onChange={(e) => setFit(e.target.checked)} />
            </label>
            <div className="soft" style={{ fontSize: 13, margin: "12px 0 4px", opacity: fit && music ? 0.5 : 1 }}>{t("ss_seconds_each", per.toFixed(1))}</div>
            <input type="range" min={1} max={5} step={0.5} value={per} disabled={fit && !!music} onChange={(e) => setPer(Number(e.target.value))}
              aria-label={t("ss_seconds_each", per.toFixed(1))} style={{ width: "100%", accentColor: "var(--gold)" }} />
          </div>

          <div className="card pad" style={{ marginBottom: 12 }}>
            <div className="soft" style={{ fontSize: 13, marginBottom: 6 }}>{t("ss_words")}</div>
            <input className="input" value={words} maxLength={120} onChange={(e) => setWords(e.target.value)} placeholder={t("ss_words_ph")} style={{ width: "100%", marginBottom: 10 }} />
            {words.trim() && (
              <>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                  {(["top", "middle", "bottom"] as const).map((p) => (
                    <button key={p} type="button" style={chip(p === wordsPos)} onClick={() => setWordsPos(p)}>
                      {p === "top" ? t("ss_top") : p === "middle" ? t("ss_middle") : t("ss_bottom")}
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                  {TEXT_FONTS.map((f) => (
                    <button key={f.key} type="button" onClick={() => setFontKey(f.key)} style={{ ...chip(f.key === fontKey), fontFamily: f.family, fontWeight: f.weight }}>{f.label}</button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {TEXT_COLORS.map((c) => (
                    <button key={c} type="button" onClick={() => setColor(c)} aria-label={c}
                      style={{ width: 30, height: 30, borderRadius: "50%", cursor: "pointer", background: c, border: c === color ? "3px solid var(--gold-bright)" : "1.5px solid var(--gold-border)" }} />
                  ))}
                </div>
              </>
            )}
          </div>

          <button className="btn block gold" onClick={render} disabled={musicLoading || adding || photos.length < MIN_PHOTOS}>{t("vk_make_video")}</button>
          {photos.length < MIN_PHOTOS && <p className="muted" style={{ textAlign: "center", fontSize: 12 }}>{t("ss_min", MIN_PHOTOS)}</p>}
        </div>
      </div>
      {pickerOpen && <SoundPicker onClose={() => setPickerOpen(false)} onPick={(s) => { setPickerOpen(false); void choose(s); }} />}
    </div>
  );
}
