// "Country you're from" (Steve, 2026-11-23) — the black and gold pieces: the one-time question
// sheet, the settings row, and the "🇵🇭 From Philippines · 🇺🇸 Lives in United States" line.
// See lib/fromCountry.ts.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { useT } from "../lib/i18n";
import { useSession } from "../lib/session";
import { post } from "../lib/api";
import { cbText } from "../lib/countryBattle";
import { countryFlag } from "../lib/allCountryBattles";
import {
  demoFromCountry, fetchFromCountry, fromCountryAskData, fromCountryDate, fromCountryDismissed, fromCountryNotNow,
  sameCountry, setFromCountry, type FromCountry,
} from "../lib/fromCountry";

/**
 * Every country (fetchSettings countryStates, the list the ad-targeting picker uses). NOT the
 * server's `countries` — that is the member's own one or two countries, and with it the list came
 * up empty on 2026-11-23 (only "United States", which is hidden as "same as where I live").
 * `extra` (sample names) is only for the ?from_demo=1 preview.
 */
function useCountryNames(extra: string[]): string[] {
  const [all, setAll] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    post<{ countryStates?: { data?: { name?: string | null }[] } }>("fetchSettings", { x: 1 })
      .then((r) => { if (live) setAll((r.data?.countryStates?.data ?? []).map((c) => c.name ?? "").filter(Boolean)); })
      .catch(() => undefined);
    return () => { live = false; };
  }, []);
  return all.length ? all : extra;
}

/**
 * "Where are you from?" — a country list with search, a big "Same as where I live (🇺🇸 United
 * States)" button, and "Not now" (ask mode) or Close (edit mode). Saves with setFromCountry.
 */
export function FromCountrySheet({ data, mode, onSaved, onClose, demo }: {
  data: FromCountry;
  mode: "ask" | "edit";
  onSaved: (d: FromCountry) => void;
  onClose: () => void;
  demo?: boolean;
}) {
  const { t } = useT();
  const { user } = useSession();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const all = useCountryNames(data.countries);
  const list = all.filter((c) => !sameCountry(c, data.country));
  const needle = q.trim().toLowerCase();
  const shown = needle ? list.filter((c) => c.toLowerCase().includes(needle)) : list;

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const pick = async (value: string) => {
    if (busy) return;
    if (demo) { onSaved({ ...data, asked: true, from_country: value || null }); return; }
    if (!user) return;
    setBusy(true);
    setErr("");
    const r = await setFromCountry(user.id, value);
    setBusy(false);
    if (r.ok) { onSaved(r.data ?? { ...data, asked: true, from_country: value || null }); return; }
    if (r.reason === "too_soon") {
      const date = fromCountryDate(r.data?.can_change_at ?? data.can_change_at);
      setErr(date ? cbText(t("from_locked"), { date }) : r.message || t("couldn_t_save"));
    } else setErr(r.message || t("couldn_t_save"));
  };

  const row = (c: string) => {
    const on = sameCountry(c, data.from_country);
    return (
      <button key={c} type="button" disabled={busy} onClick={() => pick(c)}
        style={{
          display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", cursor: "pointer",
          padding: "12px 14px", marginBottom: 8, borderRadius: 10, background: on ? "var(--gold)" : "#101010",
          color: on ? "#0d0d0d" : "var(--gold)", border: `1.5px solid ${on ? "var(--gold)" : "var(--gold-border)"}`,
          fontWeight: on ? 800 : 600, fontSize: 15,
        }}>
        <span aria-hidden style={{ fontSize: 20 }}>{countryFlag(c) || "🌍"}</span>
        <span>{c}</span>
      </button>
    );
  };

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={t("from_q_title")} onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(0,0,0,.8)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          display: "flex", flexDirection: "column", width: "100%", maxWidth: 480, maxHeight: "88vh",
          background: "#000", border: "1.5px solid var(--gold)", borderRadius: 18, padding: 18,
          boxShadow: "0 0 32px rgba(255,200,60,.18)",
        }}>
        <div style={{ fontWeight: 900, fontSize: 22, color: "var(--gold)", textAlign: "center" }}>🌍 {t("from_q_title")}</div>
        <p style={{ color: "#fff", fontSize: 14, textAlign: "center", margin: "6px 0 14px", lineHeight: 1.4 }}>{t("from_q_sub")}</p>
        {data.country && (
          <button type="button" className="btn gold" disabled={busy} onClick={() => pick("")}
            style={{ width: "100%", padding: "14px 12px", fontSize: 16, fontWeight: 800, marginBottom: 12, flex: "0 0 auto" }}>
            {t("from_same")} ({countryFlag(data.country)} {data.country})
          </button>
        )}
        <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder={t("search_count", list.length)} style={{ marginBottom: 10, flex: "0 0 auto" }} />
        {err && <div style={{ color: "var(--gold)", fontSize: 13, textAlign: "center", marginBottom: 8 }}>{err}</div>}
        <div className="picker-scroll" style={{ overflowY: "auto", flex: 1, minHeight: 120 }}>
          {shown.map(row)}
          {shown.length === 0 && (
            <p className="muted" style={{ fontSize: 13, textAlign: "center", padding: "20px 0" }}>
              {list.length ? t("nothing_matches_query", q) : "…"}
            </p>
          )}
        </div>
        <button type="button" className="btn ghost" onClick={onClose} style={{ marginTop: 12, flex: "0 0 auto" }}>
          {mode === "ask" ? t("from_not_now") : t("close")}
        </button>
      </div>
    </div>,
    document.body,
  );
}

