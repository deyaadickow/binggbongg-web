import { useEffect, useRef, useState } from "react";
import { mediaUrl, post } from "../lib/api";
import { useSession } from "../lib/session";
import { fetchMyBusinesses, uploadFlyerAsset, saveBusinessFlyer, type Business } from "../lib/business";
import { Loading } from "../components/Common";

/**
 * Steve, 2026-10-04: "add a page called 'Create Your Own Ads' where admin can add a flyer that
 * members can download and print. With members to be able to add stickers and text to modify their
 * flyer before they download it."
 *
 * The download is NOT a screenshot of the editor: the flyer is redrawn onto a canvas at the
 * ARTWORK's own pixel size, so what comes out prints as sharply as the file the admin uploaded.
 * Overlay positions are kept as a 0-1 fraction of the picture, so the same numbers are right in
 * the small on-screen preview and in the full-size export.
 */
interface PrintableAd { id: number; title?: string; image_path?: string }
interface Sticker { id: number; file?: string }

type Overlay =
  | { id: number; kind: "text"; text: string; cx: number; cy: number; size: number; colour: string; font: string }
  // A sticker, a photo the member picked, or a video's opening frame — a printed page can't
  // play a video, so that's what a video contributes. The file itself is kept when there is one:
  // on a business page the clip stays a clip and a visitor can click it (Steve, 2026-10-05).
  | { id: number; kind: "image"; url: string; cx: number; cy: number; size: number; video?: File };

/** Steve, 2026-10-04: "make the text editable like color and different font etc." */
const COLOURS = ["#ffffff", "#000000", "#D4AF37", "#FF1744", "#2979FF", "#00C853", "#FF6D00", "#AA00FF"];
const FONTS = [
  { label: "Bingg Bongg", css: "system-ui, sans-serif" },
  { label: "Serif", css: "Georgia, serif" },
  { label: "Typewriter", css: "'Courier New', monospace" },
  { label: "Handwriting", css: "'Brush Script MT', cursive" },
  { label: "Condensed", css: "'Arial Narrow', sans-serif" },
];

const full = (path?: string) => mediaUrl(path);

/** Same simple page frame the other settings pages use. */
function Page({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <h1 className="page-title">{title}</h1>
      {children}
    </div>
  );
}

export function PrintableAdsPage() {
  const [flyers, setFlyers] = useState<PrintableAd[] | null>(null);
  const [chosen, setChosen] = useState<PrintableAd | null>(null);

  useEffect(() => {
    post<PrintableAd[]>("fetchPrintableAds", {})
      .then((r) => setFlyers(r.data ?? []))
      .catch(() => setFlyers([]));
  }, []);

  if (chosen) return <FlyerEditor flyer={chosen} onBack={() => setChosen(null)} />;

  return (
    <Page title="Create Your Own Ads">
      <p className="muted" style={{ marginTop: 0 }}>
        Pick a flyer, then add your own words, stickers and photos anywhere on it and download or print it.
      </p>
      {flyers === null ? (
        <Loading />
      ) : flyers.length === 0 ? (
        <p className="muted">No flyers yet. Check back soon.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 14 }}>
          {flyers.map((f) => (
            <button key={f.id} className="card" onClick={() => setChosen(f)}
              style={{ padding: 8, cursor: "pointer", textAlign: "left", background: "none" }}>
              <img src={full(f.image_path)} alt={f.title ?? "Flyer"}
                style={{ width: "100%", borderRadius: 6, display: "block" }} />
              {f.title && <b style={{ display: "block", marginTop: 6 }}>{f.title}</b>}
              <span className="muted" style={{ fontSize: 12 }}>Click to add stickers and text</span>
            </button>
          ))}
        </div>
      )}
    </Page>
  );
}

