// The web's sound picker (Steve, 2026-11-16), for the editor, Text posts and Photo slideshows.
// The same list the phones show: fetchSoundCategories, with the server's virtual "Trending
// Sounds" (id 0, members' most-used original sounds) first. One shared preview player, which
// stops whenever the picker closes — nothing keeps playing behind the page.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { mediaUrl, post, type Sound } from "../lib/api";
import { useT } from "../lib/i18n";

interface SoundCategory { id: number; sound_category_name?: string | null; sounds?: Sound[] }

let cache: SoundCategory[] | null = null;

export function SoundPicker({ onPick, onClose }: { onPick: (s: Sound) => void; onClose: () => void }) {
  const { t } = useT();
  const [cats, setCats] = useState<SoundCategory[] | null>(cache);
  const [catId, setCatId] = useState<number | null>(cache?.[0]?.id ?? null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (cache) return;
    let alive = true;
    post<SoundCategory[]>("fetchSoundCategories", { x: 1 })
      .then((r) => {
        if (!alive) return;
        const rows = (r.data ?? []).filter((c) => (c.sounds ?? []).some((s) => s.sound));
        // Trending Sounds first (the server already puts it there; this keeps it there).
        rows.sort((a, b) => (a.id === 0 ? -1 : b.id === 0 ? 1 : 0));
        cache = rows;
        setCats(rows);
        setCatId(rows[0]?.id ?? null);
      })
      .catch(() => { if (alive) setError(t("snd_load_failed")); });
    return () => { alive = false; };
  }, [t]);

  // The preview never outlives the picker.
  useEffect(() => () => { const a = audioRef.current; if (a) { a.pause(); a.removeAttribute("src"); a.load(); } }, []);

  const list = useMemo(() => {
    if (!cats) return [];
    const q = query.trim().toLowerCase();
    const pool = q ? cats.flatMap((c) => c.sounds ?? []) : cats.find((c) => c.id === catId)?.sounds ?? [];
    const seen = new Set<number>();
    return pool.filter((s) => {
      if (!s.sound || !s.id || seen.has(s.id)) return false;
      seen.add(s.id);
      return !q || `${s.title ?? ""} ${s.singer ?? ""}`.toLowerCase().includes(q);
    });
  }, [cats, catId, query]);

  function preview(s: Sound) {
    const a = audioRef.current ?? (audioRef.current = new Audio());
    if (playing === s.id) { a.pause(); setPlaying(null); return; }
    a.src = mediaUrl(s.sound);
    a.onended = () => setPlaying(null);
    void a.play().then(() => setPlaying(s.id ?? null)).catch(() => setPlaying(null));
  }

  function stopPreview() { audioRef.current?.pause(); setPlaying(null); }

  return createPortal(
    <div onClick={() => { stopPreview(); onClose(); }} style={{ position: "fixed", inset: 0, zIndex: 66, background: "rgba(0,0,0,.82)", display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 520, height: "min(86vh, 760px)", display: "flex", flexDirection: "column", background: "#000", border: "1.5px solid var(--gold-border)", borderRadius: 16, padding: 14 }}>
        <div style={{ fontWeight: 800, fontSize: 18, color: "var(--gold)", textAlign: "center", marginBottom: 10 }}>{t("snd_pick_title")}</div>
        <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("snd_search")} style={{ width: "100%", marginBottom: 10 }} />
        {!query && cats && cats.length > 0 && (
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8, marginBottom: 6, flex: "0 0 auto" }}>
            {cats.map((c) => (
              <button key={c.id} type="button" onClick={() => setCatId(c.id)}
                style={{ flex: "0 0 auto", padding: "7px 12px", borderRadius: 999, cursor: "pointer", fontWeight: 700, fontSize: 13, whiteSpace: "nowrap",
                  border: "1.5px solid var(--gold-border)", background: c.id === catId ? "var(--gold)" : "#000", color: c.id === catId ? "#000" : "var(--gold)" }}>
                {c.id === 0 ? t("snd_trending") : c.sound_category_name ?? ""}
              </button>
            ))}
          </div>
        )}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          {error && <p className="soft" style={{ textAlign: "center" }}>{error}</p>}
          {!cats && !error && <p className="soft" style={{ textAlign: "center" }}>{t("snd_loading")}</p>}
          {cats && !list.length && <p className="soft" style={{ textAlign: "center" }}>{t("snd_none")}</p>}
          {list.map((s) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 4px", borderBottom: "1px solid #222" }}>
              <button type="button" onClick={() => preview(s)} aria-label={playing === s.id ? t("snd_stop") : t("snd_play")}
                style={{ width: 46, height: 46, flex: "0 0 46px", borderRadius: 10, border: "1.5px solid var(--gold-border)", cursor: "pointer", color: "var(--gold)", fontSize: 18,
                  background: s.image ? `#000 url(${JSON.stringify(mediaUrl(s.image))}) center / cover` : "#111" }}>
                <span style={{ background: "rgba(0,0,0,.55)", borderRadius: "50%", padding: "2px 6px" }}>{playing === s.id ? "■" : "▶"}</span>
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.title || t("snd_untitled")}</div>
                <div className="muted" style={{ fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {[s.singer, s.duration ? `${s.duration}` : ""].filter(Boolean).join(" · ")}
                </div>
              </div>
              <button type="button" className="btn small gold" onClick={() => { stopPreview(); onPick(s); }}>{t("snd_use")}</button>
            </div>
          ))}
        </div>
        <button className="btn ghost" style={{ width: "100%", marginTop: 10 }} onClick={() => { stopPreview(); onClose(); }}>{t("close")}</button>
      </div>
    </div>,
    document.body,
  );
}
