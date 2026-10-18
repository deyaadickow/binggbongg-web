// The seven links under the phones' Wallet screen, on the web (Steve, 2026-09-24: "In the
// wallet there is 7 other links please add them all here"): Redeem, Payout history, Monthly
// earnings statement, Money earned from ad referrals / all videos / reposting videos, and the
// Rewarding actions box. Same endpoints the Android WalletActivity's targets call.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { post, type Post } from "../lib/api";
import { useSession } from "../lib/session";
import { Loading, Notice } from "../components/Common";
import { useToast } from "../components/GoldToast";
import { PostCard } from "../components/PostCard";
import { GoldSelect } from "../components/GoldSelect";
import { downloadStatement, printStatement, type StatementDoc } from "../lib/statementDoc";
import { useT, type StringKey } from "../lib/i18n";

const money = (v: unknown, sym = "$") => `${sym}${Number(v ?? 0).toFixed(2)}`;


function Page({ title, children }: { title: string; children: React.ReactNode }) {
  const { t } = useT();
  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <div className="row" style={{ marginBottom: 14 }}>
        <Link to="/wallet" className="btn small ghost">{t("wallet_2")}</Link>
        <h1 className="page-title" style={{ margin: 0 }}>{title}</h1>
      </div>
      {children}
    </div>
  );
}
function NeedLogin() {
                       const { t, tn } = useT(); return <div className="page"><Notice>{tn("sign_in_to_open_this_page", <Link to="/login">{t("sign_in")}</Link>)}</Notice></div>; }

export const WALLET_LINKS: { to: string; icon: string; label: StringKey; hint: StringKey }[] = [
  { to: "/wallet/redeem", icon: "💸", label: "redeem", hint: "withdraw_your_cash_balance_by_paypal_wis" },
  { to: "/wallet/payout-history", icon: "🧾", label: "payout_history", hint: "every_withdrawal_you_ve_requested_and_it" },
  { to: "/wallet/statements", icon: "📅", label: "monthly_earnings_statement", hint: "what_you_earned_month_by_month_day_by_da" },
  { to: "/wallet/ad-referrals", icon: "📣", label: "money_earned_from_ad_referrals", hint: "commissions_from_video_ads_uploaded_with" },
  { to: "/wallet/all-videos", icon: "🎬", label: "money_earned_from_all_videos", hint: "earnings_from_your_uploaded_videos" },
  // Money earned from reposting videos: removed from the list (Steve, 2026-09-27) — the page still
  // exists at /wallet/reposts so it's one line to bring back.
  // Rewarding actions: removed from the list for now (Steve, 2026-09-24) — the page still exists
  // at /wallet/rewards so it's one line to bring back.
];

// ---- earnings totals (shared by Redeem and All videos) ---------------------------------------
/**
 * "Move earnings to my Cash Account" (Steve, 2026-10-17).
 *
 * One way only, by design: the Cash Account buys things and can never be withdrawn, which is
 * what stops a card top-up being turned straight back into cash. So there is no button back.
 */
/** The two accounts, side by side, each saying plainly what it is for. */
function TwoAccounts({ userId, earnings, cashAccount }: { userId: number; earnings: number; cashAccount: number | null }) {
  void userId;
  const accounts: [string, number | null, string][] = [
    ["Earned Cash Account", earnings,
     "What you earned from gifts, battles and videos. This is the money you withdraw."],
    ["Spending Cash Account", cashAccount,
     "Pays for everything in the app — ads, your show, coins and the shop. Can't be withdrawn."],
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 12 }}>
      {accounts.map(([title, value, blurb]) => (
        <div key={title} className="card pad" style={{ textAlign: "center", borderColor: "var(--gold-border)" }}>
          <div style={{
            width: 118, height: 118, margin: "0 auto 10px", borderRadius: "50%",
            background: "#000", border: "3px solid var(--gold-border)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontWeight: 900, color: "var(--gold)", fontSize: 22 }}>
              {value === null ? "…" : money(value)}
            </span>
          </div>
          <div style={{
            display: "inline-block", background: "var(--gold-border)", color: "#000",
            fontWeight: 800, fontSize: 12, borderRadius: 999, padding: "6px 12px", marginBottom: 8,
          }}>{title}</div>
          {/* Steve, 2026-10-17: "add a gold border around the explanation boxes under the big
              circle and make the white text bold so i can see it". */}
          <p style={{
            fontSize: 12, margin: 0, fontWeight: 700, color: "var(--text)",
            background: "#000", border: "1.5px solid var(--gold-border)",
            borderRadius: 10, padding: 8,
          }}>{blurb}</p>
        </div>
      ))}
    </div>
  );
}

