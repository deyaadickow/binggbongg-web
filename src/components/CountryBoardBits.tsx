// Country Board + Country Battle Recap pieces (Steve, 2026-11-11) shared by the Country Board page,
// the Country Battle home, the battle's end screen and a day's top 100.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { Loading } from "./Common";
import { showGoldAlert } from "./GoldToast";
import { useT } from "../lib/i18n";
import {
  demoCountryBoard, demoRecap, fetchCountryBattleRecap, fetchCountryBoard, prefetchCard, shareCard,
  type CbRecap, type CountryBoard, type DemoKind, type ShareOutcome,
} from "../lib/countryBoard";

type T = ReturnType<typeof useT>["t"];

/** "Philippines is losing to 🇬🇧 United Kingdom by 2,310 points" / "🇵🇭 Philippines is #1 in the world!" */
export function hookLine(t: T, me: NonNullable<CountryBoard["me"]>): string {
  if (me.is_leader || !me.next) return t("cbd_leader", `${me.flag} ${me.country}`);
  // A points tie (backend 2026-11-11): the lower country gets gap 0 and is_leader false.
  if (me.next.gap <= 0) return t("cbd_tied", me.country, `${me.next.flag} ${me.next.country}`);
  return t("cbd_losing", me.country, `${me.next.flag} ${me.next.country}`, me.next.gap.toLocaleString());
}

/** What a share did, said in gold ("cancelled" says nothing). */
export function sayShareOutcome(t: T, o: ShareOutcome) {
  if (o === "copied") showGoldAlert(t("link_copied_paste_it_anywhere"));
  else if (o === "failed") showGoldAlert(t("couldn_t_copy_select_the_link_and_copy_i"));
}

/** The thin gold banner on the Country Battle home: today's hook line, opening the Country Board.
 *  Nothing at all when there is no line to say (signed out, no country, not deployed). */
export function CountryHookBanner({ demo }: { demo?: DemoKind | null }) {
  const { t } = useT();
  const [me, setMe] = useState<CountryBoard["me"]>(null);
  useEffect(() => {
    let live = true;
    (demo ? demoCountryBoard(demo, "today") : fetchCountryBoard("today"))
      .then((b) => { if (live) setMe(b.me); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [demo]);
  if (!me) return null;
  return (
    <Link to={`/country-board${demo ? `?demo=${demo}` : ""}`} className="cbd-banner">
      <span>{hookLine(t, me)}</span>
      <span aria-hidden>›</span>
    </Link>
  );
}

/** Why there is no recap, in the member's language. */
function recapReason(t: T, reason: string, message: string): string {
  if (reason === "not_finished") return t("cbr_not_finished");
  if (reason === "not_participant") return t("cbr_not_participant");
  if (reason === "not_found") return t("cb2_over");
  if (reason === "signin") return t("cb_signin");
  return message || t("couldn_t_get_the_recap_try_again_in_a_mo");
}

/** The recap popup: the card picture, the sentence, Share and Open the picture. `demo` = a sample
 *  recap (or that reason: not_finished / not_participant / not_found) without the server. */
export function RecapSheet({ dayId, demo, onClose }: { dayId: number; demo?: string | null; onClose: () => void }) {
  const { t } = useT();
  const [recap, setRecap] = useState<CbRecap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** What the last share did, said inside the popup (the gold alert sits under it). */
  const [said, setSaid] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    (demo != null ? demoRecap(dayId, demo) : fetchCountryBattleRecap(dayId))
      .then((r) => { if (!live) return; if (r.ok) { setRecap(r.data); prefetchCard(r.data.card_url); } else setError(recapReason(t, r.reason, r.message)); })
      .catch(() => { if (live) setError(t("couldn_t_get_the_recap_try_again_in_a_mo")); });
    return () => { live = false; };
  }, [dayId, demo, t]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  const share = async () => {
    if (!recap) return;
    setBusy(true);
    const o = await shareCard({ cardUrl: recap.card_url, text: recap.share_text, pageUrl: recap.page_url, fileName: `country-battle-${recap.day_id}.png` });
    setBusy(false);
    setSaid(o === "copied" ? `✓ ${t("link_copied_paste_it_anywhere")}` : o === "failed" ? t("couldn_t_copy_select_the_link_and_copy_i") : "");
    setFailed(o === "failed");
  };
  // Portalled to <body>: the battle's end screen is its own stacking layer, under the app bar.
  return createPortal(
    <div className="cbd-sheet" role="dialog" aria-modal="true" aria-label={t("cbr_title")} onClick={onClose}>
      <div className="cbd-sheet-card" onClick={(e) => e.stopPropagation()}>
        <div className="cbd-sheet-head">
          <button className="back-circle" onClick={onClose} aria-label={t("back")}>‹</button>
          <b>{t("cbr_title")}</b>
        </div>
        {!recap && !error && <Loading />}
        {error && <div className="cbd-state">{error}</div>}
        {recap && (
          <>
            {recap.is_test && <div className="cbd-demo">🧪 {t("cb_test")}</div>}
            <div className="cbd-recap-line">
              <span className="cbd-flag" aria-hidden>{recap.flag}</span>
              <b>{t("cbr_rank_of", recap.rank, recap.of)}</b>
              <span>{t("cbd_points", recap.points.toLocaleString())}</span>
            </div>
            {recap.card_url && <img className="cbd-card-img" src={recap.card_url} alt={t("cbr_title")} />}
            <p className="cbd-share-text">{recap.share_text}</p>
            <button className="btn gold block cbd-big-btn" disabled={busy} onClick={() => void share()}>📤 {t("cbr_share_result")}</button>
            {said && <p className="cbd-share-text" role="status" style={{ margin: "10px 0 0", fontWeight: 800 }}>{said}</p>}
            {failed && <p className="cbd-share-text" style={{ margin: "6px 0 0", userSelect: "all" }}>{recap.page_url}</p>}
            {recap.card_url && (
              <a className="btn block cbd-big-btn" href={recap.card_url} target="_blank" rel="noreferrer" style={{ marginTop: 8 }}>🖼️ {t("cbd_open_image")}</a>
            )}
          </>
        )}
        <button className="btn block ghost" style={{ marginTop: 8 }} onClick={onClose}>{t("close")}</button>
      </div>
    </div>,
    document.body,
  );
}

/** The gold "Share my result" button (the end screen) — opens the recap popup. */
export function ShareResultButton({ dayId, demo, onOpen }: { dayId: number; demo?: string | null; onOpen?: () => void }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn gold block cbd-big-btn" style={{ marginTop: 12 }} onClick={() => { onOpen?.(); setOpen(true); }}>📤 {t("cbr_share_result")}</button>
      {open && <RecapSheet dayId={dayId} demo={demo} onClose={() => setOpen(false)} />}
    </>
  );
}

/** The small share icon on MY row of a past day's top 100. */
export function ShareMyRowIcon({ dayId, demo }: { dayId: number; demo?: string | null }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="cbd-row-share" aria-label={t("cbr_share_result")} title={t("cbr_share_result")} onClick={() => setOpen(true)}>📤</button>
      {open && <RecapSheet dayId={dayId} demo={demo} onClose={() => setOpen(false)} />}
    </>
  );
}
