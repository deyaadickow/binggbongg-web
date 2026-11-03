// The Country Battle screen, v2 (Steve, 2026-11-03): "one 10 minutes country battle once a day
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
import { useMemo, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useT } from "../lib/i18n";
import { GridBattleLive, type GridBattleSource } from "../components/GridBattleScreen";
import {
  cbReasonText, cbText, clock, countryBattleDayHeartbeat, countryGiftInfo, dayAsBattleState, joinCountryBattleDay,
  leaveCountryBattleDay, localTime, sendCountryBattleDayGift, serverNow,
} from "../lib/countryBattle";
import type { ChbBattler, ChbState } from "../lib/chatBattle";

type T = ReturnType<typeof useT>["t"];

export function CountryBattleLivePage() {
  const { dayId } = useParams();
  const [sp] = useSearchParams();
  const demo = sp.get("demo");
  if (demo) {
    return <CountryBattleDemo key={sp.toString()} n={Number(demo) || 24} withOwn={sp.get("own") !== "0"}
      phase={(sp.get("phase") as ChbState["phase"]) || "battle"} imgBase={sp.get("img")} />;
  }
  return <CountryBattleLive key={dayId} dayId={Number(dayId)} home={Number(sp.get("home")) || null}
    battlerHint={sp.get("battler") === "1"} autoJoin={sp.get("join") === "1"} />;
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
function makeSource(t: T, dayId: number, countryRef: { current: string }, calls: Pick<GridBattleSource, "heartbeat" | "join" | "leave" | "sendGift">): GridBattleSource {
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
      : t("cb_waiting")),
    leaveConfirm: t("cb2_leave_confirm"),
    goneReasons: ["not_found", "off"],
    goneText: (reason) => (reason === "off" ? t("cb_off") : t("cb2_over")),
    isThis: (r) => r.country_battle_day_id === dayId,
    noTie: true,
    fallbackPath: "/country-battle",
  };
}

function CountryBattleLive({ dayId, home, battlerHint, autoJoin }: { dayId: number; home: number | null; battlerHint: boolean; autoJoin: boolean }) {
  const { t } = useT();
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
      const r = await joinCountryBattleDay(userId, dayId);
      if (!r.ok) return r;
      return { ok: true, data: { state: r.data.state ? dayAsBattleState(r.data.state) : null } };
    },
    leave: (userId) => leaveCountryBattleDay(userId, dayId),
    sendGift: (i) => sendCountryBattleDayGift({ ...i, dayId }),
  }), [t, dayId]);
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
function CountryBattleDemo({ n, withOwn, phase, imgBase }: { n: number; withOwn: boolean; phase: ChbState["phase"]; imgBase: string | null }) {
  const { t } = useT();
  const countryRef = useRef("Philippines");
  const source = useMemo(() => {
    const count = Math.max(1, Math.min(n, DEMO_NAMES.length));
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
      room_name: null, room_open: phase !== "upcoming", starter: null, max_battlers: 50, battler_count: total, live_count: battlers.length,
      spaces_left: Math.max(0, 50 - battlers.length), can_join_now: phase === "joining" || phase === "battle",
      battlers, live: battlers.map((b) => b.user_id), finished: phase === "ended", tie: false, top3, winner: top3[0] ?? null,
      me: {
        user_id: withOwn ? 1001 : 0, is_battler: withOwn && phase !== "upcoming", is_live: withOwn && phase !== "upcoming", left: false,
        score: withOwn ? battlers[0]?.score ?? 0 : null, rank: withOwn ? 1 : null, home_room_name: null,
        can_join: !withOwn && (phase === "joining" || phase === "battle"), join_reason: withOwn ? "already_in" : null, starter_bonus: null,
      },
    });
    return makeSource(t, 0, countryRef, {
      heartbeat: async () => ({ ok: true, data: state() }),
      join: async () => ({ ok: false, reason: "full", message: "", full: true }),
      leave: async () => undefined,
      sendGift: async () => ({ status: false, message: t("cb2_full") }),
    });
  }, [t, n, withOwn, phase, imgBase]);
  return <GridBattleLive source={source} home={withOwn ? null : 1001} battlerHint={withOwn} demoUserId={withOwn ? 1001 : undefined} />;
}
