import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSession } from "../lib/session";
import { Loading, Notice } from "../components/Common";
import { money, startStripeConnect } from "../lib/shop";
import {
  applyShopAgent, fetchMyAgentEarnings, fetchMyAgentProducts, fetchMyAgentStatus, requestAgentEarningsPayout,
  type AgentEarnings, type AgentProduct, type AgentStatus,
} from "../lib/sellerAgent";
import { useT } from "../lib/i18n";

// The agent's own portal (Steve, 2026-10-16): "I'm going to hire multiple agents so each agent
// can bring us more items."
//
// An agent signs suppliers up. They never hold stock and never ship. They earn a share of every
// sale of the products they brought in, whether or not a streamer was involved in that sale.

type Tab = "products" | "earnings";

const STATUS_WORDS: Record<string, string> = {
  pending_review: "We're reviewing your application. You'll be told your rate when you're approved.",
  approved: "Approved.",
  rejected: "This application wasn't approved.",
  suspended: "This agent account is suspended. Please contact support.",
};

export function AgentPage() {
  const { t } = useT();
  const { user, isLoggedIn } = useSession();
  const myUserId = user?.id ?? 0;

  const [agent, setAgent] = useState<AgentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("products");

  const [suppliers, setSuppliers] = useState(0);
  const [products, setProducts] = useState<AgentProduct[] | null>(null);
  const [earnings, setEarnings] = useState<AgentEarnings | null>(null);

  const loadStatus = useCallback(async () => {
    if (!myUserId) return;
    try { setAgent(await fetchMyAgentStatus(myUserId)); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [myUserId]);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  const approved = agent?.status === "approved";
  const reload = useCallback(async () => {
    if (!myUserId || !approved) return;
    try {
      const [p, e] = await Promise.all([fetchMyAgentProducts(myUserId), fetchMyAgentEarnings(myUserId)]);
      setSuppliers(p.suppliers); setProducts(p.products); setEarnings(e);
    } catch (e) { setError((e as Error).message); }
  }, [myUserId, approved]);

  useEffect(() => { void reload(); }, [reload]);

  if (!isLoggedIn) {
    return <div className="page"><h1 className="page-title">{t("become_an_agent")}</h1><Notice>{t("please_sign_in_to_apply")}</Notice></div>;
  }
  if (loading) return <div className="page"><Loading /></div>;

  return (
    <div className="page">
      <div className="row" style={{ alignItems: "center", gap: 12 }}>
        <h1 className="page-title" style={{ margin: 0 }}>{agent ? "Agent" : "Become an agent"}</h1>
        <span style={{ flex: 1 }} />
        <Link to="/shop" className="btn ghost small">{t("back_to_the_shop")}</Link>
      </div>

      {error && <Notice error>{error}</Notice>}
      {notice && <Notice>{notice}</Notice>}

      {!agent ? (
        <AgentApplication myUserId={myUserId} onDone={(m) => { setNotice(m); void loadStatus(); }} onError={setError} />
      ) : !approved ? (
        <Notice>{STATUS_WORDS[agent.status] ?? agent.status}</Notice>
      ) : (
        <>
          <AgentHeader myUserId={myUserId} agent={agent} suppliers={suppliers} products={products?.length ?? 0} onError={setError} />

          <div className="row" style={{ gap: 8, margin: "16px 0", flexWrap: "wrap" }}>
            <button type="button" className={tab === "products" ? "btn" : "btn ghost"} onClick={() => setTab("products")}>{t("what_i_brought_in")}</button>
            <button type="button" className={tab === "earnings" ? "btn" : "btn ghost"} onClick={() => setTab("earnings")}>{t("earnings")}</button>
          </div>

          {tab === "products" && <AgentProducts products={products} />}
          {tab === "earnings" && <AgentEarningsPanel myUserId={myUserId} earnings={earnings} onChanged={reload} onNotice={setNotice} onError={setError} />}
        </>
      )}
    </div>
  );
}

/** A labelled field in the house style: a small gold caption above the control, and the control
 *  itself carrying .input like every other form on the site. An <input> wrapped inside a <label>
 *  lays out inline here and reads as cramped. */
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <span style={{ color: "var(--gold)", fontSize: 13, fontWeight: 700 }}>{label}</span>
      {children}
      {hint && <span className="muted" style={{ fontSize: 12 }}>{hint}</span>}
    </div>
  );
}

