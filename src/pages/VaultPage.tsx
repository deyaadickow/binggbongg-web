// Password Protected Page (Steve, 2026-10-24) — Settings -> Account.
//
// The passcode and the key live in this component's memory and nowhere else: not in localStorage,
// not in sessionStorage, not on the server. Navigating away drops them and the page locks again.
// That is deliberate — a vault that stays unlocked in storage is a vault anyone with the laptop
// can open.
import { useCallback, useEffect, useState } from "react";
import { useSession } from "../lib/session";
import { Loading, Notice } from "../components/Common";
import { showGoldConfirm } from "../components/GoldToast";
import { PageTitle } from "../components/PageTitle";
import {
  VAULT_MIN_PASSCODE, type VaultEntry, type VaultStatus,
  fetchVaultStatus, setupVault, unlockVault, fetchVaultItems, saveVaultItem,
  deleteVaultItem, forgetVault, newRecoveryCode, unlockWithRecoveryCode,
  changeVaultPasscode, rawDataKey, forgetRawDataKey,
} from "../lib/vault";

const EMPTY: VaultEntry = { title: "", username: "", password: "", notes: "" };

export function VaultPage() {
  const { user } = useSession();
  const [status, setStatus] = useState<VaultStatus | null | "loading">("loading");
  const [passcode, setPasscode] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [dataKey, setDataKey] = useState<CryptoKey | null>(null);
  const [items, setItems] = useState<VaultEntry[] | null>(null);
  const [draft, setDraft] = useState<VaultEntry | null>(null);
  const [reveal, setReveal] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  /** Made on this device at setup, shown once, never sent. */
  const [recoveryCode, setRecoveryCode] = useState(() => newRecoveryCode());
  const [savedCode, setSavedCode] = useState(false);
  /** "recover" = they forgot the passcode and are using the code instead. */
  const [mode, setMode] = useState<"normal" | "recover" | "change">("normal");
  const [typedCode, setTypedCode] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newCode2, setNewCode2] = useState("");

  const load = useCallback(() => {
    if (!user) return;
    fetchVaultStatus(user.id).then((s) => setStatus(s));
  }, [user?.id]);
  useEffect(() => { load(); }, [load]);

  // Lock on leaving. The key is never persisted, so this is belt and braces for a long-lived tab.
  useEffect(() => () => { setDataKey(null); forgetRawDataKey(); }, []);

  if (!user) return <div className="page"><Notice>Sign in to open your Password Page.</Notice></div>;
  if (status === "loading") return <div className="page"><Loading /></div>;

  async function doSetup() {
    setErr("");
    if (passcode.length < VAULT_MIN_PASSCODE) { setErr(`Use at least ${VAULT_MIN_PASSCODE} characters.`); return; }
    if (passcode !== confirmCode) { setErr("The two passcodes don't match."); return; }
    if (!understood) { setErr("Please tick the box so we know you understand."); return; }
    if (!savedCode) { setErr("Please save your recovery code first, then tick the box."); return; }
    setBusy(true);
    try {
      const r = await setupVault(user!.id, passcode, recoveryCode);
      if (!r.status) { setErr(r.message ?? "Couldn't set that up."); return; }
      const fresh = await fetchVaultStatus(user!.id);
      setStatus(fresh);
      const key = fresh ? await unlockVault(fresh, passcode) : null;
      setDataKey(key);
      setItems([]);
      setPasscode(""); setConfirmCode("");
    } finally { setBusy(false); }
  }

  async function doUnlock() {
    setErr("");
    setBusy(true);
    try {
      const key = await unlockVault(status as VaultStatus, passcode);
      if (!key) { setErr("That passcode isn't right."); return; }
      setDataKey(key);
      setItems(await fetchVaultItems(user!.id, key));
      setPasscode("");
    } finally { setBusy(false); }
  }

  /** Unlock with the recovery code, then immediately re-wrap under a new passcode. */
  async function doRecover() {
    setErr("");
    if (passcode.length < VAULT_MIN_PASSCODE) { setErr(`Use at least ${VAULT_MIN_PASSCODE} characters.`); return; }
    if (passcode !== confirmCode) { setErr("The two passcodes don't match."); return; }
    setBusy(true);
    try {
      const raw = await unlockWithRecoveryCode(status as VaultStatus, typedCode);
      if (!raw) { setErr("That recovery code isn't right."); return; }
      const r = await changeVaultPasscode(user!.id, raw, passcode);
      if (!r.status) { setErr(r.message ?? "Couldn't set that passcode."); return; }
      const fresh = await fetchVaultStatus(user!.id);
      setStatus(fresh);
      const key = fresh ? await unlockVault(fresh, passcode) : null;
      setDataKey(key);
      if (key) setItems(await fetchVaultItems(user!.id, key));
      setMode("normal"); setTypedCode(""); setPasscode(""); setConfirmCode("");
      setNote("Your passcode has been changed.");
    } finally { setBusy(false); }
  }

  /** Change the passcode while unlocked. Only the wrapping changes, so nothing is re-encrypted
   *  and the existing recovery code keeps working unless a new one is issued. */
  async function doChangePasscode() {
    setErr("");
    if (newCode.length < VAULT_MIN_PASSCODE) { setErr(`Use at least ${VAULT_MIN_PASSCODE} characters.`); return; }
    if (newCode !== newCode2) { setErr("The two passcodes don't match."); return; }
    const raw = rawDataKey();
    if (!raw) { setErr("Please lock and unlock the page, then try again."); return; }
    setBusy(true);
    try {
      const r = await changeVaultPasscode(user!.id, raw, newCode);
      if (!r.status) { setErr(r.message ?? "Couldn't change your passcode."); return; }
      setStatus(await fetchVaultStatus(user!.id));
      setMode("normal"); setNewCode(""); setNewCode2("");
      setNote("Your passcode has been changed. Your recovery code still works.");
    } finally { setBusy(false); }
  }

  async function doSave() {
    if (!draft || !dataKey) return;
    if (!draft.title.trim()) { setErr("Give it a name so you can find it."); return; }
    setErr(""); setBusy(true);
    try {
      const r = await saveVaultItem(user!.id, dataKey, draft);
      if (!r.status) { setErr(r.message ?? "Couldn't save that."); return; }
      setItems(await fetchVaultItems(user!.id, dataKey));
      setDraft(null);
      setNote("Saved.");
    } finally { setBusy(false); }
  }

  async function doDelete(id?: number) {
    if (!id || !dataKey) return;
    // The BB card, not the browser's grey confirm() — Steve, 2026-10-24: "Add our design on
    // that popup on all platforms please."
    const ok = await showGoldConfirm({
      message: "Delete this entry? It cannot be brought back.",
      confirmLabel: "Delete", cancelLabel: "Cancel", danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteVaultItem(user!.id, id);
      setItems(await fetchVaultItems(user!.id, dataKey));
    } finally { setBusy(false); }
  }

  async function doForget() {
    const ok = await showGoldConfirm({
      message: "This ERASES every password saved here.\n\nIt cannot be undone, and nobody — not support, not an administrator — can recover it.",
      confirmLabel: "Erase", cancelLabel: "Cancel", confirmWord: "ERASE", danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await forgetVault(user!.id);
      setDataKey(null); setItems(null); forgetRawDataKey(); setStatus(await fetchVaultStatus(user!.id));
      setNote("Your Password Page was erased. You can set it up again.");
    } finally { setBusy(false); }
  }

  // ---- not set up yet -------------------------------------------------------------------
  if (!status?.is_set_up) {
    return (
      <div className="page" style={{ maxWidth: 560 }}>
        <PageTitle>Password Protected Page</PageTitle>
        <div className="card pad" style={{ marginBottom: 12 }}>
          <div className="soft" style={{ fontSize: 14 }}>
            Keep your passwords here, locked behind a passcode only you know. Everything is
            encrypted on your own device before it is saved.
          </div>
          <div style={{ marginTop: 12, padding: 12, border: "1px solid var(--gold-border)", borderRadius: 10 }}>
            <b style={{ color: "var(--gold)" }}>Choose your passcode carefully.</b>
            <div className="soft" style={{ fontSize: 13, marginTop: 6 }}>
              It is not your Bingg Bongg login, and it is not stored anywhere. Nobody at Bingg
              Bongg can unlock this page or read what is in it &mdash; not support, not an
              administrator. If you forget your passcode, the recovery code below is the only way
              back in, so keep it somewhere safe.
            </div>
          </div>
          <input className="input" type="password" value={passcode} autoComplete="new-password"
                 placeholder={`New passcode (at least ${VAULT_MIN_PASSCODE} characters)`}
                 onChange={(e) => setPasscode(e.target.value)} style={{ marginTop: 12 }} />
          <input className="input" type="password" value={confirmCode} autoComplete="new-password"
                 placeholder="Type it again" onChange={(e) => setConfirmCode(e.target.value)}
                 style={{ marginTop: 8 }} />
          {/* Shown ONCE. We never store it and cannot show it again — that is what makes it a
              recovery code rather than a second copy of the key sitting on our server. */}
          <div style={{ marginTop: 14, padding: 12, border: "1px solid var(--gold-border)", borderRadius: 10 }}>
            <b style={{ color: "var(--gold)" }}>Your recovery code</b>
            <div className="soft" style={{ fontSize: 13, marginTop: 6 }}>
              Write this down or print it and keep it somewhere safe. If you ever forget your
              passcode, this is the only thing that can open your page again.
            </div>
            <code style={{ display: "block", marginTop: 10, fontSize: 16, letterSpacing: 2, color: "var(--gold)", wordBreak: "break-all" }}>
              {recoveryCode}
            </code>
            <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <button className="btn small ghost" onClick={() => void navigator.clipboard?.writeText(recoveryCode).then(() => setNote("Recovery code copied."))}>Copy</button>
              <button className="btn small ghost" onClick={() => setRecoveryCode(newRecoveryCode())}>Make a different one</button>
            </div>
            <label className="row" style={{ gap: 8, marginTop: 10, fontSize: 13 }}>
              <input type="checkbox" checked={savedCode} onChange={(e) => setSavedCode(e.target.checked)} />
              <span className="soft">I have saved my recovery code somewhere safe.</span>
            </label>
          </div>
          <label className="row" style={{ gap: 8, marginTop: 10, fontSize: 13 }}>
            <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
            <span className="soft">I understand that if I forget this passcode, what I save here is gone for good.</span>
          </label>
          {err && <div style={{ marginTop: 10 }}><Notice error>{err}</Notice></div>}
          <button className="btn gold" style={{ marginTop: 12 }} disabled={busy} onClick={() => void doSetup()}>
            {busy ? "Setting up…" : "Create my Password Page"}
          </button>
        </div>
        {note && <Notice>{note}</Notice>}
      </div>
    );
  }

  // ---- locked ---------------------------------------------------------------------------
  if (!dataKey) {
    return (
      <div className="page" style={{ maxWidth: 560 }}>
        <PageTitle>Password Protected Page</PageTitle>
        <div className="card pad">
          <div className="soft" style={{ fontSize: 14 }}>
            Enter your passcode to unlock. {status.item_count > 0 ? `${status.item_count} saved.` : ""}
          </div>
          <input className="input" type="password" value={passcode} autoComplete="current-password"
                 placeholder="Passcode" style={{ marginTop: 12 }}
                 onChange={(e) => setPasscode(e.target.value)}
                 onKeyDown={(e) => { if (e.key === "Enter") void doUnlock(); }} />
          {err && <div style={{ marginTop: 10 }}><Notice error>{err}</Notice></div>}
          <button className="btn gold" style={{ marginTop: 12 }} disabled={busy} onClick={() => void doUnlock()}>
            {busy ? "Unlocking…" : "Unlock"}
          </button>
          <button className="btn small ghost" style={{ marginTop: 10 }} disabled={busy}
                  onClick={() => { setMode("recover"); setErr(""); }}>
            I forgot my passcode
          </button>
        </div>

        {mode === "recover" && (
          <div className="card pad" style={{ marginTop: 12 }}>
            <div className="card-title" style={{ marginBottom: 8 }}>Use your recovery code</div>
            <div className="soft" style={{ fontSize: 13 }}>
              Enter the recovery code you saved when you set this page up, then choose a new
              passcode. Upper or lower case and the dashes do not matter.
            </div>
            <input className="input" value={typedCode} placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
                   onChange={(e) => setTypedCode(e.target.value)} style={{ marginTop: 10 }} />
            <input className="input" type="password" value={passcode} autoComplete="new-password"
                   placeholder={`New passcode (at least ${VAULT_MIN_PASSCODE} characters)`}
                   onChange={(e) => setPasscode(e.target.value)} style={{ marginTop: 8 }} />
            <input className="input" type="password" value={confirmCode} autoComplete="new-password"
                   placeholder="Type it again" onChange={(e) => setConfirmCode(e.target.value)}
                   style={{ marginTop: 8 }} />
            {err && <div style={{ marginTop: 10 }}><Notice error>{err}</Notice></div>}
            <div className="row" style={{ gap: 8, marginTop: 10 }}>
              <button className="btn gold small" disabled={busy} onClick={() => void doRecover()}>Unlock and set a new passcode</button>
              <button className="btn small ghost" onClick={() => { setMode("normal"); setErr(""); }}>Cancel</button>
            </div>
            <button className="btn small ghost" style={{ marginTop: 14 }} disabled={busy} onClick={() => void doForget()}>
              I lost the recovery code too &mdash; erase everything
            </button>
          </div>
        )}
        <div style={{ display: "none" }}>
        </div>
      </div>
    );
  }

  // ---- unlocked -------------------------------------------------------------------------
  return (
    <div className="page" style={{ maxWidth: 560 }}>
      <PageTitle>Password Protected Page</PageTitle>

      <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <button className="btn gold small" onClick={() => { setDraft({ ...EMPTY }); setErr(""); }}>Add a password</button>
        <button className="btn small ghost" onClick={() => { setDataKey(null); setItems(null); forgetRawDataKey(); }}>Lock</button>
        <button className="btn small ghost" onClick={() => { setMode("change"); setErr(""); }}>Change passcode</button>
      </div>

      {mode === "change" && (
        <div className="card pad" style={{ marginBottom: 12 }}>
          <div className="card-title" style={{ marginBottom: 8 }}>Change your passcode</div>
          <div className="soft" style={{ fontSize: 13 }}>
            Nothing you have saved is re-encrypted, and your recovery code keeps working.
          </div>
          <input className="input" type="password" value={newCode} autoComplete="new-password"
                 placeholder={`New passcode (at least ${VAULT_MIN_PASSCODE} characters)`}
                 onChange={(e) => setNewCode(e.target.value)} style={{ marginTop: 10 }} />
          <input className="input" type="password" value={newCode2} autoComplete="new-password"
                 placeholder="Type it again" onChange={(e) => setNewCode2(e.target.value)} style={{ marginTop: 8 }} />
          {err && <div style={{ marginTop: 10 }}><Notice error>{err}</Notice></div>}
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <button className="btn gold small" disabled={busy} onClick={() => void doChangePasscode()}>Save new passcode</button>
            <button className="btn small ghost" onClick={() => { setMode("normal"); setErr(""); }}>Cancel</button>
          </div>
        </div>
      )}

      {draft && (
        <div className="card pad" style={{ marginBottom: 12 }}>
          <div className="card-title" style={{ marginBottom: 8 }}>{draft.id ? "Edit" : "New entry"}</div>
          <input className="input" placeholder="What is it for? (Gmail, my bank…)" value={draft.title}
                 onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <input className="input" placeholder="Username or email" value={draft.username} autoComplete="off"
                 onChange={(e) => setDraft({ ...draft, username: e.target.value })} style={{ marginTop: 8 }} />
          <input className="input" placeholder="Password" value={draft.password} autoComplete="off"
                 onChange={(e) => setDraft({ ...draft, password: e.target.value })} style={{ marginTop: 8 }} />
          <textarea className="input" placeholder="Notes (optional)" value={draft.notes} rows={3}
                    onChange={(e) => setDraft({ ...draft, notes: e.target.value })} style={{ marginTop: 8 }} />
          {err && <div style={{ marginTop: 10 }}><Notice error>{err}</Notice></div>}
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <button className="btn gold small" disabled={busy} onClick={() => void doSave()}>Save</button>
            <button className="btn small ghost" onClick={() => { setDraft(null); setErr(""); }}>Cancel</button>
          </div>
        </div>
      )}

      {items === null ? <Loading /> : items.length === 0 ? (
        <Notice>Nothing saved here yet.</Notice>
      ) : items.map((it) => (
        <div key={it.id} className="card pad" style={{ marginBottom: 10 }}>
          <div style={{ fontWeight: 800, color: "var(--gold)" }}>{it.title}</div>
          {it.username && <div className="soft" style={{ fontSize: 13, marginTop: 4 }}>{it.username}</div>}
          <div className="row" style={{ gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
            <code style={{ fontSize: 14, letterSpacing: 1 }}>
              {reveal[it.id!] ? it.password : "•".repeat(Math.min(12, it.password.length || 8))}
            </code>
            <button className="btn small ghost" onClick={() => setReveal({ ...reveal, [it.id!]: !reveal[it.id!] })}>
              {reveal[it.id!] ? "Hide" : "Show"}
            </button>
            <button className="btn small ghost" onClick={() => void navigator.clipboard?.writeText(it.password).then(() => setNote("Copied."))}>
              Copy
            </button>
          </div>
          {it.notes && <div className="soft" style={{ fontSize: 13, marginTop: 8, whiteSpace: "pre-wrap" }}>{it.notes}</div>}
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <button className="btn small ghost" onClick={() => { setDraft(it); setErr(""); }}>Edit</button>
            <button className="btn small ghost" onClick={() => void doDelete(it.id)}>Delete</button>
          </div>
        </div>
      ))}

      {note && <div style={{ marginTop: 10 }}><Notice>{note}</Notice></div>}
    </div>
  );
}
