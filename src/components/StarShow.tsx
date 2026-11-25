// Star shows (Steve, 2026-11-25, spec v9) — "Bingg Bongg's Most Beautiful Woman" and "The Best
// Looking Guy On Bingg Bongg", one engine. Mockup: whos-the-star-mockup.png (black + gold).
//
//  - StarShowRoom   the stage the whole room sees while a show runs, drawn INSTEAD of the room
//                   battle: the gold banner (title, round, clock), the 3 x 4 grid of 9 tiles —
//                   the leader in the 2 x 2 block top-left (swapped in only after 3 s as leader),
//                   guests by rank, the host's tile (Host pill + gift box), "+ Request" for every
//                   free seat — plus everything opened from it: the tile hold menu, the show's
//                   Report reasons, the join card, the round-end card and the host's Show controls.
//  - StarSetupCard  the host's card from the Battles menu (START → startStarShow).
//  - StarBirthdaySheet  a host with no birthday on file (host_need_birthday).
//  - StarVoteSheet  VOTE → the normal Gifts page aimed at that guest, "Vote for <first name>".
//
// Guest tiles carry no red gift box (VOTE does that job) and tapping the video does nothing.
// Nobody but the host ever sees a percentage or a money line.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { initials, mediaUrl, giftPrice, type Gift } from "../lib/api";
import { useT } from "../lib/i18n";
import type { LiveTile } from "../lib/live";
import { mmss } from "../lib/multiLive";
import { STAR_REPORT_REASONS, isStarRefusal, starReasonText, type StarKind, type StarPerson, type StarRow, type StarShow } from "../lib/starShow";
import { Confetti, Podium, firstName } from "./GameShow";
import { HostPill, TileChrome } from "./BattleGrid";
import { MlMenu } from "./MultiLiveGrid";
import { PopNumber } from "./PopNumber";
import { TileGiftLayer } from "./TileGiftLayer";
import { PayWithSwitch } from "./PayWithSwitch";
import { showGoldAlert } from "./GoldToast";
import { sfx } from "../lib/gameSounds";

/** How long a new leader must stay leader before the big tile swaps (Steve's rule). */
export const LEADER_HOLD_MS = 3000;
const HOLD_MS = 550;

const portal = (node: React.ReactNode) => (typeof document === "undefined" ? node : createPortal(node, document.body));

function tileBackdrop(id: number): string {
  const hue = (id * 47) % 360;
  return `linear-gradient(160deg, hsl(${hue} 35% 24%), hsl(${(hue + 40) % 360} 30% 9%))`;
}

/** Seconds left in the round, counted down locally from the server's figure. */
export function useStarClock(show: StarShow | null): number {
  const endsAt = useRef(0);
  const [now, setNow] = useState(Date.now());
  const running = !!show && show.phase === "round";
  useEffect(() => {
    if (!show || !running) { endsAt.current = 0; return; }
    const next = Date.now() + show.seconds_left * 1000;
    // A poll every 1.5 s: keep the local clock unless the server's is more than 2 s away from it.
    if (Math.abs(next - endsAt.current) > 2000) endsAt.current = next;
  }, [show?.show_id, show?.round_id, show?.phase, show?.seconds_left]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [running]);
  if (!running) return 0;
  return Math.max(0, Math.ceil((endsAt.current - now) / 1000));
}

/**
 * The guest in the big tile: the server's leader, but a NEW leader only after they have stayed
 * leader for 3 s (a leader who left the stage is replaced at once). A tie never swaps — the
 * server already keeps the earlier joiner on a tie.
 */
