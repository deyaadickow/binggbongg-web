// One entry per contest the member can actually enter, titled with that contest's own name.
// The list comes from the backend already filtered to active, in-date contests that accept the
// member's country, so creating a contest in admin makes its entry appear here by itself.
import { useCallback, useEffect, useRef, useState } from "react";
import { currentAuthHeaders } from "../lib/api";
import { useSession } from "../lib/session";
import { fetchOpenContests, uploadContestVideo, type OpenContest } from "../lib/contestupload";
import { videoDuration } from "../lib/upload";
import { Loading, Notice } from "../components/Common";

function prizeLine(c: OpenContest): string | null {
  const tiers = (c.prize_tiers ?? []).filter((t) => t.prize_amount != null);
  if (tiers.length) {
    return tiers.map((t) => `#${t.rank}: $${Number(t.prize_amount).toLocaleString()}`).join(" · ");
  }
  return c.prize_amount != null ? `$${Number(c.prize_amount).toLocaleString()}` : null;
}

function ContestCard({ contest, userId, onDone }: { contest: OpenContest; userId: number; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const remaining = contest.my_uploads_remaining;
  const full = remaining !== null && remaining !== undefined && remaining <= 0;
  const maxSecs = contest.max_video_seconds ?? null;

  async function pickAndUpload(file: File) {
    setError("");
    setBusy(true);
    try {
      let secs: number | null = null;
      try {
        secs = await videoDuration(file);
      } catch {
        // A file whose length can't be read still uploads — the server checks length too.
      }
      // Checked before any bytes move, using this contest's own limit rather than a fixed one.
      if (maxSecs && secs && secs > maxSecs) {
        throw new Error(`That video is ${Math.round(secs)}s — ${contest.name} allows up to ${maxSecs}s.`);
      }
      await uploadContestVideo(userId, contest.id, file, secs, currentAuthHeaders(), setProgress);
      setSent(true);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setProgress(0);
    }
  }

  const prizes = prizeLine(contest);

  return (
    <div className="card pad" style={{ marginBottom: 12 }}>
      <b style={{ color: "var(--gold)", fontSize: 17 }}>{contest.name}</b>
      <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
        {(contest.countries ?? []).join(", ") || contest.country_name}
        {contest.start_date && contest.end_date && ` · ${contest.start_date} to ${contest.end_date}`}
      </div>
      {prizes && <div className="soft" style={{ fontSize: 13, marginTop: 6 }}>Prizes: {prizes}</div>}

      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
        {maxSecs ? `Up to ${maxSecs}s per video. ` : ""}
        {remaining === null || remaining === undefined
          ? "Enter as many videos as you like."
          : `${remaining} entr${remaining === 1 ? "y" : "ies"} left${contest.my_video_count ? ` — you've entered ${contest.my_video_count}` : ""}.`}
      </div>

      {(contest.rules ?? []).length > 0 && (
        <ul className="muted" style={{ fontSize: 12, marginTop: 8, paddingLeft: 18 }}>
          {(contest.rules ?? []).map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      )}

      {error && <p style={{ color: "#f55", fontSize: 13 }}>{error}</p>}
      {sent && <p className="soft" style={{ fontSize: 13 }}>Entered. Good luck.</p>}

      {busy && (
        <div style={{ height: 8, background: "var(--panel)", borderRadius: 999, overflow: "hidden", margin: "10px 0" }}>
          <div style={{ width: `${Math.round(progress * 100)}%`, height: "100%", background: "var(--gold-border)", transition: "width .2s" }} />
        </div>
      )}

      <input ref={fileRef} type="file" accept="video/*" style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickAndUpload(f); }} />
      <button className="btn block" disabled={busy || full} onClick={() => fileRef.current?.click()}
        style={{ marginTop: 10, background: full ? undefined : "var(--gold-border)", color: full ? undefined : "#000", borderColor: "var(--gold-border)" }}>
        {busy ? "Uploading…" : full ? "You've used all your entries" : `Upload your video for ${contest.name}`}
      </button>
    </div>
  );
}

export function ContestUploadPage() {
  const { user, isLoggedIn } = useSession();
  const [contests, setContests] = useState<OpenContest[] | null>(null);

  const load = useCallback(() => {
    if (!user) return;
    fetchOpenContests(user.id).then(setContests).catch(() => setContests([]));
  }, [user]);

  useEffect(() => { load(); }, [load]);

  if (!isLoggedIn || !user) {
    return <div className="page"><Notice>Sign in to enter a contest.</Notice></div>;
  }

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <h1 className="page-title">Enter a contest</h1>
      {contests === null ? <Loading /> : contests.length === 0 ? (
        <div className="card pad">
          <p className="soft" style={{ marginTop: 0 }}>There's no contest open for your country right now.</p>
          <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
            Contests run for a set period and are open to particular countries. When one opens for yours, it appears here by name.
          </p>
        </div>
      ) : (
        contests.map((c) => <ContestCard key={c.id} contest={c} userId={user.id} onDone={load} />)
      )}
    </div>
  );
}
