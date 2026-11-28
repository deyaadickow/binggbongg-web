// DEV ONLY (never in a production build): Bingg Bongg Speed Dating without the server, like ?ssdemo=.
//
//   /live/bb-live-145-1?sddemo=host     the host's screen: Match / Pass on each guest; tap them
//   /live/bb-live-145-1?sddemo=1        a viewer's screen: a match burst every few seconds
//   &open=birthday                      the once-only birthday card
//
// It feeds a fake `SpeedDating` (data.multi_live.speed_dating) into the same pieces the live room uses.
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useT } from "../lib/i18n";
import { publishSdView, type SpeedDating } from "../lib/speedDating";
import { SpeedDatingBirthdaySheet, SpeedDatingHeader, SpeedDatingTileLayer } from "./SpeedDating";

const HOST = { user_id: 145, name: "Mark Rivera" };
const GUESTS = [{ user_id: 201, name: "Anna Reyes" }, { user_id: 202, name: "Bea Santos" }, { user_id: 203, name: "Maria Cruz" }];
const COLORS = ["#3b2a07", "#2a1030", "#0f2a33", "#2d1a0a"];

export default function SpeedDatingDemo() {
  const { t } = useT();
  const [search] = useSearchParams();
  const isHost = search.get("sddemo") === "host";
  const [matched, setMatched] = useState<number[]>([]);
  const [passing, setPassing] = useState<number[]>([]);
  const [gone, setGone] = useState<number[]>([]);
  const [bursts, setBursts] = useState<Record<number, number>>({});
  const [chat, setChat] = useState<string[]>([]);
  const [birthday, setBirthday] = useState(search.get("open") === "birthday");

  const match = (uid: number) => {
    const g = GUESTS.find((x) => x.user_id === uid);
    const at = Date.now();
    setMatched((m) => [...m, uid]);
    setBursts((b) => ({ ...b, [uid]: at, [HOST.user_id]: at }));
    setChat((c) => [...c, t("sd_chat_matched", HOST.name, g?.name ?? "")]);
  };
  const pass = (uid: number) => {
    setPassing((p) => [...p, uid]);
    window.setTimeout(() => { setGone((g) => [...g, uid]); setPassing((p) => p.filter((x) => x !== uid)); }, 2000);
  };
  // A viewer's demo: Anna is matched a moment after opening.
  useEffect(() => {
    if (isHost) return;
    const tm = window.setTimeout(() => match(201), 1200);
    return () => window.clearTimeout(tm);
  }, [isHost]); // eslint-disable-line react-hooks/exhaustive-deps

  const sd: SpeedDating = {
    title: "BINGG BONGG SPEED DATING", host_user_id: HOST.user_id, matched_user_ids: matched, match_count: matched.length,
    passing_user_ids: passing, events: [], pass_seconds: 2,
  };
  useEffect(() => {
    publishSdView({ sd, isHost, hostUserId: HOST.user_id, bursts, localPass: [], busy: [], onMatch: match, onPass: pass });
  });
  useEffect(() => () => publishSdView(null), []);

  const tiles = [HOST, ...GUESTS.filter((g) => !gone.includes(g.user_id))];
  return (
    <div className="page" style={{ maxWidth: 560 }}>
      <SpeedDatingHeader matches={matched.length} />
      <div className={`video-grid count-${Math.min(4, tiles.length)}`}>
        {tiles.map((p, i) => (
          <div key={p.user_id} className="tile" data-uid={p.user_id} style={{ background: `linear-gradient(160deg, ${COLORS[i % 4]}, #000)`, display: "grid", placeItems: "center" }}>
            <span style={{ fontSize: 64, opacity: .5 }} aria-hidden>{p.user_id === HOST.user_id ? "🎤" : "🙂"}</span>
            <SpeedDatingTileLayer uid={p.user_id} />
            <span className="name">{p.name}{p.user_id === HOST.user_id ? " · Host" : ""}</span>
          </div>
        ))}
      </div>
      <div className="card" style={{ marginTop: 10, padding: 10, minHeight: 60 }}>
        {chat.length === 0 ? <span className="muted">Chat</span> : chat.map((c, i) => <div key={i}><b>{HOST.name}:</b> {c}</div>)}
      </div>
      {birthday && <SpeedDatingBirthdaySheet onClose={() => setBirthday(false)} onSave={async () => { setBirthday(false); return null; }} />}
    </div>
  );
}