export function useLeaderHold(show: StarShow | null): number | null {
  const want = show?.leader_user_id ?? null;
  const ids = show ? show.stage.map((r) => r.user_id) : [];
  const idsKey = [...ids].sort((a, b) => a - b).join(",");
  const [shown, setShown] = useState<number | null>(want);
  useEffect(() => {
    if (want === shown) return;
    const onStage = new Set(idsKey ? idsKey.split(",").map(Number) : []);
    if (shown === null || want === null || !onStage.has(shown)) { setShown(want); return; }
    const t = window.setTimeout(() => setShown(want), LEADER_HOLD_MS);
    return () => window.clearTimeout(t);
  }, [want, shown, idsKey]);
  return shown !== null && ids.includes(shown) ? shown : want;
}

function useVideo(tile: LiveTile | undefined) {
  const ref = useRef<HTMLVideoElement>(null);
  const hasVideo = !!tile && !tile.muted;
  useEffect(() => {
    const el = ref.current;
    if (!el || !tile || !hasVideo) return;
    return tile.attach(el);
  }, [tile, hasVideo]);
  return { ref, hasVideo };
}

/** Press-and-hold (and right-click) opens the tile's menu; a plain tap does nothing. */
function useHold(onHold: () => void) {
  const timer = useRef(0);
  const cancel = () => { if (timer.current) { window.clearTimeout(timer.current); timer.current = 0; } };
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest("button")) return;
      cancel();
      timer.current = window.setTimeout(() => { timer.current = 0; onHold(); }, HOLD_MS);
    },
    onPointerUp: cancel, onPointerLeave: cancel, onPointerCancel: cancel,
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); cancel(); onHold(); },
  };
}

function Face({ p, tile }: { p: { user_id: number; name: string; profile_image: string | null }; tile: LiveTile | undefined }) {
  const { ref, hasVideo } = useVideo(tile);
  const photo = p.profile_image ? mediaUrl(p.profile_image) : "";
  const realPhoto = photo && !/\/$/.test(photo);
  return (
    <>
      {realPhoto
        ? <img className="sts-photo" src={photo} alt="" loading="lazy" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
        : <div className="sts-ph" style={{ background: tileBackdrop(p.user_id) }}><i>{initials(p.name || "?")}</i></div>}
      {hasVideo && <video ref={ref} autoPlay playsInline muted style={tile?.isLocal ? { transform: "scaleX(-1)" } : undefined} />}
      {/* Gifts play in the giver's and the receiver's tiles (bb_gift_fx), as in every live. */}
      <TileGiftLayer uid={p.user_id} />
    </>
  );
}

function GuestTile({ r, big, me, tile, onVote, onHold }: { r: StarRow; big: boolean; me: boolean; tile: LiveTile | undefined; onVote: (() => void) | null; onHold: () => void }) {
  const { t } = useT();
  const hold = useHold(onHold);
  return (
    <div className={`sts-tile${big ? " big" : ""}${me ? " own" : ""}`} data-uid={r.user_id} {...hold}>
      <Face p={r} tile={tile} />
      {!big && <span className="sts-rank">{r.rank}</span>}
      <span className="sts-score">
        {big && <span className="sts-leader">👑 {t("sts_leader")}</span>}
        <span className="sts-bbs">{big ? <>{<PopNumber value={r.score} />} BBs</> : <PopNumber value={r.score} />}</span>
      </span>
      <span className="sts-foot">
        {onVote && <button type="button" className="sts-vote" onClick={(e) => { e.stopPropagation(); onVote(); }}>{t("sts_vote")}</button>}
        <span className="sts-name">{r.name}</span>
      </span>
    </div>
  );
}

function HostTile({ host, tile, onGift, onHold }: { host: StarPerson; tile: LiveTile | undefined; onGift: (() => void) | null; onHold: () => void }) {
  const hold = useHold(onHold);
  return (
    <div className="cb-tile sts-tile sts-host" data-uid={host.user_id} {...hold}>
      <Face p={host} tile={tile} />
      <TileChrome score={null} pill={<HostPill />} onGift={onGift} name={host.name} />
    </div>
  );
}

function RequestTile({ big, onTap }: { big: boolean; onTap: () => void }) {
  const { t } = useT();
  return (
    <button type="button" className={`sts-tile sts-req${big ? " big" : ""}`} onClick={onTap}>
      <b>+</b><span>{t("sts_request")}</span>
    </button>
  );
}

