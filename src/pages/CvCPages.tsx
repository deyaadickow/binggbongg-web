// CvC — the country vs country bragging-rights board, and one battle's page (Steve, 2026-10-17).
//
//   "I want the bragging rights board/page to be called, 'CvC' inside that page on top will be
//    called 'Country VS Country'."
//   "one board for all countries with date, when anyone clicks on any battle another page will
//    appear with all the information for that battle for those 2 countries."
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Loading, Notice } from "../components/Common";
import { mediaUrl } from "../lib/api";
import {
  fetchCountryChallenge, fetchCountryChallenges, flagOf,
  type CvCDetail, type CvCPlayer, type CvCRow, type CvCSupporter,
} from "../lib/countryChallenges";

const gold = "var(--gold)";

// ---- The board ------------------------------------------------------------------------------

export function CvCPage() {
  const [rows, setRows] = useState<CvCRow[] | null>(null);
  const [upcoming, setUpcoming] = useState<CvCRow[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchCountryChallenges()
      .then((r) => { setRows(r.rows); setUpcoming(r.upcoming); setEnabled(r.enabled); })
      .catch(() => { setRows([]); setError("Couldn't load the board."); });
  }, []);

  // Steve, 2026-10-17: "shut it off for now... When turned off, the tab will disappear as well."
  if (!enabled) {
    return (
      <div className="page" style={{ maxWidth: 900 }}>
        <h1 className="page-title">Country VS Country</h1>
        <p className="soft">This isn't open yet. Check back soon.</p>
      </div>
    );
  }

  return (
    <div className="page" style={{ maxWidth: 900 }}>
      {/* The tab says CvC; the page says what it means. */}
      <h1 className="page-title">Country VS Country</h1>
      <p className="soft" style={{ marginTop: -6 }}>
        Every country battle ever fought, and who won it.
      </p>

      {error && <Notice error>{error}</Notice>}

      {upcoming.length > 0 && (
        <>
          <h2 style={{ fontSize: 16, color: gold, marginTop: 18 }}>Coming up</h2>
          <div style={{ display: "grid", gap: 10 }}>
            {upcoming.map((c) => <UpcomingCard key={c.id} row={c} />)}
          </div>
        </>
      )}

      <h2 style={{ fontSize: 16, color: gold, marginTop: 22 }}>Bragging rights</h2>
      {rows === null && <Loading />}
      {rows !== null && rows.length === 0 && !error && (
        <p className="soft">No country battles yet. The first one goes on this board the moment it ends.</p>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {(rows ?? []).map((c) => <BoardRow key={c.id} row={c} />)}
      </div>
    </div>
  );
}

function BoardRow({ row }: { row: CvCRow }) {
  const aWon = row.winner_country_code && row.winner_country_code === row.country_a_code;
  const bWon = row.winner_country_code && row.winner_country_code === row.country_b_code;

  return (
    <Link to={`/cvc/${row.id}`} className="card pad" style={{ display: "block", textDecoration: "none" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Side name={row.country_a_name} code={row.country_a_code} score={row.score_a} won={!!aWon} />
        <span className="muted" style={{ fontWeight: 900 }}>VS</span>
        <Side name={row.country_b_name} code={row.country_b_code} score={row.score_b} won={!!bWon} />
        <span style={{ flex: 1 }} />
        <span className="muted" style={{ fontSize: 12 }}>{row.date}</span>
      </div>
      <div style={{ marginTop: 6, fontSize: 13, color: row.is_draw ? "var(--text)" : gold, fontWeight: 700 }}>
        {row.is_draw ? "Draw" : row.winner_country_name ? `${row.winner_country_name} won` : ""}
        <span className="muted" style={{ fontWeight: 400 }}> · {row.minutes} minutes</span>
      </div>
    </Link>
  );
}

function Side({ name, code, score, won }: { name: string; code?: string | null; score: number; won: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 20 }}>{flagOf(code)}</span>
      <span style={{ fontWeight: won ? 900 : 600, color: won ? gold : undefined }}>{name}</span>
      <span className="muted" style={{ fontVariantNumeric: "tabular-nums" }}>{score.toLocaleString()}</span>
    </span>
  );
}

function UpcomingCard({ row }: { row: CvCRow }) {
  return (
    <div className="card pad" style={{ borderColor: "var(--gold-border)" }}>
      <div style={{ fontWeight: 900, color: gold }}>
        {flagOf(row.country_a_code)} {row.title} {flagOf(row.country_b_code)}
      </div>
      <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
        {String(row.scheduled_at ?? "").slice(0, 16).replace("T", " ")} · {row.minutes} minutes
        {row.status === "accepted" ? " · both accepted" : row.status === "live" ? " · on now" : " · waiting for them to accept"}
      </div>
    </div>
  );
}

// ---- One battle -----------------------------------------------------------------------------

export function CvCBattlePage() {
  const { id } = useParams();
  const [data, setData] = useState<CvCDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchCountryChallenge(Number(id))
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load that battle."));
  }, [id]);

  if (error) return <div className="page"><Notice error>{error}</Notice></div>;
  if (!data) return <div className="page"><Loading /></div>;

  const h = data.head_to_head;

  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <div className="row" style={{ marginBottom: 14 }}>
        <Link to="/cvc" className="btn small ghost">‹ CvC</Link>
        <h1 className="page-title" style={{ margin: 0 }}>Country VS Country</h1>
      </div>

      <div className="card pad" style={{ borderColor: "var(--gold-border)" }}>
        <div style={{ textAlign: "center", fontWeight: 900, fontSize: 20, color: gold }}>
          {flagOf(data.country_a_code)} {data.title} {flagOf(data.country_b_code)}
        </div>
        <div className="muted" style={{ textAlign: "center", fontSize: 13, marginTop: 4 }}>
          {data.date} · {data.minutes} minutes
        </div>
        <div style={{ textAlign: "center", fontSize: 30, fontWeight: 900, marginTop: 12, fontVariantNumeric: "tabular-nums" }}>
          {data.score_a.toLocaleString()} <span className="muted" style={{ fontSize: 18 }}>–</span> {data.score_b.toLocaleString()}
        </div>
        <div style={{ textAlign: "center", marginTop: 6, color: gold, fontWeight: 800 }}>
          {data.is_draw ? "A draw" : data.winner_country_name ? `${data.winner_country_name} won` : "Not fought yet"}
        </div>
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr", marginTop: 12 }}>
        <PlayerCard player={data.player_a} code={data.country_a_code} supporters={data.top_supporters_a} />
        <PlayerCard player={data.player_b} code={data.country_b_code} supporters={data.top_supporters_b} />
      </div>

      {/* "all the information for that battle for those 2 countries" — the lifetime record
          between them is the part that makes it bragging rights rather than one scoreline. */}
      <div className="card pad" style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 900, color: gold, marginBottom: 6 }}>
          Lifetime: {data.country_a_name} v {data.country_b_name}
        </div>
        <p className="soft" style={{ margin: 0 }}>
          {h.played} battle{h.played === 1 ? "" : "s"} · {data.country_a_name} {h.wins_a} ·{" "}
          {data.country_b_name} {h.wins_b}
          {h.draws > 0 ? ` · ${h.draws} draw${h.draws === 1 ? "" : "s"}` : ""}
        </p>
      </div>
    </div>
  );
}

function PlayerCard({ player, code, supporters }: { player: CvCPlayer; code?: string | null; supporters: CvCSupporter[] }) {
  return (
    <div className="card pad">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {player.image ? (
          <img src={mediaUrl(player.image)} alt="" width={38} height={38}
               style={{ borderRadius: "50%", objectFit: "cover" }} />
        ) : <span style={{ fontSize: 24 }}>{flagOf(code)}</span>}
        <div>
          <div style={{ fontWeight: 800 }}>{player.name ?? "—"}</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {flagOf(code)} {player.country} · {player.followers.toLocaleString()} followers
          </div>
        </div>
      </div>
      <div style={{ marginTop: 10, fontSize: 22, fontWeight: 900, color: gold, fontVariantNumeric: "tabular-nums" }}>
        {player.score.toLocaleString()}
      </div>

      {supporters.length > 0 && (
        <>
          <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>Who backed them</div>
          <div style={{ display: "grid", gap: 4, marginTop: 4 }}>
            {supporters.map((s) => (
              <div key={s.user_id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span>{s.name ?? "Someone"}</span>
                <span className="muted" style={{ fontVariantNumeric: "tabular-nums" }}>{s.coins.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