function MoveToCashAccount({ userId, onMoved, cashAccount, setCashAccount }: {
  userId: number; onMoved: () => void;
  cashAccount: number | null; setCashAccount: (v: number | null) => void;
}) {
  const { t } = useT();
  // Steve, 2026-10-17: "$0.00 as default" — not the whole balance, which reads as a
  // decision already taken.
  const [amount, setAmount] = useState("0.00");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const load = useCallback(() => {
    post<{ balance?: number }>("fetchMyAdCashAccount", { my_user_id: userId })
      .then((r) => setCashAccount(Number(r.data?.balance ?? 0)))
      .catch(() => setCashAccount(null));
    // setCashAccount is the owner's setter and stable; including it would re-run this on every
    // render of the page above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(load, [load]);
  void cashAccount;

  async function move() {
    const value = Number(amount);
    if (!(value > 0) || busy) return;
    setBusy(true); setNote("");
    try {
      const r = await post<{ earnings?: number; cash_account?: number }>(
        "transferEarningsToCashAccount", { user_id: userId, amount: value },
      );
      // The server's own message carries the real figures when it refuses — most often that
      // the earnings don't cover it — so it has to reach the member word for word.
      if (!r.status) throw new Error(r.message ?? "Couldn't move that.");
      setNote(r.message ?? "Moved.");
      setAmount("");
      if (r.data?.cash_account !== undefined) setCashAccount(Number(r.data.cash_account));
      onMoved();
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card pad" style={{ marginBottom: 12 }}>
      <b style={{ color: "var(--gold)" }}>{t("move_cash_to_spending_account")}</b>
      {/* The two balances are the circles above — repeating them here would just be two places
          to disagree. */}
      <p style={{ fontSize: 13, margin: "6px 0 10px", fontWeight: 700, color: "var(--text)" }}>
        {t("moves_money_from_your_earned_cash_accoun")}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input className="input" type="number" min={0.01} step="0.01" placeholder={t("amount_in")}
               value={amount} onChange={(e) => setAmount(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
        <button className="btn" disabled={busy || !(Number(amount) > 0)} onClick={move}
                style={{ background: "var(--gold-border)", color: "#000", borderColor: "var(--gold-border)" }}>
          {busy ? "Moving…" : "Move cash to spending account"}
        </button>
      </div>
      {note && <p style={{ fontSize: 13, marginTop: 10, marginBottom: 0, fontWeight: 700 }}>{note}</p>}
    </div>
  );
}

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
  const { t } = useT();
  const thisYear = new Date().getFullYear();
  return (
    <div className="row" style={{ flexWrap: "wrap", gap: 18 }}>
      {[["Today", earn?.todayEarnings], ["This week", earn?.thisWeekEarnings], ["This month", earn?.thisMonthEarnings]].map(([k, v]) => (
        <div key={k as string}><div className="muted" style={{ fontSize: 12 }}>{k as string}</div><div style={{ fontWeight: 800, color: "var(--gold)", fontSize: 18 }}>{earn ? money(v) : "…"}</div></div>
      ))}
      <div>
        {/* Steve, 2026-10-06: "Please make these into our black and gold design" — the native
            list opened as the operating system's grey menu with a red highlight. */}
        <GoldSelect
          ariaLabel={t("year")}
          style={{ minWidth: 92 }}
          value={String(year)}
          options={[0, 1, 2, 3].map((i) => ({ value: String(thisYear - i), label: String(thisYear - i) }))}
          onChange={(v) => onYear(Number(v))}
        />
        <div style={{ fontWeight: 800, color: "var(--gold)", fontSize: 18 }}>{earn ? money(earn.yearEarnings) : "…"}</div>
      </div>
    </div>
  );
}

// ---- Redeem --------------------------------------------------------------------------------
interface WiseProfile { has_profile?: boolean; profile?: { country?: string; currency?: string; provider?: string; account_holder_name?: string; account_number?: string; address_line?: string; address_city?: string; address_postcode?: string } }
interface WiseCountry { code?: string; country?: string; name?: string; currency?: string; providers?: ({ key?: string; id?: string; value?: string; name?: string; label?: string } | string)[] }
export function RedeemPage() {
  const { t } = useT();
  const { user, isLoggedIn, refresh } = useSession();
  // Owned here so the Spending circle and the move card can never disagree about the figure.
  const [cashAccount, setCashAccount] = useState<number | null>(null);
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
    <Page title={t("redeem")}>
      {/* Steve, 2026-10-17: "Add another big circle for a second wallet/account, call the first
          one 'Earned Cash Account' and second 'Spending Cash Account' then you can explane what
          each account does." Two genuinely different kinds of money, and the names now carry
          that: one is yours to take out, the other is yours to spend in the app. */}
      <TwoAccounts userId={user.id} earnings={Number(user.cash_wallet ?? 0)} cashAccount={cashAccount} />

      <div className="card pad" style={{ marginBottom: 12 }}>
        <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>{t("total_money_earned_from_all_your_uploade")}</div>
        <EarningsRow earn={earn} year={year} onYear={setYear} />
      </div>
      {/* Steve, 2026-10-17: "Cash account they can not withdraw out of, they can only withdraw
          the earnings but they can also transfer their earnings to their cash account." The move
          sits next to the withdraw form because they are the two things you can do with earnings,
          and a member deciding between them should see both in one place. One way only — there is
          deliberately no button back. */}
      <MoveToCashAccount userId={user.id} onMoved={refresh} cashAccount={cashAccount} setCashAccount={setCashAccount} />

      <div className="card pad" style={{ marginBottom: 12 }}>
        <b style={{ color: "var(--gold)" }}>{t("how_much_money_would_you_like_to_withdraw")}</b>
        <input className="input" type="number" min={1} step="0.01" placeholder={t("amount_in")} value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: "100%", margin: "8px 0 12px" }} />
        <b style={{ color: "var(--gold)" }}>{t("select_payment_method")}</b>
        <div className="row" style={{ margin: "8px 0 12px", flexWrap: "wrap" }}>
          {gateways.map((g) => <button key={g} className={`btn small${gateway === g ? "" : " ghost"}`} onClick={() => setGateway(g)}>{pretty(g)}</button>)}
        </div>
        {gateway !== "Wise" ? (
          <>
            <label className="soft" style={{ fontSize: 13 }}>{t("account")}</label>
            <input className="input" placeholder={t("email_or_mobile")} value={account} onChange={(e) => setAccount(e.target.value)} style={{ width: "100%", marginBottom: 12 }} />
          </>
        ) : (
          <div className="card pad" style={{ marginBottom: 12, background: "#000" }}>
            {wise === null ? <Loading /> : wise.has_profile && !editWise ? (
              <div className="row">
                <div style={{ flex: 1, fontSize: 13 }}>
                  <b>{t("wise_details_saved")}</b>
                  <div className="muted">{wise.profile?.account_holder_name} · {wise.profile?.country} {wise.profile?.currency ? `(${wise.profile.currency})` : ""} · {wise.profile?.provider}{wise.profile?.account_number ? ` · ${wise.profile.account_number}` : ""}</div>
                </div>
                <button className="btn small ghost" onClick={() => setEditWise(true)}>{t("edit")}</button>
              </div>
            ) : (
              <>
                <b style={{ color: "var(--gold)" }}>{t("your_wise_payout_details")}</b>
                <div className="grid" style={{ marginTop: 8, gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <GoldSelect
                    ariaLabel={t("battle_tab_country")}
                    placeholder={t("battle_tab_country")}
                    searchable
                    value={wf.country}
                    options={countries.map((c) => ({ value: cc(c), label: `${c.name ?? cc(c)}${c.currency ? ` (${c.currency})` : ""}` }))}
                    onChange={(v) => setWf({ ...wf, country: v, provider: "" })}
                  />
                  {provs.length > 0
                    ? <GoldSelect
                        ariaLabel={t("wallet_or_bank")}
                        placeholder={t("wallet_bank")}
                        searchable
                        value={wf.provider}
                        options={provs.map((p) => ({ value: p.key, label: p.label }))}
                        onChange={(v) => setWf({ ...wf, provider: v })}
                      />
                    : <input className="input" placeholder={t("wallet_bank_provider")} value={wf.provider} onChange={(e) => setWf({ ...wf, provider: e.target.value })} />}
                  <input className="input" placeholder={t("account_number_mobile_wallet_number")} value={wf.account_number} onChange={(e) => setWf({ ...wf, account_number: e.target.value })} />
                  <input className="input" placeholder={t("account_holder_name")} value={wf.account_holder_name} onChange={(e) => setWf({ ...wf, account_holder_name: e.target.value })} />
                  <input className="input" placeholder={t("address_line")} value={wf.address_line} onChange={(e) => setWf({ ...wf, address_line: e.target.value })} />
                  <input className="input" placeholder={t("city")} value={wf.address_city} onChange={(e) => setWf({ ...wf, address_city: e.target.value })} />
                  <input className="input" placeholder={t("postcode_optional")} value={wf.address_postcode} onChange={(e) => setWf({ ...wf, address_postcode: e.target.value })} />
                </div>
                <div className="row" style={{ marginTop: 10 }}>
                  <button className="btn small" disabled={busy} onClick={saveWise}>{t("save_wise_details")}</button>
                  {wise?.has_profile && <button className="btn small ghost" onClick={() => setEditWise(false)}>{t("cancel")}</button>}
                </div>
              </>
            )}
          </div>
        )}
        <button className="btn block" disabled={busy || (gateway === "Wise" && !wise?.has_profile)} onClick={redeem}>{busy ? "Sending…" : "Redeem"}</button>
      </div>
      {el}
    </Page>
  );
}

// ---- Payout history ---------------------------------------------------------------------------
interface PayoutRow { id: number; amount: number; gateway?: string; status?: string | number; date?: string; completed_date?: string | null; reference?: string | null; auto_approved?: boolean }
export function PayoutHistoryPage() {
  const { t } = useT();
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
    <Page title={t("payout_history")}>
      <div className="card">
        {rows === null ? <Loading /> : rows.length === 0 ? <p className="muted" style={{ padding: 14 }}>{t("no_withdrawals_yet")}</p> : rows.map((r) => (
          <div key={r.id} className="row" style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)" }}>
            <div style={{ flex: 1 }}>
              <b style={{ color: "var(--gold)" }}>{money(r.amount, sym)}</b> <span className="muted">{t("via_gateway", r.gateway ?? "—")}</span>
              <div className="muted" style={{ fontSize: 12 }}>{t("requested_on", String(r.date ?? "").slice(0, 10))}{r.completed_date ? t("dot_paid_on", String(r.completed_date).slice(0, 10)) : ""}{r.reference ? t("dot_ref", r.reference) : ""}</div>
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
  const { t } = useT();
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

  // Steve, 2026-10-06: "On these 2 pages add a download and a print button." Both buttons are
  // built from the rows already on screen, so a member never downloads something different from
  // what they are looking at.
  const owner = user.fullname || user.username || undefined;
  const monthName = open ? (open.month_label ?? `${open.year}-${String(open.month).padStart(2, "0")}`) : "";
  const monthsDoc = (): StatementDoc => ({
    title: "Monthly earnings statement",
    subtitle: "All months",
    owner,
    rows: (months ?? []).map((m) => ({
      left: m.month_label ?? `${m.year}-${String(m.month).padStart(2, "0")}`,
      right: money(m.total_earned, sym),
    })),
    totalLabel: "Total earned",
    total: money((months ?? []).reduce((t, m) => t + Number(m.total_earned ?? 0), 0), sym),
  });
  const daysDoc = (): StatementDoc => ({
    title: "Monthly earnings statement",
    subtitle: monthName,
    owner,
    rows: (days ?? []).map((d) => ({
      left: `Day ${d.day}`,
      note: d.entry_count ? `· ${d.entry_count} ${d.entry_count === 1 ? "entry" : "entries"}` : undefined,
      right: money(d.total_earned, sym),
    })),
    totalLabel: "Total earned",
    total: money(open?.total_earned, sym),
  });
  const safe = (text: string) => text.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const buttons = (doc: () => StatementDoc, filename: string, ready: boolean) => (
    <div className="row" style={{ gap: 8, marginBottom: 10 }}>
      <button className="btn small" disabled={!ready} onClick={() => downloadStatement(doc(), filename)}>{t("download_2")}</button>
      <button className="btn small ghost" disabled={!ready} onClick={() => printStatement(doc())}>{t("print")}</button>
    </div>
  );

  return (
    <Page title={t("monthly_earnings_statement")}>
      {open ? (
        <>
          <div className="row" style={{ marginBottom: 10 }}><button className="btn small ghost" onClick={() => setOpen(null)}>{t("all_months")}</button><b style={{ color: "var(--gold)" }}>{open.month_label ?? `${open.year}-${open.month}`}</b><span className="spacer" /><b>{money(open.total_earned, sym)}</b></div>
          {buttons(daysDoc, `binggbongg-statement-${safe(monthName)}.pdf`, (days?.length ?? 0) > 0)}
          <div className="card">
            {days === null ? <Loading /> : days.length === 0 ? <p className="muted" style={{ padding: 14 }}>{t("nothing_earned_this_month")}</p> : days.map((d, i) => (
              <div key={i} className="row" style={{ padding: "8px 14px", borderBottom: "1px solid var(--line)" }}>
                <span style={{ flex: 1 }}>{t("day_n", d.day)}{d.entry_count ? <span className="muted">{t("dot_n_entries", d.entry_count)}</span> : null}</span>
                <b style={{ color: "var(--gold)" }}>{money(d.total_earned, sym)}</b>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
        {buttons(monthsDoc, "binggbongg-statement-all-months.pdf", (months?.length ?? 0) > 0)}
        <div className="card">
          {months === null ? <Loading /> : months.length === 0 ? <p className="muted" style={{ padding: 14 }}>{t("no_statements_yet_they_appear_once_you_e")}</p> : months.map((m, i) => (
            <button key={i} className="side-link big" onClick={() => setOpen(m)} style={{ justifyContent: "space-between" }}>
              <span>{m.month_label ?? `${m.year}-${String(m.month).padStart(2, "0")}`}</span>
              <b style={{ color: "var(--gold)" }}>{money(m.total_earned, sym)}</b>
            </button>
          ))}
        </div>
        </>
      )}
    </Page>
  );
}

// ---- Money earned from ad referrals -----------------------------------------------------------------
interface AdEarning { video_ad_id?: number; advertiser_name?: string; thumbnail?: string; total?: number; months?: { month?: string | number; year?: number; amount?: number }[] }
export function AdReferralEarningsPage() {
  const { t } = useT();
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
    <Page title={t("money_earned_from_ad_referrals")}>
      <div className="card pad" style={{ marginBottom: 12 }}><div className="muted" style={{ fontSize: 12 }}>{t("total_earned")}</div><div style={{ fontWeight: 800, color: "var(--gold)", fontSize: 28 }}>{total === null ? "…" : money(total)}</div>
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>{t("a_one_time_commission_for_every_video_ad")}</p></div>
      <div className="card">
        {ads === null ? <Loading /> : ads.length === 0 ? <p className="muted" style={{ padding: 14 }}>{t("no_ad_referrals_yet")}</p> : ads.map((a, i) => (
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
  const { t } = useT();
  if (posts === null) return <Loading />;
  if (posts.length === 0) return <p className="muted">{t("no_videos_yet")}</p>;
  return <div className="grid">{posts.map((p) => <PostCard key={p.id} post={p} />)}</div>;
}
export function AllVideosEarningsPage() {
  const { t } = useT();
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
    <Page title={t("money_earned_from_all_videos")}>
      <div className="card pad" style={{ marginBottom: 12 }}>
        <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>{t("total_money_earned_from_all_your_uploade")}</div>
        <EarningsRow earn={earn} year={year} onYear={setYear} />
      </div>
      <VideoList posts={posts} />
    </Page>
  );
}
export function RepostEarningsPage() {
  const { t } = useT();
  const { user, isLoggedIn } = useSession();
  const [posts, setPosts] = useState<Post[] | null>(null);
  useEffect(() => {
    if (!user) return;
    post<Post[]>("fetchUserRepostedPosts", { user_id: user.id, my_user_id: user.id }).then((r) => setPosts(r.data ?? [])).catch(() => setPosts([]));
  }, [user]);
  if (!isLoggedIn || !user) return <NeedLogin />;
  return (
    <Page title={t("money_earned_from_reposting_videos")}>
      <p className="muted" style={{ fontSize: 13 }}>{t("videos_you_reposted_you_earn_a_share_of")}</p>
      <VideoList posts={posts} />
    </Page>
  );
}

// ---- Rewarding actions --------------------------------------------------------------------------
interface RewardSettings { reward_daily_check_in?: number | string; reward_video_upload?: number | string; reward_signup?: number | string }
export function RewardingActionsPage() {
  const { t } = useT();
  const { isLoggedIn } = useSession();
  const [s, setS] = useState<RewardSettings | null>(null);
  useEffect(() => { post<RewardSettings>("fetchSettings", { x: 1 }).then((r) => setS(r.data ?? {})).catch(() => setS({})); }, []);
  if (!isLoggedIn) return <NeedLogin />;
  const rows = [["Daily check-in", s?.reward_daily_check_in, "Open the app every day"], ["Whenever you upload a video", s?.reward_video_upload, "Every video you post"], ["Sign-up reward", s?.reward_signup, "Once, when you joined"]];
  return (
    <Page title={t("rewarding_actions")}>
      <div className="card">
        {rows.map(([k, v, hint]) => (
          <div key={k as string} className="row" style={{ padding: "12px 14px", borderBottom: "1px solid var(--line)" }}>
            <div style={{ flex: 1 }}><b>{k as string}</b><div className="muted" style={{ fontSize: 12 }}>{hint as string}</div></div>
            <b style={{ color: "var(--gold)" }}>{s ? `${Number(v ?? 0)} coins` : "…"}</b>
          </div>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 12 }}>{t("daily_check_in_and_upload_rewards_are_cr")}</p>
    </Page>
  );
}