export function StarBanner({ show, secondsLeft, onShow }: { show: StarShow; secondsLeft: number; onShow?: (() => void) | null }) {
  const { t } = useT();
  const man = show.kind === "man";
  return (
    <div className={`sts-banner${man ? " man" : ""}`}>
      <div className="sts-banner-l">
        <small>{t(man ? "sts_banner_top_man" : "sts_banner_top_woman")}</small>
        <b>{man ? "😎" : "👑"} {t(man ? "sts_banner_main_man" : "sts_banner_main_woman")}</b>
      </div>
      {onShow && <button type="button" className="sts-show-btn" onClick={onShow}>⚙️ {t("sts_show_btn")}</button>}
      <div className="sts-banner-r">
        <small>{t("sts_round_n", show.round_no)}</small>
        <b>{mmss(show.phase === "round" ? secondsLeft : 0)}</b>
      </div>
    </div>
  );
}

export interface StarActions {
  /** VOTE: open the Gifts page aimed at this guest (the parent owns the gift list and the send). */
  vote: (p: StarPerson) => void;
  /** The host tile's own gift box. */
  hostGift: () => void;
  viewProfile: (p: StarPerson) => void;
  /** reportUser with the show reason (English) and room_name; the parent says thank you. */
  report: (p: StarPerson, reasonEn: string) => Promise<void>;
  /** The normal requestToJoinLive; answers the refusal reason (null = sent / not ours). */
  request: () => Promise<{ reason: string | null; message: string | null } | null>;
  /** confirmStarShowGuest. */
  confirm: (dateOfBirth: string) => Promise<{ ok: boolean; reason: string | null; message: string | null }>;
  next: () => void;
  setLowest: (on: boolean) => void;
  end: () => void;
  remove: (p: StarPerson, ban: boolean) => void;
  needSignIn: () => void;
}

/**
 * The whole show as one room sees it. Everything the server decides comes in `show`; this keeps
 * only what is on this screen (menus, cards, the 3 s leader hold).
 */
