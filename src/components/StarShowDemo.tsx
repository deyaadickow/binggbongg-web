// DEV ONLY (never in a production build): the star shows without the server, like ?vcbdemo=.
//
//   /live/bb-live-145-1?ssdemo=1          a viewer's phone: rounds of 45 s, an 8 s break, scores rolling
//                                         up, the leader swapping (after the 3 s hold)
//   ?ssdemo=host                          the host's phone (Show button, Remove in the hold menu)
//   &kind=man                             the men's show
//   &open=setup|join|vote|controls|end|hold|report|birthday|menu   open that screen straight away
//
// It feeds a fake `StarShow` (the contract's `data`) into the same components the live room uses.
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Gift } from "../lib/api";
import { useT } from "../lib/i18n";
import type { StarKind, StarLastRound, StarPerson, StarRow, StarShow } from "../lib/starShow";
import { BattleActionBar } from "./BattleActionBar";
import { BattleMenu } from "./BattleEngines";
import { StarBirthdaySheet, StarSetupCard, StarShowRoom, StarVoteSheet, type StarActions } from "./StarShow";

const ROUND_SECS = 45;
const BREAK_SECS = 8;
const ME = 999;
const HOST: StarPerson = { user_id: 145, name: "Mark Rivera", username: "mark", profile_image: null };
const WOMEN = ["Anna Reyes", "Bea Santos", "Maria Cruz", "Carla Lim", "Joy Garcia", "Grace Tan", "Rina Lopez", "Liza Mendoza"];
const MEN = ["Leo Navarro", "Paolo Cruz", "Marco Diaz", "Rafael Lim", "Jon Garcia", "Ben Tan", "Carlo Reyes", "Miguel Santos"];
const START_SCORES = [1250, 980, 640, 310, 120, 0];

