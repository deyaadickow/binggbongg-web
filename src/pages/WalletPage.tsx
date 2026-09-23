import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { WEB_BASE, post, type CoinPlan } from "../lib/api";
import { useSession } from "../lib/session";
import { Loading, Notice } from "../components/Common";

export function WalletPage() {
  const { user, isLoggedIn, refresh } = useSession();
  const [plans, setPlans] = useState<CoinPlan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { refresh(); /* fresh balances */ }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!user) return;
    post<CoinPlan[]>("fetchCoinPlans", { user_id: user.id })
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

  const price = (p: CoinPlan) => p.price ?? p.amount ?? 0;
  const coins = (p: CoinPlan) => p.coin_amount ?? p.coins ?? 0;

  return (
    <div className="page">
      <h1 className="page-title">Wallet</h1>
      <div className="grid">
        <div className="card pad"><div className="muted">Coins to gift</div><div style={{ fontSize: 28, fontWeight: 800, color: "var(--gold)" }}>{user.no_redeem_wallet ?? 0}</div></div>
        <div className="card pad"><div className="muted">Earned coins</div><div style={{ fontSize: 28, fontWeight: 800, color: "var(--gold)" }}>{user.redeem_wallet ?? 0}</div></div>
        <div className="card pad"><div className="muted">Cash balance</div><div style={{ fontSize: 28, fontWeight: 800, color: "var(--gold)" }}>${Number(user.cash_wallet ?? 0).toFixed(2)}</div></div>
      </div>
      <h2 className="page-title" style={{ marginTop: 22, fontSize: 18 }}>Buy coins</h2>
      {error && <Notice error>{error}</Notice>}
      {plans === null ? <Loading /> : (
        <div className="grid">
          {plans.map((p) => (
            <div key={p.id} className="card pad center">
              <div style={{ fontSize: 24, fontWeight: 800, color: "var(--gold)" }}>{coins(p)} coins</div>
              <div className="soft">${Number(price(p)).toFixed(2)}</div>
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
