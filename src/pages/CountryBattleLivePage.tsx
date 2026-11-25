// The Country Battle screen, v2 (Steve, 2026-11-03; hourly 5-minute battles since 2026-11-22): "one 10 minutes country battle once a day
// every day seven days a week, in Philippines it will be 8 pm ... Everything else will be the same
// as chat battle." So it IS the Chat Battle screen (components/GridBattleScreen): one shared room,
// own tile top-left, up to 23 others rotating, stars with sound, cb_gift with "say thanks!", the
// chat strip, the 30-second spotlight, viewers following their host in, and the podium. What
// Country Battle adds: the "upcoming" phase before the room opens, Join live at ANY moment during
// the lobby and the 10 minutes up to the cap ("Country Battle is full"), and no starter.
//
// /country-battle/live/:dayId               watch (viewer)
// /country-battle/live/:dayId?home=303      a viewer who followed battler 303 in: 303 pinned top-left
// /country-battle/live/:dayId?join=1        the page's "Join live": camera + mic, then join
// /country-battle/live/:dayId?battler=1     this browser has already joined: publish
// /country-battle/live/0?demo=24|12|6       fake battlers, no LiveKit or server, for the explainer
//                                           video. &phase=upcoming|joining|battle|ended, &own=0 =
//                                           a viewer's screen, &img=/path/ = /path/1.jpg… as photos.
//                                           &phase=ended: the podium with "Share my result" (a
//                                           sample recap; &reason=not_finished|not_participant|not_found).
// /country-battle/live/:dayId?live=1        opened from the red Live button on the chips: a bar on top
//                                           steps through every battle under way (‹ 2 / 5 Next battle ›)
// /country-battle/live/0?vcbdemo=1|rival     DEV ONLY (never in a production build): Virtual Country
//                                           Battles on a fake state — whole country (1 live + 30
//                                           virtual) or Country VS Country (two halves);
//                                           =empty: Nepal vs Bhutan with no Bhutan members.
//                                           &country=Bhutan: the whole-country demo for another country (its scenery).
//                                           Free BBs from Bingg Bongg land in bursts (free_score).
import { useEffect, useMemo, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useT } from "../lib/i18n";
import { GridBattleLive, type GridBattleSource } from "../components/GridBattleScreen";
import {
  cbReasonText, cbText, clock, countryBattleDayHeartbeat, countryBattlePath, countryGiftInfo, dayAsBattleState, joinCountryBattleDay,
  leaveCountryBattleDay, localTime, sendCountryBattleDayGift, serverNow, setCountryBattleRoomTiles,
  type CbRoom, type CbRoomBrief,
} from "../lib/countryBattle";
import type { ChbBattler, ChbState } from "../lib/chatBattle";
import { ShareResultButton } from "../components/CountryBoardBits";
import { RivalBar } from "../components/RivalBar";
import { countryFlag, useRunningBattles, type AcbBattle } from "../lib/allCountryBattles";

type T = ReturnType<typeof useT>["t"];

export function CountryBattleLivePage() {
  const { dayId } = useParams();
  const [sp] = useSearchParams();
  const demo = sp.get("demo");
  // Virtual Country Battles demo: compiled out of the production build (import.meta.env.DEV is false there).
  const vcbDemo = import.meta.env.DEV ? sp.get("vcbdemo") : null;
  if (vcbDemo) return <VirtualCbDemo key={vcbDemo + (sp.get("n") ?? "")} rival={vcbDemo === "rival" || vcbDemo === "empty"} emptySide={vcbDemo === "empty"} country={sp.get("country") || undefined} tiles={Number(sp.get("n")) || 0} />;
  if (demo) {
    return <CountryBattleDemo key={sp.toString()} n={demo === "0" ? 0 : Number(demo) || 24} withOwn={sp.get("own") !== "0"}
      phase={(sp.get("phase") as ChbState["phase"]) || "battle"} imgBase={sp.get("img")} recapDemo={sp.get("reason") ?? ""} />;
  }
  // ?side= — a Rival Battle's country to fight for; a new side means a fresh screen that joins for it.
  const side = sp.get("side");
  const screen = <CountryBattleLive key={`${dayId}-${side ?? ""}`} dayId={Number(dayId)} home={Number(sp.get("home")) || null}
    battlerHint={sp.get("battler") === "1"} autoJoin={sp.get("join") === "1"} side={side} />;
  if (sp.get("live") !== "1") return screen;
  return <>{<LiveBattlesBar dayId={Number(dayId)} />}{screen}</>;
}

