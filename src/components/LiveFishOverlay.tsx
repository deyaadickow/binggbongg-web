// Catch the Fish (Steve, 2026-11-07) — see lib/liveFish for the whole story and the server calls.
//
// <LiveFishOverlay />  (viewers): one fish every `every_seconds` (first one ~10 s in), swimming
//   fully across the screen in `seconds`, with its tail and fins swinging (a 16-frame sprite sheet
//   played as a CSS sprite). Tap -> it stops and asks first (a moving fish is easy to hit by
//   accident and it costs coins); SEND GIFT -> sendCoinsToUser fish=1, a "caught" burst, and an
//   ordinary room chat line "🐟 @me caught the fish! (100 coins)" so the streamer can thank them.
// <FishHostControls /> (the streamer): the on/off switch and the "who caught the fish" list.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { displayName } from "../lib/api";
import { useSession } from "../lib/session";
import { useT } from "../lib/i18n";
import { chatChannel, sendChat, type ChatMessage } from "../lib/firebase";
import { requireVerified } from "../lib/verifyEmail";
import {
  FISH_SPRITES, catchFish, fetchFishCatchers, fetchLiveFish, fishChatLine, isFishChatLine, setLiveFish,
  type FishCatchers, type LiveFishStatus,
} from "../lib/liveFish";
import { showGoldAlert, showGoldConfirm } from "./GoldToast";
import { Avatar } from "./Common";

const FIRST_FISH_MS = 10_000;
const STATUS_POLL_MS = 60_000;
const FISH_WIDTH = 180; // px; the hit area adds padding around it

interface Fish {
  id: number;
  sprite: number;
  /** true = swims left to right (the sprite's own facing). */
  ltr: boolean;
  /** % of the window height: kept clear of the header and the chat/action bar. */
  top: number;
  seconds: number;
  coins: number;
}

type Phase = "swim" | "confirm" | "sending" | "caught";

let fishSeq = 0;