function AgentHeader({ myUserId, agent, suppliers, products, onError }: {
  myUserId: number; agent: AgentStatus; suppliers: number; products: number; onError: (m: string) => void;
}) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="row" style={{ alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>{agent.name}</div>
          <div className="muted" style={{ fontSize: 13 }}>
            {suppliers} supplier{suppliers === 1 ? "" : "s"} · {products} product{products === 1 ? "" : "s"}
          </div>
          {/* The signup referral is what most agents are actually recruited on, so it gets its
              own line rather than being buried in a total. */}
          {(agent.referral_earned_cents ?? 0) > 0 && (
            <div className="muted" style={{ fontSize: 13 }}>
              {money(agent.referral_earned_cents)} earned from signing suppliers up
            </div>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="muted" style={{ fontSize: 12 }}>{t("your_usual_rate")}</div>
          {/* A null rate means no rate has been agreed, which is not the same as zero. Saying
              "0%" here would read as a settled deal that pays nothing. */}
          <div style={{ fontWeight: 800, fontSize: 20, color: agent.default_commission_rate === null ? undefined : "var(--gold)" }}>
            {agent.default_commission_rate === null ? "Not set yet" : `${agent.default_commission_rate}%`}
          </div>
        </div>
      </div>

      {agent.default_commission_rate === null && (
        <Notice>{t("your_rate_hasn_t_been_set_yet_so_nothing")}</Notice>
      )}

      {!agent.stripe_connected && (
        <div className="row" style={{ alignItems: "center", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
          <div className="muted" style={{ flex: 1, minWidth: 220, fontSize: 13 }}>
            {t("connect_a_bank_account_and_we_can_pay_yo")}</div>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await startStripeConnect(myUserId);
                const url = r.url as string | undefined;
                if (r.status && url) window.location.href = url;
                else { onError(r.message ?? "Couldn't start Stripe."); setBusy(false); }
              } catch (e) { onError((e as Error).message); setBusy(false); }
            }}
          >
            {t("connect_your_bank_account")}</button>
        </div>
      )}
    </div>
  );
}

function AgentApplication({ myUserId, onDone, onError }: { myUserId: number; onDone: (m: string) => void; onError: (m: string) => void }) {
  const { t } = useT();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="card"
      style={{ padding: 16, display: "grid", gap: 12, maxWidth: 520 }}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const r = await applyShopAgent(myUserId, { name: name.trim(), contact_email: email.trim(), phone: phone.trim(), country_code: country.trim().toUpperCase() });
          onDone(r.message);
        } catch (err) { onError((err as Error).message); }
        finally { setBusy(false); }
      }}
    >
      <p className="muted" style={{ margin: 0 }}>
        {t("agents_find_suppliers_and_bring_their_pr")}</p>
      <Field label={t("your_name_or_company_name")}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
      </Field>
      <Field label={t("contact_email")}>
        <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={190} />
      </Field>
      <Field label={t("phone_or_whatsapp")}>
        <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} />
      </Field>
      <Field label={t("country_code")} hint={t("two_letters_like_ph_or_cn")}>
        <input className="input" value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} maxLength={2} style={{ textTransform: "uppercase" }} />
      </Field>
      <button type="submit" className="btn" disabled={busy || !name.trim()}>{busy ? "Sending…" : "Apply to be an agent"}</button>
    </form>
  );
}

