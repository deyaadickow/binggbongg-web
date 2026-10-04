import { useEffect, useRef, useState } from "react";
import { mediaUrl, post } from "../lib/api";
import { Loading } from "../components/Common";

/**
 * Steve, 2026-10-04: "add a page called 'Ads You Can Print' where admin can add a flyer that
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
  | { id: number; kind: "text"; text: string; cx: number; cy: number; size: number }
  | { id: number; kind: "sticker"; url: string; cx: number; cy: number; size: number };

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
    <Page title="Ads You Can Print">
      <p className="muted" style={{ marginTop: 0 }}>
        Pick a flyer, add your own stickers and words anywhere on it, then download or print it.
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
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [isPickerOpen, setPickerOpen] = useState(false);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef<number | null>(null);

  const addText = () => {
    const text = window.prompt("Your text");
    if (!text || !text.trim()) return;
    const overlay: Overlay = { id: Date.now(), kind: "text", text: text.trim(), cx: 0.5, cy: 0.5, size: 0.05 };
    setOverlays((o) => [...o, overlay]);
    setSelected(overlay.id);
  };

  const openStickers = () => {
    post<Sticker[]>("fetchActiveStickers", {})
      .then((r) => { setStickers(r.data ?? []); setPickerOpen((r.data ?? []).length > 0); })
      .catch(() => undefined);
  };

  const addSticker = (s: Sticker) => {
    const overlay: Overlay = { id: Date.now(), kind: "sticker", url: full(s.file), cx: 0.5, cy: 0.5, size: 0.22 };
    setOverlays((o) => [...o, overlay]);
    setSelected(overlay.id);
    setPickerOpen(false);
  };

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
  const render = async (): Promise<string | null> => {
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

    for (const overlay of overlays) {
      const cx = overlay.cx * canvas.width;
      const cy = overlay.cy * canvas.height;
      if (overlay.kind === "text") {
        const px = overlay.size * canvas.height;
        ctx.font = `bold ${px}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        // A white word on white artwork would be invisible and the member can't restyle it.
        ctx.shadowColor = "rgba(0,0,0,0.9)";
        ctx.shadowBlur = px * 0.12;
        ctx.shadowOffsetY = px * 0.04;
        ctx.fillStyle = "#fff";
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
      }
    }

    return await new Promise((resolve) =>
      canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : null), "image/png")
    );
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
    <Page title="Ads You Can Print">
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
                color: "#fff", fontWeight: 700,
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
        <button className="btn" onClick={download}>Download</button>
        <button className="btn" onClick={printFlyer}>Print</button>
      </div>

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