export function StarShowRoom({ show, host, myId, isHost, signedIn, hasBirthday, tiles, actions, joinSignal = 0, demoOpen }: {
  show: StarShow;
  host: StarPerson;
  myId: number | null;
  isHost: boolean;
  signedIn: boolean;
  /** The member already has a birthday on file: the join card hides the picker. */
  hasBirthday: boolean;
  tiles: LiveTile[];
  actions: StarActions;
  /** Bumped by the parent when its own Ask to join answered need_confirm: opens the join card. */
  joinSignal?: number;
  /** DEV demo only: open one of the cards straight away for a screenshot. */
  demoOpen?: "controls" | "join" | "hold" | "report" | null;
}) {
  const { t } = useT();
  const secondsLeft = useStarClock(show);
  const leaderId = useLeaderHold(show);
  const byUser = useMemo(() => new Map(tiles.filter((x) => x.userId != null).map((x) => [x.userId as number, x])), [tiles]);
  const [menu, setMenu] = useState<{ title: string; items: { label: string; onPick: () => void; danger?: boolean }[] } | null>(null);
  const [reportFor, setReportFor] = useState<StarPerson | null>(demoOpen === "report" ? show.stage[0] ?? null : null);
  const [joinOpen, setJoinOpen] = useState(demoOpen === "join");
  const [controlsOpen, setControlsOpen] = useState(demoOpen === "controls");
  const [endClosedFor, setEndClosedFor] = useState(0);
  const onStage = !!myId && show.stage.some((r) => r.user_id === myId);

  useEffect(() => { if (joinSignal > 0) setJoinOpen(true); }, [joinSignal]);

  // Order after the leader: guests by rank (then join order), the host, then a "+ Request" per free seat.
  const leader = show.stage.find((r) => r.user_id === leaderId) ?? null;
  const rest = show.stage.filter((r) => r !== leader).sort((a, b) => a.rank - b.rank || a.joined_order - b.joined_order);
  const seats = Math.max(0, Math.min(show.seats_left, show.max_tiles - 1 - show.stage.length));

  function holdGuest(r: StarPerson) {
    const items: { label: string; onPick: () => void; danger?: boolean }[] = [];
    const mine = r.user_id === myId;
    if (!mine) items.push({ label: t("sts_hold_vote", firstName(r.name) || r.name), onPick: () => vote(r) });
    items.push({ label: t("sts_view_profile"), onPick: () => actions.viewProfile(r) });
    if (!mine) items.push({ label: t("sts_report"), onPick: () => { if (!signedIn) { actions.needSignIn(); return; } setReportFor(r); } });
    if (isHost) {
      items.push({ label: t("sts_remove"), danger: true, onPick: () => actions.remove(r, false) });
      items.push({ label: t("sts_remove_ban"), danger: true, onPick: () => actions.remove(r, true) });
    }
    setMenu({ title: r.name, items });
  }
  function holdHost() {
    setMenu({ title: host.name, items: [{ label: t("sts_view_profile"), onPick: () => actions.viewProfile(host) }] });
  }
  useEffect(() => { if (demoOpen === "hold" && show.stage[0]) holdGuest(show.stage[0]); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function vote(r: StarPerson) {
    if (!signedIn) { actions.needSignIn(); return; }
    actions.vote(r);
  }

  async function tapRequest() {
    if (!signedIn) { actions.needSignIn(); return; }
    if (isHost) { setControlsOpen(true); return; }
    if (onStage) return;
    const refusal = show.my_refusal ?? null;
    if (refusal === "need_confirm") { setJoinOpen(true); return; }
    if (isStarRefusal(refusal)) { showGoldAlert(starReasonText(refusal, null, show.kind)); return; }
    const r = await actions.request();
    if (r?.reason === "need_confirm") setJoinOpen(true);
    else if (r && isStarRefusal(r.reason)) showGoldAlert(starReasonText(r.reason, r.message, show.kind));
  }

  const last = show.last_round;
  const endOpen = show.phase === "break" && !!last && endClosedFor !== last.round_no;

  return (
    <div className="sts-stage" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <StarBanner show={show} secondsLeft={secondsLeft} onShow={isHost ? () => setControlsOpen(true) : null} />
      <div className="sts-grid">
        {leader
          ? <GuestTile key={`L${leader.user_id}`} r={leader} big me={leader.user_id === myId} tile={byUser.get(leader.user_id)}
              onVote={leader.user_id === myId ? null : () => vote(leader)} onHold={() => holdGuest(leader)} />
          : <RequestTile big onTap={() => { void tapRequest(); }} />}
        {rest.map((r) => (
          <GuestTile key={r.user_id} r={r} big={false} me={r.user_id === myId} tile={byUser.get(r.user_id)}
            onVote={r.user_id === myId ? null : () => vote(r)} onHold={() => holdGuest(r)} />
        ))}
        <HostTile host={host} tile={byUser.get(host.user_id)} onGift={host.user_id === myId ? null : () => { if (!signedIn) { actions.needSignIn(); return; } actions.hostGift(); }} onHold={holdHost} />
        {Array.from({ length: leader ? seats : Math.max(0, seats - 1) }, (_, i) => <RequestTile key={`req${i}`} big={false} onTap={() => { void tapRequest(); }} />)}
      </div>

      {menu && portal(<MlMenu title={menu.title} items={menu.items} onClose={() => setMenu(null)} />)}
      {reportFor && portal(<StarReportSheet who={reportFor} onClose={() => setReportFor(null)}
        onPick={(reasonEn) => { const p = reportFor; setReportFor(null); void actions.report(p, reasonEn); }} />)}
      {joinOpen && portal(<StarJoinCard kind={show.kind} needBirthday={!hasBirthday} onClose={() => setJoinOpen(false)}
        onSend={async (dob) => {
          const c = await actions.confirm(dob);
          if (!c.ok) return starReasonText(c.reason, c.message, show.kind);
          setJoinOpen(false);
          const r = await actions.request();
          if (r && isStarRefusal(r.reason) && r.reason !== "need_confirm") showGoldAlert(starReasonText(r.reason, r.message, show.kind));
          return null;
        }} />)}
      {controlsOpen && isHost && portal(<StarHostControls show={show} onClose={() => setControlsOpen(false)}
        onNext={() => { setControlsOpen(false); actions.next(); }}
        onLowest={actions.setLowest}
        onEnd={() => { if (!window.confirm(t("sts_end_confirm"))) return; setControlsOpen(false); actions.end(); }} />)}
      {endOpen && last && portal(<StarRoundEnd show={show} onClose={() => setEndClosedFor(last.round_no)} />)}
    </div>
  );
}

/** The round's winner card: crown, headline, podium, thanks / joins lines, next-round countdown. */
export function StarRoundEnd({ show, onClose }: { show: StarShow; onClose: () => void }) {
  const { t } = useT();
  const last = show.last_round!;
  const [burst] = useState(() => Date.now());
  const endsAt = useRef(Date.now() + last.next_round_in * 1000);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(i); }, []);
  const hasWinner = !!last.winner && !last.tie && last.winner.score > 0;
  useEffect(() => { if (hasWinner) try { sfx.fanfare(); } catch { /* no audio */ } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const left = Math.max(0, Math.ceil((endsAt.current - now) / 1000));
  const man = show.kind === "man";
  return (
    <div className="chb-end sts-end" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="card pad" onClick={(e) => e.stopPropagation()}>
        {hasWinner && <Confetti burst={burst} />}
        <div className="sts-end-crown">{last.tie ? "🤝" : "👑"}</div>
        <div className="sts-end-head">{t(man ? "sts_round_head_man" : "sts_round_head_woman", last.round_no)}</div>
        {last.tie ? <div className="sts-end-name">{t("sts_tie")}</div>
          : hasWinner ? (<>
            <div className="sts-end-name">{last.winner!.name}</div>
            <div className="sts-end-bbs">{t("sts_bbs_n", last.winner!.score.toLocaleString())}</div>
          </>) : <div className="sts-end-name" style={{ fontSize: 20 }}>{t("sts_no_votes")}</div>}
        {last.podium.length > 0 && <Podium tie={last.tie} rows={last.podium.map((r) => ({ name: firstName(r.name) || r.name, value: r.score.toLocaleString() }))} />}
        {(last.left || last.joined.length > 0) && (
          <div className="sts-end-lines">
            {last.left && <div>{t("sts_thanks_left", firstName(last.left.name) || last.left.name)} 💛</div>}
            {last.joined.map((p) => <div key={p.user_id}>{t("sts_joins_next", firstName(p.name) || p.name, last.round_no + 1)}</div>)}
          </div>
        )}
        <div className="sts-end-next">{t("sts_next_round_in", last.round_no + 1, left)}</div>
      </div>
    </div>
  );
}

function StarReportSheet({ who, onPick, onClose }: { who: StarPerson; onPick: (reasonEn: string) => void; onClose: () => void }) {
  const { t } = useT();
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet sts-sheet" onClick={(e) => e.stopPropagation()}>
        <h3>{t("sts_report_title", who.name)}</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {STAR_REPORT_REASONS.map((r) => (
            <button key={r.en} type="button" className="btn block" style={{ borderColor: "var(--red)", color: "var(--red)" }} onClick={() => onPick(r.en)}>{t(r.key)}</button>
          ))}
          <button type="button" className="btn block ghost" onClick={onClose}>{t("ml_cancel")}</button>
        </div>
      </div>
    </div>
  );
}

/** A switch in the mockup's style (gold knob on black). */
function GoldSwitch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`sts-switch${on ? " on" : ""}`} onClick={() => onChange(!on)}><i /></button>
  );
}

