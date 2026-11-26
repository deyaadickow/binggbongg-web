// /singing-contest — the monthly Bingg Bongg Singing Contest (Steve, 2026-11-26). Black page, gold text and gold
// borders only. Built straight from the contract: header + countdown, explainer video, rules, the Record button
// (or why not), my entry, the leaderboard (Vote = the normal gift sheet on that post, sendCoinsToPost), and last
// month's winners. Recording itself happens on Go Live (?singing=1) and in the host's live room.
//
// Never show the base / total payout numbers. The only percentages here are the top-3 extras.
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSession } from "../lib/session";
import { useT } from "../lib/i18n";
import { PageTitle } from "../components/PageTitle";
import { Avatar, Loading, Notice } from "../components/Common";
import { GiftSheet } from "../components/GiftSheet";
import { displayName, mediaUrl, type Post, type UserSummary } from "../lib/api";
import { deleteSingingContestEntry, dhm, fetchSingingContest, scDemo, type ScContest, type ScEntry } from "../lib/singingContest";

const GOLD = "#F0C420";
const box: CSSProperties = { background: "#000", border: `2px solid ${GOLD}`, borderRadius: 16, padding: 14, color: GOLD, marginTop: 14 };

function Thumb({ e, size = 64, onOpen }: { e: ScEntry; size?: number; onOpen: () => void }) {
  return (
    <button onClick={onOpen} aria-label="Play" style={{ width: size, height: Math.round(size * 1.33), flexShrink: 0, padding: 0, borderRadius: 10,
      border: `1px solid ${GOLD}`, background: "#000", overflow: "hidden", cursor: "pointer", display: "grid", placeItems: "center", color: GOLD, fontSize: 22 }}>
      {e.thumbnail_url ? <img src={mediaUrl(e.thumbnail_url)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "🎤"}
    </button>
  );
}

export function SingingContestPage() {
  const { t } = useT();
  const { user, isLoggedIn } = useSession();
  const navigate = useNavigate();
  const demo = scDemo();
  const myId = user?.id ?? (demo ? 99001 : 0);
  const [data, setData] = useState<ScContest | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [voteFor, setVoteFor] = useState<ScEntry | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!myId) return;
    try {
      const r = await fetchSingingContest(myId);
      if (!r.status) { setError(r.message ?? t("try_again")); setData(null); return; }
      setError(null);
      setData(r);
      const rd = r.round;
      setLeft(rd ? (rd.status === "upcoming" ? rd.seconds_to_start : rd.seconds_left) : 0);
    } catch (e) { setError((e as Error).message); setData(null); }
  }, [myId, t]);

  useEffect(() => { load(); }, [load]);
  // Countdown ticks locally; a recording still being made re-checks every 15 s.
  useEffect(() => { const id = window.setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000); return () => clearInterval(id); }, []);
  const processing = data?.me?.recording?.status === "processing" || data?.me?.recording?.status === "pending" || data?.me?.recording?.status === "recording";
  useEffect(() => { if (!processing) return; const id = window.setInterval(load, 15000); return () => clearInterval(id); }, [processing, load]);

  const open = (e: ScEntry) => navigate(`/video/${e.post_id}`);

  async function del(e: ScEntry) {
    if (!window.confirm(t("sc_delete_confirm"))) return;
    setBusy(true);
    try {
      const r = await deleteSingingContestEntry(myId, e.entry_id);
      if (!r.status) throw new Error(r.message ?? t("try_again"));
      await load();
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  const page = (body: React.ReactNode) => (
    <div className="page" style={{ maxWidth: 640, background: "#000", color: GOLD, borderRadius: 18, paddingBottom: 40 }}>
      <PageTitle>{t("sc_title")}</PageTitle>
      {body}
    </div>
  );

  if (!isLoggedIn && !demo) return page(<Notice><Link to="/login" state={{ from: "/singing-contest" }}>{t("sign_in")}</Link></Notice>);
  if (data === undefined) return page(<Loading />);
  if (data === null) return page(<><Notice error>{error}</Notice><button className="btn" style={{ marginTop: 12 }} onClick={load}>{t("try_again")}</button></>);
  if (!data.enabled) return page(<div style={box}>{t("sc_off")}</div>);

  const round = data.round;
  const me = data.me;
  const rec = me?.recording;
  const extras = data.rules?.extras ?? [];
  const placeKey = (p: number) => (p === 1 ? "sc_place_1" : p === 2 ? "sc_place_2" : "sc_place_3") as "sc_place_1";
  const name = (e: ScEntry) => displayName(e.user as Partial<UserSummary>);

  return page(
    <>
      {/* Header + countdown */}
      <div style={{ ...box, textAlign: "center" }}>
        <div style={{ fontSize: 22, fontWeight: 900 }}>🎤 {round?.label ?? ""}</div>
        {round && (
          <div style={{ marginTop: 8, fontSize: 20, fontWeight: 900 }}>
            {round.status === "upcoming" ? t("sc_starts_in", dhm(left)) : round.status === "active" ? t("sc_ends_in", dhm(left)) : t("sc_ended")}
          </div>
        )}
        {round && round.status !== "upcoming" && <div style={{ marginTop: 4, fontSize: 13 }}>{t("sc_counts", round.entries_count.toLocaleString(), round.votes_total.toLocaleString())}</div>}
      </div>

      {/* Explainer video (already in the member's language); hidden when there is none. */}
      {data.video?.url && (
        <div style={{ ...box, padding: 0, overflow: "hidden" }}>
          <video src={mediaUrl(data.video.url)} poster={data.video.poster ? mediaUrl(data.video.poster) : undefined} controls playsInline preload="metadata"
            style={{ display: "block", width: "100%", maxHeight: 420, background: "#000" }} />
        </div>
      )}

      {/* Rules */}
      <div style={box}>
        <div style={{ fontWeight: 900, fontSize: 17, marginBottom: 6 }}>{t("sc_rules")}</div>
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.5 }}>
          {(["sc_rule_1", "sc_rule_2", "sc_rule_3", "sc_rule_4", "sc_rule_5", "sc_brag_rule", "sc_rule_6"] as const).map((k) => <li key={k}>{t(k)}</li>)}
        </ul>
      </div>

      {/* Record, or why not; a recording still being made / one that failed. */}
      {rec && (rec.status === "processing" || rec.status === "pending" || rec.status === "recording") ? (
        <div style={{ ...box, textAlign: "center", fontWeight: 800 }}>{t("sc_processing")}</div>
      ) : rec && rec.status === "failed" && rec.reason_text ? (
        <div style={{ ...box, textAlign: "center", fontWeight: 700 }}>{rec.reason_text}</div>
      ) : null}
      {me?.can_record ? (
        <button onClick={() => setConfirmOpen(true)} style={{ ...box, width: "100%", minHeight: 60, fontSize: 19, fontWeight: 900, cursor: "pointer",
          background: "linear-gradient(180deg, #2a1a00 0%, #120b00 60%, #000 100%)", boxShadow: "0 0 14px rgba(240,196,32,.25)" }}>
          🎤 {t("sc_record")}
        </button>
      ) : me?.reason_text && !(rec && rec.status === "processing") ? (
        <div style={{ ...box, textAlign: "center", fontWeight: 700 }}>{me.reason_text}</div>
      ) : null}
      {error && <div style={{ marginTop: 12 }}><Notice error>{error}</Notice></div>}

      {/* My entry */}
      {me?.entry && (
        <div style={box}>
          <div style={{ fontWeight: 900, fontSize: 17, marginBottom: 8 }}>{t("sc_my_entry")}</div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Thumb e={me.entry} size={72} onOpen={() => open(me.entry!)} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{t("sc_rank", me.entry.rank)}</div>
              <div style={{ fontWeight: 700 }}>{t("sc_votes", me.entry.votes.toLocaleString())}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button className="btn small" onClick={() => open(me.entry!)}>{t("sc_watch")}</button>
              <button className="btn small" style={{ background: "#000", borderColor: GOLD, color: GOLD }} disabled={busy} onClick={() => del(me.entry!)}>{t("delete")}</button>
            </div>
          </div>
        </div>
      )}

      {/* Leaderboard */}
      {round && round.status !== "upcoming" && (
        <div style={box}>
          <div style={{ fontWeight: 900, fontSize: 17, marginBottom: 6 }}>{t("sc_leaderboard")}</div>
          {(data.entries ?? []).length === 0 && <div style={{ padding: "8px 0" }}>{t("sc_no_entries")}</div>}
          {(data.entries ?? []).map((e) => (
            <div key={e.entry_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: `1px solid rgba(240,196,32,.35)` }}>
              <div style={{ width: 34, textAlign: "center", fontWeight: 900, fontSize: e.rank <= 3 ? 20 : 16 }}>{e.rank <= 3 ? ["🥇", "🥈", "🥉"][e.rank - 1] : `#${e.rank}`}</div>
              <Thumb e={e} size={46} onOpen={() => open(e)} />
              <Link to={`/profile/${e.user.user_id}`} style={{ flexShrink: 0 }}><Avatar user={{ ...e.user, id: e.user.user_id } as Partial<UserSummary>} /></Link>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name(e)}{e.is_mine ? " ★" : ""}</div>
                <div style={{ fontSize: 12, opacity: 0.85 }}>{e.user.country ?? ""}</div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{t("sc_votes", e.votes.toLocaleString())}</div>
              </div>
              {!e.is_mine && round.status === "active" && (
                <button className="btn small" onClick={() => setVoteFor(e)}>{t("sc_vote")}</button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Last month's winners */}
      {data.last_winners && data.last_winners.winners.length > 0 && (
        <div style={box}>
          <div style={{ fontWeight: 900, fontSize: 17, marginBottom: 6 }}>🏆 {t("sc_last_winners", data.last_winners.label)}</div>
          {data.last_winners.winners.map((w) => (
            <div key={w.place} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: `1px solid rgba(240,196,32,.35)` }}>
              <div style={{ width: 34, textAlign: "center", fontSize: 20 }}>{["🥇", "🥈", "🥉"][w.place - 1] ?? `#${w.place}`}</div>
              <Thumb e={w.entry} size={46} onOpen={() => open(w.entry)} />
              <Avatar user={{ ...w.entry.user, id: w.entry.user.user_id } as Partial<UserSummary>} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800 }}>{name(w.entry)}</div>
                <div style={{ fontSize: 12, opacity: 0.85 }}>{w.entry.user.country ?? ""} · {t("sc_votes", w.entry.votes.toLocaleString())}</div>
                {extras.some((x) => x.place === w.place) && <div style={{ fontWeight: 800, fontSize: 13 }}>{t(placeKey(w.place))}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lifetime Bragging Rights (Steve, 2026-11-26): every winner, forever. */}
      <Link to="/singing-contest/bragging-rights" style={{ ...box, display: "block", textAlign: "center", fontSize: 18, fontWeight: 900, textDecoration: "none",
        background: "linear-gradient(180deg, #2a1a00 0%, #120b00 60%, #000 100%)", boxShadow: "0 0 14px rgba(240,196,32,.25)" }}>
        {t("sc_brag_button")}
      </Link>

      {confirmOpen && (
        <div className="modal-backdrop" onClick={() => setConfirmOpen(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()} role="dialog" style={{ background: "#000", border: `2px solid ${GOLD}`, color: GOLD }}>
            <h3 style={{ marginTop: 0, color: GOLD }}>🎤 {t("sc_title")}</h3>
            <p style={{ fontWeight: 700, lineHeight: 1.5 }}>{t("sc_confirm_body")}</p>
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button className="btn" style={{ flex: 1 }} onClick={() => navigate("/go-live?singing=1")}>{t("sc_confirm_go")}</button>
              <button className="btn ghost" style={{ flex: 1 }} onClick={() => setConfirmOpen(false)}>{t("cancel")}</button>
            </div>
          </div>
        </div>
      )}

      {voteFor && (
        <GiftSheet post={{ id: voteFor.post_id, user_id: voteFor.user.user_id } as Post} onClose={() => setVoteFor(null)} onSent={() => { void load(); }} />
      )}
    </>,
  );
}
