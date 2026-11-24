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
// /country-battle/live/0?vcbdemo=1|rival     DEV ONLY (never in a production build): Virtual Country
//                                           Battles on a fake state — whole country (1 live + 30
//                                           virtual) or Country VS Country (two halves).
import { useMemo, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useT } from "../lib/i18n";
import { GridBattleLive, type GridBattleSource } from "../components/GridBattleScreen";
import {
  cbReasonText, cbText, clock, countryBattleDayHeartbeat, countryBattlePath, countryGiftInfo, dayAsBattleState, joinCountryBattleDay,
  leaveCountryBattleDay, localTime, sendCountryBattleDayGift, serverNow,
} from "../lib/countryBattle";
import type { ChbBattler, ChbState } from "../lib/chatBattle";
import { ShareResultButton } from "../components/CountryBoardBits";
import { RivalBar } from "../components/RivalBar";

type T = ReturnType<typeof useT>["t"];

export function CountryBattleLivePage() {
  const { dayId } = useParams();
  const [sp] = useSearchParams();
  const demo = sp.get("demo");
  // Virtual Country Battles demo: compiled out of the production build (import.meta.env.DEV is false there).
  const vcbDemo = import.meta.env.DEV ? sp.get("vcbdemo") : null;
  if (vcbDemo) return <VirtualCbDemo key={vcbDemo} rival={vcbDemo === "rival"} />;
  if (demo) {
    return <CountryBattleDemo key={sp.toString()} n={demo === "0" ? 0 : Number(demo) || 24} withOwn={sp.get("own") !== "0"}
      phase={(sp.get("phase") as ChbState["phase"]) || "battle"} imgBase={sp.get("img")} recapDemo={sp.get("reason") ?? ""} />;
  }
  // ?side= — a Rival Battle's country to fight for; a new side means a fresh screen that joins for it.
  const side = sp.get("side");
  return <CountryBattleLive key={`${dayId}-${side ?? ""}`} dayId={Number(dayId)} home={Number(sp.get("home")) || null}
    battlerHint={sp.get("battler") === "1"} autoJoin={sp.get("join") === "1"} side={side} />;
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
function makeSource(t: T, dayId: number, countryRef: { current: string }, calls: Pick<GridBattleSource, "heartbeat" | "join" | "leave" | "sendGift">, recapDemo?: string, onRivalJoin?: (country: string) => void): GridBattleSource {
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
  const source = useMemo(() => makeSource(t, dayId, countryRef, {
    heartbeat: async (userId, live) => {
      const r = await countryBattleDayHeartbeat(userId, dayId, live);
      if (!r.ok) return r;
      countryRef.current = r.data.country;
      return { ok: true, data: dayAsBattleState(r.data) };
    },
    join: async (userId) => {
      const r = await joinCountryBattleDay(userId, dayId, side);
      if (!r.ok) return r;
      return { ok: true, data: { state: r.data.state ? dayAsBattleState(r.data.state) : null } };
    },
    leave: (userId) => leaveCountryBattleDay(userId, dayId),
    sendGift: (i) => sendCountryBattleDayGift({ ...i, dayId }),
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

function VirtualCbDemo({ rival }: { rival: boolean }) {
  const { t } = useT();
  const countryRef = useRef(rival ? "Philippines vs Indonesia" : "Philippines");
  const source = useMemo(() => {
    const t0 = serverNow();
    const opens = new Date(t0 - 7 * 60_000).toISOString();
    const starts = new Date(t0 - 2 * 60_000).toISOString();
    const ends = new Date(t0 + 3 * 60_000).toISOString();
    type Row = ChbBattler;
    const row = (id: number, name: string, opts: { live: boolean; photo: string | null; side?: string; score: number }): Row => ({
      user_id: id, name, username: name.replace(/[^a-z]/g, ""), profile_image: opts.photo, score: opts.score, real_score: opts.live ? opts.score : 0,
      rank: 0, is_live: opts.live, left: false, is_starter: false, home_room_name: null, chat_room_name: null,
      is_virtual: !opts.live, side: opts.side ?? null,
    });
    // Every other virtual member has a photo; the rest show gold initials.
    const photoOf = (i: number) => (i % 2 === 0 ? VCB_PHOTOS[(i / 2) % VCB_PHOTOS.length] : null);
    let rows: Row[];
    if (!rival) {
      // Whole country: ONE live member, 30 virtual — 23 of them fill the 24 tiles, moving on every ~4 s.
      rows = [
        row(2001, DEMO_NAMES[0], { live: true, photo: vcbPhoto("/lp/live.jpg"), score: 4200 }),
        ...DEMO_NAMES.slice(1, 31).map((n, i) => row(2002 + i, n, { live: false, photo: photoOf(i), score: 1800 - i * 37 })),
      ];
    } else {
      // Country VS Country: Philippines (1 live + 16 virtual, rotating) vs Indonesia (1 live + 9 virtual).
      const a = "Philippines";
      const b = "Indonesia";
      rows = [
        row(3001, DEMO_NAMES[0], { live: true, photo: vcbPhoto("/lp/live.jpg"), side: a, score: 3900 }),
        ...DEMO_NAMES.slice(1, 17).map((n, i) => row(3002 + i, n, { live: false, photo: photoOf(i), side: a, score: 1500 - i * 41 })),
        row(4001, VCB_ID_NAMES[0], { live: true, photo: vcbPhoto("/lp/live2.jpg"), side: b, score: 4400 }),
        ...VCB_ID_NAMES.slice(1, 10).map((n, i) => row(4002 + i, n, { live: false, photo: photoOf(i + 1), side: b, score: 1700 - i * 53 })),
      ];
    }
    const state = (): ChbState => {
      // Free BBs arrive in bursts on the virtual tiles (here: a little more each beat).
      const beat = Math.floor((serverNow() - t0) / 5000);
      const battlers = rows.map((r) => (r.is_virtual ? { ...r, score: r.score + beat * ((r.user_id % 5) + 1) * 10 } : r))
        .sort((x, y) => (y.real_score ?? 0) - (x.real_score ?? 0) || y.score - x.score)
        .map((r, i) => ({ ...r, rank: i + 1 }));
      const live = battlers.filter((r) => !r.is_virtual).map((r) => r.user_id);
      const sideSum = (c: string, real: boolean) => battlers.filter((r) => r.side === c).reduce((n, r) => n + (real ? r.real_score ?? 0 : r.score), 0);
      return {
        contest_id: 0, name: rival ? "Philippines vs Indonesia · Tue, Nov 24" : "Philippines · Tue, Nov 24", shared: true, phase: "battle",
        server_now: new Date().toISOString(), created_at: opens, starts_at: starts, ends_at: ends, opens_at: opens, phase_ends_at: ends,
        room_name: null, room_open: true, starter: null, max_battlers: null, battler_count: live.length, live_count: live.length,
        spaces_left: null, unlimited: true, can_join_now: true, battlers, live,
        virtual: rows.filter((r) => r.is_virtual).map((r) => r.user_id), virtual_battle: true,
        finished: false, tie: false, top3: [], winner: null,
        rival: rival ? {
          a: { country: "Philippines", flag: "🇵🇭", score: sideSum("Philippines", false), battlers: 17, real_score: sideSum("Philippines", true) },
          b: { country: "Indonesia", flag: "🇮🇩", score: sideSum("Indonesia", false), battlers: 10, real_score: sideSum("Indonesia", true) },
          winner: null, label: "Philippines vs Indonesia",
        } : null,
        me: { user_id: 0, is_battler: false, is_live: false, left: false, score: null, rank: null, home_room_name: null, can_join: true, join_reason: null, starter_bonus: null },
      };
    };
    return makeSource(t, 0, countryRef, {
      heartbeat: async () => ({ ok: true, data: state() }),
      join: async () => ({ ok: false, reason: "demo", message: t("cb2_go_live_join"), full: false }),
      leave: async () => undefined,
      sendGift: async () => ({ status: false, message: t("cb_off") }),
    });
  }, [t, rival]);
  return <GridBattleLive source={source} home={null} battlerHint={false} />;
}