/** Host: the card from the Battles menu. */
export function StarSetupCard({ kind, onStart, onCancel }: { kind: StarKind; onStart: (lowestLeaves: boolean) => Promise<void>; onCancel: () => void }) {
  const { t } = useT();
  const [lowest, setLowest] = useState(false);
  const [busy, setBusy] = useState(false);
  const man = kind === "man";
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="sts-card" onClick={(e) => e.stopPropagation()}>
        <h3>{man ? "😎" : "👑"} {t(man ? "sts_short_man" : "sts_short_woman")}</h3>
        <p className="sts-card-blurb">{t("sts_setup_blurb")}</p>
        <div className="sts-label">{t("sts_you_earn")}</div>
        <div className="sts-box"><b>{t("sts_you_earn_line")}</b><small>{t("sts_paid_by")}</small></div>
        <div className="sts-label">{t("sts_rounds")}</div>
        <div className="sts-box">{t("sts_rounds_line")}</div>
        <div className="sts-label">{t("sts_seats")}</div>
        <div className="sts-box sts-box-row"><span>{t("sts_lowest_leaves")}</span><GoldSwitch on={lowest} onChange={setLowest} label={t("sts_lowest_leaves")} /></div>
        <div className="sts-rules"><b>{t("sts_rules_title")}</b><br />{t("sts_rules_body")}</div>
        <button type="button" className="sts-gold-btn" disabled={busy}
          onClick={async () => { setBusy(true); try { await onStart(lowest); } finally { setBusy(false); } }}>{busy ? "…" : t("sts_start")}</button>
        <button type="button" className="sts-text-btn" onClick={onCancel}>{t("sts_cancel")}</button>
      </div>
    </div>
  );
}

