// The seven links under the phones' Wallet screen, on the web (Steve, 2026-09-24: "In the
// wallet there is 7 other links please add them all here"): Redeem, Payout history, Monthly
// earnings statement, Money earned from ad referrals / all videos / reposting videos, and the
// Rewarding actions box. Same endpoints the Android WalletActivity's targets call.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { post, type Post } from "../lib/api";
import { useSession } from "../lib/session";
import { Loading, Notice } from "../components/Common";
import { PostCard } from "../components/PostCard";

const money = (v: unknown, sym = "$") => `${sym}${Number(v ?? 0).toFixed(2)}`;

function useToast() {
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  return { setToast, el: toast ? <div className="notice" style={{ position: "fixed", left: 16, right: 16, bottom: 16, maxWidth: 480, margin: "0 auto", zIndex: 30 }}>{toast}</div> : null };
}

function Page({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <div className="row" style={{ marginBottom: 14 }}>
        <Link to="/wallet" className="btn small ghost">‹ Wallet</Link>
        <h1 className="page-title" style={{ margin: 0 }}>{title}</h1>
      </div>
      {children}
    </div>
  );
}
function NeedLogin() { return <div className="page"><Notice>Sign in to open this page. <Link to="/login">Sign in</Link></Notice></div>; }

export const WALLET_LINKS: { to: string; icon: string; label: string; hint: string }[] = [
  { to: "/wallet/redeem", icon: "💸", label: "Redeem", hint: "Withdraw your cash balance by PayPal, Wise and more" },
  { to: "/wallet/payout-history", icon: "🧾", label: "Payout history", hint: "Every withdrawal you've requested and its status" },
  { to: "/wallet/statements", icon: "📅", label: "Monthly earnings statement", hint: "What you earned, month by month, day by day" },
  { to: "/wallet/ad-referrals", icon: "📣", label: "Money earned from ad referrals", hint: "Commissions from video ads uploaded with your code" },
  { to: "/wallet/all-videos", icon: "🎬", label: "Money earned from all videos", hint: "Earnings from your uploaded videos" },
  { to: "/wallet/reposts", icon: "🔁", label: "Money earned from reposting videos", hint: "Earnings from videos you reposted" },
  { to: "/wallet/rewards", icon: "🎁", label: "Rewarding actions", hint: "Daily check-in, upload and sign-up rewards" },
];

// ---- earnings totals (shared by Redeem and All videos) ---------------------------------------
interface Earnings { todayEarnings?: number; thisWeekEarnings?: number; thisMonthEarnings?: number; yearEarnings?: number }
function useEarnings(userId: number | undefined, year: number) {
  const [earn, setEarn] = useState<Earnings | null>(null);
  useEffect(() => {
    if (!userId) return;
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    post<unknown>("fetchEarningData", { user_id: userId, today_date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, month: d.getMonth() + 1, month_year: d.getFullYear(), year })
      .then((r) => setEarn(r as unknown as Earnings)).catch(() => setEarn({}));
  }, [userId, year]);
  return earn;
}
function EarningsRow({ earn, year, onYear }: { earn: Earnings | null; year: number; onYear: (y: number) => void }) {
  const thisYear = new Date().getFullYear();
  return (
    <div className="row" style={{ flexWrap: "wrap", gap: 18 }}>
      {[["Today", earn?.todayEarnings], ["This week", earn?.thisWeekEarnings], ["This month", earn?.thisMonthEarnings]].map(([k, v]) => (
        <div key={k as string}><div className="muted" style={{ fontSize: 12 }}>{k as string}</div><div style={{ fontWeight: 800, color: "var(--gold)", fontSize: 18 }}>{earn ? money(v) : "…"}</div></div>
      ))}
      <div>
        <select className="input" style={{ minHeight: 30, padding: "0 8px", fontSize: 12 }} value={year} onChange={(e) => onYear(Number(e.target.value))}>
          {[0, 1, 2, 3].map((i) => <option key={i} value={thisYear - i}>{thisYear - i}</option>)}
        </select>
        <div style={{ fontWeight: 800, color: "var(--gold)", fontSize: 18 }}>{earn ? money(earn.yearEarnings) : "…"}</div>
      </div>
    </div>
  );
}

