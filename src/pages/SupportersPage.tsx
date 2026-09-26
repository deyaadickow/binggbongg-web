// "Who Supported Me" (Steve, 2026-09-26): "On each personal profile page please add a link called
// 'Support' but inside the link page call it, 'Who Supported Me'. In this link, show who supported
// and gave me gifts. First page will be Avatar, Names and Total Gifts, when they click on any
// name, it will give them a breakdown of that member's gifts by day, month and year. With total
// coins." Backend: SupportersController (fetchMySupporters / fetchSupporterGiftBreakdown), which
// counts every coin sent to me from live rooms, battles, tap games and video votes.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { displayName, post, type UserSummary } from "../lib/api";
import { useSession } from "../lib/session";
import { Avatar, Loading, Notice } from "../components/Common";

interface Supporter { user: UserSummary; total_coins: number; gift_count: number; last_gift_at?: string | null }
interface SupportersData { total_coins: number; gift_count: number; supporter_count: number; supporters: Supporter[] }
interface BreakdownRow { period: string; label: string; total_coins: number; gift_count: number }
interface BreakdownData { supporter: UserSummary; period: Period; total_coins: number; gift_count: number; rows: BreakdownRow[] }
type Period = "day" | "month" | "year";

const n = (v: number | undefined) => Number(v ?? 0).toLocaleString();

// Steve, 2026-09-26: "Put the gifts in the middle of the page, large in gold." Every row (the
// supporters list, the breakdown header and each day/month/year line) carries the gift count as
// a big gold figure in its middle column.
function GiftCount({ count }: { count: number | undefined }) {
  return (
    // Number and word side by side (Steve, 2026-09-26: "14 Gifts, make them next to each other,
    // not on top of each other"), aligned on their baseline.
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 5, minWidth: 90 }}>
      <span style={{ fontWeight: 900, fontSize: 26, lineHeight: 1, color: "var(--gold)" }}>{n(count)}</span>
      <span className="muted" style={{ fontSize: 12 }}>{(count ?? 0) === 1 ? "gift" : "gifts"}</span>
    </div>
  );
}

// Steve, 2026-09-26: "Please separate the gifters by date, put date between them in the middle,
// latest date on top." Grouped by the day of each member's LATEST gift (last_gift_at, server
// time), newest day first; within a day the bigger total comes first.
interface DayGroup { key: string; label: string; supporters: Supporter[] }
function groupByLastGift(list: Supporter[]): DayGroup[] {
  const sorted = [...list].sort((a, b) =>
    (b.last_gift_at ?? "").localeCompare(a.last_gift_at ?? "") || b.total_coins - a.total_coins);
  const groups: DayGroup[] = [];
  for (const s of sorted) {
    const key = (s.last_gift_at ?? "").slice(0, 10) || "unknown";
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      const d = new Date(`${key}T00:00:00`);
      const label = isNaN(d.getTime()) ? "Earlier" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
      g = { key, label, supporters: [] };
      groups.push(g);
    }
    g.supporters.push(s);
  }
  return groups;
}

function DateDivider({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "6px 0 2px" }}>
      <div style={{ flex: 1, height: 1, background: "var(--gold-border)" }} />
      <div style={{ fontWeight: 800, fontSize: 13, color: "var(--gold)", letterSpacing: "0.03em" }}>{label}</div>
      <div style={{ flex: 1, height: 1, background: "var(--gold-border)" }} />
    </div>
  );
}

function NeedLogin() {
  return <div className="page"><Notice>Sign in to see who supported you. <Link to="/login">Sign in</Link></Notice></div>;
}

