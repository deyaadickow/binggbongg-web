// Text post (Steve, 2026-11-16: "Build all three on all 3 platforms" — TikTok's text posts).
// Up to 300 characters on a background, in a chosen font, colour and alignment, with optional
// music. It is rendered on this device into a 720x1280 mp4 (the music as its sound, silent AAC
// with none) and goes through the normal upload screen with post_kind=text, so every feed on
// every platform just plays it like any other video.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { post } from "../lib/api";
import { useT } from "../lib/i18n";
import { PageTitle } from "../components/PageTitle";
import { Notice } from "../components/Common";
import { SoundPicker } from "../components/SoundPicker";
import { showGoldAlert } from "../components/GoldToast";
import { loadTextBehindFonts } from "../lib/textBehind";
import { drawTextBg, drawTextBlock, POST_H, POST_W, TEXT_BGS, TEXT_COLORS, TEXT_FONTS, type TextAlign, type TextBg } from "../lib/textPost";
import { loadScaledImage, pickMime, renderToMp4, type RenderResult } from "../lib/videoKit";
import { startMusic, useMusic } from "../lib/music";
import { useSession } from "../lib/session";

const MAX_CHARS = 300;

const chip = (on: boolean): React.CSSProperties => ({
  padding: "8px 12px", borderRadius: 999, cursor: "pointer", fontWeight: 700, fontSize: 13, whiteSpace: "nowrap",
  border: "1.5px solid var(--gold-border)", background: on ? "var(--gold)" : "#000", color: on ? "#000" : "var(--gold)",
});