/**
 * The one-time question on the Country Battle pages and the Country Board: shown when the member is
 * signed in and fetchFromCountry says asked=false. "Not now" waits for the next app start.
 * ?from_demo=1 shows it with sample countries under `vite` only (never in a build).
 */
const ASK_ENABLED = false as boolean;

export function FromCountryAsk() {
  const { user } = useSession();
  const [sp] = useSearchParams();
  const demo = import.meta.env.DEV && sp.get("from_demo") === "1";
  const uid = user?.id ?? 0;
  const [data, setData] = useState<FromCountry | null>(null);
  useEffect(() => {
    if (demo) { setData(demoFromCountry()); return; }
    // The popup is gone (Steve, 2026-11-23: "Remove this page, it is no longer needed" — any member battles
    // for any country now). "Country you're from" stays as an optional row in Account Settings.
    if (ASK_ENABLED === false) return;
    if (!uid || fromCountryDismissed()) return;
    let live = true;
    fromCountryAskData(uid).then((d) => { if (live && d && !d.asked && !fromCountryDismissed()) setData(d); });
    return () => { live = false; };
  }, [uid, demo]);
  if (!data || data.asked) return null;
  const close = () => { fromCountryNotNow(); setData(null); };
  return <FromCountrySheet data={data} mode="ask" demo={demo} onClose={close} onSaved={() => { fromCountryNotNow(); setData(null); }} />;
}

/**
 * The settings row "Country you're from": the flag + name, or "Same as where I live". A tap opens the
 * same sheet, unless the 30-day lock is on ("You can change this on <date>"). Nothing at all while
 * the server can't answer (not deployed yet).
 */
export function FromCountryRow({ style }: { style?: React.CSSProperties }) {
  const { t } = useT();
  const { user, refresh } = useSession();
  const uid = user?.id ?? 0;
  const [data, setData] = useState<FromCountry | null>(null);
  const [open, setOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    let live = true;
    fetchFromCountry(uid).then((d) => { if (live) setData(d); });
    return () => { live = false; };
  }, [uid]);
  if (!data) return null;
  const from = data.from_country && !sameCountry(data.from_country, data.country) ? data.from_country : null;
  const date = fromCountryDate(data.can_change_at);
  return (
    <>
      <button type="button" className="row" onClick={() => (data.can_change ? setOpen(true) : setLocked(true))}
        style={{ width: "100%", padding: "12px 14px", background: "transparent", border: 0, textAlign: "left", cursor: "pointer", color: "inherit", ...style }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>{t("from_row")}</div>
          <div style={{ fontSize: 13, color: "var(--gold)" }}>
            {from ? `${countryFlag(from)} ${from}` : t("from_same")}
          </div>
          {locked && !data.can_change && (
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{date ? cbText(t("from_locked"), { date }) : ""}</div>
          )}
        </div>
        <span aria-hidden style={{ color: "var(--gold)", fontSize: 18 }}>›</span>
      </button>
      {open && (
        <FromCountrySheet data={data} mode="edit" onClose={() => setOpen(false)}
          onSaved={(d) => { setData(d); setOpen(false); refresh(); }} />
      )}
    </>
  );
}

/** "🇵🇭 From Philippines · 🇺🇸 Lives in United States" — only when from_country is set and differs. */
export function FromCountryLine({ country, fromCountry }: { country?: string | null; fromCountry?: string | null }) {
  const { t } = useT();
  if (!fromCountry || !country || sameCountry(fromCountry, country)) return null;
  return (
    <div className="gold-plate" style={{ marginTop: 6, fontSize: 12, color: "var(--gold)", opacity: 0.9 }}>
      {countryFlag(fromCountry)} {cbText(t("from_line_from"), { country: fromCountry })}
      {" · "}
      {countryFlag(country)} {cbText(t("from_line_lives"), { country })}
    </div>
  );
}