export function SupportersPage() {
  const { user, isLoggedIn } = useSession();
  const [data, setData] = useState<SupportersData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    post<SupportersData>("fetchMySupporters", { my_user_id: user.id, start: 0, count: 200 })
      .then((r) => { if (r.status && r.data) setData(r.data); else setError(r.message ?? "Couldn't load your supporters."); })
      .catch(() => setError("Couldn't load your supporters."))
      .finally(() => setLoading(false));
  }, [user]);

  if (!isLoggedIn || !user) return <NeedLogin />;

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <div className="row" style={{ marginBottom: 14 }}>
        <Link to={`/profile/${user.id}`} className="btn small ghost">‹ Profile</Link>
        <h1 className="page-title" style={{ margin: 0 }}>Who Supported Me</h1>
      </div>
      {loading ? <Loading /> : error ? <Notice>{error}</Notice> : data && (
        <>
          <div className="card row" style={{ padding: 14, marginBottom: 12, justifyContent: "space-between" }}>
            <div><div className="muted" style={{ fontSize: 12 }}>SUPPORTERS</div><div style={{ fontWeight: 800, fontSize: 20 }}>{n(data.supporter_count)}</div></div>
            <div><div className="muted" style={{ fontSize: 12 }}>GIFTS</div><div style={{ fontWeight: 800, fontSize: 20 }}>{n(data.gift_count)}</div></div>
            <div style={{ textAlign: "right" }}><div className="muted" style={{ fontSize: 12 }}>TOTAL COINS</div><div style={{ fontWeight: 800, fontSize: 20 }}>{n(data.total_coins)}</div></div>
          </div>
          {data.supporters.length === 0 ? (
            <p className="muted" style={{ padding: "24px 0", textAlign: "center" }}>No one has sent you a gift yet.</p>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {groupByLastGift(data.supporters).map((g) => [
                <DateDivider key={`d-${g.key}`} label={g.label} />,
                ...g.supporters.map((s) => (
                <Link key={s.user.id} to={`/support/${s.user.id}`} className="card row" style={{ padding: 10, color: "inherit" }}>
                  <Avatar user={s.user} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName(s.user)}</div>
                    <div className="muted" style={{ fontSize: 13 }}>@{s.user.username ?? ""}</div>
                  </div>
                  <GiftCount count={s.gift_count} />
                  <div style={{ textAlign: "right", flexShrink: 0, minWidth: 72 }}>
                    <div style={{ fontWeight: 800 }}>{n(s.total_coins)}</div>
                    <div className="muted" style={{ fontSize: 12 }}>coins</div>
                  </div>
                </Link>
                )),
              ])}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function SupporterBreakdownPage() {
  const { id } = useParams();
  const { user, isLoggedIn } = useSession();
  const [period, setPeriod] = useState<Period>("day");
  const [data, setData] = useState<BreakdownData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !id) return;
    setLoading(true);
    post<BreakdownData>("fetchSupporterGiftBreakdown", { my_user_id: user.id, supporter_user_id: Number(id), period })
      .then((r) => { if (r.status && r.data) setData(r.data); else setError(r.message ?? "Couldn't load this breakdown."); })
      .catch(() => setError("Couldn't load this breakdown."))
      .finally(() => setLoading(false));
  }, [user, id, period]);

  if (!isLoggedIn || !user) return <NeedLogin />;

  const periods: { key: Period; label: string }[] = [{ key: "day", label: "Day" }, { key: "month", label: "Month" }, { key: "year", label: "Year" }];

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <div className="row" style={{ marginBottom: 14 }}>
        <Link to="/support" className="btn small ghost">‹ Who Supported Me</Link>
      </div>
      {data && (
        <div className="card row" style={{ padding: 14, marginBottom: 12 }}>
          <Link to={`/profile/${data.supporter.id}`}><Avatar user={data.supporter} size="lg" /></Link>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>{displayName(data.supporter)}</div>
            <div className="muted" style={{ fontSize: 13 }}>@{data.supporter.username ?? ""}</div>
          </div>
          <GiftCount count={data.gift_count} />
          <div style={{ textAlign: "right", minWidth: 72 }}>
            <div style={{ fontWeight: 800, fontSize: 20 }}>{n(data.total_coins)}</div>
            <div className="muted" style={{ fontSize: 12 }}>total coins</div>
          </div>
        </div>
      )}
      <div className="row" style={{ gap: 8, marginBottom: 12 }}>
        {/* Steve, 2026-09-26: "Make them gold border for day, month and year" — the .btn gold
            border on all three (not .ghost, whose border is grey); the selected one is filled gold. */}
        {periods.map((p) => (
          <button key={p.key} className="btn small" onClick={() => setPeriod(p.key)}
            style={period === p.key ? { background: "var(--gold)", color: "#000" } : { background: "transparent", color: "var(--gold)" }}>
            {p.label}
          </button>
        ))}
      </div>
      {loading ? <Loading /> : error ? <Notice>{error}</Notice> : data && (
        data.rows.length === 0 ? (
          <p className="muted" style={{ padding: "24px 0", textAlign: "center" }}>No gifts from this member yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {data.rows.map((r) => (
              <div key={r.period} className="card row" style={{ padding: "10px 14px" }}>
                <div style={{ flex: 1, fontWeight: 700 }}>{r.label}</div>
                <GiftCount count={r.gift_count} />
                <div style={{ flex: 1, fontWeight: 800, textAlign: "right" }}>{n(r.total_coins)} coins</div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