/** The bar over a battle opened from the red Live button (Steve, 2026-11-24: "when you click the live button, it
 *  will show you all the battles that are under way one after another"): which one of how many, ‹ and Next battle ›.
 *  The list refreshes every 20 s, so a battle that ends drops out and a new one joins; after the last comes the first. */
function LiveBattlesBar({ dayId }: { dayId: number }) {
  const { t } = useT();
  const navigate = useNavigate();
  const running = useRunningBattles();
  const n = running.length;
  const i = running.findIndex((b) => b.day_id === dayId);
  const go = (b: AcbBattle) => navigate(countryBattlePath(b.day_id!, { live: true }), { replace: true });
  const next = n ? running[(i + 1) % n] : null;
  const prev = n ? running[i < 0 ? n - 1 : (i - 1 + n) % n] : null;
  const stepping = n > 1 || (n === 1 && i < 0);
  // ← and → step too, unless the member is typing in the chat.
  useEffect(() => {
    if (!stepping) return;
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key === "ArrowRight" && next) go(next);
      if (e.key === "ArrowLeft" && prev) go(prev);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  if (!n) return null;
  const cur = i >= 0 ? running[i] : null;
  return (
    <div className="lbq-bar" role="navigation">
      <button type="button" className="lbq-arrow" disabled={!stepping} onClick={() => prev && go(prev)} aria-label={t("lbq_prev")} title={t("lbq_prev")}>‹</button>
      <div className="lbq-mid">
        <span className="lbq-live">Live</span>
        <span className="lbq-pos">{i >= 0 ? `${i + 1} / ${n}` : `${n}`}</span>
        {cur && <span className="lbq-name">{cur.kind === "rival" ? "⚔️" : countryFlag(cur.country) || "🌍"} {cur.country}</span>}
      </div>
      <button type="button" className="lbq-next" disabled={!stepping} onClick={() => next && go(next)}>{t("lbq_next")} ›</button>
    </div>
  );
}

/** The header lines: "Opens in mm:ss", "Starts in mm:ss — go live and join!", "mm:ss left". */
function phaseLines(t: T, st: ChbState, now: number): { sub: string; line: string } {
  if (st.phase === "ended") return { sub: "", line: t("chb_ended") };
  const target = st.phase_ends_at ? Date.parse(st.phase_ends_at) : NaN;
  const left = Number.isNaN(target) ? "" : clock(target - now);
  if (st.phase === "upcoming") return { sub: cbText(t("cb_starts_at"), { time: localTime(st.starts_at) }), line: left ? cbText(t("cb2_opens_in"), { time: left }) : "" };
  if (st.phase === "joining") return { sub: t("cb2_go_live_join"), line: left ? cbText(t("cb_starts_in"), { time: left }) : "" };
  return { sub: t("chb_battle_on"), line: left ? cbText(t("cb_time_left"), { time: left }) : "" };
}

/** Why I can't join, under the header — only the reasons worth saying while I watch. */
function joinNote(t: T, st: ChbState, country: string): string | null {
  const r = st.me.join_reason;
  if (!r || r === "already_in" || r === "ended" || r === "not_open") return null;
  return cbReasonText(t, r, null, country);
}

/** Country Battle's side of the shared screen: its calls and its texts. */
function makeSource(t: T, dayId: number, countryRef: { current: string }, calls: Pick<GridBattleSource, "heartbeat" | "join" | "leave" | "sendGift"> & Partial<Pick<GridBattleSource, "rooms">>, recapDemo?: string, onRivalJoin?: (country: string) => void): GridBattleSource {
  return {
    kind: "country",
    id: dayId,
    title: t("cb_title"),
    ...calls,
    giftInfo: countryGiftInfo,
    reasonText: (reason, message) => cbReasonText(t, reason, message, countryRef.current),
    phaseLines: (st, now) => phaseLines(t, st, now),
    joinLabel: () => t("cb_join"),
    joinNote: (st) => joinNote(t, st, countryRef.current),
    emptyText: (st) => (st.phase === "upcoming"
      ? cbText(t("cb2_room_opens_at"), { time: localTime(st.opens_at) })
      // Steve, 2026-11-22: a battle with nobody live was a blank black page. Only shows when there
      // are no tiles at all, so never over a battler's own camera (the old "Waiting" box did).
      : cbText(t("cb_nobody_yet"), { country: countryRef.current || st.name })),
    leaveConfirm: t("cb2_leave_confirm"),
    goneReasons: ["not_found", "off"],
    goneText: (reason) => (reason === "off" ? t("cb_off") : t("cb2_over")),
    isThis: (r) => r.country_battle_day_id === dayId,
    noTie: true,
    fallbackPath: "/country-battle",
    rivalJoin: onRivalJoin,
    // Country Battle Recap (Steve, 2026-11-11): a battler's "Share my result" under the podium.
    // A Rival Battle: the two countries' score bar; a viewer who can join picks a side there.
    topExtra: (st) => (st.rival
      ? <RivalBar rival={st.rival} finished={st.phase === "ended"}
          onJoin={!st.me.is_battler && st.me.can_join && onRivalJoin ? onRivalJoin : undefined} />
      : null),
    endExtra: (st, hold) => (st.finished && (st.me.is_battler || (st.me.score ?? 0) > 0)
      ? <ShareResultButton dayId={dayId} demo={recapDemo} onOpen={hold} />
      : null),
  };
}

function CountryBattleLive({ dayId, home, battlerHint, autoJoin, side }: { dayId: number; home: number | null; battlerHint: boolean; autoJoin: boolean; side?: string | null }) {
  const { t } = useT();
  const navigate = useNavigate();
  // The battle's country, for "This battle is for members in {country}." — off the last heartbeat.
  const countryRef = useRef("");
  // Country Battle rooms: the room this screen shows, sent as room_no on every heartbeat/join (null until the server has
  // said which — it picks the viewer's own room, else the lowest one not full). An answer for a room the screen has
  // since moved away from is dropped (the next beat brings the right one).
  const roomRef = useRef<number | null>(null);
  const source = useMemo(() => makeSource(t, dayId, countryRef, {
    heartbeat: async (userId, live) => {
      const asked = roomRef.current;
      const r = await countryBattleDayHeartbeat(userId, dayId, live, asked);
      if (!r.ok) return r;
      if (roomRef.current !== asked) return { ok: false, reason: "stale_room", message: "", full: false };
      countryRef.current = r.data.country;
      if (r.data.room) roomRef.current = r.data.room.no;
      return { ok: true, data: dayAsBattleState(r.data) };
    },
    join: async (userId) => {
      const r = await joinCountryBattleDay(userId, dayId, side, roomRef.current);
      if (!r.ok) return r;
      // The room the server seated me in (the one watched may have filled): the screen switches to it.
      if (r.data.room_no) roomRef.current = r.data.room_no;
      return { ok: true, data: { state: r.data.state ? dayAsBattleState(r.data.state) : null } };
    },
    leave: (userId) => leaveCountryBattleDay(userId, dayId),
    sendGift: (i) => sendCountryBattleDayGift({ ...i, dayId }),
    rooms: {
      pick: (no) => { roomRef.current = no; },
      setTiles: async (myId, tiles) => {
        const no = roomRef.current;
        if (!no) return { ok: false, reason: "", message: "", full: false };
        const r = await setCountryBattleRoomTiles(myId, dayId, no, tiles);
        if (!r.ok) return r;
        if (r.data.room) roomRef.current = r.data.room.no;
        return { ok: true, data: dayAsBattleState(r.data) };
      },
    },
  }, undefined, (country) => navigate(countryBattlePath(dayId, { join: true, side: country }), { replace: true })), [t, dayId, side, navigate]);
  return <GridBattleLive source={source} home={home} battlerHint={battlerHint} autoJoin={autoJoin} />;
}

// ---- the demo (the explainer video) ----------------------------------------------------------

const DEMO_NAMES = [
  "maria santos", "juan dela cruz", "angel reyes", "mark bautista", "joy villanueva", "paolo garcia",
  "kristine mendoza", "jericho ramos", "liza fernandez", "carlo aquino", "bea castillo", "miguel torres",
  "nicole gonzales", "rafael navarro", "jasmine cruz", "enzo salazar", "trisha domingo", "kevin morales",
  "andrea lim", "gabriel tan", "camille flores", "joshua rivera", "sofia del rosario", "daniel lopez",
  "ella marquez", "renz pascual", "hannah ocampo", "lance santiago", "mika valdez", "ivan soriano",
  "riza manalo", "nathan co", "pia robles", "jomar cabrera", "lovely ignacio", "aldrin perez",
  "yna gutierrez", "jay-r alcantara", "cherry de leon", "marvin padilla",
];

/** The real screen on a fake day: the same GridBattleLive, fed by a source that never calls the
 *  server (no room name, so no LiveKit either). */
function CountryBattleDemo({ n, withOwn, phase, imgBase, recapDemo }: { n: number; withOwn: boolean; phase: ChbState["phase"]; imgBase: string | null; recapDemo: string }) {
  const { t } = useT();
  const countryRef = useRef("Philippines");
  const source = useMemo(() => {
    const count = Math.max(0, Math.min(n, DEMO_NAMES.length));
    // More battlers than tiles at 24, so the rotation has someone to bring in.
    const total = count >= 24 ? DEMO_NAMES.length : count;
    const t0 = serverNow();
    const opens = new Date(t0 + (phase === "upcoming" ? 3 * 3600_000 + 754_000 : phase === "joining" ? -60_000 : -9 * 60_000)).toISOString();
    const starts = new Date(Date.parse(opens) + 5 * 60_000).toISOString();
    const ends = new Date(Date.parse(starts) + 10 * 60_000).toISOString();
    const counting = phase === "battle" || phase === "ended";
    const battlers: ChbBattler[] = phase === "upcoming" ? [] : DEMO_NAMES.slice(0, total).map((name, i) => ({
      user_id: 1001 + i, name, username: name.replace(/[^a-z]/g, ""), profile_image: imgBase ? `${imgBase.replace(/\/?$/, "/")}${i + 1}.jpg` : null,
      score: counting ? Math.max(0, 5200 - i * 170 - (i % 3) * 40) : 0, rank: i + 1, is_live: true, left: false, is_starter: false,
      home_room_name: null, chat_room_name: null,
    }));
    const top3 = phase === "ended" ? battlers.slice(0, 3).map((b, i) => ({ ...b, place: i + 1 })) : [];
    const state = (): ChbState => ({
      contest_id: 0, name: "Philippines · Tue, Nov 3", shared: true, phase, server_now: new Date().toISOString(), created_at: opens,
      starts_at: starts, ends_at: ends, opens_at: opens,
      phase_ends_at: phase === "upcoming" ? opens : phase === "joining" ? starts : phase === "battle" ? ends : null,
      room_name: null, room_open: phase !== "upcoming", starter: null, max_battlers: null, battler_count: total, live_count: battlers.length,
      spaces_left: null, unlimited: true, can_join_now: phase === "joining" || phase === "battle",
      battlers, live: battlers.map((b) => b.user_id), finished: phase === "ended", tie: false, top3, winner: top3[0] ?? null,
      me: {
        user_id: withOwn ? 1001 : 0, is_battler: withOwn && phase !== "upcoming", is_live: withOwn && phase !== "upcoming", left: false,
        score: withOwn ? battlers[0]?.score ?? 0 : null, rank: withOwn ? 1 : null, home_room_name: null,
        can_join: !withOwn && (phase === "joining" || phase === "battle"), join_reason: withOwn ? "already_in" : null, starter_bonus: null,
      },
    });
    return makeSource(t, 0, countryRef, {
      heartbeat: async () => ({ ok: true, data: state() }),
      join: async () => ({ ok: false, reason: "demo", message: t("cb2_go_live_join"), full: false }),
      leave: async () => undefined,
      sendGift: async () => ({ status: false, message: t("cb_off") }),
    }, recapDemo);
  }, [t, n, withOwn, phase, imgBase, recapDemo]);
  return <GridBattleLive source={source} home={withOwn ? null : 1001} battlerHint={withOwn} demoUserId={withOwn ? 1001 : undefined} />;
}

// ---- the Virtual Country Battles demo (DEV ONLY) ---------------------------------------------
// Steve, 2026-11-24: "All country battles and country VS country battles with all virtual members...
// This is only temporary, once real members start coming in we will stop the virtual battles." The
// real screen on a fake state with `virtual` + battlers[].is_virtual, so it can be checked before the
// server sends them. Only reachable when import.meta.env.DEV (see CountryBattleLivePage).

// Absolute: mediaUrl() puts a bare path on the uploads server.
const vcbPhoto = (path: string) => `${window.location.origin}${path}`;
const VCB_PHOTOS = ["/lp/fans.jpg", "/lp/live2.jpg", "/lp/friends.jpg", "/lp/earn.jpg", "/lp/battle.jpg", "/lp/contest.jpg", "/img/assistant_bingg.jpg", "/img/assistant_bongg.jpg"].map(vcbPhoto);
const VCB_ID_NAMES = [
  "putri ayu", "budi santoso", "siti rahma", "agus pratama", "dewi lestari", "rizky hidayat", "nur aini", "fajar nugroho",
  "indah permata", "yoga saputra", "ratna sari", "hendra wijaya", "maya anggraini", "dimas prakoso", "lina marlina",
];

function VirtualCbDemo({ rival, emptySide = false, country = "Philippines", tiles = 0 }: { rival: boolean; emptySide?: boolean; country?: string; tiles?: number }) {
  const { t } = useT();
  // =empty is Nepal vs Bhutan, the battle Steve was watching (Bhutan has no members).
  const sideA = emptySide ? "Nepal" : country;
  const sideB = emptySide ? "Bhutan" : "Indonesia";
  const countryRef = useRef(rival ? `${sideA} vs ${sideB}` : sideA);
  const source = useMemo(() => {
    const t0 = serverNow();
    const opens = new Date(t0 - 7 * 60_000).toISOString();
    const starts = new Date(t0 - 2 * 60_000).toISOString();
    const ends = new Date(t0 + 3 * 60_000).toISOString();
    type Row = ChbBattler;
    // Round 2c: each member's country scenery (the real pictures on S3), for tiles with no photo.
    const sceneryOf = (country: string, id: number) => `uploads/scenery/${country.toLowerCase()}_${(Math.floor(id / 2) % 4) + 1}.webp`;
    const row = (id: number, name: string, opts: { live: boolean; photo: string | null; side?: string; score: number }): Row => ({
      scenery_image: sceneryOf(opts.side ?? sideA, id),
      user_id: id, name, username: name.replace(/[^a-z]/g, ""), profile_image: opts.photo, score: opts.score, real_score: opts.live ? opts.score : 0,
      rank: 0, is_live: opts.live, left: false, is_starter: false, home_room_name: null, chat_room_name: null,
      is_virtual: !opts.live, side: opts.side ?? null,
    });
    // Every other virtual member has a photo; the rest show gold initials.
    const photoOf = (i: number) => (i % 2 === 0 ? VCB_PHOTOS[(i / 2) % VCB_PHOTOS.length] : null);
    let rows: Row[];
    // &n=2..24 (Country Battle ROOMS, 2026-11-24): a fake `room` so the rooms screen can be checked without the server —
    // room 1 has ONE live member (its host, with a photo) and starts at n tiles, the rest its fixed virtual players
    // (no photos, each on its own scenery picture, no gift bursts); room 2 is all virtual, 4 tiles, no host. The viewer
    // is room 1's host (is_host), so the "Tiles n ▾" picker works: it changes the tile count right here.
    const demoRooms = { cur: 1, tiles: { 1: Math.max(2, Math.min(24, tiles)), 2: 4 } as Record<number, number> };
    const roomPool = DEMO_NAMES.concat(VCB_ID_NAMES).slice(1, 1 + 23 + 4);
    if (!rival && tiles > 0) {
      rows = [
        { ...row(2100, DEMO_NAMES[0], { live: true, photo: vcbPhoto("/lp/live.jpg"), score: 4200 }), room_no: 1 },
        ...roomPool.map((n, i) => ({
          ...row(2101 + i, n, { live: false, photo: null, score: 2400 - i * 83 }),
          scenery_image: `uploads/scenery/${sideA.toLowerCase().replace(/\s+/g, "-")}_${(i % 24) + 1}.webp`,
          room_no: null,
        })),
      ];
    } else if (!rival) {
      // Whole country: ONE live member, 30 virtual — 23 of them fill the 24 tiles, moving on every ~4 s.
      rows = [
        row(2001, DEMO_NAMES[0], { live: true, photo: vcbPhoto("/lp/live.jpg"), score: 4200 }),
        ...DEMO_NAMES.slice(1, 31).map((n, i) => row(2002 + i, n, { live: false, photo: photoOf(i), score: 1800 - i * 37 })),
      ];
    } else {
      // Country VS Country: Philippines (1 live + 16 virtual, rotating) vs Indonesia (1 live + 9 virtual).
      const a = sideA;
      const b = sideB;
      rows = [
        row(3001, DEMO_NAMES[0], { live: true, photo: vcbPhoto("/lp/live.jpg"), side: a, score: 3900 }),
        ...DEMO_NAMES.slice(1, emptySide ? 4 : 17).map((n, i) => row(3002 + i, n, { live: false, photo: photoOf(i), side: a, score: 1500 - i * 41 })),
      ];
      if (!emptySide) rows.push(
        row(4001, VCB_ID_NAMES[0], { live: true, photo: vcbPhoto("/lp/live2.jpg"), side: b, score: 4400 }),
        ...VCB_ID_NAMES.slice(1, 10).map((n, i) => row(4002 + i, n, { live: false, photo: photoOf(i + 1), side: b, score: 1700 - i * 53 })),
      );
    }
    const state = (): ChbState => {
      // Free BBs from Bingg Bongg arrive in bursts on the virtual tiles: each beat (5 s) about a
      // quarter of them get 50–250 more, so free_score rises and their tiles play the gift.
      const beat = Math.floor((serverNow() - t0) / 5000);
      const freeOf = (id: number) => (tiles > 0 ? 0 : Math.floor((beat + (id % 4)) / 4) * ((id % 5) + 1) * 50);
      const battlers = rows.map((r) => (r.is_virtual
        ? { ...r, score: r.score + freeOf(r.user_id), free_score: r.score + freeOf(r.user_id) }
        : { ...r, free_score: 0 }))
        .sort((x, y) => (y.real_score ?? 0) - (x.real_score ?? 0) || y.score - x.score)
        .map((r, i) => ({ ...r, rank: i + 1 }));
      const roomMode = !rival && tiles > 0;
      const live = roomMode ? (demoRooms.cur === 1 ? [2100] : []) : battlers.filter((r) => !r.is_virtual).map((r) => r.user_id);
      // Room 1: the first (tiles - 1) of the pool; room 2: the last 4 — fixed, never rotating.
      const roomVirtual = !roomMode ? [] : demoRooms.cur === 1
        ? rows.slice(1, demoRooms.tiles[1]).map((r) => r.user_id)
        : rows.slice(rows.length - demoRooms.tiles[2]).map((r) => r.user_id);
      const room: CbRoom | null = roomMode ? {
        no: demoRooms.cur, tiles: demoRooms.tiles[demoRooms.cur], host_user_id: demoRooms.cur === 1 ? 2100 : null,
        real_count: demoRooms.cur === 1 ? 1 : 0, full: false, is_host: demoRooms.cur === 1, min_tiles: 2, max_tiles: 24,
      } : null;
      const roomsList: CbRoomBrief[] = roomMode ? [1, 2].map((no) => ({ no, tiles: demoRooms.tiles[no], real_count: no === 1 ? 1 : 0, full: false })) : [];
      const sideSum = (c: string, real: boolean) => battlers.filter((r) => r.side === c).reduce((n, r) => n + (real ? r.real_score ?? 0 : r.score), 0);
      return {
        contest_id: 0, name: rival ? `${sideA} vs ${sideB} · Tue, Nov 24` : `${sideA} · Tue, Nov 24`, shared: true, phase: "battle",
        server_now: new Date().toISOString(), created_at: opens, starts_at: starts, ends_at: ends, opens_at: opens, phase_ends_at: ends,
        room_name: null, room_open: true, starter: null, max_battlers: null, battler_count: live.length, live_count: live.length,
        spaces_left: null, unlimited: true, can_join_now: true, battlers, live,
        virtual: roomMode ? roomVirtual : rows.filter((r) => r.is_virtual).map((r) => r.user_id), virtual_battle: true,
        room, rooms: roomsList,
        finished: false, tie: false, top3: [], winner: null,
        rival: rival ? {
          a: { country: sideA, flag: emptySide ? "🇳🇵" : "🇵🇭", scenery_image: `uploads/scenery/${sideA.toLowerCase()}_1.webp`, score: sideSum(sideA, false), battlers: 17, real_score: sideSum(sideA, true) },
          b: emptySide
            // Nobody from Bhutan: its free BBs go to the side itself (country_free), 500 every 10 s.
            ? { country: "Bhutan", flag: "🇧🇹", scenery_image: "uploads/scenery/bhutan_2.webp", score: Math.floor(beat / 2) * 500, battlers: 0, real_score: 0, free_score: Math.floor(beat / 2) * 500, country_free: Math.floor(beat / 2) * 500 }
            : { country: "Indonesia", flag: "🇮🇩", score: sideSum("Indonesia", false), battlers: 10, real_score: sideSum("Indonesia", true) },
          winner: null, label: `${sideA} vs ${sideB}`,
        } : null,
        me: { user_id: 0, is_battler: false, is_live: false, left: false, score: null, rank: null, home_room_name: null, can_join: true, join_reason: null, starter_bonus: null },
      };
    };
    return makeSource(t, 0, countryRef, {
      heartbeat: async () => ({ ok: true, data: state() }),
      join: async () => ({ ok: false, reason: "demo", message: t("cb2_go_live_join"), full: false }),
      leave: async () => undefined,
      sendGift: async () => ({ status: false, message: t("cb_off") }),
      ...(!rival && tiles > 0 ? {
        rooms: {
          pick: (no: number) => { demoRooms.cur = no; },
          setTiles: async (_myId: number, n: number) => {
            demoRooms.tiles[demoRooms.cur] = Math.max(2, Math.min(24, n));
            return { ok: true as const, data: state() };
          },
        },
      } : {}),
    }, undefined, () => undefined);
  }, [t, rival, emptySide, sideA, sideB, tiles]);
  return <GridBattleLive source={source} home={null} battlerHint={false} />;
}
