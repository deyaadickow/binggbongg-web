import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  BATTLE_TYPES, addSchedule, deleteSchedule, fetchMyBattleRequests, fetchUserSchedule,
  formatScheduleTime, localInputToUtc, respondToBattleRequest, sendBattleRequest,
  type BattleRequestItem, type ScheduleItem, type ScheduleKind,
} from "../lib/api";

/**
 * "My Live/Battle Schedule" — Steve, 2026-10-06.
 *
 * On your OWN profile: add a live or a battle, see what you have coming up, and answer battle
 * requests from other members. On SOMEONE ELSE'S profile: see what they have coming up and ask
 * them for a battle.
 *
 * Every time shown here is rendered from the server's UTC through toLocaleString, so a member in
 * Manila and a member in Miami each see the same moment in their own clock.
 */
export function ScheduleSection({ profileId, myId }: { profileId: number; myId?: number }) {
  const isMine = myId != null && myId === profileId;

  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [incoming, setIncoming] = useState<BattleRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [kind, setKind] = useState<ScheduleKind>("live");
  const [battleType, setBattleType] = useState<string>(BATTLE_TYPES[0]);
  const [when, setWhen] = useState("");
  const [note, setNote] = useState("");

  const [showRequest, setShowRequest] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchUserSchedule(profileId, myId);
      setItems(rows);
      if (isMine && myId) {
        const { incoming: inc } = await fetchMyBattleRequests(myId);
        setIncoming(inc);
      }
    } catch {
      setNotice("Could not load the schedule.");
    } finally {
      setLoading(false);
    }
  }, [profileId, myId, isMine]);

  useEffect(() => { void reload(); }, [reload]);

  async function submitAdd() {
    if (!myId || !when) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await addSchedule({
        myId, kind, startsAtUtc: localInputToUtc(when),
        battleType: kind === "battle" ? battleType : undefined,
        note: note.trim() || undefined,
      });
      if (res.status === false) { setNotice(res.message ?? "Could not add that."); return; }
      setShowAdd(false); setWhen(""); setNote("");
      await reload();
    } finally { setBusy(false); }
  }

  async function submitRequest() {
    if (!myId || !when) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await sendBattleRequest({
        myId, toUserId: profileId, battleType, startsAtUtc: localInputToUtc(when),
        note: note.trim() || undefined,
      });
      setNotice(res.message ?? (res.status ? "Battle request sent." : "Could not send that."));
      if (res.status !== false) { setShowRequest(false); setWhen(""); setNote(""); }
    } finally { setBusy(false); }
  }

  async function answer(req: BattleRequestItem, accept: boolean) {
    if (!myId) return;
    setBusy(true);
    try {
      const res = await respondToBattleRequest(myId, req.id, accept);
      setNotice(res.message ?? null);
      await reload();
    } finally { setBusy(false); }
  }

  async function remove(item: ScheduleItem) {
    if (!myId) return;
    setBusy(true);
    try { await deleteSchedule(myId, item.id); await reload(); } finally { setBusy(false); }
  }

  function describe(item: ScheduleItem) {
    if (item.kind === "battle") {
      const vs = item.opponent?.fullname ? ` vs ${item.opponent.fullname}` : "";
      return `${item.battle_type ?? "Battle"}${vs}`;
    }
    return "Going live";
  }

  return (
    <section className="card schedule-card">
      <div className="row">
        <h3 className="schedule-title">{isMine ? "My Live/Battle Schedule" : "Schedule"}</h3>
        <span className="spacer" />
        <Link to="/upcoming" className="btn small ghost">What's on</Link>
        {isMine && (
          <button className="btn small" onClick={() => { setShowAdd((v) => !v); setShowRequest(false); }}>
            {showAdd ? "Cancel" : "Add"}
          </button>
        )}
        {!isMine && myId != null && (
          <button className="btn small" onClick={() => { setShowRequest((v) => !v); setShowAdd(false); }}>
            {showRequest ? "Cancel" : "Request a battle"}
          </button>
        )}
      </div>

      {notice && <div className="gift-notice">{notice}</div>}

      {(showAdd || showRequest) && (
        <div className="schedule-form">
          {showAdd && (
            <div className="row">
              <label><input type="radio" checked={kind === "live"} onChange={() => setKind("live")} /> Live</label>
              <label><input type="radio" checked={kind === "battle"} onChange={() => setKind("battle")} /> Battle</label>
            </div>
          )}
          {(showRequest || kind === "battle") && (
            <label className="schedule-field">
              <span>Battle type</span>
              <select value={battleType} onChange={(e) => setBattleType(e.target.value)}>
                {BATTLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          )}
          <label className="schedule-field">
            <span>When (your time)</span>
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </label>
          <label className="schedule-field">
            <span>Note (optional)</span>
            <input type="text" maxLength={191} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="What are you doing?" />
          </label>
          <button className="btn" disabled={busy || !when}
            onClick={() => (showAdd ? void submitAdd() : void submitRequest())}>
            {showAdd ? "Add to my schedule" : "Send request"}
          </button>
        </div>
      )}

      {isMine && incoming.length > 0 && (
        <div className="schedule-requests">
          <h4>Battle requests</h4>
          {incoming.map((req) => (
            <div key={req.id} className="schedule-row">
              <div>
                <b>{req.from_user?.fullname ?? "A member"}</b>
                <div className="muted">{req.battle_type} · {formatScheduleTime(req.starts_at)}</div>
                {req.note && <div className="muted">{req.note}</div>}
              </div>
              <span className="spacer" />
              <button className="btn small" disabled={busy} onClick={() => void answer(req, true)}>Accept</button>
              <button className="btn small ghost" disabled={busy} onClick={() => void answer(req, false)}>Deny</button>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="muted">Loading…</div>
      ) : items.length === 0 ? (
        <div className="muted">
          {isMine ? "Nothing scheduled yet. Add a live or a battle so your followers can plan to join."
                  : "Nothing scheduled right now."}
        </div>
      ) : (
        items.map((item) => (
          <div key={item.id} className="schedule-row">
            <div>
              <b>{describe(item)}</b>
              <div className="muted">{formatScheduleTime(item.starts_at)}</div>
              {item.note && <div className="muted">{item.note}</div>}
            </div>
            <span className="spacer" />
            {isMine && (
              <button className="btn small ghost" disabled={busy} onClick={() => void remove(item)}>Remove</button>
            )}
          </div>
        ))
      )}
    </section>
  );
}