const svgGift = (emoji: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><text x="32" y="48" font-size="44" text-anchor="middle">${emoji}</text></svg>`)}`;
const GIFTS: Gift[] = [
  ["Rose", "🌹", 100], ["Bouquet", "💐", 300], ["Crown", "👑", 1000], ["Diamond", "💎", 500],
  ["Heart", "❤️", 10], ["Star", "⭐", 50], ["Bow", "🎀", 200], ["Car", "🚗", 5000],
].map(([name, e, price], i) => ({ id: 900 + i, name: name as string, image: svgGift(e as string), votes: price as number }));

type Sim = { kind: StarKind; round: number; phase: "round" | "break"; left: number; lowest: boolean; stage: (StarPerson & { score: number; joined: number })[]; waiting: StarPerson[]; last: StarLastRound | null; earned: number; next: number };

function person(id: number, name: string): StarPerson { return { user_id: id, name, username: name.split(" ")[0].toLowerCase(), profile_image: null }; }

function initial(kind: StarKind, open: string | null): Sim {
  const names = kind === "man" ? MEN : WOMEN;
  const stage = names.slice(0, 6).map((n, i) => ({ ...person(201 + i, n), score: START_SCORES[i], joined: i }));
  const sim: Sim = { kind, round: 2, phase: "round", left: 221, lowest: true, stage, waiting: [person(330, names[6]), person(331, names[7])], last: null, earned: 333, next: 0 };
  if (open === "end") return finishRound(sim);
  return sim;
}

/** Leader as the server picks it: most BBs; a tie keeps the earlier joiner; nobody yet = first guest. */
function ranked(stage: Sim["stage"]): StarRow[] {
  const sorted = [...stage].sort((a, b) => b.score - a.score || a.joined - b.joined);
  let rank = 0, prev: number | null = null;
  const rankOf = new Map<number, number>();
  sorted.forEach((r, i) => { rank = prev !== null && r.score === prev ? rank : i + 1; prev = r.score; rankOf.set(r.user_id, rank); });
  return stage.map((r) => ({ user_id: r.user_id, name: r.name, username: r.username, profile_image: r.profile_image, score: r.score, joined_order: r.joined, rank: rankOf.get(r.user_id) ?? 1 }));
}

function finishRound(s: Sim): Sim {
  const sorted = [...s.stage].sort((a, b) => b.score - a.score || a.joined - b.joined);
  const top = sorted.filter((r) => r.score > 0);
  const tie = top.length > 1 && top[0].score === top[1].score;
  let stage = s.stage, waiting = s.waiting, left: StarPerson | null = null;
  const joined: StarPerson[] = [];
  if (s.lowest && waiting.length > 0 && stage.length > 0) {
    const low = sorted[sorted.length - 1];
    left = person(low.user_id, low.name);
    const nextIn = waiting[0];
    joined.push(nextIn);
    waiting = [...waiting.slice(1), left];
    stage = [...stage.filter((r) => r.user_id !== low.user_id), { ...nextIn, score: 0, joined: Math.max(...stage.map((r) => r.joined)) + 1 }];
  }
  return {
    ...s, phase: "break", left: 0, stage, waiting, next: BREAK_SECS,
    last: {
      round_no: s.round, tie,
      winner: top[0] && !tie ? { ...person(top[0].user_id, top[0].name), score: top[0].score } : null,
      podium: top.slice(0, 3).map((r) => ({ user_id: r.user_id, name: r.name, score: r.score })),
      left, joined, next_round_in: BREAK_SECS,
    },
  };
}

function toShow(s: Sim, isHost: boolean, confirmed: boolean): StarShow {
  const rows = ranked(s.stage);
  const leader = [...rows].sort((a, b) => b.score - a.score || a.joined_order - b.joined_order)[0];
  return {
    show_id: 12, kind: s.kind, title: s.kind === "man" ? "The Best Looking Guy On Bingg Bongg" : "Bingg Bongg's Most Beautiful Woman",
    room_name: "bb-live-145-1", host_user_id: HOST.user_id, lowest_leaves: s.lowest, round_no: s.phase === "break" ? s.round : s.round,
    round_minutes: 5, phase: s.phase, round_id: 880 + s.round, seconds_left: s.left, max_tiles: 9,
    seats_left: Math.max(0, 8 - s.stage.length), leader_user_id: leader?.user_id ?? null, stage: rows, waiting: s.waiting,
    last_round: s.phase === "break" ? s.last : null,
    my_refusal: isHost ? null : confirmed ? null : "need_confirm",
    host_pay: isHost ? { percent: 10, line: "You earn 10% of every guest's gifts, paid by Bingg Bongg.", earned_bbs: s.earned } : undefined,
  };
}

export default function StarShowDemo() {
  const { t } = useT();
  const [sp] = useSearchParams();
  const isHost = sp.get("ssdemo") === "host";
  const kind: StarKind = sp.get("kind") === "man" ? "man" : "woman";
  const open = sp.get("open");
  const frozen = sp.has("freeze");
  const [sim, setSim] = useState<Sim>(() => initial(kind, open));
  const [confirmed, setConfirmed] = useState(false);
  const [voteFor, setVoteFor] = useState<StarPerson | null>(open === "vote" ? sim.stage[1] : null);
  const [setup, setSetup] = useState(open === "setup");
  const [birthday, setBirthday] = useState(open === "birthday");
  const [menu, setMenu] = useState(open === "menu");
  const [toast, setToast] = useState<string | null>(null);
  const [chat, setChat] = useState<{ who: string; text: string }[]>([
    { who: "Liza", text: "voted for Anna with a ⭐ Star · +50" },
    { who: "Ben", text: "sent Anna a 🌹 Rose · +100" },
    { who: "Carlo", text: "Bea you look amazing" },
    { who: "Rina", text: "sent Bea a 💎 Diamond · +500" },
    { who: "Mark (Host)", text: "3 minutes left in round 2! Tap VOTE 👑" },
  ]);
  const toastTimer = useRef(0);
  const say = (m: string) => { setToast(m); window.clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setToast(null), 2600); };

  // The fake server: a gift lands every 1.5 s, the clock runs, round → break → round.
  useEffect(() => {
    if (frozen) return;
    const iv = window.setInterval(() => {
      setSim((s) => {
        if (s.phase === "break") {
          if (s.next > 1.5) return { ...s, next: s.next - 1.5 };
          return { ...s, phase: "round", round: s.round + 1, left: ROUND_SECS, last: null, stage: s.stage.map((r) => ({ ...r, score: 0 })) };
        }
        const left = Math.max(0, s.left - 1.5);
        if (left <= 0) return finishRound(s);
        // Favour the 2nd and 3rd place so the leader swaps now and then.
        const order = [...s.stage].sort((a, b) => b.score - a.score);
        const pick = Math.random() < 0.6 ? order[1 + Math.floor(Math.random() * Math.min(2, order.length - 1))] : order[Math.floor(Math.random() * order.length)];
        const bbs = [10, 50, 100, 100, 200, 300, 500][Math.floor(Math.random() * 7)];
        return { ...s, left, earned: s.earned + Math.round(bbs / 3), stage: s.stage.map((r) => (r.user_id === pick?.user_id ? { ...r, score: r.score + bbs } : r)) };
      });
    }, 1500);
    return () => window.clearInterval(iv);
  }, [frozen]);

  const show = toShow(sim, isHost, confirmed);
  const actions: StarActions = {
    vote: (p) => setVoteFor(p),
    hostGift: () => setVoteFor(null),
    viewProfile: (p) => say(`(demo) /profile/${p.user_id}`),
    report: async (p, reasonEn) => { say(`${t("sts_reported")} (${reasonEn}, ${p.name})`); },
    request: async () => {
      if (!confirmed) return { reason: "need_confirm", message: null };
      setSim((s) => ({ ...s, waiting: [...s.waiting, person(ME, "You")] }));
      say("Request sent. The host will see it in a moment.");
      return null;
    },
    confirm: async () => { setConfirmed(true); return { ok: true, reason: null, message: null }; },
    next: () => setSim((s) => (s.phase === "round" ? finishRound(s) : s)),
    setLowest: (on) => setSim((s) => ({ ...s, lowest: on })),
    end: () => { say(t("sts_ended")); setSim(initial(kind, null)); },
    remove: (p, ban) => { setSim((s) => ({ ...s, stage: s.stage.filter((r) => r.user_id !== p.user_id) })); say(ban ? "Removed. They can't come back this show." : "Removed from the stage."); },
    needSignIn: () => say("(demo) sign in"),
  };

  return (
    <div className="page" style={{ maxWidth: 480, margin: "0 auto" }}>
      <div className="row" style={{ marginBottom: 8 }}>
        <span style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--gold)", color: "#000", display: "grid", placeItems: "center", fontWeight: 900 }}>M</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800 }}>{HOST.name}{isHost ? " (you)" : ""}</div>
          <div className="muted" style={{ fontSize: 13 }}>👁 1,284 watching · {show.stage.length + 1} on screen</div>
        </div>
        <span className="pill live">● LIVE</span>
      </div>
      <div className="video-grid sts-on">
        <StarShowRoom show={show} host={HOST} myId={isHost ? HOST.user_id : ME} isHost={isHost} signedIn hasBirthday={false}
          tiles={[]} actions={actions} demoOpen={open === "controls" || open === "join" || open === "hold" || open === "report" ? open : null} />
      </div>
      <div className="card chat" style={{ height: "auto", marginTop: 6 }}>
        <div className="log" style={{ padding: "6px 10px", gap: 3, fontSize: 13 }}>
          {chat.slice(-5).map((m, i) => <div key={i}><span className="who">{m.who}: </span><span className="soft">{m.text}</span></div>)}
        </div>
      </div>
      <BattleActionBar className="live-bar" onBattles={() => (isHost ? setMenu(true) : say("(demo) room menu"))} onMessages={() => setChat((c) => [...c, { who: "You", text: "Go Anna! 👑" }])}
        onMt={() => {}} mtOn={false} onFlip={null} joinLabel={isHost ? null : t("ask_to_join")} onJoin={() => { void actions.request(); }}
        onGifts={() => setVoteFor(show.stage[0] ?? null)} onShare={() => {}} />
      {voteFor && (
        <StarVoteSheet name={voteFor.name} gifts={GIFTS} balance={12500} onClose={() => setVoteFor(null)}
          onSend={(g) => {
            const bbs = Number(g.votes ?? 0);
            setSim((s) => ({ ...s, stage: s.stage.map((r) => (r.user_id === voteFor.user_id ? { ...r, score: r.score + bbs } : r)) }));
            setChat((c) => [...c, { who: "You", text: `voted for ${voteFor.name.split(" ")[0]} with a ${g.name} · +${bbs}` }]);
            say(`Sent ${g.name} (${bbs} BBs) to ${voteFor.name}`);
            setVoteFor(null);
          }} />
      )}
      {menu && <BattleMenu peopleOnScreen={show.stage.length + 1} onClose={() => setMenu(false)} onNotice={say} onPick={() => setMenu(false)}
        onStarShow={(k) => { setMenu(false); say(`(demo) ${k}`); setSetup(true); }} />}
      {setup && <StarSetupCard kind={kind} onCancel={() => setSetup(false)} onStart={async (lowest) => { setSetup(false); setSim((s) => ({ ...s, lowest })); say(t("sts_started")); }} />}
      {birthday && <StarBirthdaySheet onClose={() => setBirthday(false)} onSave={async () => { setBirthday(false); say(t("sts_started")); }} />}
      {toast && <div style={{ position: "fixed", left: "50%", bottom: 90, transform: "translateX(-50%)", zIndex: 200, background: "#000", color: "var(--gold)", border: "1.5px solid var(--gold)", borderRadius: 12, padding: "8px 14px", fontWeight: 800, fontSize: 14, maxWidth: "90vw" }}>{toast}</div>}
    </div>
  );
}
