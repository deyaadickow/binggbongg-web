// /singing-contest/bragging-rights — Lifetime Bragging Rights (Steve, 2026-11-26: "The winners will have a lifetime
// bragging rights board that their name will be on there forever."). Black page, gold text and borders. Legends strip
// (medal counts), then one gold card per month, newest first, 🥇🥈🥉 rows. A winner whose video was deleted stays on
// the board, just without a play button (post_id null). No money on this page.
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSession } from "../lib/session";
import { useT } from "../lib/i18n";
import { PageTitle } from "../components/PageTitle";
import { Avatar, Loading, Notice } from "../components/Common";
import { displayName, mediaUrl, type UserSummary } from "../lib/api";
import { fetchSingingContestBraggingRights, scDemo, type ScBragMonth, type ScBragWinner, type ScLegend, type ScUser } from "../lib/singingContest";

const GOLD = "#F0C420";
const box: CSSProperties = { background: "#000", border: `2px solid ${GOLD}`, borderRadius: 16, padding: 14, color: GOLD, marginTop: 14 };
const MEDALS = ["🥇", "🥈", "🥉"];
const asUser = (u: ScUser) => ({ ...u, id: u.user_id }) as Partial<UserSummary>;

function WinnerRow({ w, onPlay }: { w: ScBragWinner; onPlay: (postId: number) => void }) {
  const { t } = useT();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: "1px solid rgba(240,196,32,.35)" }}>
      <div style={{ width: 30, textAlign: "center", fontSize: 22 }}>{MEDALS[w.place - 1] ?? `#${w.place}`}</div>
      <Link to={`/profile/${w.user.user_id}`} style={{ flexShrink: 0 }}><Avatar user={asUser(w.user)} /></Link>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName(asUser(w.user))}</div>
        <div style={{ fontSize: 12, opacity: 0.85 }}>{w.user.country ?? ""}</div>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{t("sc_votes", w.votes.toLocaleString())}</div>
      </div>
      {w.post_id ? (
        <button onClick={() => onPlay(w.post_id!)} aria-label="Play" style={{ width: 46, height: 61, flexShrink: 0, padding: 0, borderRadius: 10, border: `1px solid ${GOLD}`,
          background: "#000", overflow: "hidden", cursor: "pointer", display: "grid", placeItems: "center", color: GOLD, fontSize: 20, position: "relative" }}>
          {w.thumbnail_url ? <img src={mediaUrl(w.thumbnail_url)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "🎤"}
          <span style={{ position: "absolute", bottom: 2, right: 4, fontSize: 12 }}>▶</span>
        </button>
      ) : <div style={{ width: 46, flexShrink: 0 }} />}
    </div>
  );
}

function LegendChip({ l }: { l: ScLegend }) {
  const { t } = useT();
  return (
    <Link to={`/profile/${l.user.user_id}`} style={{ flex: "0 0 auto", width: 132, textAlign: "center", padding: "10px 8px", border: `1px solid ${GOLD}`, borderRadius: 14,
      background: "linear-gradient(180deg, #2a1a00 0%, #120b00 60%, #000 100%)", color: GOLD, textDecoration: "none" }}>
      <div style={{ fontWeight: 900, fontSize: 13 }}>#{l.rank}</div>
      <div style={{ display: "flex", justifyContent: "center", margin: "6px 0" }}><Avatar user={asUser(l.user)} /></div>
      <div style={{ fontWeight: 800, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName(asUser(l.user))}</div>
      <div style={{ fontSize: 11, opacity: 0.85, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.user.country ?? ""}</div>
      <div style={{ fontSize: 13, marginTop: 4, whiteSpace: "nowrap" }}>🥇{l.first} 🥈{l.second} 🥉{l.third}</div>
      <div style={{ fontSize: 11, fontWeight: 700 }}>{t("sc_brag_wins", l.wins)}</div>
    </Link>
  );
}

export function BraggingRightsPage() {
  const { t } = useT();
  const { user, isLoggedIn } = useSession();
  const navigate = useNavigate();
  const demo = scDemo();
  const myId = user?.id ?? (demo ? 99001 : 0);
  const [months, setMonths] = useState<ScBragMonth[] | null>(null);
  const [legends, setLegends] = useState<ScLegend[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (start: number) => {
    if (!myId) return;
    setBusy(true);
    try {
      const r = await fetchSingingContestBraggingRights(myId, start, 12);
      if (!r.status) throw new Error(r.message ?? t("try_again"));
      setError(null);
      setEnabled(r.enabled !== false);
      setMonths((prev) => (start === 0 ? r.months ?? [] : [...(prev ?? []), ...(r.months ?? [])]));
      if (start === 0) setLegends(r.legends ?? []);
      setHasMore(!!r.has_more);
    } catch (e) { setError((e as Error).message); if (start === 0) setMonths([]); } finally { setBusy(false); }
  }, [myId, t]);
  useEffect(() => { load(0); }, [load]);

  const play = (postId: number) => navigate(`/video/${postId}`);

  return (
    <div className="page" style={{ maxWidth: 640, background: "#000", color: GOLD, borderRadius: 18, paddingBottom: 40 }}>
      <PageTitle backTo="/singing-contest">{t("sc_brag_title")}</PageTitle>
      <div style={{ ...box, textAlign: "center" }}>
        <div style={{ fontSize: 24, fontWeight: 900 }}>🏆 {t("sc_brag_title")}</div>
        <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>{t("sc_brag_sub")}</div>
      </div>
      {!isLoggedIn && !demo ? (
        <div style={{ marginTop: 14 }}><Notice><Link to="/login" state={{ from: "/singing-contest/bragging-rights" }}>{t("sign_in")}</Link></Notice></div>
      ) : months === null ? <Loading /> : !enabled ? (
        <div style={box}>{t("sc_off")}</div>
      ) : (
        <>
          {error && <div style={{ marginTop: 12 }}><Notice error>{error}</Notice></div>}
          {months.length === 0 && !error && <div style={{ ...box, textAlign: "center", fontWeight: 800 }}>{t("sc_brag_empty")}</div>}
          {legends.length > 0 && (
            <div style={box}>
              <div style={{ fontWeight: 900, fontSize: 17, marginBottom: 8 }}>⭐ {t("sc_brag_legends")}</div>
              <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
                {legends.map((l) => <LegendChip key={l.user.user_id} l={l} />)}
              </div>
            </div>
          )}
          {months.map((m) => (
            <div key={m.round_id} style={box}>
              <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 4 }}>🎤 {m.label}</div>
              {m.winners.map((w) => <WinnerRow key={w.entry_id} w={w} onPlay={play} />)}
            </div>
          ))}
          {hasMore && (
            <button className="btn block" style={{ marginTop: 14 }} disabled={busy} onClick={() => load(months.length)}>{t("sc_brag_more")}</button>
          )}
        </>
      )}
    </div>
  );
}
