import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useSession } from "../lib/session";
import { fetchDailyFortune, type DailyFortune } from "../lib/api";
import { tt, useT  } from "../lib/i18n";

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
  const { t, tn } = useT();
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
        setError(res.message ?? tt("could_not_load_that_right_now"));
        return;
      }
      setFortune(res);
      setEditingBirthday(false);
      if (res.date_of_birth) setBirthday(res.date_of_birth.slice(0, 10));
    } catch {
      setError(tt("could_not_load_that_right_now"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [me]);

  if (!me) {
    return <div className="page"><div className="notice">{tn("sign_in_to_see_lucky_numbers", <Link to="/login">{t("sign_in")}</Link>)}</div></div>;
  }

  // Numeric order: sorting the keys as strings would put "10" before "3".
  const numbers = Object.entries(fortune?.lucky_numbers ?? {})
    .map(([length, value]) => ({ length: Number(length), value }))
    .sort((a, b) => a.length - b.length);

  const headingPlate: CSSProperties = {
    marginTop: 18, padding: "12px 16px", borderRadius: 10,
    background: "var(--gold)", color: "#000", fontWeight: 800, fontSize: 18,
    border: "2px solid #000", textAlign: "center",
  };
  // Steve, 2026-10-13: "Add a light border same as above on the bottom horoscope box" — the
  // same hairline the digit rows carry, so the whole page reads as one set of boxes.
  const plainPlate: CSSProperties = {
    padding: 16, borderRadius: 10, background: "#000", border: "1px solid var(--gold)",
  };

  const hasSign = Boolean(fortune?.sign);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="page">
      <h2>{t("lucky_numbers_horoscope")}</h2>

      {/* Steve, 2026-10-13: "Put the 'Your Lucky Numbers' and 'Your Daily Horoscope' in a gold
          box with bold black text. Add a black border to the rest of the boxes. All text should
          be in gold. Make the 3 digit, 4 digit ... text the same size as the numbers." Same on
          Android and iOS. */}
      <div style={headingPlate}>{t("your_lucky_numbers")}</div>
      {loading && !fortune ? (
        <p className="muted">{t("imagePickerLoading")}</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {numbers.map((n) => (
            <div
              key={n.length}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "14px 16px", borderRadius: 10,
                // Steve, 2026-10-13: "Add a border around the digits not too thick." A hairline
                // gold rim on the black plate — the horoscope boxes below keep their black one.
                background: "#000", border: "1px solid var(--gold)",
              }}
            >
              {/* Same size and weight as the number beside it — a small grey caption made the
                  row read as one number with a note, not as "this is the 3-digit one". */}
              <span style={{ fontSize: 24, fontWeight: 700, color: "var(--gold)" }}>{t("n_digits", n.length)}</span>
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

      <div style={{ ...headingPlate, marginTop: 30 }}>{t("your_daily_horoscope")}</div>
      {error && <div className="notice">{error}</div>}

      {hasSign && !editingBirthday ? (
        <div style={plainPlate}>
          <div style={{ color: "var(--gold)", fontWeight: 700, textTransform: "capitalize" }}>{fortune?.sign}</div>
          <p style={{ marginBottom: 0, marginTop: 10, color: "var(--gold)" }}>
            {/* A sign with nothing in the bank yet is possible — say so rather than leave an
                empty box that just looks broken. */}
            {fortune?.horoscope || "No reading for your sign today. Check back tomorrow."}
          </p>
          <button className="btn small" style={{ marginTop: 14, background: "transparent", color: "var(--gold)", borderColor: "var(--gold-border)" }}
                  onClick={() => setEditingBirthday(true)}>
            {t("change_my_birthday")}</button>
        </div>
      ) : (
        // No birth date: the numbers above still work, so this asks rather than blocks.
        <div style={plainPlate}>
          <p style={{ marginTop: 0, color: "var(--gold)" }}>
            {t("horoscope_needs_birthday")}</p>
          <input
            type="date"
            className="input"
            value={birthday}
            max={today}  /* a birthday cannot be in the future; the server rejects one anyway */
            onChange={(e) => setBirthday(e.target.value)}
          />
          <button className="btn" style={{ marginTop: 12 }} disabled={!birthday || loading}
                  onClick={() => void load(birthday)}>
            {t("save_address")}</button>
        </div>
      )}

      <p className="muted" style={{ marginTop: 24, textAlign: "center", fontSize: 12 }}>
        {fortune?.disclaimer ?? "For entertainment only."}
      </p>
    </div>
  );
}
