import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSession } from "../lib/session";
import { Avatar } from "../components/Common";
import {
  fetchMyBirthdayWishes,
  fetchTodaysBirthdays,
  sendBirthdayFlowers,
  sendBirthdayWish,
  type BirthdayList,
  type BirthdayMember,
  type BirthdayWishes,
} from "../lib/api";

/**
 * The Birthday Page on the web (Steve, 2026-10-20) — the same two screens the phones got the
 * same day, as one page with a toggle.
 *
 * Steve's spec: "Today's Birthday page... they can send Happy Birthday for free or Flowers for
 * 100 coins, and the member will know who sent the Happy Birthday and who sent the flowers."
 *
 * Why it exists: the app had 2 birthdays saved out of 3,942 members, because the only place a
 * date of birth was ever asked for was the Private Rooms 18+ gate — and the server was dropping
 * it anyway. Steve's answer was to make a birthday worth having.
 */
export function BirthdayPage() {
  const { user: me } = useSession();
  const [tab, setTab] = useState<"today" | "mine">("today");
  const [list, setList] = useState<BirthdayList | null>(null);
  const [wishes, setWishes] = useState<BirthdayWishes | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** The member a send is in flight for — both buttons on that row go quiet meanwhile, so a
   *  fast double-click can't spend 200 coins on one lot of flowers. */
  const [sendingTo, setSendingTo] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadToday = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    setError(null);
    try {
      setList(await fetchTodaysBirthdays(me.id));
    } catch {
      setError("Couldn't load that right now.");
    } finally {
      setLoading(false);
    }
  }, [me]);

  const loadMine = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    setError(null);
    try {
      setWishes(await fetchMyBirthdayWishes(me.id));
    } catch {
      setError("Couldn't load that right now.");
    } finally {
      setLoading(false);
    }
  }, [me]);

  useEffect(() => {
    if (tab === "today") void loadToday();
    else void loadMine();
  }, [tab, loadToday, loadMine]);

  if (!me) {
    return (
      <div className="page">
        <div className="notice">
          <Link to="/login">Sign in</Link> to see today's birthdays.
        </div>
      </div>
    );
  }

  const flowerCoins = list?.flower_coins ?? 100;
  const members = list?.members ?? [];

  async function send(member: BirthdayMember, kind: "wish" | "flowers") {
    if (!me || sendingTo !== null) return;
    setSendingTo(member.user_id);
    try {
      const res = kind === "wish"
        ? await sendBirthdayWish(me.id, member.user_id)
        : await sendBirthdayFlowers(me.id, member.user_id);
      // The server's own wording either way — it knows which rule was hit (already wished,
      // not their birthday, not enough coins).
      setNotice(res.message ?? (kind === "wish" ? "Happy Birthday sent!" : "Flowers sent!"));
      if (res.status && kind === "wish") void loadToday();
    } catch {
      setNotice("Couldn't send that.");
    } finally {
      setSendingTo(null);
    }
  }

  return (
    <div className="page">
      <h2 style={{ color: "var(--gold)" }}>Birthdays</h2>

      <div className="row" style={{ gap: 8, marginBottom: 14 }}>
        <button className={tab === "today" ? "btn gold" : "btn"} onClick={() => setTab("today")}>
          Today's birthdays
        </button>
        <button className={tab === "mine" ? "btn gold" : "btn"} onClick={() => setTab("mine")}>
          Who wished me
        </button>
      </div>

      {notice && <div className="notice" style={{ marginBottom: 12 }}>{notice}</div>}
      {error && <div className="notice" style={{ marginBottom: 12 }}>{error}</div>}
      {loading && <div className="notice">Loading…</div>}

      {!loading && tab === "today" && (
        <>
          {/* Steve: "add a text that says... Add your birthday to your profile page and your
              name will be on this page on your birthday." Hidden once they have one — the line
              is a nudge, not a notice. */}
          {!list?.my_birthday && list?.invite_text && (
            <div className="card" style={{ padding: 14, marginBottom: 12, textAlign: "center" }}>
              <div style={{ color: "var(--gold)", fontSize: 14 }}>{list.invite_text}</div>
              <Link to="/settings/profile" className="btn gold" style={{ marginTop: 10, display: "inline-block" }}>
                Add my birthday
              </Link>
            </div>
          )}

          {members.length === 0 && <div className="notice">Nobody has a birthday today.</div>}

          {members.map((m) => {
            const busy = sendingTo === m.user_id;
            return (
              <div key={m.user_id} className="card row" style={{ padding: 10, marginBottom: 8, gap: 10 }}>
                <Link to={`/profile/${m.user_id}`}><Avatar user={m} /></Link>
                <Link
                  to={`/profile/${m.user_id}`}
                  style={{ flex: 1, minWidth: 0, fontWeight: 800, color: "var(--gold)" }}
                >
                  🎂 {m.fullname || m.username || "Member"}
                </Link>
                {m.is_me ? (
                  // No wishing yourself a happy birthday.
                  <span style={{ color: "var(--gold)", opacity: 0.7, fontSize: 13 }}>That's you</span>
                ) : (
                  <div className="row" style={{ gap: 6 }}>
                    {m.already_wished ? (
                      // Free, once each. Once sent, say so rather than letting them be refused.
                      <span className="btn" style={{ opacity: 0.65, cursor: "default" }}>Wished ✓</span>
                    ) : (
                      <button className="btn gold" disabled={busy} onClick={() => void send(m, "wish")}>
                        Happy Birthday
                      </button>
                    )}
                    {/* Uncapped on purpose — as many as they want to pay for. */}
                    <button className="btn" disabled={busy} onClick={() => void send(m, "flowers")}>
                      💐 {flowerCoins}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      {!loading && tab === "mine" && (
        <>
          <div className="card row" style={{ padding: 12, marginBottom: 10, textAlign: "center" }}>
            <Total value={wishes?.total_wishes ?? 0} label="Wishes" />
            <Total value={wishes?.total_flowers ?? 0} label="Flowers" />
            <Total value={wishes?.total_coins ?? 0} label="Coins" />
          </div>

          {(wishes?.wishes ?? []).length === 0 && <div className="notice">Nobody has wished you yet.</div>}

          {(wishes?.wishes ?? []).map((w) => (
            <div key={w.id} className="card row" style={{ padding: 10, marginBottom: 8, gap: 10 }}>
              <Link to={`/profile/${w.sender_user_id ?? 0}`}><Avatar user={w} /></Link>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Link to={`/profile/${w.sender_user_id ?? 0}`} style={{ fontWeight: 800, color: "var(--gold)" }}>
                  {w.fullname || w.username || "Someone"}
                </Link>
                {/* Steve: "the member will know who sent the Happy Birthday and who sent the
                    flowers." */}
                <div style={{ fontSize: 13, color: "var(--gold)", opacity: 0.75 }}>
                  {w.kind === "flower" ? "sent you Flowers 💐" : "wished you Happy Birthday 🎂"}
                </div>
              </div>
              {w.kind === "flower" && (w.coins ?? 0) > 0 && (
                <span style={{ fontWeight: 800, color: "var(--gold)" }}>{w.coins}</span>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function Total({ value, label }: { value: number; label: string }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: "var(--gold)" }}>{value}</div>
      <div style={{ fontSize: 12, color: "var(--gold)", opacity: 0.75 }}>{label}</div>
    </div>
  );
}