export function LiveFishOverlay({ streamerId, streamerName, roomName, active = true }: {
  /** The room owner — the gift goes to them. */
  streamerId: number;
  /** Their @username (or name) for the confirm popup. */
  streamerName: string;
  /** The streamer's live room: the gift's room_name and the chat channel the catch line goes to. */
  roomName: string;
  /** false = no fish at all (the streamer's own screen, a demo, a closed room). */
  active?: boolean;
}) {
  const { t } = useT();
  const navigate = useNavigate();
  const { user, refresh } = useSession();
  const myId = user?.id ?? 0;
  const userRef = useRef(user);
  userRef.current = user;

  const [status, setStatus] = useState<LiveFishStatus | null>(null);
  const [fish, setFish] = useState<Fish | null>(null);
  const [phase, setPhase] = useState<Phase>("swim");

  // The streamer's fish state: on opening the room, then every minute. Any failure = no fish.
  // Keyed on the member's id, never on the user object (it is replaced on every refresh).
  const on = active && !!streamerId && !!roomName && myId > 0 && myId !== streamerId;
  useEffect(() => {
    setStatus(null);
    if (!on) return;
    let alive = true;
    const load = () => fetchLiveFish(streamerId, myId).then((s) => { if (alive) setStatus(s); });
    load();
    const timer = window.setInterval(load, STATUS_POLL_MS);
    return () => { alive = false; window.clearInterval(timer); };
  }, [on, streamerId, myId]);

  const enabled = on && !!status?.enabled;
  const every = status?.every_seconds ?? 30;
  const statusRef = useRef(status);
  statusRef.current = status;
  const fishRef = useRef(fish);
  fishRef.current = fish;

  // One fish every `every` seconds; the first ~10 s after the room opens. Never two at once, and
  // none while the tab is hidden (nobody would see it swim).
  useEffect(() => {
    if (!enabled) { setFish(null); return; }
    const spawn = () => {
      const s = statusRef.current;
      if (!s || document.hidden) return;
      if (fishRef.current) return;
      setPhase("swim");
      setFish({
        id: ++fishSeq,
        sprite: Math.floor(Math.random() * FISH_SPRITES.length),
        ltr: Math.random() < 0.5,
        top: 18 + Math.random() * 47,
        seconds: s.seconds,
        coins: s.coins,
      });
    };
    let interval = 0;
    const first = window.setTimeout(() => { spawn(); interval = window.setInterval(spawn, every * 1000); }, FIRST_FISH_MS);
    return () => { window.clearTimeout(first); window.clearInterval(interval); };
  }, [enabled, every]);

  if (!fish) return null;
  const sprite = FISH_SPRITES[fish.sprite];
  const who = streamerName.replace(/^@/, "");

  function tap() {
    if (phase !== "swim") return;
    if (!requireVerified()) return;
    setPhase("confirm");
  }

  async function send() {
    const me = userRef.current;
    if (!fish || !me) return;
    setPhase("sending");
    const r = await catchFish(me.id, streamerId, roomName);
    if (r.ok) {
      setPhase("caught");
      refresh();
      // An ordinary room chat line — the streamer and everyone sees it (old apps show it as text).
      sendChat(chatChannel(roomName, streamerId), me.id, displayName(me), fishChatLine(me.username || displayName(me), fish.coins), me.profile_image ?? "").catch(() => undefined);
      return;
    }
    setPhase("swim"); // it swims on and leaves
    if (r.code === "fish_low_balance") {
      const buy = await showGoldConfirm({ message: t("fish_low_balance", fish.coins), confirmLabel: t("buy_coins"), cancelLabel: t("cancel") });
      if (buy) navigate("/wallet");
    } else if (r.code === "fish_already") {
      showGoldAlert(t("fish_already"));
    } else if (r.code === "fish_off") {
      setStatus((s) => (s ? { ...s, enabled: false } : s));
      showGoldAlert(t("fish_off"));
    } else if (r.message) {
      showGoldAlert(r.message); // "" = the verify-your-email card is already up
    }
  }

  const paused = phase !== "swim";
  return (
    <div className="fish-layer">
      <div className="fish-banner" role="status">
        {phase === "caught" ? t("fish_caught_you", fish.coins) : t("fish_banner", fish.coins)}
      </div>
      <div key={fish.id} className={`fish-swim ${fish.ltr ? "ltr" : "rtl"}${paused ? " paused" : ""}`}
        style={{ top: `${fish.top}%`, animationDuration: `${fish.seconds}s`, ["--fish-w" as string]: `${FISH_WIDTH}px` }}
        onAnimationEnd={(e) => {
          if (e.animationName === "fish-swim-ltr" || e.animationName === "fish-swim-rtl" || e.animationName === "fish-caught") setFish(null);
        }}>
        <button type="button" className="fish-hit" onClick={tap} aria-label={t("fish_confirm_title")} disabled={phase === "caught"}>
          <div className="fish-bob">
            <div className={`fish-sprite${phase === "caught" ? " caught" : ""}`}
              style={{ backgroundImage: `url(${sprite.src})`, height: Math.round(FISH_WIDTH * sprite.ratio) }} />
            {phase === "caught" && <div className="fish-burst" aria-hidden="true">{Array.from({ length: 10 }, (_, i) => <i key={i} style={{ ["--a" as string]: `${i * 36}deg` }} />)}</div>}
          </div>
        </button>
      </div>
      {(phase === "confirm" || phase === "sending") && (
        <div className="fish-confirm-backdrop">
          <div className="card pad fish-confirm" role="dialog" aria-modal="true">
            <h3>{t("fish_confirm_title")}</h3>
            <p>{t("fish_confirm_text", who, fish.coins)}</p>
            <div className="fish-confirm-buttons">
              <button className="btn" onClick={() => setPhase("swim")} disabled={phase === "sending"}>{t("cancel")}</button>
              <button className="btn fish-send" onClick={send} disabled={phase === "sending"} autoFocus>{t("fish_send_gift")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The streamer's side: "🐟 Catch the Fish" on/off (on by default) and a fish button with this
 * live's catch count that opens "Who caught the fish 🐟". Hidden while the server has no fish
 * (an old server, or the admin's master switch is off).
 */
export function FishHostControls({ myId, roomName, messages }: { myId: number; roomName: string; messages: ChatMessage[] }) {
  const { t } = useT();
  const [status, setStatus] = useState<LiveFishStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<FishCatchers | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setStatus(null);
    if (!myId) return;
    let alive = true;
    fetchLiveFish(myId, myId).then((s) => { if (alive) setStatus(s); });
    return () => { alive = false; };
  }, [myId]);

  // This live's catches: every 30 s, and whenever a "🐟 @… caught the fish!" line arrives.
  const fishLines = messages.reduce((n, m) => n + (isFishChatLine(m.message) ? 1 : 0), 0);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!myId || !roomName) return;
    let alive = true;
    fetchFishCatchers(myId, roomName).then((r) => { if (alive && r) setList(r); });
    return () => { alive = false; };
  }, [myId, roomName, fishLines, tick]);

  if (!status || (!status.enabled && status.streamer_on)) return null;
  const isOn = status.streamer_on;

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const next = await setLiveFish(myId, !isOn);
    setBusy(false);
    if (!next) { showGoldAlert(t("something_went_wrong")); return; }
    setStatus(next);
  }

  return (
    <>
      <button type="button" role="switch" aria-checked={isOn} className={`btn small${isOn ? "" : " ghost"}`} disabled={busy}
        title={t("fish_switch_help")} onClick={toggle}>
        {isOn ? t("fish_switch_on") : t("fish_switch_off")}
      </button>
      <button type="button" className="btn small" title={t("fish_catchers_title")} onClick={() => setOpen(true)}>
        🐟 {list?.total_catches ?? 0}
      </button>
      {open && <FishCatchersSheet data={list} onClose={() => setOpen(false)} />}
    </>
  );
}

function FishCatchersSheet({ data, onClose }: { data: FishCatchers | null; onClose: () => void }) {
  const { t } = useT();
  const navigate = useNavigate();
  const rows = data?.catchers ?? [];
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet fish-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h3>{t("fish_catchers_title")}</h3>
        {rows.length === 0
          ? <p className="muted" style={{ textAlign: "center" }}>{t("fish_catchers_empty")}</p>
          : rows.map((c) => (
            <button key={c.user_id} type="button" className="fish-catcher" onClick={() => { onClose(); navigate(`/profile/${c.user_id}`); }}>
              <Avatar user={{ fullname: c.fullname, username: c.username, profile_image: c.profile_image ?? undefined }} />
              <span className="fish-catcher-who">
                <b>{c.fullname || c.username}</b>
                {c.username && <span className="muted">@{c.username}</span>}
              </span>
              <span className="fish-catcher-count">{t("fish_catcher_count", c.catches, c.coins)}</span>
            </button>
          ))}
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <button type="button" className="btn small" onClick={onClose}>{t("close")}</button>
        </div>
      </div>
    </div>
  );
}