function FlyerEditor({ flyer, onBack }: { flyer: PrintableAd; onBack: () => void }) {
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [publishing, setPublishing] = useState<string | null>(null);
  const { user } = useSession();
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [isPickerOpen, setPickerOpen] = useState(false);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef<number | null>(null);

  const addText = () => {
    const text = window.prompt("Your text");
    if (!text || !text.trim()) return;
    const overlay: Overlay = { id: Date.now(), kind: "text", text: text.trim(), cx: 0.5, cy: 0.5, size: 0.05, colour: "#ffffff", font: FONTS[0].css };
    setOverlays((o) => [...o, overlay]);
    setSelected(overlay.id);
  };

  const openStickers = () => {
    post<Sticker[]>("fetchActiveStickers", {})
      .then((r) => { setStickers(r.data ?? []); setPickerOpen((r.data ?? []).length > 0); })
      .catch(() => undefined);
  };

  const addSticker = (s: Sticker) => {
    const overlay: Overlay = { id: Date.now(), kind: "image", url: full(s.file), cx: 0.5, cy: 0.5, size: 0.22 };
    setOverlays((o) => [...o, overlay]);
    setSelected(overlay.id);
    setPickerOpen(false);
  };

  /** Steve: "the ability to upload images and videos to add to the flyer". */
  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (file.type.startsWith("video")) {
      // A printed page can't play a video, so its opening frame goes on instead.
      const url = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.src = url;
      video.muted = true;
      await new Promise((r) => { video.onloadeddata = r; video.currentTime = 0.1; });
      const c = document.createElement("canvas");
      c.width = video.videoWidth; c.height = video.videoHeight;
      c.getContext("2d")?.drawImage(video, 0, 0);
      URL.revokeObjectURL(url);
      // One video per flyer (Steve, 2026-10-05). A new one replaces the old rather than being
      // refused — replacing is what a member means by picking again.
      setOverlays((o) => [
        ...o.filter((x) => !(x.kind === "image" && x.video)),
        { id: Date.now(), kind: "image", url: c.toDataURL("image/png"), cx: 0.5, cy: 0.5, size: 0.4, video: file },
      ]);
      window.alert("A printed page can't play a video, so its opening picture went on the flyer. Put the flyer on your business page and visitors can click it to watch.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () =>
      setOverlays((o) => [...o, { id: Date.now(), kind: "image", url: String(reader.result), cx: 0.5, cy: 0.5, size: 0.4 }]);
    reader.readAsDataURL(file);
  };

  const restyle = (patch: Partial<Extract<Overlay, { kind: "text" }>>) =>
    setOverlays((o) => o.map((x) => (x.id === selected && x.kind === "text" ? { ...x, ...patch } : x)));

  const resize = (factor: number) =>
    setOverlays((o) => o.map((x) => (x.id === selected ? { ...x, size: Math.min(Math.max(x.size * factor, 0.02), 0.8) } : x)));

  const removeSelected = () => { setOverlays((o) => o.filter((x) => x.id !== selected)); setSelected(null); };

  // Pointer events rather than mouse: the same handler then works on a tablet.
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragging.current === null || !frameRef.current) return;
    const box = frameRef.current.getBoundingClientRect();
    // Clamped inside the picture — anything dragged outside would be cropped away on export.
    const cx = Math.min(Math.max((e.clientX - box.left) / box.width, 0.02), 0.98);
    const cy = Math.min(Math.max((e.clientY - box.top) / box.height, 0.02), 0.98);
    setOverlays((o) => o.map((x) => (x.id === dragging.current ? { ...x, cx, cy } : x)));
  };

  /** Flattens the flyer at the artwork's own pixel size and hands back a PNG blob URL. */
  const renderBlob = async (): Promise<Blob | null> => (await renderPage())?.blob ?? null;

  /** The page, plus where each clip ended up on it as fractions of the page. */
  const renderPage = async (): Promise<{ blob: Blob; boxes: Record<number, { x: number; y: number; w: number; h: number }> } | null> => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = full(flyer.image_path);
    try { await image.decode(); } catch { return null; }

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0);

    const boxes: Record<number, { x: number; y: number; w: number; h: number }> = {};

    for (const overlay of overlays) {
      const cx = overlay.cx * canvas.width;
      const cy = overlay.cy * canvas.height;
      if (overlay.kind === "text") {
        const px = overlay.size * canvas.height;
        ctx.font = `bold ${px}px ${overlay.font}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        // A white word on white artwork would be invisible and the member can't restyle it.
        ctx.shadowColor = "rgba(0,0,0,0.9)";
        ctx.shadowBlur = px * 0.12;
        ctx.shadowOffsetY = px * 0.04;
        ctx.fillStyle = overlay.colour;
        ctx.fillText(overlay.text, cx, cy);
        ctx.shadowColor = "transparent";
      } else {
        const sticker = new Image();
        sticker.crossOrigin = "anonymous";
        sticker.src = overlay.url;
        try { await sticker.decode(); } catch { continue; }
        const w = overlay.size * canvas.width;
        const h = w * (sticker.naturalHeight / Math.max(sticker.naturalWidth, 1));
        ctx.drawImage(sticker, cx - w / 2, cy - h / 2, w, h);
        // Steve, 2026-10-05: "add a gold border to each uploaded video" — the flyer's own
        // border, one point of stroke and ten of corner, scaled to the page.
        // Steve, 2026-10-05: "add the same border to all images as well." A photo or a video
        // the member added gets the gold box; a sticker is a cut-out, so it doesn't.
        const framed = overlay.url.startsWith("data:");
        if (overlay.video) {
          boxes[overlay.id] = {
            x: (cx - w / 2) / canvas.width,
            y: (cy - h / 2) / canvas.height,
            w: w / canvas.width,
            h: h / canvas.height,
          };
        }
        if (framed) {
          ctx.strokeStyle = "#D4AF37";
          ctx.lineWidth = Math.max(canvas.width * 0.011, 5);
          const r = canvas.width * 0.026;
          const x = cx - w / 2, y = cy - h / 2;
          ctx.beginPath();
          ctx.moveTo(x + r, y);
          ctx.arcTo(x + w, y, x + w, y + h, r);
          ctx.arcTo(x + w, y + h, x, y + h, r);
          ctx.arcTo(x, y + h, x, y, r);
          ctx.arcTo(x, y, x + w, y, r);
          ctx.closePath();
          ctx.stroke();
        }
      }
    }

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png")
    );
    return blob ? { blob, boxes } : null;
  };

  /** The same page as an object URL, for Download and Print. */
  const render = async (): Promise<string | null> => {
    const blob = await renderBlob();
    return blob ? URL.createObjectURL(blob) : null;
  };

  /**
   * Steve, 2026-10-05: "I like the videos in still mode and when i click on each video, it goes
   * to full screen" — which a downloaded file can never do, because a saved file is one flat
   * picture. On a business page the flyer keeps its clips as separate things.
   */
  const publish = async () => {
    const clips = overlays.filter((o): o is Extract<Overlay, { kind: "image" }> => o.kind === "image" && !!o.video);
    if (clips.length === 0) {
      window.alert("Add a video to the flyer first.");
      return;
    }
    if (!user?.id) return;

    let pages: Business[] = [];
    try {
      pages = (await fetchMyBusinesses(user.id)).data;
    } catch {
      window.alert("Couldn't load your business pages.");
      return;
    }
    if (pages.length === 0) {
      window.alert("You don't have a business page yet. Create one from Bingg Bongg Business.");
      return;
    }

    const choice = pages.length === 1
      ? pages[0]
      : pages.find((p) => p.name === window.prompt("Put this flyer on which page?\n\n" + pages.map((p) => p.name).join("\n"), pages[0].name ?? ""));
    if (!choice) return;

    const rendered = await renderPage();
    if (!rendered) { window.alert("Couldn't read the flyer."); return; }

    setPublishing("Uploading the flyer…");
    try {
      const imagePath = await uploadFlyerAsset(user.id, choice.id, "image", rendered.blob, "flyer.png");
      const uploaded = [];
      for (let i = 0; i < clips.length; i++) {
        const clip = clips[i];
        setPublishing(`Uploading video ${i + 1} of ${clips.length}…`);
        const videoPath = await uploadFlyerAsset(user.id, choice.id, "video", clip.video!, clip.video!.name || "clip.mp4");
        // Fractions of the page, measured while the page was drawn, so a phone, a tablet and
        // the website all put the clickable area in the same place.
        const box = rendered.boxes[clip.id];
        if (box) uploaded.push({ video_path: videoPath, ...box });
      }
      setPublishing("Almost there…");
      const message = await saveBusinessFlyer(user.id, choice.id, imagePath, uploaded);
      window.alert(message);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Couldn't put it on your page.");
    } finally {
      setPublishing(null);
    }
  };

  const download = async () => {
    const url = await render();
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `BinggBongg_flyer_${Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printFlyer = async () => {
    const url = await render();
    if (!url) return;
    // A window with just the image, printed at page width — the browser's own print dialog also
    // offers Save as PDF, so somebody with no printer still gets a file.
    const w = window.open("");
    if (!w) return;
    w.document.write(
      `<style>@page{margin:10mm}body{margin:0}img{width:100%}</style><img src="${url}" onload="window.print();window.close()" />`
    );
  };

  return (
    <Page title="Create Your Own Ads">
      <button className="btn" onClick={onBack} style={{ marginBottom: 12 }}>← Back to flyers</button>

      <div
        ref={frameRef}
        onPointerMove={onPointerMove}
        onPointerUp={() => (dragging.current = null)}
        onPointerLeave={() => (dragging.current = null)}
        style={{ position: "relative", maxWidth: 420, margin: "0 auto", touchAction: "none", userSelect: "none" }}
      >
        <img src={full(flyer.image_path)} alt={flyer.title ?? "Flyer"}
          style={{ width: "100%", display: "block", borderRadius: 6 }}
          onClick={() => setSelected(null)} />

        {overlays.map((o) => (
          <div
            key={o.id}
            onPointerDown={(e) => { e.preventDefault(); dragging.current = o.id; setSelected(o.id); }}
            style={{
              position: "absolute",
              left: `${o.cx * 100}%`,
              top: `${o.cy * 100}%`,
              transform: "translate(-50%,-50%)",
              cursor: "move",
              opacity: selected === o.id ? 0.85 : 1,
              whiteSpace: "nowrap",
            }}
          >
            {o.kind === "text" ? (
              <span style={{
                color: o.colour, fontWeight: 700, fontFamily: o.font,
                fontSize: `calc(${o.size} * ${frameRef.current?.clientHeight ?? 500}px)`,
                textShadow: "0 1px 3px #000",
              }}>{o.text}</span>
            ) : (
              <img src={o.url} alt="" style={{ width: `${o.size * (frameRef.current?.clientWidth ?? 400)}px` }} />
            )}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginTop: 14 }}>
        {selected !== null && (
          <>
            <button className="btn" onClick={() => resize(1 / 1.15)}>Smaller</button>
            <button className="btn" onClick={() => resize(1.15)}>Bigger</button>
            <button className="btn" onClick={removeSelected}>Delete</button>
          </>
        )}
        <button className="btn" onClick={addText}>Add Text</button>
        <button className="btn" onClick={openStickers}>Add Sticker</button>
        <label className="btn" style={{ cursor: "pointer" }}>
          Add Photo / Video
          <input type="file" accept="image/*,video/*" onChange={onPickFile} style={{ display: "none" }} />
        </label>
        <button className="btn" onClick={download}>Download</button>
        <button className="btn" onClick={publish} disabled={!!publishing}>
          {publishing ?? "Put on My Business Page"}
        </button>
        <button className="btn" onClick={printFlyer}>Print</button>
      </div>

      {(() => {
        const current = overlays.find((o) => o.id === selected);
        if (!current || current.kind !== "text") return null;
        return (
          <div className="card" style={{ marginTop: 12, padding: 12 }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Colour</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {COLOURS.map((c) => (
                <button key={c} onClick={() => restyle({ colour: c })} aria-label={c}
                  style={{ width: 26, height: 26, borderRadius: "50%", background: c, border: "1px solid #888", cursor: "pointer" }} />
              ))}
            </div>
            <div className="muted" style={{ fontSize: 12, margin: "10px 0 6px" }}>Font</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {FONTS.map((f) => (
                <button key={f.label} className="btn" style={{ fontFamily: f.css }}
                  onClick={() => restyle({ font: f.css })}>{f.label}</button>
              ))}
            </div>
          </div>
        );
      })()}

      {isPickerOpen && (
        <div className="card" style={{ marginTop: 14, padding: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(70px,1fr))", gap: 10 }}>
            {stickers.map((s) => (
              <img key={s.id} src={full(s.file)} alt="" onClick={() => addSticker(s)}
                style={{ width: "100%", cursor: "pointer" }} />
            ))}
          </div>
        </div>
      )}
    </Page>
  );
}
