// The contest board the website never had. Steve, 2026-10-22, looking at www.binggbongg.com on
// his phone: "The web on my phone doesn't have the 'Philippine singing contest'." It did not —
// /enter-contest was the only contest route on the whole site, and it exists to ENTER, so the
// contest was invisible to everyone including the Filipinos who could enter it.
//
// Entering stays country-locked (that is ContestUploadPage, fed by the country-gated
// fetchOfficialContestsOpenForUpload). Watching, voting and gifting are open to the world —
// which is how the server has always behaved: voteOfficialContestVideo has no country check
// and the calendar has never been filtered.
import { useCallback, useEffect, useState } from "react";
import { useParams, Link, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { mediaUrl } from "../lib/api";
import { useSession } from "../lib/session";
import { fetchContests, fetchBoard, voteForEntry, isLive, contestEntryShareUrl, shareContestEntry, type Contest, type Board, type BoardRow } from "../lib/contests";
import { useT } from "../lib/i18n";
import { Loading, Notice } from "../components/Common";
import { PageTitle } from "../components/PageTitle";

function dateRange(c: Contest): string {
  const f = (d?: string | null) => (d ? new Date(d + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "");
  return c.start_date && c.end_date ? `${f(c.start_date)} – ${f(c.end_date)}` : "";
}

function prizeLine(c: Contest): string | null {
  const tiers = (c.prize_tiers ?? []).filter((t) => t.prize_amount != null);
  return tiers.length ? tiers.map((t) => `#${t.rank}: $${Number(t.prize_amount).toLocaleString()}`).join(" · ") : null;
}

/** The list of contests. Every live one, whatever country it belongs to. */
export function ContestsPage() {
  const [contests, setContests] = useState<Contest[] | null>(null);
  const { user } = useSession();

  useEffect(() => {
    fetchContests(user?.id).then((all) => setContests(all.filter(isLive)));
  }, [user?.id]);

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <PageTitle>Contests</PageTitle>
      {contests === null ? <Loading /> : contests.length === 0 ? (
        <Notice>There are no contests running right now. Check back soon.</Notice>
      ) : (
        contests.map((c) => {
          const where = (c.countries ?? [c.country_name].filter(Boolean)).join(", ");
          return (
            <Link key={c.id} to={`/contests/${c.id}`} className="card pad" style={{ display: "block", marginBottom: 12, textDecoration: "none" }}>
              <div style={{ fontWeight: 700, fontSize: 17 }}>{c.name}</div>
              {where && <div className="soft" style={{ fontSize: 14, marginTop: 2 }}>{where}</div>}
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                {dateRange(c)}
                {c.status === "upcoming" && " · entries open, voting not started"}
              </div>
              {prizeLine(c) && <div style={{ fontSize: 13, marginTop: 6 }}>{prizeLine(c)}</div>}
            </Link>
          );
        })
      )}
    </div>
  );
}

function EntryRow({ row, canVote, onVoted, contest, votingOpen, highlighted }: {
  row: BoardRow; canVote: boolean; onVoted: (videoId: number, count: number) => void;
  contest: Contest; votingOpen: boolean; highlighted: boolean;
}) {
  const { user } = useSession();
  const { t } = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  // The server owns every voting rule — per-hour window, once-per-contest, "not your own
  // video", voting closed. It is also the only thing that knows the member's current quota, so
  // its refusal text is shown verbatim rather than second-guessed here.
  async function vote() {
    if (!user) return;
    setBusy(true); setNote("");
    const res = await voteForEntry(user.id, row.video_id);
    setBusy(false);
    setNote(res.message ?? (res.ok ? "Vote counted!" : "Couldn't vote."));
    if (res.ok && res.videoVoteCount != null) onVoted(row.video_id, res.videoVoteCount);
  }

  const isMine = user?.id === row.user_id;

  // Steve, 2026-10-30: "Yes build the share to get votes button". Your own entry gets the
  // share button where the Vote button would be (the server refuses a vote for yourself).
  async function share() {
    const text = contest.name ? t("share_vote_text", contest.name) : t("share_vote_text_no_name");
    const how = await shareContestEntry(text, contestEntryShareUrl(contest.id, row.video_id));
    if (how === "copied") setNote(t("link_copied_paste_it_anywhere"));
  }

  return (
    <div id={`entry-${row.video_id}`} className="card pad"
         style={{ marginBottom: 10, ...(highlighted ? { borderColor: "var(--gold)", boxShadow: "0 0 0 2px var(--gold), 0 0 18px rgba(240,196,32,0.45)" } : {}) }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <div style={{ fontWeight: 700, fontSize: 18, minWidth: 28 }}>#{row.rank}</div>
        {row.thumb_path && (
          <img src={mediaUrl(row.thumb_path)} alt="" width={56} height={56}
               style={{ borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {row.fullname || row.username || "—"}
          </div>
          <div className="muted" style={{ fontSize: 13 }}>
            {row.vote_count.toLocaleString()} votes · {row.gift_coins.toLocaleString()} gift coins
          </div>
          {/* Only ever shown when false, and only then because a contestant who has not met the
              contest's minimum-videos floor cannot win — worth saying plainly rather than
              letting them climb a board they are not eligible for. */}
          {!row.is_prize_eligible && (
            <div className="muted" style={{ fontSize: 12 }}>Not yet eligible for a prize</div>
          )}
        </div>
      </div>

      {row.caption && <div className="soft" style={{ fontSize: 13, marginTop: 8 }}>{row.caption}</div>}

      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        {canVote && !isMine && (
          <button className="btn small" onClick={vote} disabled={busy}>
            {busy ? "Voting…" : "Vote"}
          </button>
        )}
        {/* A friend who opened a shared link without being signed in: Vote takes them to sign
            in (or sign up) and brings them straight back to this entry. */}
        {votingOpen && !user && (
          <button className="btn small" onClick={() => navigate("/login", { state: { from: location.pathname + location.search } })}>
            {t("vote_sign_in")}
          </button>
        )}
        {isMine && (
          <button className="btn small" onClick={share} style={{ background: "var(--gold-border)", color: "#000", borderColor: "var(--gold-border)" }}>{t("share_to_get_votes")}</button>
        )}
        {row.post_id != null && (
          <Link className="btn small" to={`/video/${row.post_id}`}>Watch &amp; Gift</Link>
        )}
      </div>
      {note && <div className="soft" style={{ fontSize: 13, marginTop: 8 }}>{note}</div>}
    </div>
  );
}

/** One contest: its rules, and its board(s). A `both` contest is two races at once, so it gets
 *  two tabs — the server sends the gifts board alongside the votes board, re-ranked from the
 *  same read so the two can never disagree with each other. */
export function ContestBoardPage() {
  const { id } = useParams();
  const contestId = Number(id);
  const navigate = useNavigate();
  const { user, isLoggedIn } = useSession();
  const location = useLocation();
  const [params] = useSearchParams();
  const entryParam = Number(params.get("entry"));
  const highlightId = Number.isFinite(entryParam) && entryParam > 0 ? entryParam : null;
  const [board, setBoard] = useState<Board | null | "missing">(null);
  const [tab, setTab] = useState<"votes" | "gifts">("votes");

  const load = useCallback(() => {
    if (!Number.isFinite(contestId)) { setBoard("missing"); return; }
    fetchBoard(contestId).then((b) => setBoard(b ?? "missing"));
  }, [contestId]);
  useEffect(() => { load(); }, [load]);
  // A shared link (?entry=<contest video id>) scrolls to that entry once the board has drawn.
  useEffect(() => {
    if (!highlightId || board === null || board === "missing") return;
    const el = document.getElementById(`entry-${highlightId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [board, highlightId]);

  if (board === null) return <div className="page"><Loading /></div>;
  if (board === "missing") return <div className="page"><Notice>That contest couldn't be found.</Notice></div>;

  const c = board.contest;
  // The list page only ever links to live contests, but a URL is a URL: fetchOfficialContest-
  // Leaderboard happily serves a contest that is switched OFF or long finished, and a disabled
  // one is usually a test row an admin never wants a member to see. Checked here rather than
  // trusting where the visitor came from.
  if (!isLive(c)) {
    return (
      <div className="page" style={{ maxWidth: 720 }}>
        <PageTitle>{c.name ?? "Contest"}</PageTitle>
        <Notice>This contest isn't running right now.</Notice>
        <button className="btn small ghost" style={{ marginTop: 12 }} onClick={() => navigate("/contests")}>
          All contests
        </button>
      </div>
    );
  }
  const both = (c.ranking_metric ?? "") === "both" && !!board.gifts_leaderboard;
  const rows = both && tab === "gifts" ? (board.gifts_leaderboard ?? []) : board.leaderboard;
  // Voting opens with the contest itself; during the entry-only week the status is "upcoming"
  // and the server would refuse anyway, so the button is not offered.
  const votingOpen = (c.status ?? "") === "active";
  const where = (c.countries ?? [c.country_name].filter(Boolean)).join(", ");

  function onVoted(videoId: number, count: number) {
    setBoard((b) => (b && b !== "missing")
      ? { ...b,
          leaderboard: b.leaderboard.map((r) => r.video_id === videoId ? { ...r, vote_count: count } : r),
          gifts_leaderboard: b.gifts_leaderboard?.map((r) => r.video_id === videoId ? { ...r, vote_count: count } : r) }
      : b);
  }

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <PageTitle>{c.name ?? "Contest"}</PageTitle>

      <div className="card pad" style={{ marginBottom: 12 }}>
        {where && <div className="soft">{where}</div>}
        <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{dateRange(c)}</div>
        {prizeLine(c) && <div style={{ fontSize: 13, marginTop: 6 }}>{prizeLine(c)}</div>}
        {c.vote_limit_text && <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>{c.vote_limit_text}</div>}
        {c.status === "upcoming" && (
          <div className="soft" style={{ fontSize: 13, marginTop: 8 }}>
            Entries are open. Voting starts {c.start_date ? dateRange(c).split("–")[0].trim() : "soon"}.
          </div>
        )}
        {/* Anyone may watch and support; only members in the contest's countries may enter. */}
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          Anyone can watch, vote and send gifts. Only members in {where || "that country"} can enter.
        </div>
      </div>

      {both && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button className={`btn small${tab === "votes" ? "" : " ghost"}`} onClick={() => setTab("votes")}>Votes</button>
          <button className={`btn small${tab === "gifts" ? "" : " ghost"}`} onClick={() => setTab("gifts")}>Gifts</button>
        </div>
      )}

      {!isLoggedIn && (
        <Notice>
          <Link to="/login" state={{ from: location.pathname + location.search }}>Sign in</Link> to vote and send gifts.
        </Notice>
      )}

      {rows.length === 0 ? (
        <Notice>No entries yet.</Notice>
      ) : (
        rows.map((r) => (
          <EntryRow key={`${tab}-${r.video_id}`} row={r}
                    canVote={votingOpen && isLoggedIn && !!user} onVoted={onVoted}
                    contest={c} votingOpen={votingOpen} highlighted={r.video_id === highlightId} />
        ))
      )}

      <button className="btn small ghost" style={{ marginTop: 12 }} onClick={() => navigate("/contests")}>
        All contests
      </button>
    </div>
  );
}
