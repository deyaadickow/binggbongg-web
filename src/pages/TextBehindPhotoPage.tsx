// Text Behind Photo (Steve, 2026-11-02: "Yes, build both on all three platforms"). Pick a photo,
// the person is cut out right here in the browser (the same MediaPipe selfie segmenter Green Screen
// uses), type up to 20 letters, pick a style, drag/pinch/slide it into place and save. The words
// go BEHIND the person: photo, then text, then the cut-out person on top, then a small "Made on
// Bingg Bongg" mark (+ "@username", on by default). Nothing is sent anywhere until the member
// saves it to their Bingg Bongg Photos, which goes through the normal photo upload and moderation.
//
// Money: the 4 free styles are free; a premium style is charged once per FINISHED picture, when it
// is saved or shared (re-saving the same picture is free; change anything and it's a new picture).
// Trying styles is always free. Prices come from the server; the coins go to Bingg Bongg.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { ImageSegmenter } from "@mediapipe/tasks-vision";
import { currentAuthHeaders } from "../lib/api";
import { useSession } from "../lib/session";
import { tt, useT } from "../lib/i18n";
import { Notice } from "../components/Common";
import { PageTitle } from "../components/PageTitle";
import { loadImageSegmenter } from "../lib/segmenter";
import { createFolder, fetchMyFolders, isFavouritesFolder, uploadPhoto } from "../lib/photos";
import {
  DEFAULT_STYLES, FREE_COLORS, chargeTextPhotoStyle, newClientRef, cutOutPerson, defaultColorFor, drawStyleSample, fetchTextPhotoStyles,
  fitSize, loadTextBehindFonts, photoCanvasFromFile, renderComposite, type TextLayout, type TextPhotoStyle,
} from "../lib/textBehind";
import { requireVerified } from "../lib/verifyEmail";

/** The folder the pictures land in on Bingg Bongg Photos — made the first time if it isn't there. */
const PHOTOS_FOLDER = "Text Behind Photo";
const MAX_LETTERS = 20;
/** Long side of the on-screen preview (the saved picture is full size, up to 2048). */
const PREVIEW_SIDE = 1080;

type Phase = "empty" | "cutting" | "ready";

/** Keep at most 2 lines and 20 letters (the line break isn't a letter). */
function clampText(v: string): string {
  const lines = v.replace(/\r/g, "").split("\n").slice(0, 2);
  let left = MAX_LETTERS;
  return lines.map((l) => { const part = Array.from(l).slice(0, Math.max(0, left)).join(""); left -= Array.from(part).length; return part; }).join("\n");
}

