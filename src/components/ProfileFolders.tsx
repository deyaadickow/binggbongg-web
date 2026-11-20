/**
 * Profile video folders (Steve, 2026-11-20). The gold chip row above a profile's Videos grid —
 * "All videos", then every folder with its count — plus the owner's "+ New folder" and each
 * folder's ⋮ (rename / delete). Also the imperative folder picker used by Upload and by the
 * video hold menu's "Move to folder" (pickFolder), and the name dialog (askFolderName).
 */
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { tt, useT } from "../lib/i18n";
import { showGoldAlert, showGoldConfirm } from "./GoldToast";
import {
  FOLDER_NAME_MAX, FOLDERS_CHANGED, announceFoldersChanged, createPostFolder, deletePostFolder,
  fetchPostFolders, renamePostFolder, type PostFolder,
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

  return (
    <div className="profile-folders" style={{ display: "flex", gap: 8, overflowX: "auto", padding: "10px 2px 12px", alignItems: "center" }}>
      <button style={chip(selected === 0)} onClick={() => onSelect(0)}>{t("fld_all_videos")}</button>
      {folders.map((f) => (
        <span key={f.id} style={{ position: "relative", display: "inline-flex" }}>
          <button style={chip(selected === f.id)} onClick={() => onSelect(f.id)}
            onContextMenu={(e) => { if (isMe) { e.preventDefault(); setMenuFor(f.id); } }}>
            📁 {f.name} <span style={{ opacity: .8, fontWeight: 600 }}>{f.post_count}</span>
            {isMe && (
              <span role="button" aria-label="⋮" onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === f.id ? null : f.id); }}
                style={{ marginLeft: 2, padding: "0 2px", fontWeight: 900 }}>⋮</span>
            )}
          </button>
          {menuFor === f.id && (
            <span style={{ position: "absolute", top: "110%", left: 0, zIndex: 30, background: "#000", border: "1.5px solid var(--gold-border)", borderRadius: 12, padding: 6, display: "flex", flexDirection: "column", gap: 4, minWidth: 170 }}>
              <button className="btn" style={{ color: "var(--gold)", background: "#000", borderColor: "var(--gold-border)" }} onClick={() => void rename(f)}>✏️ {t("fld_rename")}</button>
              <button className="btn" style={{ color: "#ff6b6b", background: "#000", borderColor: "var(--gold-border)" }} onClick={() => void remove(f)}>🗑️ {t("fld_delete")}</button>
            </span>
          )}
        </span>
      ))}
      {isMe && myId && (
        <button style={{ ...chip(false), borderStyle: "dashed" }}
          onClick={async () => { const f = await createFolderFlow(myId); if (f) onSelect(f.id); }}>
          + {t("fld_new_folder")}
        </button>
      )}
    </div>
  );
}