function AgentProducts({ products }: { products: AgentProduct[] | null }) {
  const { t } = useT();
  if (products === null) return <Loading />;
  if (products.length === 0) {
    return <Notice>{t("nothing_yet_once_a_supplier_you_signed_u")}</Notice>;
  }

  const sold = products.reduce((n, p) => n + (p.sold_count ?? 0), 0);

  return (
    <>
      <div className="muted" style={{ marginBottom: 10 }}>{products.length} products · {sold} sold in total</div>
      <div className="table-wrap" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid var(--gold-border)" }}>
              <th style={{ padding: "8px 10px" }}>{t("product")}</th>
              <th style={{ padding: "8px 10px" }}>{t("supplier")}</th>
              <th style={{ padding: "8px 10px", textAlign: "right" }}>{t("price")}</th>
              <th style={{ padding: "8px 10px", textAlign: "right" }}>{t("sold")}</th>
              <th style={{ padding: "8px 10px", textAlign: "right" }}>{t("you_earn")}</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <td style={{ padding: "8px 10px" }}>
                  {p.title}
                  <div className="muted" style={{ fontSize: 12 }}>{p.status}</div>
                </td>
                <td style={{ padding: "8px 10px" }}>{p.seller_name ?? "—"}</td>
                <td style={{ padding: "8px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{money(p.price_cents)}</td>
                <td style={{ padding: "8px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{p.sold_count ?? 0}</td>
                <td style={{ padding: "8px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: p.agent_rate > 0 ? "var(--gold)" : undefined }}>
                  {p.agent_rate > 0 ? `${p.agent_rate}%` : "—"}
                  {/* Worth saying which rate is in force: a product with its own rate is not
                      affected when the agent's usual rate changes. */}
                  {p.agent_rate > 0 && p.rate_source === "product" && <div className="muted" style={{ fontSize: 11 }}>{t("set_for_this_product")}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function AgentEarningsPanel({ myUserId, earnings, onChanged, onNotice, onError }: {
  myUserId: number; earnings: AgentEarnings | null; onChanged: () => void; onNotice: (m: string) => void; onError: (m: string) => void;
}) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  if (earnings === null) return <Loading />;

  return (
    <>
      <div className="grid wide" style={{ marginBottom: 14 }}>
        <Figure label={t("still_settling")} value={money(earnings.pending_cents)} hint={t("earned_but_held_until_the_buyer_s_return")} />
        <Figure label={t("ready_to_pay_out")} value={money(earnings.payable_cents)} gold />
        <Figure label={t("paid_so_far")} value={money(earnings.paid_cents)} />
      </div>

      <div className="row" style={{ alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn"
          disabled={busy || earnings.payable_cents <= 0 || !earnings.payout_ready}
          onClick={async () => {
            setBusy(true);
            try { onNotice(await requestAgentEarningsPayout(myUserId)); onChanged(); }
            catch (e) { onError((e as Error).message); }
            finally { setBusy(false); }
          }}
        >
          {busy ? "Requesting…" : "Request a payout"}
        </button>
        {!earnings.payout_ready && <span className="muted" style={{ fontSize: 13 }}>{t("connect_a_bank_account_first")}</span>}
        {earnings.payout_ready && earnings.payable_cents <= 0 && <span className="muted" style={{ fontSize: 13 }}>{t("nothing_is_ready_to_pay_out_yet")}</span>}
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 8px" }}>{t("every_sale")}</h2>
      {earnings.commissions.length === 0 ? (
        <Notice>{t("no_sales_yet")}</Notice>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--gold-border)" }}>
                <th style={{ padding: "8px 10px" }}>{t("order")}</th>
                <th style={{ padding: "8px 10px", textAlign: "right" }}>{t("you_earned")}</th>
                <th style={{ padding: "8px 10px", textAlign: "right" }}>{t("rate")}</th>
                <th style={{ padding: "8px 10px" }}>{t("state")}</th>
              </tr>
            </thead>
            <tbody>
              {earnings.commissions.map((c, i) => (
                <tr key={`${c.order_number}-${i}`} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <td style={{ padding: "8px 10px" }}>
                    {c.order_number}
                    {c.kind === "referral" && (
                      <div className="muted" style={{ fontSize: 11 }}>{t("signing_up_the_supplier")}</div>
                    )}
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{money(c.amount_cents)}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{c.rate}%</td>
                  <td style={{ padding: "8px 10px" }}>{c.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {earnings.payouts.length > 0 && (
        <>
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: "18px 0 8px" }}>{t("payouts")}</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {earnings.payouts.map((p) => (
              <div key={p.id} className="card row" style={{ padding: 12, gap: 12, alignItems: "center" }}>
                <div style={{ flex: 1 }}>{money(p.amount_cents)}</div>
                <div className="muted">{p.status}{p.sent_at ? ` · ${p.sent_at}` : ""}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function Figure({ label, value, hint, gold }: { label: string; value: string; hint?: string; gold?: boolean }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="muted" style={{ fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: gold ? "var(--gold)" : undefined, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {hint && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}