/** Host with no birthday on file: one date box, saved with the normal profile update. */
export function StarBirthdaySheet({ onSave, onClose }: { onSave: (dob: string) => Promise<void>; onClose: () => void }) {
  const { t } = useT();
  const [dob, setDob] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="sts-card" onClick={(e) => e.stopPropagation()}>
        <h3>🎂 {t("sts_birthday_title")}</h3>
        <p className="sts-card-blurb">{t("sts_birthday_host_line")}</p>
        <label className="sts-box sts-box-row"><span>{t("sts_birthday")}</span>
          <input type="date" className="sts-date" value={dob} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDob(e.target.value)} /></label>
        <button type="button" className="sts-gold-btn" disabled={busy || !dob}
          onClick={async () => { setBusy(true); try { await onSave(dob); } finally { setBusy(false); } }}>{busy ? "…" : t("sts_save")}</button>
        <button type="button" className="sts-text-btn" onClick={onClose}>{t("sts_cancel")}</button>
      </div>
    </div>
  );
}

/** "+ Request" for a member who has not confirmed yet: gender + 18 tick and birthday, once. */
export function StarJoinCard({ kind, needBirthday, onSend, onClose }: {
  kind: StarKind; needBirthday: boolean;
  /** Answers an error to show, or null when done. */
  onSend: (dob: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const { t } = useT();
  const [checked, setChecked] = useState(false);
  const [dob, setDob] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const man = kind === "man";
  async function send() {
    if (!checked) { setErr(t("sts_need_check")); return; }
    if (needBirthday && !dob) { setErr(t("sts_r_bad_birthday")); return; }
    setErr(null); setBusy(true);
    // A member with a birthday on file sends any value: the server keeps the one it has.
    try { setErr(await onSend(needBirthday ? dob : "2000-01-01")); } finally { setBusy(false); }
  }
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="sts-card" onClick={(e) => e.stopPropagation()}>
        <h3>{t(man ? "sts_join_title_man" : "sts_join_title_woman")}</h3>
        <label className="sts-box sts-check"><input type="checkbox" checked={checked} onChange={(e) => { setChecked(e.target.checked); setErr(null); }} />
          <span>{t(man ? "sts_confirm_man" : "sts_confirm_woman")}</span></label>
        {needBirthday && (
          <label className="sts-box sts-box-row"><span>{t("sts_birthday")}</span>
            <input type="date" className="sts-date" value={dob} max={new Date().toISOString().slice(0, 10)} onChange={(e) => { setDob(e.target.value); setErr(null); }} /></label>
        )}
        <p className="sts-card-rule">{t("sts_rules_line")}</p>
        {err && <div className="sts-err">{err}</div>}
        <button type="button" className="sts-gold-btn" disabled={busy} onClick={() => { void send(); }}>{busy ? "…" : t("sts_send_request")}</button>
        <button type="button" className="sts-text-btn" onClick={onClose}>{t("sts_cancel")}</button>
      </div>
    </div>
  );
}

/** Host: Next round · Lowest leaves on/off · Waiting line · End show, and the pay line. */
export function StarHostControls({ show, onNext, onLowest, onEnd, onClose }: {
  show: StarShow; onNext: () => void; onLowest: (on: boolean) => void; onEnd: () => void; onClose: () => void;
}) {
  const { t } = useT();
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="sts-card" onClick={(e) => e.stopPropagation()}>
        <h3>⚙️ {t("sts_controls_title")}</h3>
        {show.host_pay && (
          <div className="sts-box"><b>{show.host_pay.line}</b><small>{t("sts_earned", show.host_pay.earned_bbs.toLocaleString())}</small></div>
        )}
        <button type="button" className="sts-gold-btn" disabled={show.phase !== "round"} onClick={onNext}>⏭️ {t("sts_next_round")}</button>
        <div className="sts-box sts-box-row"><span>{t("sts_lowest_leaves")}</span><GoldSwitch on={show.lowest_leaves} onChange={onLowest} label={t("sts_lowest_leaves")} /></div>
        <div className="sts-label">{t("sts_waiting_line", show.waiting.length)}</div>
        <div className="sts-box sts-wait">
          {show.waiting.length === 0 ? <span className="muted">{t("sts_waiting_empty")}</span>
            : show.waiting.map((p, i) => <div key={p.user_id}><b>{i + 1}.</b> {p.name}</div>)}
        </div>
        <button type="button" className="sts-red-btn" onClick={onEnd}>{t("sts_end_show")}</button>
        <button type="button" className="sts-text-btn" onClick={onClose}>{t("close")}</button>
      </div>
    </div>
  );
}

