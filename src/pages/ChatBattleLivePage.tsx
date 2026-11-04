// The Chat Battle screen (#9, was "Solo Battle With Unlimited Players"; Steve, 2026-11-03):
// "I want it to be the same as country battle with up to 24 tiles changing on the host's screen,
// Every one that is battling will have a host screen exactly the same as country battle."
//
// Built from the Country Battle pieces (CountryBattleGrid, useRotation, useStarPins,
// useCountryBattleRoom, GiftSheet), plus what Chat Battle adds: the in-screen Join, the home tile
// a viewer followed in, the leaderboard's 30-second spotlight, the battler's own viewers' chat
// under the tiles, and the end podium with the way back to a normal live.
//
// /chat-battle/:contestId              watch (viewer, no home tile)
// /chat-battle/:contestId?home=303     a viewer who followed battler 303 in: 303 pinned top-left
// /chat-battle/:contestId?battler=1    this browser just started / joined: publish camera + mic
// /chat-battle/0?demo=24|12|6          the screen with fake battlers and no LiveKit or server, for
//                                      the explainer video. &own=0 = a viewer's screen (home tile
//                                      instead of own); &end=1 = the podium; &img=/path/ photos.
import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useT } from "../lib/i18n";
import { showGoldAlert } from "../components/GoldToast";
import { SoloBattleStandingsSheet } from "../components/SoloBattle";
import { CbHeader, CountryBattleGrid, StarredYouBar, heardIds } from "../components/BattleGrid";
import { CHAT_RESERVE, ChatStrip, GridBattleEnd, GridBattleLive, SPOTLIGHT_MS, nameOf, useGridBattleTiles, type GridBattleSource } from "../components/GridBattleScreen";
import { cbText, clock, useTick } from "../lib/countryBattle";
import { type ChatMessage } from "../lib/firebase";
import { sfx } from "../lib/gameSounds";
import {
  chatBattleHeartbeat, chatReasonText, joinChatBattle, leaveChatBattle, sendChatBattleGift,
  type ChbBattler, type ChbGiftInfo, type ChbState,
} from "../lib/chatBattle";

// ---- the page --------------------------------------------------------------------------------

export function ChatBattleLivePage() {
  const { contestId } = useParams();
  const [sp] = useSearchParams();
  const demo = sp.get("demo");
  if (demo) return <ChatBattleDemo n={Number(demo) || 24} withOwn={sp.get("own") !== "0"} showEnd={sp.get("end") === "1"} imgBase={sp.get("img")} />;
  const home = Number(sp.get("home")) || null;
  return <ChatBattleLive key={contestId} contestId={Number(contestId)} home={home} battlerHint={sp.get("battler") === "1"} />;
}

/** Chat Battle's side of the shared screen: its calls and its texts. */
function ChatBattleLive({ contestId, home, battlerHint }: { contestId: number; home: number | null; battlerHint: boolean }) {
  const { t } = useT();
  const source = useMemo<GridBattleSource>(() => ({
    kind: "chat",
    id: contestId,
    title: t("chb_title"),
    heartbeat: (userId, live) => chatBattleHeartbeat(userId, contestId, live),
    join: async (userId) => {
      const r = await joinChatBattle(userId, contestId);
      if (!r.ok) return r;
      // shared:false would be the old own-room flow — never offered on this screen.
      if (!r.data.shared) return { ok: false, reason: "", message: "", full: false };
      return { ok: true, data: { state: r.data.chat_battle ?? null } };
    },
    leave: (userId) => leaveChatBattle(userId, contestId),
    sendGift: (i) => sendChatBattleGift({ ...i, contestId }),
    giftInfo: (res) => (res.status && res.chat_battle_gift && typeof res.chat_battle_gift === "object" ? res.chat_battle_gift as ChbGiftInfo : null),
    reasonText: (reason, message) => chatReasonText(t, reason, message),
    phaseLines: (st, now) => {
      if (st.phase === "ended") return { sub: "", line: t("chb_ended") };
      const target = st.phase_ends_at ? Date.parse(st.phase_ends_at) : NaN;
      const left = Number.isNaN(target) ? "" : clock(target - now);
      if (st.phase === "joining") return { sub: t("chb_gifts_start_in"), line: left };
      return { sub: t("chb_battle_on"), line: left ? cbText(t("cb_time_left"), { time: left }) : "" };
    },
    joinLabel: (st, now) => (st.phase === "joining" && st.phase_ends_at
      ? cbText(t("chb_join_in"), { time: clock(Date.parse(st.phase_ends_at) - now) })
      : t("cb_join")),
    emptyText: () => t("chb_waiting"),
    leaveConfirm: t("chb_leave_confirm"),
    goneReasons: ["not_found"],
    goneText: () => t("chb_over"),
    isThis: (r) => r.chat_battle_contest_id === contestId,
    fallbackPath: "/live",
  }), [contestId, t]);
  return <GridBattleLive source={source} home={home} battlerHint={battlerHint} />;
}

