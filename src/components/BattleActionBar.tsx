// The live room's bottom icons on the grid battle screen (Country Battle + Chat Battle). Steve,
// 2026-11-21, after battling from the website: "we need all these icons on the bottom, it should be
// the same with the website ... everything should be the same with all the icons on the phones and
// the website." The phones' live room bar: Battles · Messages · MT · CC · Flip — the same order and
// colours here (icon over a small label, black bar, gold line on top).
//
// The normal live room (LiveViewerPage) uses it too, with CC: Steve, 2026-11-21: "Adding all the
// icons on the bottom of every live is very important." CC stays off the grid battles: live
// captions only exist when the speaker's own phone runs speech-to-text (the host's "Captions"
// switch), and nobody in a battle runs it — a CC button there would show nothing.
import { useT } from "../lib/i18n";

/** One more button on the bar (the live tools: Voice to Text, Captions, Sounds ... Pause Chat). */
export interface BarItem { key: string; icon: React.ReactNode; label: string; onClick: () => void; active?: boolean }

/** The bar's height, kept free under the grid with the chat strip. */
export const ACTION_BAR_RESERVE = 62;

const noEmoji = (s: string) => s.replace(/^[^\p{L}\p{N}]+/u, "").trim();

function BullseyeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#D4AF37" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="7.5" /><circle cx="12" cy="12" r="1.6" fill="#D4AF37" />
      <path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" strokeLinecap="round" />
    </svg>
  );
}
function BubbleIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
      <path fill={color} d="M12 3C6.5 3 2 6.6 2 11c0 2.3 1.2 4.4 3.2 5.9-.2 1.4-.9 2.8-2 3.8 2 .1 4-.6 5.5-1.8 1 .3 2.1.4 3.3.4 5.5 0 10-3.6 10-8.2S17.5 3 12 3z" />
    </svg>
  );
}
function CcIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
      <rect x="2" y="4.5" width="20" height="15" rx="3" fill="#FFD54F" />
      <text x="12" y="15.6" textAnchor="middle" fontSize="8.5" fontWeight="900" fontFamily="Arial, sans-serif" fill="#000">CC</text>
    </svg>
  );
}
function FlipIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
      <path fill="#4FC3F7" d="M9 4 7.5 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3.5L15 4H9z" />
      <path d="M8.2 11.2a4 4 0 0 1 7.1-1.4M15.8 14.8a4 4 0 0 1-7.1 1.4" fill="none" stroke="#000" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M15.9 8.2v2.2h-2.2M8.1 17.8v-2.2h2.2" fill="none" stroke="#000" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CameraIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
      <path fill={on ? "#B388FF" : "#888"} d="M3 6.5A2.5 2.5 0 0 1 5.5 4h8A2.5 2.5 0 0 1 16 6.5v1.8l4.2-2.6A1.2 1.2 0 0 1 22 6.7v10.6a1.2 1.2 0 0 1-1.8 1L16 15.7v1.8a2.5 2.5 0 0 1-2.5 2.5h-8A2.5 2.5 0 0 1 3 17.5z" />
      {!on && <path d="M3 3l18 18" stroke="#fff" strokeWidth="2" strokeLinecap="round" />}
    </svg>
  );
}
function MicIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
      <rect x="8.5" y="2.5" width="7" height="12" rx="3.5" fill={on ? "#FF6E6E" : "#888"} />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" stroke={on ? "#FF6E6E" : "#888"} strokeWidth="2" strokeLinecap="round" />
      {!on && <path d="M3 3l18 18" stroke="#fff" strokeWidth="2" strokeLinecap="round" />}
    </svg>
  );
}
function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
      <circle cx="10" cy="8" r="4" fill="#69F0AE" /><path fill="#69F0AE" d="M2 20c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5z" />
      <path d="M19 7v6M16 10h6" stroke="#69F0AE" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function GiftIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
      <path fill="#FF80AB" d="M3 8h18v4H3zM4.5 12h15v9h-15z" /><path d="M12 8v13" stroke="#000" strokeWidth="1.6" />
      <path d="M12 8C10 4 6.5 4.5 7.3 6.8 7.8 8 12 8 12 8zm0 0c2-4 5.5-3.5 4.7-1.2C16.2 8 12 8 12 8z" fill="none" stroke="#FF80AB" strokeWidth="1.8" />
    </svg>
  );
}
function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
      <path d="M12 15V3M7.5 7.5 12 3l4.5 4.5" fill="none" stroke="#4DD0E1" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 11v8.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V11" fill="none" stroke="#4DD0E1" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function BarButton({ icon, label, onClick, active }: { icon: React.ReactNode; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button type="button" className={`cb-bar-btn${active ? " active" : ""}`} onClick={onClick} aria-label={label} title={label}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

