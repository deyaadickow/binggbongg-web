// Bingg Bongg Speed Dating (Steve, 2026-11-28) — the room's pieces: the gold header, the host's Match / Pass on each
// guest tile, "Pass" and "Matched" on the tile, the "It's a Match! 💛" burst, and the once-only birthday card.
// Rules and server calls: lib/speedDating.ts.
import { useEffect, useState } from "react";
import { useT } from "../lib/i18n";
import { BURST_MS, useSdView } from "../lib/speedDating";

/** "💛 Speed Dating" on a Live Now card. */
export function SpeedDatingBadge() {
  const { t } = useT();
  return <span className="pill" style={{ background: "#000", borderColor: "var(--gold)", color: "var(--gold)", fontWeight: 900 }}>💛 {t("sd_label")}</span>;
}

/** "BINGG BONGG SPEED DATING" in gold above the room. */
export function SpeedDatingHeader({ matches }: { matches: number }) {
  const { t } = useT();
  return (
    <div className="sd-header" role="heading" aria-level={2}>
      <span className="sd-header-heart" aria-hidden>💛</span>
      <span className="sd-header-title">{t("sd_title")}</span>
      <span className="sd-header-heart" aria-hidden>💛</span>
      {matches > 0 && <span className="sd-header-count">{t("sd_matches_count", matches)}</span>}
    </div>
  );
}

/** Inside every tile of the live grid (both layouts), like TileGiftLayer. Draws nothing outside speed dating. */
export function SpeedDatingTileLayer({ uid }: { uid: number | null | undefined }) {
  const { t } = useT();
  const v = useSdView();
  const [, tick] = useState(0);
  const burstAt = uid && v ? v.bursts[uid] : undefined;
  useEffect(() => {
    if (!burstAt) return;
    const left = BURST_MS - (Date.now() - burstAt);
    if (left <= 0) return;
    const tm = window.setTimeout(() => tick((n) => n + 1), left + 30);
    return () => window.clearTimeout(tm);
  }, [burstAt]);
  if (!v || !v.sd || !uid) return null;
  const isGuest = uid !== v.hostUserId;
  const matched = v.sd.matched_user_ids.includes(uid);
  const passing = isGuest && (v.sd.passing_user_ids.includes(uid) || v.localPass.includes(uid));
  const bursting = !!burstAt && Date.now() - burstAt < BURST_MS;
  const busy = v.busy.includes(uid);
  return (
    <div className="sd-layer" onDoubleClick={(e) => e.stopPropagation()}>
      {isGuest && matched && !bursting && <span className="sd-matched-pill">💛 {t("sd_matched")}</span>}
      {v.isHost && isGuest && !matched && !passing && (
        <div className="sd-acts">
          <button type="button" className="sd-btn sd-match" disabled={busy}
            onClick={(e) => { e.stopPropagation(); v.onMatch(uid); }}>💛 {t("sd_match")}</button>
          <button type="button" className="sd-btn sd-pass" disabled={busy}
            onClick={(e) => { e.stopPropagation(); v.onPass(uid); }}>{t("sd_pass")}</button>
        </div>
      )}
      {passing && <div className="sd-passing"><span>{t("sd_pass")}</span></div>}
      {bursting && (
        <div className="sd-burst" aria-live="polite">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <i key={i} style={{ ["--i" as string]: i }}>💛</i>)}
          <b>{t("sd_its_a_match")}</b>
        </div>
      )}
    </div>
  );
}

/** Go Live: the gold choice. */
export function SpeedDatingToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  const { t } = useT();
  return (
    <button type="button" className={`sd-toggle${on ? " on" : ""}`} aria-pressed={on} onClick={() => onChange(!on)}>
      <span className="sd-toggle-text">
        <b>💛 {t("sd_golive_toggle")}</b>
        <small>{t("sd_golive_note")}</small>
      </span>
      <span className={`sts-switch${on ? " on" : ""}`} aria-hidden><i /></span>
    </button>
  );
}

/** The once-only birthday (18+). onSave answers an error to show, or null when done. */
export function SpeedDatingBirthdaySheet({ onSave, onClose }: { onSave: (dob: string) => Promise<string | null>; onClose: () => void }) {
  const { t } = useT();
  const [dob, setDob] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="sts-card" onClick={(e) => e.stopPropagation()}>
        <h3>💛 {t("sd_title")}</h3>
        <p className="sts-card-blurb">{t("sd_birthday_line")}</p>
        <label className="sts-box sts-box-row"><span>{t("sd_birthday_title")}</span>
          <input type="date" className="sts-date" value={dob} max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => { setDob(e.target.value); setErr(null); }} /></label>
        {err && <div className="sts-err">{err}</div>}
        <button type="button" className="sts-gold-btn" disabled={busy || !dob}
          onClick={async () => { setBusy(true); try { setErr(await onSave(dob)); } finally { setBusy(false); } }}>{busy ? "…" : t("sd_save")}</button>
        <button type="button" className="sts-text-btn" onClick={onClose}>{t("sd_cancel")}</button>
      </div>
    </div>
  );
}
