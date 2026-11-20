/**
 * Profile video folders (Steve, 2026-11-20). The gold chip row above a profile's Videos grid —
 * "All videos", then every folder with its count — plus the owner's "+ New folder" and each
 * folder's ⋮ (rename / delete). Also the imperative folder picker used by Upload and by the
 * video hold menu's "Move to folder" (pickFolder), and the name dialog (askFolderName).
 */
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { tt, useT } from "../lib/i18n";
import { mediaUrl } from "../lib/api";
import { Link } from "react-router-dom";
import { showGoldAlert, showGoldConfirm } from "./GoldToast";
import {
  FOLDER_NAME_MAX, FOLDERS_CHANGED, announceFoldersChanged, createPostFolder, deletePostFolder,
  fetchFolderVideos, fetchPostFolders, renamePostFolder, setFolderOrder, setFolderSeries,
  type FolderVideo, type PostFolder, type SeriesInfo,
} from "../lib/folders";

const chip = (active: boolean): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 999,
  border: "1.5px solid var(--gold-border)", background: active ? "var(--gold-border)" : "#000",
  color: active ? "#000" : "var(--gold)", fontWeight: 700, fontSize: 14, cursor: "pointer", whiteSpace: "nowrap",
});

function mount(render: (close: () => void) => React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const close = () => { root.unmount(); host.remove(); };
  root.render(<>{render(close)}</>);
}

const overlay: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,.55)",
  display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
};
const card: React.CSSProperties = {
  maxWidth: 420, width: "100%", background: "#000", borderColor: "var(--gold-border)", color: "var(--gold)",
};
const goldBtn: React.CSSProperties = { background: "var(--gold-border)", color: "#000", borderColor: "var(--gold-border)", minWidth: 120 };

/** Gold name dialog; resolves the typed name or null. `save` returns an error message or null. */
export function askFolderName(opts: { title: string; initial?: string; okLabel: string; save: (name: string) => Promise<string | null> }): Promise<boolean> {
  return new Promise((resolve) => {
    mount((close) => {
      function Dialog() {
        const [name, setName] = useState(opts.initial ?? "");
        const [busy, setBusy] = useState(false);
        const [err, setErr] = useState<string | null>(null);
        const done = (ok: boolean) => { close(); resolve(ok); };
        async function submit() {
          const n = name.trim().replace(/\s+/g, " ");
          if (!n || n.length > FOLDER_NAME_MAX) { setErr(tt("fld_bad_name")); return; }
          setBusy(true);
          const e = await opts.save(n).catch(() => tt("fld_bad_name"));
          setBusy(false);
          if (e) setErr(e); else done(true);
        }
        return (
          <div style={overlay} onClick={() => done(false)}>
            <div className="card pad" style={card} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ margin: "0 0 12px", color: "var(--gold)", textAlign: "center" }}>{opts.title}</h3>
              <input className="input" autoFocus value={name} maxLength={FOLDER_NAME_MAX}
                placeholder={tt("fld_name_hint")}
                onChange={(e) => { setName(e.target.value); setErr(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
                style={{ width: "100%", color: "var(--gold)", borderColor: "var(--gold-border)", background: "#000" }} />
              <div style={{ textAlign: "right", fontSize: 12, opacity: .7, marginTop: 4 }}>{name.length}/{FOLDER_NAME_MAX}</div>
              {err && <p style={{ color: "#ff6b6b", margin: "6px 0 0", textAlign: "center" }}>{err}</p>}
              <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 14 }}>
                <button className="btn" onClick={() => done(false)} style={{ minWidth: 120 }}>{tt("fld_cancel")}</button>
                <button className="btn" disabled={busy} onClick={() => void submit()} style={goldBtn}>{opts.okLabel}</button>
              </div>
            </div>
          </div>
        );
      }
      return <Dialog />;
    });
  });
}

function errFrom(r: { status?: boolean; code?: string; message?: string }): string | null {
  if (r.status) return null;
  if (r.code === "duplicate") return tt("fld_taken");
  if (r.code === "bad_name") return tt("fld_bad_name");
  return r.message || tt("fld_bad_name");
}

/** "+ New folder" for me. Resolves the new folder (or null). */
export async function createFolderFlow(myId: number): Promise<PostFolder | null> {
  let made: PostFolder | null = null;
  await askFolderName({
    title: tt("fld_new_folder"), okLabel: tt("fld_create"),
    save: async (name) => {
      const r = await createPostFolder(myId, name);
      if (r.status && r.folder) made = r.folder;
      return errFrom(r);
    },
  });
  if (made) announceFoldersChanged();
  return made;
}