// ---- Redeem --------------------------------------------------------------------------------
interface WiseProfile { has_profile?: boolean; profile?: { country?: string; currency?: string; provider?: string; account_holder_name?: string; account_number?: string; address_line?: string; address_city?: string; address_postcode?: string } }
interface WiseCountry { code?: string; country?: string; name?: string; currency?: string; providers?: ({ key?: string; id?: string; value?: string; name?: string; label?: string } | string)[] }
export function RedeemPage() {
  const { user, isLoggedIn, refresh } = useSession();
  const [year, setYear] = useState(new Date().getFullYear());
  const earn = useEarnings(user?.id, year);
  const [amount, setAmount] = useState("");
  const [gateway, setGateway] = useState<string>("PayPal");
  const [gateways, setGateways] = useState<string[]>(["PayPal", "Wise"]);
  useEffect(() => {
    // The admin's "Redeem gateways" list (PayPal, Alipay, Grab Pay, Cash App Pay, …) plus Wise.
    post<{ redeem_gateways?: { gateway: string }[] }>("fetchSettings", { x: 1 }).then((r) => {
      const g = (r.data?.redeem_gateways ?? []).map((x) => x.gateway).filter(Boolean);
      if (g.length) setGateways(g.includes("Wise") ? g : [...g, "Wise"]);
    }).catch(() => undefined);
  }, []);
  const pretty = (g: string) => g.replace(/_/g, " ");
  const [account, setAccount] = useState("");
  const [wise, setWise] = useState<WiseProfile | null>(null);
  const [countries, setCountries] = useState<WiseCountry[]>([]);
  const [editWise, setEditWise] = useState(false);
  const [wf, setWf] = useState({ country: "", provider: "", account_number: "", account_holder_name: "", address_line: "", address_city: "", address_postcode: "" });
  const [busy, setBusy] = useState(false);
  const { setToast, el } = useToast();
  const loadWise = useCallback(() => {
    if (!user) return;
    post<unknown>("getWisePayoutProfile", { user_id: user.id }).then((r) => {
      const w = r as unknown as WiseProfile; setWise(w);
      const p = w.profile; if (p) setWf({ country: p.country ?? "", provider: p.provider ?? "", account_number: "", account_holder_name: p.account_holder_name ?? "", address_line: p.address_line ?? "", address_city: p.address_city ?? "", address_postcode: p.address_postcode ?? "" });
    }).catch(() => setWise({}));
    post<unknown>("wiseWalletOptions", { user_id: user.id }).then((r) => setCountries(((r as { countries?: WiseCountry[] }).countries) ?? [])).catch(() => undefined);
  }, [user]);
  useEffect(loadWise, [loadWise]);
  if (!isLoggedIn || !user) return <NeedLogin />;
  const cc = (c: WiseCountry) => c.code ?? c.country ?? "";
  const selected = countries.find((c) => cc(c) === wf.country);
  const provs = (selected?.providers ?? []).map((p) => typeof p === "string" ? { key: p, label: p } : { key: p.key ?? p.id ?? p.value ?? p.name ?? "", label: p.label ?? p.name ?? p.key ?? "" });
  async function saveWise() {
    setBusy(true);
    try {
      const r = await post("saveWisePayoutProfile", { user_id: user!.id, ...wf });
      if (!r.status) throw new Error(r.message ?? "Couldn't save your Wise details.");
      setToast("Wise details saved."); setEditWise(false); loadWise();
    } catch (e) { setToast((e as Error).message); } finally { setBusy(false); }
  }
  async function redeem() {
    const cash = Number(amount);
    if (!cash || cash <= 0) { setToast("Enter the amount to withdraw."); return; }
    if (gateway !== "Wise" && !account.trim()) { setToast(`Enter your ${pretty(gateway)} account (email or mobile).`); return; }
    setBusy(true);
    try {
      const r = await post("submitRedeem", { user_id: user!.id, gateway, account: gateway === "Wise" ? "wise" : account.trim(), cash_amount: cash });
      if (!r.status) throw new Error(r.message ?? "Couldn't submit the request.");
      setToast("Withdrawal requested. You'll see it in Payout history."); setAmount(""); refresh();
    } catch (e) { setToast((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Page title="Redeem">
      <div className="card pad" style={{ marginBottom: 12 }}>
        <div className="muted" style={{ fontSize: 12 }}>Cash balance (after converting coins → gifts → diamonds → cash)</div>
        <div style={{ fontWeight: 800, color: "var(--gold)", fontSize: 30 }}>{money(user.cash_wallet)}</div>
        <div className="muted" style={{ fontSize: 12, margin: "10px 0 6px" }}>Total money earned from all your uploaded videos in all categories</div>
        <EarningsRow earn={earn} year={year} onYear={setYear} />
      </div>
      <div className="card pad" style={{ marginBottom: 12 }}>
        <b style={{ color: "var(--gold)" }}>How much money would you like to withdraw?</b>
        <input className="input" type="number" min={1} step="0.01" placeholder="Amount in $" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: "100%", margin: "8px 0 12px" }} />
        <b style={{ color: "var(--gold)" }}>Select payment method</b>
        <div className="row" style={{ margin: "8px 0 12px", flexWrap: "wrap" }}>
          {gateways.map((g) => <button key={g} className={`btn small${gateway === g ? "" : " ghost"}`} onClick={() => setGateway(g)}>{pretty(g)}</button>)}
        </div>
        {gateway !== "Wise" ? (
          <>
            <label className="soft" style={{ fontSize: 13 }}>Account</label>
            <input className="input" placeholder="Email or mobile" value={account} onChange={(e) => setAccount(e.target.value)} style={{ width: "100%", marginBottom: 12 }} />
          </>
        ) : (
          <div className="card pad" style={{ marginBottom: 12, background: "#000" }}>
            {wise === null ? <Loading /> : wise.has_profile && !editWise ? (
              <div className="row">
                <div style={{ flex: 1, fontSize: 13 }}>
                  <b>Wise details saved</b>
                  <div className="muted">{wise.profile?.account_holder_name} · {wise.profile?.country} {wise.profile?.currency ? `(${wise.profile.currency})` : ""} · {wise.profile?.provider}{wise.profile?.account_number ? ` · ${wise.profile.account_number}` : ""}</div>
                </div>
                <button className="btn small ghost" onClick={() => setEditWise(true)}>Edit</button>
              </div>
            ) : (
              <>
                <b style={{ color: "var(--gold)" }}>Your Wise payout details</b>
                <div className="grid" style={{ marginTop: 8, gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <select className="input" value={wf.country} onChange={(e) => setWf({ ...wf, country: e.target.value, provider: "" })}>
                    <option value="">Country</option>
                    {countries.map((c) => <option key={cc(c)} value={cc(c)}>{c.name ?? cc(c)}{c.currency ? ` (${c.currency})` : ""}</option>)}
                  </select>
                  {provs.length > 0
                    ? <select className="input" value={wf.provider} onChange={(e) => setWf({ ...wf, provider: e.target.value })}><option value="">Wallet / bank</option>{provs.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select>
                    : <input className="input" placeholder="Wallet / bank (provider)" value={wf.provider} onChange={(e) => setWf({ ...wf, provider: e.target.value })} />}
                  <input className="input" placeholder="Account number / mobile wallet number" value={wf.account_number} onChange={(e) => setWf({ ...wf, account_number: e.target.value })} />
                  <input className="input" placeholder="Account holder name" value={wf.account_holder_name} onChange={(e) => setWf({ ...wf, account_holder_name: e.target.value })} />
                  <input className="input" placeholder="Address line" value={wf.address_line} onChange={(e) => setWf({ ...wf, address_line: e.target.value })} />
                  <input className="input" placeholder="City" value={wf.address_city} onChange={(e) => setWf({ ...wf, address_city: e.target.value })} />
                  <input className="input" placeholder="Postcode (optional)" value={wf.address_postcode} onChange={(e) => setWf({ ...wf, address_postcode: e.target.value })} />
                </div>
                <div className="row" style={{ marginTop: 10 }}>
                  <button className="btn small" disabled={busy} onClick={saveWise}>Save Wise details</button>
                  {wise?.has_profile && <button className="btn small ghost" onClick={() => setEditWise(false)}>Cancel</button>}
                </div>
              </>
            )}
          </div>
        )}
        <button className="btn block" disabled={busy || (gateway === "Wise" && !wise?.has_profile)} onClick={redeem}>{busy ? "Sending…" : "Redeem"}</button>
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>By redeeming you agree to the <a href="https://admin.binggbongg.com/termsOfUse" target="_blank" rel="noreferrer">Terms &amp; Policy</a>.</p>
      </div>
      {el}
    </Page>
  );
}

// ---- Payout history ---------------------------------------------------------------------------
interface PayoutRow { id: number; amount: number; gateway?: string; status?: string | number; date?: string; completed_date?: string | null; reference?: string | null; auto_approved?: boolean }
export function PayoutHistoryPage() {
  const { user, isLoggedIn } = useSession();
  const [rows, setRows] = useState<PayoutRow[] | null>(null);
  const [sym, setSym] = useState("$");
  useEffect(() => {
    if (!user) return;
    post<unknown>("fetchPayoutHistory", { user_id: user.id }).then((r) => {
      const x = r as { history?: PayoutRow[]; data?: PayoutRow[]; currency_symbol?: string };
      setRows(x.history ?? x.data ?? []); if (x.currency_symbol) setSym(x.currency_symbol);
    }).catch(() => setRows([]));
  }, [user]);
  if (!isLoggedIn || !user) return <NeedLogin />;
  const label = (s: PayoutRow["status"]) => ({ "0": "Pending", "1": "Completed", "2": "Rejected" } as Record<string, string>)[String(s)] ?? String(s ?? "");
  return (
    <Page title="Payout history">
      <div className="card">
        {rows === null ? <Loading /> : rows.length === 0 ? <p className="muted" style={{ padding: 14 }}>No withdrawals yet.</p> : rows.map((r) => (
          <div key={r.id} className="row" style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)" }}>
            <div style={{ flex: 1 }}>
              <b style={{ color: "var(--gold)" }}>{money(r.amount, sym)}</b> <span className="muted">via {r.gateway ?? "—"}</span>
              <div className="muted" style={{ fontSize: 12 }}>Requested {String(r.date ?? "").slice(0, 10)}{r.completed_date ? ` · paid ${String(r.completed_date).slice(0, 10)}` : ""}{r.reference ? ` · ref ${r.reference}` : ""}</div>
            </div>
            <span className="pill">{label(r.status)}</span>
          </div>
        ))}
      </div>
    </Page>
  );
}

// ---- Monthly earnings statement -----------------------------------------------------------------
interface StatementMonth { year: number; month: number; month_label?: string; total_earned?: number }
interface StatementDay { day: number | string; total_earned?: number; entry_count?: number }
export function StatementsPage() {
  const { user, isLoggedIn } = useSession();
  const [months, setMonths] = useState<StatementMonth[] | null>(null);
  const [sym, setSym] = useState("$");
  const [open, setOpen] = useState<StatementMonth | null>(null);
  const [days, setDays] = useState<StatementDay[] | null>(null);
  useEffect(() => {
    if (!user) return;
    post<{ months?: StatementMonth[]; currency_symbol?: string }>("fetchMonthlyEarningsStatements", { user_id: user.id }).then((r) => {
      setMonths(r.data?.months ?? []); if (r.data?.currency_symbol) setSym(r.data.currency_symbol);
    }).catch(() => setMonths([]));
  }, [user]);
  useEffect(() => {
    if (!user || !open) return;
    setDays(null);
    post<{ days?: StatementDay[] }>("fetchMonthlyEarningsStatementDetail", { user_id: user.id, year: open.year, month: open.month }).then((r) => {
      setDays(r.data?.days ?? []);
    }).catch(() => setDays([]));
  }, [user, open]);
  if (!isLoggedIn || !user) return <NeedLogin />;
  return (
    <Page title="Monthly earnings statement">
      {open ? (
        <>
          <div className="row" style={{ marginBottom: 10 }}><button className="btn small ghost" onClick={() => setOpen(null)}>‹ All months</button><b style={{ color: "var(--gold)" }}>{open.month_label ?? `${open.year}-${open.month}`}</b><span className="spacer" /><b>{money(open.total_earned, sym)}</b></div>
          <div className="card">
            {days === null ? <Loading /> : days.length === 0 ? <p className="muted" style={{ padding: 14 }}>Nothing earned this month.</p> : days.map((d, i) => (
              <div key={i} className="row" style={{ padding: "8px 14px", borderBottom: "1px solid var(--line)" }}>
                <span style={{ flex: 1 }}>Day {d.day}{d.entry_count ? <span className="muted"> · {d.entry_count} entries</span> : null}</span>
                <b style={{ color: "var(--gold)" }}>{money(d.total_earned, sym)}</b>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="card">
          {months === null ? <Loading /> : months.length === 0 ? <p className="muted" style={{ padding: 14 }}>No statements yet — they appear once you earn.</p> : months.map((m, i) => (
            <button key={i} className="side-link big" onClick={() => setOpen(m)} style={{ justifyContent: "space-between" }}>
              <span>{m.month_label ?? `${m.year}-${String(m.month).padStart(2, "0")}`}</span>
              <b style={{ color: "var(--gold)" }}>{money(m.total_earned, sym)}</b>
            </button>
          ))}
        </div>
      )}
    </Page>
  );
}

// ---- Money earned from ad referrals -----------------------------------------------------------------
interface AdEarning { video_ad_id?: number; advertiser_name?: string; thumbnail?: string; total?: number; months?: { month?: string | number; year?: number; amount?: number }[] }
export function AdReferralEarningsPage() {
  const { user, isLoggedIn } = useSession();
  const [ads, setAds] = useState<AdEarning[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  useEffect(() => {
    if (!user) return;
    post<unknown>("fetchMyAdReferralEarnings", { my_user_id: user.id }).then((r) => {
      const x = r as { ads?: AdEarning[]; data?: AdEarning[] | { ads?: AdEarning[]; total_earnings?: number }; total_earnings?: number };
      const d = Array.isArray(x.data) ? { ads: x.data } : (x.data ?? {});
      setAds(x.ads ?? d.ads ?? []); setTotal(Number(x.total_earnings ?? d.total_earnings ?? 0));
    }).catch(() => setAds([]));
  }, [user]);
  if (!isLoggedIn || !user) return <NeedLogin />;
  return (
    <Page title="Money earned from ad referrals">
      <div className="card pad" style={{ marginBottom: 12 }}><div className="muted" style={{ fontSize: 12 }}>Total earned</div><div style={{ fontWeight: 800, color: "var(--gold)", fontSize: 28 }}>{total === null ? "…" : money(total)}</div>
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>A one-time commission for every video ad uploaded with your referral code.</p></div>
      <div className="card">
        {ads === null ? <Loading /> : ads.length === 0 ? <p className="muted" style={{ padding: 14 }}>No ad referrals yet.</p> : ads.map((a, i) => (
          <div key={i} style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)" }}>
            <div className="row"><b style={{ flex: 1 }}>{a.advertiser_name ?? `Ad #${a.video_ad_id ?? i + 1}`}</b><b style={{ color: "var(--gold)" }}>{money(a.total)}</b></div>
            {(a.months ?? []).map((m, j) => <div key={j} className="row muted" style={{ fontSize: 12, paddingLeft: 12 }}><span style={{ flex: 1 }}>{m.month} {m.year}</span><span>{money(m.amount)}</span></div>)}
          </div>
        ))}
      </div>
    </Page>
  );
}

// ---- Money earned from all videos / reposts --------------------------------------------------------
function VideoList({ posts }: { posts: Post[] | null }) {
  if (posts === null) return <Loading />;
  if (posts.length === 0) return <p className="muted">No videos yet.</p>;
  return <div className="grid">{posts.map((p) => <PostCard key={p.id} post={p} />)}</div>;
}
export function AllVideosEarningsPage() {
  const { user, isLoggedIn } = useSession();
  const [year, setYear] = useState(new Date().getFullYear());
  const earn = useEarnings(user?.id, year);
  const [posts, setPosts] = useState<Post[] | null>(null);
  useEffect(() => {
    if (!user) return;
    post<Post[]>("fetchMyVideosByUploadBonusOrder", { user_id: user.id, my_user_id: user.id, start: 0, count: 60 }).then((r) => setPosts(r.data ?? [])).catch(() => setPosts([]));
  }, [user]);
  if (!isLoggedIn || !user) return <NeedLogin />;
  return (
    <Page title="Money earned from all videos">
      <div className="card pad" style={{ marginBottom: 12 }}>
        <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Total money earned from all your uploaded videos in all categories</div>
        <EarningsRow earn={earn} year={year} onYear={setYear} />
      </div>
      <VideoList posts={posts} />
    </Page>
  );
}
export function RepostEarningsPage() {
  const { user, isLoggedIn } = useSession();
  const [posts, setPosts] = useState<Post[] | null>(null);
  useEffect(() => {
    if (!user) return;
    post<Post[]>("fetchUserRepostedPosts", { user_id: user.id, my_user_id: user.id }).then((r) => setPosts(r.data ?? [])).catch(() => setPosts([]));
  }, [user]);
  if (!isLoggedIn || !user) return <NeedLogin />;
  return (
    <Page title="Money earned from reposting videos">
      <p className="muted" style={{ fontSize: 13 }}>Videos you reposted. You earn a share of what they make while your repost is up.</p>
      <VideoList posts={posts} />
    </Page>
  );
}

// ---- Rewarding actions --------------------------------------------------------------------------
interface RewardSettings { reward_daily_check_in?: number | string; reward_video_upload?: number | string; reward_signup?: number | string }
export function RewardingActionsPage() {
  const { isLoggedIn } = useSession();
  const [s, setS] = useState<RewardSettings | null>(null);
  useEffect(() => { post<RewardSettings>("fetchSettings", { x: 1 }).then((r) => setS(r.data ?? {})).catch(() => setS({})); }, []);
  if (!isLoggedIn) return <NeedLogin />;
  const rows = [["Daily check-in", s?.reward_daily_check_in, "Open the app every day"], ["Whenever you upload a video", s?.reward_video_upload, "Every video you post"], ["Sign-up reward", s?.reward_signup, "Once, when you joined"]];
  return (
    <Page title="Rewarding actions">
      <div className="card">
        {rows.map(([k, v, hint]) => (
          <div key={k as string} className="row" style={{ padding: "12px 14px", borderBottom: "1px solid var(--line)" }}>
            <div style={{ flex: 1 }}><b>{k as string}</b><div className="muted" style={{ fontSize: 12 }}>{hint as string}</div></div>
            <b style={{ color: "var(--gold)" }}>{s ? `${Number(v ?? 0)} coins` : "…"}</b>
          </div>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 12 }}>Daily check-in and upload rewards are credited from the phone app.</p>
    </Page>
  );
}