export function TextPostPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const { isLoggedIn } = useSession();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [text, setText] = useState("");
  const [bgs, setBgs] = useState<TextBg[]>(TEXT_BGS);
  const [bgKey, setBgKey] = useState("gold");
  const [fontKey, setFontKey] = useState("anton");
  const [color, setColor] = useState("#FFFFFF");
  const [align, setAlign] = useState<TextAlign>("center");
  const [seconds, setSeconds] = useState(8);
  const [pickerOpen, setPickerOpen] = useState(false);
  const { music, loading: musicLoading, error: musicError, choose, clear } = useMusic();
  const images = useRef<Record<string, ImageBitmap | null>>({});
  const [imgTick, setImgTick] = useState(0);
  const [phase, setPhase] = useState<"edit" | "render" | "done">("edit");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<RenderResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [mime] = useState(pickMime);

  const bg = bgs.find((b) => b.key === bgKey) ?? bgs[0];
  const font = TEXT_FONTS.find((f) => f.key === fontKey) ?? TEXT_FONTS[0];

  useEffect(() => { void loadTextBehindFonts().then(() => setImgTick((n) => n + 1)); }, []);

  // Two or three Bingg Bongg scenes from the Green Screen's backgrounds, after the bundled one.
  useEffect(() => {
    let alive = true;
    post<{ virtualBackgrounds?: { id: number; title?: string | null; file?: string | null }[] }>("fetchSettings", { x: 1 })
      .then((r) => {
        if (!alive) return;
        const scenes = (r.data?.virtualBackgrounds ?? []).filter((b) => b.file && /\.(png|jpe?g|webp)$/i.test(b.file)).slice(0, 3)
          .map((b, i): TextBg => ({ key: `scene${b.id}`, label: b.title?.trim() || `Scene ${i + 1}`, kind: "image", url: b.file! }));
        if (scenes.length) setBgs([...TEXT_BGS, ...scenes]);
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);

  // Pictures load when chosen (and are kept), scaled to the canvas.
  useEffect(() => {
    if (bg.kind !== "image" || !bg.url || bg.key in images.current) return;
    images.current[bg.key] = null;
    const url = bg.url.startsWith("/") ? bg.url : (bg.url.startsWith("http") ? bg.url : `https://d32kgcvh9dqf5h.cloudfront.net/${bg.url.replace(/^\/+/, "")}`);
    loadScaledImage(url, POST_W * 1.15, POST_H * 1.15)
      .then((b) => { images.current[bg.key] = b; setImgTick((n) => n + 1); })
      .catch(() => { delete images.current[bg.key]; showGoldAlert(t("tp_bg_failed")); setBgKey("gold"); });
  }, [bg, t]);

  useEffect(() => () => { Object.values(images.current).forEach((b) => b?.close()); }, []);

  // With music, the length follows it (up to 15 s).
  useEffect(() => {
    if (music) setSeconds(Math.max(5, Math.min(15, Math.floor(music.buffer.duration))));
  }, [music]);

  const style = { font, color, align };
  const draw = (ctx: CanvasRenderingContext2D, time: number) => {
    drawTextBg(ctx, bg, images.current[bg.key] ?? null, time);
    const appear = Math.min(1, time / 0.6);
    const pad = 70;
    drawTextBlock(ctx, text || (phase === "edit" ? t("tp_placeholder_preview") : ""), style, { x: pad, y: 200, w: POST_W - pad * 2, h: POST_H - 400 }, 104, appear);
  };

  // The live preview: the first 2 seconds play, then it holds — what the video will look like.
  useEffect(() => {
    if (phase !== "edit") return;
    let raf = 0;
    const started = performance.now();
    const frame = () => {
      const c = canvasRef.current;
      if (c) draw(c.getContext("2d")!, ((performance.now() - started) / 1000) % (seconds + 1.5));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }); // every render: the closure carries the current settings

  useEffect(() => () => abortRef.current?.abort(), []);

  async function render() {
    if (!text.trim()) { showGoldAlert(t("tp_type_something")); return; }
    const canvas = canvasRef.current;
    if (!canvas) return;
    setPhase("render");
    setProgress(0);
    const ab = new AbortController();
    abortRef.current = ab;
    try {
      const r = await renderToMp4({
        canvas, duration: seconds, name: "text-post", thumbAt: Math.min(1.5, seconds / 2), signal: ab.signal,
        draw: (ctx, time) => draw(ctx, time),
        onStart: (ac, dest) => { if (music) startMusic(ac, music.buffer, dest, 1, seconds); },
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
    if (!isLoggedIn) { navigate("/login", { state: { from: "/text-post" } }); return; }
    navigate("/upload", {
      state: {
        greenScreen: { file: result.file, duration: result.duration, thumb: result.thumb },
        postKind: "text",
        ...(music?.sound.id ? { remix: { soundId: music.sound.id, soundTitle: music.sound.title ?? "" } } : {}),
      },
    });
  }

  if (!mime) {
    return <div className="page" style={{ maxWidth: 520 }}><PageTitle backTo="/upload">{t("tp_title")}</PageTitle><Notice>{t("vk_unsupported")}</Notice></div>;
  }

  void imgTick;
  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <PageTitle backTo="/upload">{t("tp_title")}</PageTitle>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ flex: "0 1 320px", width: "100%", maxWidth: 340, margin: "0 auto" }}>
          <div style={{ position: "relative", aspectRatio: "9 / 16", borderRadius: 14, overflow: "hidden", border: "2px solid var(--gold-border)", background: "#000" }}>
            <canvas ref={canvasRef} width={POST_W} height={POST_H} style={{ width: "100%", height: "100%", display: phase === "done" ? "none" : "block" }} />
            {phase === "done" && result && <video src={result.url} controls autoPlay playsInline style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }} />}
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
            <textarea className="input" rows={4} value={text} maxLength={MAX_CHARS} placeholder={t("tp_placeholder")}
              onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))} style={{ width: "100%", fontSize: 16 }} />
            <div className="muted" style={{ textAlign: "right", fontSize: 12 }}>{text.length} / {MAX_CHARS}</div>
          </div>

          <div className="card pad" style={{ marginBottom: 12 }}>
            <div className="soft" style={{ fontSize: 13, marginBottom: 8 }}>{t("tp_background")}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {bgs.map((b) => (
                <button key={b.key} type="button" onClick={() => setBgKey(b.key)} title={b.label} aria-label={b.label}
                  style={{ width: 46, height: 64, borderRadius: 8, cursor: "pointer", padding: 0,
                    border: b.key === bgKey ? "3px solid var(--gold-bright)" : "1.5px solid var(--gold-border)",
                    background: b.kind === "image"
                      ? `#000 url(${JSON.stringify(b.url!.startsWith("/") || b.url!.startsWith("http") ? b.url! : `https://d32kgcvh9dqf5h.cloudfront.net/${b.url}`)}) center / cover`
                      : b.kind === "gradient" ? `linear-gradient(160deg, ${b.colors!.join(", ")})` : b.colors![0] }} />
              ))}
            </div>
          </div>

          <div className="card pad" style={{ marginBottom: 12 }}>
            <div className="soft" style={{ fontSize: 13, marginBottom: 8 }}>{t("tp_font")}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              {TEXT_FONTS.map((f) => (
                <button key={f.key} type="button" onClick={() => setFontKey(f.key)} style={{ ...chip(f.key === fontKey), fontFamily: f.family, fontWeight: f.weight, fontSize: 15 }}>{f.label}</button>
              ))}
            </div>
            <div className="soft" style={{ fontSize: 13, marginBottom: 8 }}>{t("tp_color")}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              {TEXT_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)} aria-label={c}
                  style={{ width: 34, height: 34, borderRadius: "50%", cursor: "pointer", background: c,
                    border: c === color ? "3px solid var(--gold-bright)" : "1.5px solid var(--gold-border)", boxShadow: c === color ? "0 0 0 2px #000 inset" : undefined }} />
              ))}
            </div>
            <div className="soft" style={{ fontSize: 13, marginBottom: 8 }}>{t("tp_align")}</div>
            <div style={{ display: "flex", gap: 8 }}>
              {(["left", "center", "right"] as TextAlign[]).map((a) => (
                <button key={a} type="button" onClick={() => setAlign(a)} style={chip(a === align)}>
                  {a === "left" ? t("tp_left") : a === "center" ? t("tp_center") : t("tp_right")}
                </button>
              ))}
            </div>
          </div>

          <div className="card pad" style={{ marginBottom: 12 }}>
            <div className="row" style={{ alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0, color: "var(--gold)", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {musicLoading ? t("snd_loading") : music ? `♪ ${music.sound.title || t("snd_untitled")}` : t("vk_no_music")}
              </div>
              {music && <button className="btn small ghost" onClick={clear}>{t("vk_remove")}</button>}
              <button className="btn small gold" onClick={() => setPickerOpen(true)}>{music ? t("vk_change_sound") : t("vk_add_sound")}</button>
            </div>
            {musicError && <p style={{ color: "#f55", fontSize: 13, margin: "6px 0 0" }}>{musicError}</p>}
            <div className="soft" style={{ fontSize: 13, margin: "12px 0 4px" }}>{t("tp_length", seconds)}</div>
            <input type="range" min={5} max={15} step={1} value={seconds} onChange={(e) => setSeconds(Number(e.target.value))}
              aria-label={t("tp_length", seconds)} style={{ width: "100%", accentColor: "var(--gold)" }} />
          </div>

          <button className="btn block gold" onClick={render} disabled={musicLoading}>{t("vk_make_video")}</button>
        </div>
      </div>
      {pickerOpen && <SoundPicker onClose={() => setPickerOpen(false)} onPick={(s) => { setPickerOpen(false); void choose(s); }} />}
    </div>
  );
}