/**
 * Pick one of MY folders for a video. Resolves the folder id (0 = no folder) or null when
 * dismissed. Offers "+ New folder" inside, which picks the new one straight away.
 */
export function pickFolder(myId: number, currentId: number | null | undefined): Promise<number | null> {
  return new Promise((resolve) => {
    mount((close) => {
      function Sheet() {
        const [folders, setFolders] = useState<PostFolder[] | null>(null);
        useEffect(() => { void fetchPostFolders(myId).then(setFolders); }, []);
        const done = (v: number | null) => { close(); resolve(v); };
        const row = (active: boolean): React.CSSProperties => ({
          ...chip(active), width: "100%", justifyContent: "space-between", padding: "11px 16px", marginBottom: 8, fontSize: 16,
        });
        return (
          <div style={overlay} onClick={() => done(null)}>
            <div className="card pad" style={{ ...card, maxHeight: "80vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ margin: "0 0 12px", color: "var(--gold)", textAlign: "center" }}>{tt("fld_move")}</h3>
              {folders === null ? <p style={{ textAlign: "center" }}>…</p> : (
                <>
                  <button style={row(!currentId)} onClick={() => done(0)}>
                    <span>{tt("fld_none")}</span>{!currentId && <span>✓</span>}
                  </button>
                  {folders.map((f) => (
                    <button key={f.id} style={row(currentId === f.id)} onClick={() => done(f.id)}>
                      <span>📁 {f.name}</span><span>{currentId === f.id ? "✓" : f.post_count}</span>
                    </button>
                  ))}
                  <button style={{ ...row(false), justifyContent: "center", borderStyle: "dashed" }}
                    onClick={async () => { const f = await createFolderFlow(myId); if (f) done(f.id); }}>
                    + {tt("fld_new_folder")}
                  </button>
                </>
              )}
              <div style={{ textAlign: "center", marginTop: 6 }}>
                <button className="btn" onClick={() => done(null)} style={{ minWidth: 120 }}>{tt("fld_cancel")}</button>
              </div>
            </div>
          </div>
        );
      }
      return <Sheet />;
    });
  });
}

/** The chip row over the Videos grid. selected 0 = All videos. */
export function ProfileFolders({ profileId, isMe, myId, selected, onSelect }: {
  profileId: number; isMe: boolean; myId?: number | null; selected: number; onSelect: (id: number) => void;
}) {
  const { t } = useT();
  const [folders, setFolders] = useState<PostFolder[]>([]);
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [editFor, setEditFor] = useState<PostFolder | null>(null);

  useEffect(() => {
    let live = true;
    const load = () => void fetchPostFolders(profileId).then((f) => { if (live) setFolders(f); });
    load();
    window.addEventListener(FOLDERS_CHANGED, load);
    return () => { live = false; window.removeEventListener(FOLDERS_CHANGED, load); };
  }, [profileId]);

  // A selected folder that was deleted falls back to All videos.
  useEffect(() => {
    if (selected && folders.length && !folders.some((f) => f.id === selected)) onSelect(0);
  }, [folders]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isMe && folders.length === 0) return null;

  async function rename(f: PostFolder) {
    setMenuFor(null);
    if (!myId) return;
    const ok = await askFolderName({
      title: t("fld_rename"), initial: f.name, okLabel: t("fld_save"),
      save: async (name) => errFrom(await renamePostFolder(myId, f.id, name)),
    });
    if (ok) announceFoldersChanged();
  }
  async function remove(f: PostFolder) {
    setMenuFor(null);
    if (!myId) return;
    const yes = await showGoldConfirm({ message: `${f.name}\n\n${t("fld_delete_confirm")}`, confirmLabel: t("fld_delete"), cancelLabel: t("fld_cancel"), danger: true });
    if (!yes) return;
    const r = await deletePostFolder(myId, f.id);
    if (!r.status) { showGoldAlert(r.message || "Error"); return; }
    if (selected === f.id) onSelect(0);
    announceFoldersChanged();
  }

  async function toggleSeries(f: PostFolder) {
    setMenuFor(null);
    if (!myId) return;
    const r = await setFolderSeries(myId, f.id, !f.is_series);
    if (!r.status) { showGoldAlert(r.message || "Error"); return; }
    announceFoldersChanged();
    // The open folder's order changed: open it again.
    if (selected === f.id) { onSelect(0); window.setTimeout(() => onSelect(f.id), 0); }
  }

  const menuFolder = folders.find((f) => f.id === menuFor) ?? null;
  return (
    <div className="profile-folders" style={{ display: "flex", gap: 10, overflowX: "auto", padding: "10px 2px 12px", alignItems: "flex-end" }}>
      <FolderTile label={t("fld_all_videos")} active={selected === 0} icon="▦" onClick={() => onSelect(0)} />
      {folders.map((f) => (
        <FolderTile key={f.id} label={f.name} count={f.post_count} cover={f.cover} active={selected === f.id} series={!!f.is_series}
          onClick={() => onSelect(f.id)}
          onMenu={isMe ? () => setMenuFor(f.id) : undefined}
          onEdit={isMe ? () => setEditFor(f) : undefined} />
      ))}
      {isMe && myId && (
        <FolderTile label={t("fld_new_folder")} icon="+" dashed
          onClick={async () => { const f = await createFolderFlow(myId); if (f) onSelect(f.id); }} />
      )}
      {editFor && myId && (
        <FolderOrderSheet folder={editFor} profileId={profileId} myId={myId} onClose={() => setEditFor(null)}
          onSaved={() => {
            const id = editFor.id;
            setEditFor(null);
            announceFoldersChanged();
            // Open the folder (again) so its grid shows the new #1, #2 …
            onSelect(0); window.setTimeout(() => onSelect(id), 0);
          }} />
      )}
      {menuFolder && (
        <div style={overlay} onClick={() => setMenuFor(null)}>
          <div className="card pad" style={{ ...card, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 14px", color: "var(--gold)" }}>📁 {menuFolder.name}</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button className="btn" style={{ color: "var(--gold)", background: "#000", borderColor: "var(--gold-border)" }} onClick={() => void rename(menuFolder)}>✏️ {t("fld_rename")}</button>
              <button className="btn" style={{ color: "var(--gold)", background: "#000", borderColor: "var(--gold-border)" }} onClick={() => void toggleSeries(menuFolder)}>#️⃣ {t(menuFolder.is_series ? "fld_series_off" : "fld_series_on")}</button>
              <button className="btn" style={{ color: "#ff6b6b", background: "#000", borderColor: "var(--gold-border)" }} onClick={() => void remove(menuFolder)}>🗑️ {t("fld_delete")}</button>
              <button className="btn" onClick={() => setMenuFor(null)}>{t("fld_cancel")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * One folder, drawn as a folder (Steve, 2026-11-20: "make it look like a folder but also the front
 * of it will look like their first video with a name of the folder on the bottom of the folder").
 * Gold tab on top, gold-outlined front showing the first video's thumbnail (dark with an icon when
 * empty), and the name + count on a dark strip along the bottom. Owner: hold / right-click / ⋮.
 */
function FolderTile({ label, count, cover, icon, active, dashed, series, onClick, onMenu, onEdit }: {
  label: string; count?: number; cover?: string | null; icon?: string; active?: boolean; dashed?: boolean; series?: boolean;
  onClick: () => void; onMenu?: () => void; onEdit?: () => void;
}) {
  const hold = useRef<number | null>(null);
  const held = useRef(false);
  const stop = () => { if (hold.current) { window.clearTimeout(hold.current); hold.current = null; } };
  const border = `${active ? 3 : 2}px ${dashed ? "dashed" : "solid"} ${active ? "var(--gold-bright)" : "var(--gold-border)"}`;
  const img = cover ? mediaUrl(cover) : "";
  return (
    <button type="button" title={label}
      onClick={() => { if (held.current) { held.current = false; return; } onClick(); }}
      onContextMenu={(e) => { if (onMenu) { e.preventDefault(); onMenu(); } }}
      onPointerDown={() => { held.current = false; stop(); if (onMenu) hold.current = window.setTimeout(() => { held.current = true; onMenu(); }, 650); }}
      onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
      style={{ flex: "0 0 auto", width: 112, padding: 0, background: "transparent", border: "none", cursor: "pointer", position: "relative",
        filter: active ? "drop-shadow(0 0 6px rgba(240,196,32,.55))" : undefined }}>
      {/* the folder's tab */}
      <div style={{ width: 46, height: 12, marginLeft: 8, borderTop: border, borderLeft: border, borderRight: border,
        borderRadius: "7px 7px 0 0", background: active ? "var(--gold-border)" : "#000" }} />
      {/* the front */}
      <div style={{ position: "relative", height: 92, marginTop: -2, border, borderRadius: "0 10px 10px 10px", overflow: "hidden",
        background: img ? `#000 url("${img}") center/cover no-repeat` : "linear-gradient(160deg,#1a1a1a,#050505)" }}>
        {!img && (
          <span style={{ position: "absolute", inset: "0 0 28px 0", display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--gold)", fontSize: icon === "+" ? 34 : 28, fontWeight: 800 }}>{icon ?? <GoldFolderIcon />}</span>
        )}
        {series && (
          <span style={{ position: "absolute", top: 3, left: 3, padding: "1px 6px", borderRadius: 8, background: "var(--gold-border)",
            color: "#000", fontWeight: 900, fontSize: 10.5 }}>#1…{count}</span>
        )}
        {onEdit && (
          <span role="button" aria-label="✎" title={tt("fld_edit")} onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            style={{ position: "absolute", top: 3, right: 28, width: 22, height: 22, borderRadius: 11, background: "var(--gold-border)",
              color: "#000", fontWeight: 900, lineHeight: "22px", fontSize: 13 }}>✎</span>
        )}
        {onMenu && (
          <span role="button" aria-label="⋮" onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onMenu(); }}
            style={{ position: "absolute", top: 3, right: 3, width: 22, height: 22, borderRadius: 11, background: "rgba(0,0,0,.7)",
              color: "var(--gold)", fontWeight: 900, lineHeight: "22px", fontSize: 14 }}>⋮</span>
        )}
        <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "5px 6px", background: "rgba(0,0,0,.82)",
          borderTop: "1px solid var(--gold-border)", color: "var(--gold)", fontWeight: 800, fontSize: 12.5,
          display: "flex", gap: 4, justifyContent: "center", alignItems: "baseline" }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
          {count != null && <span style={{ opacity: .8, fontWeight: 700, flex: "0 0 auto" }}>{count}</span>}
        </span>
      </div>
    </button>
  );
}

/** A small gold-outlined folder for an empty folder's front. */
function GoldFolderIcon() {
  return (
    <svg width="34" height="28" viewBox="0 0 34 28" aria-hidden="true">
      <path d="M2 5a3 3 0 0 1 3-3h8l3 3h13a3 3 0 0 1 3 3v15a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
    </svg>
  );
}

/** Gold "Set number" box for a numbered series: resolves 1..max, or null. */
export function askNumber(current: number, max: number): Promise<number | null> {
  return new Promise((resolve) => {
    mount((close) => {
      function Dialog() {
        const [v, setV] = useState(String(current));
        const done = (n: number | null) => { close(); resolve(n); };
        const n = Number(v);
        const ok = Number.isInteger(n) && n >= 1 && n <= max;
        return (
          <div style={overlay} onClick={() => done(null)}>
            <div className="card pad" style={{ ...card, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ margin: "0 0 12px", color: "var(--gold)" }}>{tt("fld_set_number")}</h3>
              <input className="input" autoFocus inputMode="numeric" value={v} onChange={(e) => setV(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => { if (e.key === "Enter" && ok) done(n); }}
                style={{ width: 120, textAlign: "center", fontSize: 22, fontWeight: 800, color: "var(--gold)", borderColor: "var(--gold-border)", background: "#000" }} />
              <p style={{ margin: "8px 0 0", opacity: .8 }}>{tt("fld_number_hint", max)}</p>
              <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 14 }}>
                <button className="btn" onClick={() => done(null)} style={{ minWidth: 110 }}>{tt("fld_cancel")}</button>
                <button className="btn" disabled={!ok} onClick={() => done(n)} style={goldBtn}>{tt("fld_save")}</button>
              </div>
            </div>
          </div>
        );
      }
      return <Dialog />;
    });
  });
}

/**
 * The folder editor, like Edit Playlist (Steve, 2026-11-20: "move the videos and organize them the
 * way i want top video would be #1 video, next would be #2 video. this is the way i want to be able
 * to create a sereis with the video folders"). Drag a row by its ≡ handle (mouse or finger); the top
 * row is #1. Update saves the whole order and makes the folder a numbered series.
 */
function FolderOrderSheet({ folder, profileId, myId, onClose, onSaved }: {
  folder: PostFolder; profileId: number; myId: number; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useT();
  const [rows, setRows] = useState<FolderVideo[] | null>(null);
  const [dragAt, setDragAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const ROW = 76;

  useEffect(() => {
    let live = true;
    void fetchFolderVideos(profileId, folder.id).then((v) => {
      if (!live) return;
      // Series folders already come in their order; otherwise by any saved number, then as listed.
      const sorted = folder.is_series ? v : [...v].sort((a, b) => (a.folder_pos ?? 1e9) - (b.folder_pos ?? 1e9));
      setRows(sorted);
    }).catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, [profileId, folder.id, folder.is_series]);

  function startDrag(e: React.PointerEvent, from: number) {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragAt(from);
    let at = from;
    const top = listRef.current?.getBoundingClientRect().top ?? 0;
    const move = (ev: PointerEvent) => {
      if (!rows) return;
      const to = Math.max(0, Math.min(rows.length - 1, Math.floor((ev.clientY - top + (listRef.current?.scrollTop ?? 0)) / ROW)));
      if (to !== at) {
        setRows((list) => {
          if (!list) return list;
          const next = [...list]; const [it] = next.splice(at, 1); next.splice(to, 0, it); return next;
        });
        at = to; setDragAt(to);
      }
    };
    const up = () => {
      setDragAt(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  async function update() {
    if (!rows) return;
    setSaving(true);
    try {
      const r = await setFolderOrder(myId, folder.id, rows.map((v) => v.id));
      if (!r.ok) { showGoldAlert(r.message || tt("something_went_wrong")); setSaving(false); return; }
      onSaved();
    } catch {
      showGoldAlert(tt("something_went_wrong")); setSaving(false);
    }
  }

  return (
    <div style={{ ...overlay, padding: 12 }} onClick={onClose}>
      <div className="card pad" style={{ ...card, maxWidth: 460, boxSizing: "border-box", maxHeight: "88vh", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h2 style={{ margin: 0, color: "var(--gold)", flex: 1, fontWeight: 900 }}>{t("fld_edit")}</h2>
          <button className="btn small ghost" aria-label={t("fld_cancel")} onClick={onClose}>✕</button>
        </div>
        <div style={{ color: "var(--gold)", opacity: .85, fontWeight: 700, margin: "2px 0 4px" }}>📁 {folder.name}</div>
        <div className="muted" style={{ fontSize: 14, marginBottom: 10 }}>{t("fld_edit_sub")}</div>
        <div ref={listRef} style={{ overflowY: "auto", flex: 1, touchAction: dragAt === null ? "auto" : "none" }}>
          {rows === null ? <div className="muted center" style={{ padding: 24 }}>…</div>
            : rows.length === 0 ? <p className="muted center">{t("fld_empty")}</p>
            : rows.map((v, i) => (
              <div key={v.id} style={{ height: ROW - 8, marginBottom: 8, display: "flex", alignItems: "center", gap: 12, padding: "0 10px 0 4px",
                borderRadius: 10, border: `1.5px solid ${dragAt === i ? "var(--gold-bright)" : "var(--gold-border)"}`,
                background: dragAt === i ? "rgba(240,196,32,.12)" : "#000" }}>
                <div style={{ width: 50, height: 60, borderRadius: 6, flex: "0 0 auto", background: v.thumbnail ? `#111 url("${mediaUrl(v.thumbnail)}") center/cover` : "#111" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "var(--gold)", fontWeight: 900, fontSize: 18 }}>#{i + 1}</div>
                  {(v.description ?? "").trim() && (
                    <div className="muted" style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.description}</div>
                  )}
                </div>
                <span role="button" aria-label="≡" onPointerDown={(e) => startDrag(e, i)}
                  style={{ color: "var(--gold)", fontSize: 28, lineHeight: 1, padding: "8px 6px", cursor: "grab", touchAction: "none", userSelect: "none" }}>≡</span>
              </div>
            ))}
        </div>
        <button className="btn" disabled={saving || !rows?.length} onClick={() => void update()}
          style={{ marginTop: 12, height: 46, color: "var(--gold-bright)", background: "#000", border: "1.5px solid var(--gold-border)", fontWeight: 800 }}>
          {saving ? "…" : t("fld_update")}
        </button>
      </div>
    </div>
  );
}