function StyleTile({ style, color, chosen, fontsOk, onPick }: { style: TextPhotoStyle; color: string; chosen: boolean; fontsOk: boolean; onPick: () => void }) {
  const { t } = useT();
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (ref.current) drawStyleSample(ref.current, style, style.is_premium ? "#FFFFFF" : color); }, [style, color, fontsOk]);
  return (
    <button type="button" onClick={onPick} aria-pressed={chosen}
            style={{ padding: 4, borderRadius: 12, cursor: "pointer", background: chosen ? "rgba(212,175,55,0.16)" : "transparent",
                     border: `2px solid ${chosen ? "var(--gold)" : "var(--gold-border)"}`, boxShadow: chosen ? "0 0 0 2px var(--gold)" : "none",
                     color: "var(--gold)", font: "inherit", display: "flex", flexDirection: "column", alignItems: "stretch", gap: 3, minWidth: 0 }}>
      <canvas ref={ref} width={192} height={72} aria-label={style.name} style={{ width: "100%", height: "auto", borderRadius: 8, display: "block" }} />
      <span style={{ fontSize: 11, fontWeight: 700, textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {style.is_premium && style.coins > 0 ? `🪙 ${t("n_coins", style.coins)}` : t("tbp_free")}
      </span>
    </button>
  );
}

export function TextBehindPhotoPage() {
  const { t, tn } = useT();
  const { user, isLoggedIn, refresh } = useSession();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const photoRef = useRef<HTMLCanvasElement | null>(null);
  const personRef = useRef<HTMLCanvasElement | null>(null);
  const segRef = useRef<Promise<ImageSegmenter> | null>(null);

  const [styles, setStyles] = useState<TextPhotoStyle[]>(DEFAULT_STYLES);
  const [styleKey, setStyleKey] = useState("bold");
  const [fontsOk, setFontsOk] = useState(false);
  const [phase, setPhase] = useState<Phase>("empty");
  const [photoId, setPhotoId] = useState(0);
  const [noPerson, setNoPerson] = useState(false);
  const [cutoutFailed, setCutoutFailed] = useState(false);
  const [text, setText] = useState(() => tt("tbp_default_text"));
  const [layout, setLayout] = useState<Omit<TextLayout, "text">>({ cx: 0.5, cy: 0.36, size: 0.25, tilt: 0, color: "#FFFFFF" });
  const [autoFit, setAutoFit] = useState(true);
  const [showUsername, setShowUsername] = useState(true);
  const [busy, setBusy] = useState<null | "save" | "photos" | "share">(null);
  const [error, setError] = useState("");
  const [needCoins, setNeedCoins] = useState(false);
  const [savedTo, setSavedTo] = useState<string | null>(null);
  // The picture that has already been paid for (or logged, for a free style): saving or sharing
  // the SAME picture again costs nothing.
  const [paidSig, setPaidSig] = useState<string | null>(null);

  useEffect(() => { loadTextBehindFonts().then(() => setFontsOk(true)); }, []);
  const loadStyles = useCallback(() => {
    fetchTextPhotoStyles(user?.id ?? 0).then((list) => { if (list && list.length) setStyles(list); });
  }, [user?.id]);
  useEffect(loadStyles, [loadStyles]);

  const style = useMemo(() => styles.find((s) => s.key === styleKey) ?? styles[0] ?? DEFAULT_STYLES[0], [styles, styleKey]);
  // A style the server dropped falls back to the first one it sends.
  useEffect(() => { if (!styles.some((s) => s.key === styleKey) && styles[0]) setStyleKey(styles[0].key); }, [styles, styleKey]);

  const username = user?.username ? String(user.username).replace(/^@/, "") : null;
  const fullLayout: TextLayout = useMemo(() => ({ ...layout, text }), [layout, text]);
  const sig = JSON.stringify([photoId, style.key, fullLayout, showUsername ? username : null]);
  const alreadyPaid = paidSig === sig;
  // The server's id for THIS finished picture: a new one whenever anything about the picture changes.
  const clientRef = useMemo(() => newClientRef(), [sig]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the text fitted to the picture's width until the member sizes it by hand.
  useEffect(() => {
    if (!autoFit || !fontsOk) return;
    const c = document.createElement("canvas").getContext("2d");
    if (!c) return;
    const size = fitSize(c, text, style.font, 1000);
    setLayout((l) => (Math.abs(l.size - size) < 0.002 ? l : { ...l, size }));
  }, [autoFit, text, style.font, fontsOk]);

  // ---- The preview ----
  const draw = useCallback(() => {
    const out = previewRef.current, photo = photoRef.current;
    if (!out || !photo) return;
    renderComposite(out, { photo, person: personRef.current, style, layout: fullLayout, watermark: { username: showUsername ? username : null } });
  }, [style, fullLayout, showUsername, username]);
  useEffect(() => {
    const id = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(id);
  }, [draw, phase, fontsOk, photoId]);

  // ---- Picking a photo ----
  async function choose(file: File | undefined) {
    if (!file) return;
    setError(""); setNeedCoins(false); setSavedTo(null); setNoPerson(false); setCutoutFailed(false);
    let photo: HTMLCanvasElement;
    try { photo = await photoCanvasFromFile(file); } catch { setError(tt("tbp_bad_photo")); return; }
    photoRef.current = photo;
    personRef.current = null;
    const k = Math.min(1, PREVIEW_SIDE / Math.max(photo.width, photo.height));
    if (previewRef.current) { previewRef.current.width = Math.round(photo.width * k); previewRef.current.height = Math.round(photo.height * k); }
    setPhotoId((n) => n + 1);
    setPhase("cutting");
    try {
      if (!segRef.current) segRef.current = loadImageSegmenter();
      const seg = await segRef.current;
      // Let the "Finding the person…" line paint before the (synchronous) cut-out runs.
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
      const person = cutOutPerson(seg as unknown as Parameters<typeof cutOutPerson>[0], photo);
      if (photoRef.current !== photo) return; // another photo was picked meanwhile
      personRef.current = person;
      setNoPerson(!person);
    } catch {
      segRef.current = null;
      setCutoutFailed(true);
    }
    setPhase("ready");
  }

  // ---- Drag to move, pinch to size ----
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ startCx: number; startCy: number; px: number; py: number; dist: number; size: number } | null>(null);
  function rel(e: React.PointerEvent) {
    const r = previewRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, w: r.width };
  }
  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (phase === "empty") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = rel(e);
    pointers.current.set(e.pointerId, { x: p.x, y: p.y });
    const pts = [...pointers.current.values()];
    const dist = pts.length >= 2 ? Math.hypot((pts[0].x - pts[1].x) * p.w, (pts[0].y - pts[1].y) * p.w) : 0;
    gesture.current = { startCx: layout.cx, startCy: layout.cy, px: p.x, py: p.y, dist, size: layout.size };
  }
  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const g = gesture.current;
    if (!g || !pointers.current.has(e.pointerId)) return;
    const p = rel(e);
    pointers.current.set(e.pointerId, { x: p.x, y: p.y });
    const pts = [...pointers.current.values()];
    if (pts.length >= 2 && g.dist > 0) {
      const d = Math.hypot((pts[0].x - pts[1].x) * p.w, (pts[0].y - pts[1].y) * p.w);
      setAutoFit(false);
      setLayout((l) => ({ ...l, size: Math.min(0.6, Math.max(0.05, g.size * (d / g.dist))) }));
    } else if (pts.length === 1) {
      setLayout((l) => ({ ...l, cx: Math.min(1, Math.max(0, g.startCx + (p.x - g.px))), cy: Math.min(1, Math.max(0, g.startCy + (p.y - g.py))) }));
    }
  }
  function onUp(e: React.PointerEvent<HTMLCanvasElement>) {
    pointers.current.delete(e.pointerId);
    // The finger left on the picture carries on dragging from where it is now.
    const rest = [...pointers.current.values()][0];
    gesture.current = rest ? { startCx: layout.cx, startCy: layout.cy, px: rest.x, py: rest.y, dist: 0, size: layout.size } : null;
  }

  // ---- Paying (premium styles) and making the file ----
  async function ensurePaid(): Promise<boolean> {
    if (!user) return false;
    if (paidSig === sig) return true;
    if (!style.is_premium || style.coins <= 0) {
      // Free: logged with the server (0 coins), but never in the member's way.
      void chargeTextPhotoStyle(user.id, style.key, clientRef).catch(() => null);
      setPaidSig(sig);
      return true;
    }
    if (!window.confirm(tt("tbp_confirm_cost", style.name, style.coins))) return false;
    try {
      const r = await chargeTextPhotoStyle(user.id, style.key, clientRef);
      if (!r.ok) {
        if (r.notEnoughCoins) setNeedCoins(true);
        else if (r.styleUnavailable) { setError(tt("tbp_style_unavailable")); loadStyles(); }
        else setError(r.message || tt("tbp_couldnt_charge"));
        return false;
      }
      setPaidSig(sig);
      refresh();
      return true;
    } catch (e) {
      setError((e as Error).message || tt("tbp_couldnt_charge"));
      return false;
    }
  }

  function makeJpeg(): Promise<Blob> {
    const photo = photoRef.current!;
    const out = document.createElement("canvas");
    out.width = photo.width; out.height = photo.height;
    renderComposite(out, { photo, person: personRef.current, style, layout: fullLayout, watermark: { username: showUsername ? username : null } });
    return new Promise((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error(tt("tbp_couldnt_make")))), "image/jpeg", 0.92));
  }
  const fileName = () => `bingg-bongg-text-behind-${Date.now()}.jpg`;

  async function act(kind: "save" | "photos" | "share") {
    if (!user || !photoRef.current || busy || phase !== "ready" || !text.trim()) return;
    if (kind === "photos" && !requireVerified()) return; // an upload (2026-11-05)
    setError(""); setNeedCoins(false); setSavedTo(null);
    setBusy(kind);
    try {
      if (!(await ensurePaid())) return;
      const blob = await makeJpeg();
      const file = new File([blob], fileName(), { type: "image/jpeg" });
      if (kind === "photos") {
        let folders = await fetchMyFolders(user.id);
        let folder = folders.find((f) => !isFavouritesFolder(f) && (f.name ?? "").trim().toLowerCase() === PHOTOS_FOLDER.toLowerCase());
        if (!folder) {
          await createFolder(user.id, PHOTOS_FOLDER).catch(() => undefined);
          folders = await fetchMyFolders(user.id);
          folder = folders.find((f) => !isFavouritesFolder(f) && (f.name ?? "").trim().toLowerCase() === PHOTOS_FOLDER.toLowerCase())
            ?? folders.find((f) => !isFavouritesFolder(f));
        }
        if (!folder) throw new Error(tt("tbp_no_folder"));
        await uploadPhoto(user.id, folder.id, file, currentAuthHeaders());
        setSavedTo(folder.name ?? PHOTOS_FOLDER);
        return;
      }
      if (kind === "share" && navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: "Bingg Bongg" }); } catch { /* the member closed the share sheet */ }
        return;
      }
      // Save (or Share where the browser can't share a file): a download.
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = file.name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {
      setError((e as Error).message || tt("tbp_couldnt_make"));
    } finally {
      setBusy(null);
    }
  }

  if (!isLoggedIn) {
    return (
      <div className="page">
        <PageTitle>{t("tbp_title")}</PageTitle>
        <Notice>{tn("tbp_sign_in", <Link to="/login">{t("sign_in_2")}</Link>)}</Notice>
      </div>
    );
  }

  const ready = phase === "ready";
  const free = !style.is_premium || style.coins <= 0;
  const canAct = ready && !!text.trim() && !busy;
  const lines = text.split("\n");
  const letters = Array.from(text.replace(/\n/g, "")).length;

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <PageTitle>{t("tbp_title")}</PageTitle>
      <p className="soft" style={{ marginTop: 0 }}>{t("tbp_intro")}</p>

      {/* The picture. Dragging on it moves the words; two fingers size them. */}
      <div style={{ background: "#000", border: "1.5px solid var(--gold-border)", borderRadius: "var(--radius)", display: "flex", alignItems: "center", justifyContent: "center",
                    minHeight: phase === "empty" ? 240 : 0, overflow: "hidden", position: "relative" }}>
        <canvas ref={previewRef} width={720} height={960}
                onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
                style={{ display: phase === "empty" ? "none" : "block", width: "100%", height: "auto", maxHeight: "70vh", objectFit: "contain", touchAction: "none", cursor: "grab" }} />
        {phase === "empty" && <span className="muted" style={{ padding: 20, textAlign: "center" }}>🖼️ {t("tbp_no_photo")}</span>}
        {phase === "cutting" && (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(0,0,0,.45)" }}>
            <span style={{ background: "rgba(0,0,0,.8)", border: "1px solid var(--gold-border)", color: "var(--gold)", fontWeight: 700, padding: "8px 14px", borderRadius: 999 }}>{t("tbp_cutting")}</span>
          </div>
        )}
      </div>
      {ready && noPerson && <div style={{ marginTop: 10 }}><Notice>{t("tbp_no_person")}</Notice></div>}
      {ready && cutoutFailed && <div style={{ marginTop: 10 }}><Notice>{t("tbp_cutout_unavailable")}</Notice></div>}
      {ready && <div className="muted" style={{ fontSize: 12.5, marginTop: 6, textAlign: "center" }}>{t("tbp_drag_hint")}</div>}

      <input ref={cameraRef} type="file" accept="image/*" capture="user" hidden onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={galleryRef} type="file" accept="image/*" hidden onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ""; }} />
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <button className="btn" style={{ flex: 1 }} onClick={() => cameraRef.current?.click()} disabled={phase === "cutting" || !!busy}>{t("take_a_selfie")}</button>
        <button className="btn" style={{ flex: 1 }} onClick={() => galleryRef.current?.click()} disabled={phase === "cutting" || !!busy}>{t("choose_a_photo")}</button>
      </div>

      {/* The words */}
      <label style={{ display: "block", marginTop: 16 }}>
        <div className="row" style={{ alignItems: "baseline" }}>
          <b style={{ color: "var(--gold)", flex: 1 }}>{t("tbp_your_text")}</b>
          <span className="muted" style={{ fontSize: 12 }}>{letters}/{MAX_LETTERS}</span>
        </div>
        <textarea className="input" rows={lines.length > 1 ? 2 : 1} value={text} placeholder={t("tbp_default_text")}
                  onChange={(e) => setText(clampText(e.target.value))}
                  style={{ width: "100%", marginTop: 6, resize: "none", fontSize: 18, fontWeight: 700, boxSizing: "border-box" }} />
        <span className="muted" style={{ fontSize: 12 }}>{t("tbp_text_hint")}</span>
      </label>

      {/* The styles: each tile is the style's own name drawn in that style. */}
      <div style={{ marginTop: 14 }}>
        <b style={{ color: "var(--gold)" }}>{t("tbp_style")}</b>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 8, marginTop: 6 }}>
          {styles.map((s) => (
            <StyleTile key={s.key} style={s} color={s.key === style.key ? layout.color : defaultColorFor(s.key)} chosen={s.key === style.key} fontsOk={fontsOk}
                       onPick={() => { setStyleKey(s.key); if (!s.is_premium || s.coins <= 0) setLayout((l) => ({ ...l, color: defaultColorFor(s.key) })); }} />
          ))}
        </div>
      </div>

      {free && (
        <div style={{ marginTop: 14 }}>
          <b style={{ color: "var(--gold)" }}>{t("tbp_color")}</b>
          <div style={{ display: "flex", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
            {FREE_COLORS.map((c) => (
              <button key={c} type="button" aria-label={c} aria-pressed={layout.color === c} onClick={() => setLayout((l) => ({ ...l, color: c }))}
                      style={{ width: 36, height: 36, borderRadius: "50%", background: c, cursor: "pointer",
                               border: layout.color === c ? "3px solid var(--gold)" : "2px solid rgba(255,255,255,.35)", boxShadow: layout.color === c ? "0 0 0 2px #000 inset" : "none" }} />
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 12px", alignItems: "center", marginTop: 14 }}>
        <b style={{ color: "var(--gold)" }}>{t("tbp_size")}</b>
        <input type="range" min={0.05} max={0.6} step={0.005} value={layout.size} aria-label={t("tbp_size")} style={{ accentColor: "#F0C420" }}
               onChange={(e) => { setAutoFit(false); setLayout((l) => ({ ...l, size: Number(e.target.value) })); }} />
        <b style={{ color: "var(--gold)" }}>{t("tbp_tilt")}</b>
        <input type="range" min={-15} max={15} step={1} value={layout.tilt} aria-label={t("tbp_tilt")} style={{ accentColor: "#F0C420" }}
               onChange={(e) => setLayout((l) => ({ ...l, tilt: Number(e.target.value) }))} />
      </div>
      <button className="btn small ghost" style={{ marginTop: 8 }} onClick={() => { setAutoFit(true); setLayout((l) => ({ ...l, cx: 0.5, cy: 0.36, tilt: 0 })); }}>{t("tbp_reset")}</button>

      <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 14, cursor: "pointer" }}>
        <input type="checkbox" checked={showUsername} onChange={(e) => setShowUsername(e.target.checked)} />
        <span>{t("tbp_show_username", username ? `@${username}` : "@username")}</span>
      </label>

      {/* What it costs, said before any button is pressed. */}
      <div className="muted" style={{ fontSize: 13, marginTop: 12 }}>
        {free ? t("tbp_free_note", style.name) : alreadyPaid ? `✓ ${t("tbp_paid_already")}` : t("tbp_premium_note", style.name, style.coins)}
      </div>

      <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
        <button className="btn primary" disabled={!canAct} onClick={() => void act("save")}>{busy === "save" ? t("tbp_saving") : `⬇️ ${t("tbp_save_picture")}`}</button>
        <button className="btn" disabled={!canAct} onClick={() => void act("photos")}>{busy === "photos" ? t("tbp_saving") : `🖼️ ${t("tbp_save_to_photos")}`}</button>
        <button className="btn" disabled={!canAct} onClick={() => void act("share")}>{busy === "share" ? t("tbp_saving") : `📤 ${t("tbp_share")}`}</button>
      </div>

      {needCoins && (
        <div style={{ marginTop: 12 }}><Notice error>{t("tbp_not_enough_coins")} <Link to="/wallet">{t("buy_coins")}</Link></Notice></div>
      )}
      {error && <div style={{ marginTop: 12 }}><Notice error>{error}</Notice></div>}
      {savedTo && (
        <div style={{ marginTop: 12, color: "var(--gold)", fontWeight: 700, textAlign: "center" }}>
          {tn("saved_to_your_photos_folder", <Link to="/photos">{t("photos")}</Link>, savedTo)}
        </div>
      )}
    </div>
  );
}
