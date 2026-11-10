// Free Points v2 (Steve, 2026-11-09) — see lib/freePoints.ts. Everything here renders nothing
// (or the old single balance) when the server has not sent the new fields yet.
import { useEffect, useState } from "react";
import { useT } from "../lib/i18n";
import { fetchLivePoints, type LivePoints, type WalletSplit } from "../lib/freePoints";

const fmt = (x: number, lang: string) => x.toLocaleString(lang === "tl" ? "fil" : lang);

/** The Wallet's gifting balance: "Coins: N" + "⭐ Free Points: N" + the explainer (+ Test coins
 *  for testers only). Without the split it is the old single number, exactly as before. */
export function WalletBalance({ w, label }: { w: WalletSplit; label: string }) {
  const { t, lang } = useT();
  if (!w.split) {
    return <div className="card pad"><div className="muted">{label}</div><div style={{ fontSize: 28, fontWeight: 800, color: "var(--gold)" }}>{w.total}</div></div>;
  }
  return (
    <div className="card pad fp-wallet">
      <div className="muted">{label}</div>
      <div className="fp-wallet-line">{t("fp_coins", fmt(w.paid, lang))}</div>
      <div className="fp-wallet-line">{t("fp_free_points", fmt(w.free, lang))}</div>
      <div className="fp-explainer">{t("fp_explainer")}</div>
      {w.test > 0 && <div className="fp-test">{t("fp_test_coins", fmt(w.test, lang))}</div>}
    </div>
  );
}

/** " (incl. N Free Points)" after a gifting balance, only when there are some. */
export function FreePointsIncl({ w }: { w: WalletSplit }) {
  const { t, lang } = useT();
  if (!w.split || w.free <= 0) return null;
  return <span className="fp-incl"> {t("fp_incl", fmt(w.free, lang))}</span>;
}

/** Fetches fetchLivePoints now, every 60 s, and again whenever `bump` changes. null = show nothing. */
export function useLivePoints(myId: number | null | undefined, bump?: unknown): LivePoints | null {
  const [lp, setLp] = useState<LivePoints | null>(null);
  useEffect(() => {
    if (!myId) { setLp(null); return; }
    let alive = true;
    const load = () => { void fetchLivePoints(myId).then((r) => { if (alive) setLp(r); }); };
    load();
    const id = setInterval(load, 60000);
    return () => { alive = false; clearInterval(id); };
  }, [myId, bump]);
  return lp;
}

/** The host's gold pill while live: "⭐ +500 Free Points / hour · 1/4 today". */
export function LivePointsPill({ myId, bump }: { myId: number | null; bump?: unknown }) {
  const { t } = useT();
  const lp = useLivePoints(myId, bump);
  if (!lp) return null;
  const done = Math.min(lp.today_hours_done, lp.max_hours);
  return (
    <div className="sb-pill-row">
      <span className="sb-pill fp-pill">
        {done >= lp.max_hours ? t("fp_live_done") : t("fp_live_pill", lp.per_hour, done, lp.max_hours)}
      </span>
    </div>
  );
}

/** The card at the top of Go Live, before going live, while the promotion runs. */
export function GoLivePointsCard({ myId }: { myId: number | null }) {
  const { t } = useT();
  const lp = useLivePoints(myId);
  if (!lp) return null;
  return <div className="card pad sb-card fp-golive"><span className="sb-card-line">{t("fp_golive_card", lp.per_hour, lp.max_hours)}</span></div>;
}

/** The short gold "+500 Free Points for going live!" toast; it clears itself after 5 s. */
export function LivePointsToast({ points, onDone }: { points: number; onDone: () => void }) {
  const { t } = useT();
  useEffect(() => { const id = setTimeout(onDone, 5000); return () => clearTimeout(id); }, [points, onDone]);
  return <div className="fp-toast" role="status" aria-live="polite">{t("fp_live_awarded", points)}</div>;
}