// ---- the demo (explainer video, and the 360-px check) ---------------------------------------

const DEMO_NAMES = [
  "maria santos", "juan dela cruz", "angel reyes", "mark bautista", "joy villanueva", "paolo garcia",
  "kristine mendoza", "jericho ramos", "liza fernandez", "carlo aquino", "bea castillo", "miguel torres",
  "nicole gonzales", "rafael navarro", "jasmine cruz", "enzo salazar", "trisha domingo", "kevin morales",
  "andrea lim", "gabriel tan", "camille flores", "joshua rivera", "sofia del rosario", "daniel lopez",
  "ella marquez", "renz pascual", "hannah ocampo", "lance santiago", "mika valdez", "ivan soriano",
];
const DEMO_CHAT = [
  ["joy villanueva", "go maria!! 🔥"], ["paolo garcia", "sending roses 🌹"], ["bea castillo", "from Cebu 👋"],
  ["kevin morales", "you got this"], ["andrea lim", "the gift box is on every tile 😍"],
];

function ChatBattleDemo({ n, withOwn, showEnd, imgBase }: { n: number; withOwn: boolean; showEnd: boolean; imgBase: string | null }) {
  const { t } = useT();
  const navigate = useNavigate();
  const now = useTick();
  const count = Math.max(1, Math.min(n, DEMO_NAMES.length));
  // More battlers than tiles at 24, so the rotation has someone to bring in.
  const total = count >= 24 ? DEMO_NAMES.length : count;
  const battlers = useMemo<ChbBattler[]>(() => DEMO_NAMES.slice(0, total).map((name, i) => ({
    user_id: 1001 + i, name, username: name.replace(/\s+/g, ""), profile_image: imgBase ? `${imgBase.replace(/\/?$/, "/")}${i + 1}.jpg` : null,
    score: Math.max(0, 4200 - i * 170 - (i % 3) * 40), rank: i + 1, is_live: true, left: false, is_starter: i === 0,
    home_room_name: null, chat_room_name: null,
  })), [total, imgBase]);
  const live = useMemo(() => battlers.map((b) => b.user_id), [battlers]);
  const [giftTarget, setGiftTarget] = useState<number | null>(null);
  const [spot, setSpot] = useState<number | null>(null);
  const [listen, setListen] = useState<number | null>(null);
  const [boardOpen, setBoardOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(showEnd);
  const grid = useGridBattleTiles({
    battlers, live, publishers: [], myId: withOwn ? 1001 : 0, isBattler: withOwn, home: withOwn ? null : 1001,
    giftTarget, spot, onPinFull: () => showGoldAlert(t("chb_pin_max")),
  });
  // One member who starred you, so the "talk back" banner is on camera; on a viewer's screen the
  // host (1001) has two stars, so the viewer hears three.
  const demoStarredMe = withOwn && grid.shown.length > 2 ? [grid.shown[2]].filter((id) => !grid.star.pins.includes(id)) : [];
  const demoHomeStars = withOwn ? [] : grid.shown.slice(0, 2);
  const demoHeard = heardIds({ isBattler: withOwn, pins: grid.star.pins, home: withOwn ? null : 1001, homeStars: demoHomeStars, spot, listen });
  const demoTiles = grid.tiles.map((x) => (demoStarredMe.includes(x.userId) ? { ...x, starredMe: true } : x));
  const left = 227 - (Math.floor(now / 1000) % 227);
  const messages: ChatMessage[] = DEMO_CHAT.map(([who, msg], i) => ({ id: `d${i}`, senderUserId: 2000 + i, senderName: who, message: msg, sentAt: i }));
  const fakeState: ChbState = {
    contest_id: 0, name: "Maria's Chat Battle", shared: true, phase: endOpen ? "ended" : "battle",
    server_now: "", created_at: "", starts_at: "", ends_at: "", phase_ends_at: null, room_name: null, room_open: true,
    starter: battlers[0], max_battlers: null, battler_count: total, live_count: total, spaces_left: null, unlimited: true, can_join_now: false,
    battlers, live, winner: { ...battlers[0], score: battlers[0].score }, tie: false, finished: endOpen,
    me: { user_id: 1001, is_battler: withOwn, is_live: withOwn, left: false, score: withOwn ? battlers[0].score : null, rank: 1, home_room_name: null, can_join: false, join_reason: null },
  };
  return (
    <div className="page cb-page" style={{ paddingTop: 10 }}>
      <CbHeader title={t("chb_title")} stage={fakeState.name} sub={t("chb_battle_on")}
        line={cbText(t("cb_time_left"), { time: clock(left * 1000) })}
        liveCount={total}
        scoreText={withOwn ? cbText(t("chb_my_score"), { n: battlers[0].score.toLocaleString() }) : null}
        onBack={() => navigate("/battles")}
        actions={<>
          <button className="btn small ghost" onClick={() => setBoardOpen(true)}>🏆 {t("leaderboard")}</button>
          {!withOwn && <button className="btn small" onClick={() => undefined}>{cbText(t("chb_join_in"), { time: "1:42" })}</button>}
        </>} />
      <StarredYouBar ids={demoStarredMe} nameOf={(id) => nameOf(grid.byId.get(id))} onStarBack={(id) => grid.star.toggle(id)} />
      <CountryBattleGrid stage={grid.stage} tiles={demoTiles} listen={demoHeard} reserve={CHAT_RESERVE} phoneFullWidth
        onTap={(id) => {
          if (withOwn) grid.star.toggle(id);
          else if (id !== 1001) setListen((cur) => (cur === id ? null : id));
        }}
        onGift={(id) => { setGiftTarget(id); setTimeout(() => setGiftTarget(null), 4000); }} />
      <ChatStrip messages={messages} onSend={() => undefined} />
      {boardOpen && (
        <SoloBattleStandingsSheet battle={{ id: 0, name: fakeState.name }} myUserId={null} onClose={() => setBoardOpen(false)}
          rows={battlers.map((b) => ({ user_id: b.user_id, label: nameOf(b), score: b.score, profile_image: b.profile_image }))}
          finished={false} footer={t("chb_tap_spotlight")}
          onPick={(r) => {
            const id = Number(r.user_id);
            setBoardOpen(false);
            setSpot(id); sfx.reveal();
            setTimeout(() => setSpot((s) => (s === id ? null : s)), SPOTLIGHT_MS);
          }} />
      )}
      {endOpen && <GridBattleEnd st={fakeState} note={withOwn ? t("chb_back_to_live") : cbText(t("chb_following"), { name: battlers[0].name ?? "" })} onClose={() => setEndOpen(false)} />}
    </div>
  );
}