export function BattleActionBar({ onBattles, onMessages, onMt, mtOn, onCc, ccOn, onFlip, className,
  onCamera, cameraOn, onMic, micOn, joinLabel, onJoin, onGifts, onShare, afterCc, afterMic, tail }: {
  onBattles: () => void;
  onMessages: () => void;
  onMt: () => void;
  /** Chat is being translated: MT shows lit. */
  mtOn: boolean;
  /** The live room's CC (live captions). Absent where nobody publishes captions (the battles). */
  onCc?: () => void;
  ccOn?: boolean;
  /** Battlers only (a viewer has no camera to flip), as in the live room. */
  onFlip: (() => void) | null;
  className?: string;
  /** The rest of the live room's bar (Steve, 2026-11-21: "I want them to see and use all the
   *  icons we have available to use"), in the phones' order: Camera · Mic (whoever is on camera),
   *  Join (a viewer who may join), Gifts, Share & Earn 10%. The row scrolls sideways like theirs. */
  onCamera?: (() => void) | null;
  cameraOn?: boolean;
  onMic?: (() => void) | null;
  micOn?: boolean;
  joinLabel?: string | null;
  onJoin?: () => void;
  onGifts?: (() => void) | null;
  onShare?: () => void;
  /** The live tools (Steve, 2026-11-23: "Missing I-cons from the bottom. Caption, Voice to text,
   *  Sound, Music, Stickers, Background, Filters, Text to Voice, Pause Chat."), in the phones'
   *  places: Voice to Text by the chat icons, Captions after Mic, the rest after Share. */
  afterCc?: BarItem[];
  afterMic?: BarItem[];
  tail?: BarItem[];
}) {
  const { t } = useT();
  return (
    <nav className={`cb-bar${className ? ` ${className}` : ""}`} aria-label={t("fsec_battles")}>
      <BarButton icon={<BullseyeIcon />} label={t("fsec_battles")} onClick={onBattles} />
      <BarButton icon={<BubbleIcon color="#fff" />} label={t("messages")} onClick={onMessages} />
      <BarButton icon={<BubbleIcon color="#4FC3F7" />} label="MT" onClick={onMt} active={mtOn} />
      {onCc && <BarButton icon={<CcIcon />} label="CC" onClick={onCc} active={ccOn} />}
      {afterCc?.map((b) => <BarButton key={b.key} icon={b.icon} label={b.label} onClick={b.onClick} active={b.active} />)}
      {onFlip && <BarButton icon={<FlipIcon />} label={noEmoji(t("flip"))} onClick={onFlip} />}
      {onCamera && <BarButton icon={<CameraIcon on={cameraOn !== false} />} label="Camera" onClick={onCamera} />}
      {onMic && <BarButton icon={<MicIcon on={micOn !== false} />} label={micOn === false ? "Mic Off" : "Mic"} onClick={onMic} />}
      {afterMic?.map((b) => <BarButton key={b.key} icon={b.icon} label={b.label} onClick={b.onClick} active={b.active} />)}
      {joinLabel && onJoin && <BarButton icon={<PersonIcon />} label={joinLabel} onClick={onJoin} />}
      {onGifts && <BarButton icon={<GiftIcon />} label="Gifts" onClick={onGifts} />}
      {onShare && <BarButton icon={<ShareIcon />} label="Share & Earn 10%" onClick={onShare} />}
      {tail?.map((b) => <BarButton key={b.key} icon={b.icon} label={b.label} onClick={b.onClick} active={b.active} />)}
    </nav>
  );
}

/** Battles: our black and gold menu — this battle's leaderboard, every country's battles, and
 *  every battle you can play. */
export function BattlesMenu({ onLeaderboard, onAllCountries, onAllBattles, onClose, showLeaderboard }: {
  onLeaderboard: () => void;
  onAllCountries: () => void;
  onAllBattles: () => void;
  onClose: () => void;
  showLeaderboard: boolean;
}) {
  const { t } = useT();
  const rows = [
    ...(showLeaderboard ? [{ label: `🏆 ${t("leaderboard")}`, onPick: onLeaderboard }] : []),
    { label: `🌍 ${t("acb_tab")}`, onPick: onAllCountries },
    { label: `⚔️ ${t("fx_battles_title")}`, onPick: onAllBattles },
  ];
  return (
    <div className="cb-menu-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="cb-menu" onClick={(e) => e.stopPropagation()}>
        <div style={{ textAlign: "center", marginBottom: 10 }}>
          <img src="/logo_horizontal.png" alt="Bingg Bongg" style={{ height: 54, maxWidth: "100%" }} />
        </div>
        <div className="cb-menu-title">{t("fsec_battles")}</div>
        {rows.map((r) => (
          <button key={r.label} type="button" className="cb-menu-row" onClick={r.onPick}>
            <span>{r.label}</span><b>›</b>
          </button>
        ))}
        <button type="button" className="btn ghost" style={{ width: "100%", marginTop: 4 }} onClick={onClose}>{t("close")}</button>
      </div>
    </div>
  );
}
