import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSession } from "../lib/session";
import { fetchDailyFortune, type DailyFortune } from "../lib/api";

/**
 * Lucky numbers + daily horoscope (Steve, 2026-10-09): "for entertainment only so we can bring
 * members to the app on a daily bases."
 *
 * THE TWO HALVES BEHAVE DIFFERENTLY ON PURPOSE, on his instruction: "Lucky number will be
 * different every time they click it... Horoscope has to be the same." So the button re-calls
 * the endpoint and gets new numbers, and the horoscope does NOT move when it does. That is
 * correct, not a caching bug.
 */
export function DailyFortunePage() {
  const { user: me } = useSession();
  const [fortune, setFortune] = useState<DailyFortune | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [birthday, setBirthday] = useState("");
  const [editingBirthday, setEditingBirthday] = useState(false);

  async function load(dateOfBirth?: string) {
    if (!me) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchDailyFortune(me.id, dateOfBirth);
      if (!res.status) {
        setError(res.message ?? "Could not load that right now.");
        return;
      }
      setFortune(res);
      setEditingBirthday(false);
      if (res.date_of_birth) setBirthday(res.date_of_birth.slice(0, 10));
    } catch {
      setError("Could not load that right now.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [me]);

  if (!me) {
    return <div className="page"><div className="notice">Sign in to see your lucky numbers. <Link to="/login">Sign in</Link></div></div>;
  }

  // Numeric order: sorting the keys as strings would put "10" before "3".
  const numbers = Object.entries(fortune?.lucky_numbers ?? {})
    .map(([length, value]) => ({ length: Number(length), value }))
    .sort((a, b) => a.length - b.length);

  const hasSign = Boolean(fortune?.sign);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="page">
      <h2>Lucky Numbers &amp; Horoscope</h2>

      <h3 style={{ color: "var(--gold)", marginTop: 18 }}>Your lucky numbers</h3>
      {loading && !fortune ? (
        <p className="muted">Loading…</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {numbers.map((n) => (
            <div
              key={n.length}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "14px 16px", borderRadius: 10,
                background: "rgba(0,0,0,.45)", border: "1px solid var(--gold-border)",
              }}
            >
              <span className="muted" style={{ fontSize: 13 }}>{n.length} digits</span>
              {/* Monospace so the digits do not jiggle between draws, and rendered as the
                  string we were given — Number() here would eat the leading zero. */}
              <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 24, fontWeight: 700, letterSpacing: 2, color: "var(--gold)" }}>
                {n.value}
              </span>
            </div>
          ))}
        </div>
      )}
      <button className="btn wide" style={{ marginTop: 16 }} disabled={loading} onClick={() => void load()}>
        {loading ? "…" : "Give me new numbers"}
      </button>

      <h3 style={{ color: "var(--gold)", marginTop: 30 }}>Your daily horoscope</h3>
      {error && <div className="notice">{error}</div>}

      {hasSign && !editingBirthday ? (
        <div style={{ padding: 16, borderRadius: 10, background: "rgba(0,0,0,.45)", border: "1px solid var(--gold-border)" }}>
          <div style={{ color: "var(--gold)", fontWeight: 600, textTransform: "capitalize" }}>{fortune?.sign}</div>
          <p style={{ marginBottom: 0, marginTop: 10 }}>
            {/* A sign with nothing in the bank yet is possible — say so rather than leave an
                empty box that just looks broken. */}
            {fortune?.horoscope || "No reading for your sign today. Check back tomorrow."}
          </p>
          <button className="btn small" style={{ marginTop: 14, background: "transparent", color: "var(--gold)", borderColor: "var(--gold-border)" }}
                  onClick={() => setEditingBirthday(true)}>
            Change my birthday
          </button>
        </div>
      ) : (
        // No birth date: the numbers above still work, so this asks rather than blocks.
        <div style={{ padding: 16, borderRadius: 10, background: "rgba(0,0,0,.45)", border: "1px solid var(--gold-border)" }}>
          <p style={{ marginTop: 0 }}>
            Tell us your birthday and we will show your star sign and today&apos;s reading.
            We only need the day and month — we keep it for next time.
          </p>
          <input
            type="date"
            className="input"
            value={birthday}
            max={today}  /* a birthday cannot be in the future; the server rejects one anyway */
            onChange={(e) => setBirthday(e.target.value)}
          />
          <button className="btn" style={{ marginTop: 12 }} disabled={!birthday || loading}
                  onClick={() => void load(birthday)}>
            Save
          </button>
        </div>
      )}

      <p className="muted" style={{ marginTop: 24, textAlign: "center", fontSize: 12 }}>
        {fortune?.disclaimer ?? "For entertainment only."}
      </p>
    </div>
  );
}