/** VOTE → our normal Gifts page aimed at that guest. The gift is the vote; its BBs are the points. */
export function StarVoteSheet({ name, gifts, balance, onSend, onClose }: {
  name: string; gifts: Gift[]; balance: number | null; onSend: (g: Gift) => void; onClose: () => void;
}) {
  const { t } = useT();
  const first = firstName(name) || name;
  return (
    <div className="modal-backdrop sts-vote-backdrop" onClick={onClose}>
      <div className="modal-sheet sts-vote-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sts-vote-head">
          <b>👑 {t("sts_vote_for", first)}</b>
          <small>{t("sts_vote_line", first)}</small>
          <button type="button" className="sts-vote-x" aria-label={t("close")} onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: "6px 6px 0" }}><PayWithSwitch hint /></div>
        <div className="gifts sts-gifts">
          {gifts.map((g) => (
            <button key={g.id} type="button" onClick={() => onSend(g)}>
              {g.image ? <img src={mediaUrl(g.image)} alt="" /> : <span style={{ fontSize: 28 }}>🎁</span>}
              <span>{g.name ?? ""}</span>
              <b>{giftPrice(g).toLocaleString()}</b>
            </button>
          ))}
        </div>
        {balance !== null && <div className="sts-vote-bal">{t("sts_bbs_n", balance.toLocaleString())}</div>}
      </div>
    </div>
  );
}
