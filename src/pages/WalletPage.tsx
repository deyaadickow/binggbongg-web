import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { WEB_BASE, post } from "../lib/api";

interface WebCoinPlan { id: number; coins: number; bonus_coins: number; total_coins: number; price: number }
import { useSession } from "../lib/session";
import { Loading, Notice } from "../components/Common";
import { WALLET_LINKS } from "./WalletPages";

export function WalletPage() {
  const { user, isLoggedIn, refresh } = useSession();
  const [plans, setPlans] = useState<WebCoinPlan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { refresh(); /* fresh balances */ }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!user) return;
    // The packs the WEBSITE checkout sells (with bonus coins) — not the phones' store products.
    post<WebCoinPlan[]>("fetchWebCoinPlans", { user_id: user.id })
      .then((res) => setPlans(res.data ?? []))
      .catch((e) => setError((e as Error).message));
  }, [user]);

  async function buy() {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const res = await post<unknown>("startWebCoinsBuySession", { user_id: user.id });
      const token = (res as { token?: string }).token ?? (res.data as { token?: string } | undefined)?.token;
      if (!res.status || !token) throw new Error(res.message ?? "Couldn't open the coin store.");
      window.open(`${WEB_BASE}buyCoins/${token}`, "_blank", "noopener");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!isLoggedIn || !user) return <div className="page"><Notice>Sign in to see your wallet. <Link to="/login">Sign in</Link></Notice></div>;


  return (
    <div className="page">
      <h1 className="page-title">Wallet</h1>
      <div className="grid">
        <div className="card pad"><div className="muted">Coins to gift</div><div style={{ fontSize: 28, fontWeight: 800, color: "var(--gold)" }}>{user.no_redeem_wallet ?? 0}</div></div>
        <div className="card pad"><div className="muted">Earned coins</div><div style={{ fontSize: 28, fontWeight: 800, color: "var(--gold)" }}>{user.redeem_wallet ?? 0}</div></div>
        <div className="card pad"><div className="muted">Cash balance</div><div style={{ fontSize: 28, fontWeight: 800, color: "var(--gold)" }}>${Number(user.cash_wallet ?? 0).toFixed(2)}</div></div>
      </div>
      {/* Steve, 2026-09-24: the seven links under the phones' Wallet screen, as gold bullet boxes. */}
      <div className="grid wide" style={{ marginTop: 14 }}>
        {WALLET_LINKS.map((l) => (
          <Link key={l.to} to={l.to} className="card pad wallet-link">
            <span className="ico">{l.icon}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <b style={{ color: "var(--gold)" }}>{l.label}</b>
              <span className="muted" style={{ display: "block", fontSize: 12 }}>{l.hint}</span>
            </span>
            <span style={{ color: "var(--gold)", fontSize: 22 }}>›</span>
          </Link>
        ))}
      </div>
      <h2 className="page-title" style={{ marginTop: 22, fontSize: 18 }}>Buy coins</h2>
      {error && <Notice error>{error}</Notice>}
      {plans === null ? <Loading /> : (
        <div className="grid">
          {plans.map((p) => (
            <div key={p.id} className="card pad center">
              <div style={{ fontSize: 24, fontWeight: 800, color: "var(--gold)" }}>{p.total_coins.toLocaleString()} coins</div>
              {p.bonus_coins > 0 && <div className="muted" style={{ fontSize: 12 }}>{p.coins.toLocaleString()} + {p.bonus_coins.toLocaleString()} bonus</div>}
              <div className="soft" style={{ marginTop: 4 }}>${Number(p.price).toFixed(2)}</div>
            </div>
          ))}
        </div>
      )}
      <div className="center" style={{ marginTop: 18 }}>
        <button className="btn" onClick={buy} disabled={busy}>{busy ? "Opening…" : "Buy coins"}</button>
        <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>Opens the secure Bingg Bongg checkout with PayPal or card. Your balance updates here when you come back.</p>
      </div>
    </div>
  );
}
