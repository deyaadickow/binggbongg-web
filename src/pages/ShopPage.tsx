import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useSession } from "../lib/session";
import { Loading, Notice } from "../components/Common";
import {
  addToShowcase, addressLine, cancelShopOrder, createShopOrder, fetchMySampleRequests, fetchMyShopEarnings, fetchMyShopOrders,
  fetchShopAddresses, fetchShopCatalog, fetchShopProduct, fetchShopSettings, fetchShowcase, money, pinShowcaseItem, removeFromShowcase,
  requestShopEarningsPayout, requestShopSample, saveShopAddress, startStripeConnect, type ShopAddress, type ShopEarnings, type ShopOrder,
  type ShopProduct, type ShopSampleRequest, type ShopSettings,
} from "../lib/shop";

// Bingg Bongg Shop — the marketplace on the web (Steve, 2026-10-15). /shop (catalogue, Showcase,
// Orders, Earnings), /shop/product/:id, /shop/showcase/:userId (a member's Showcase). Buying goes
// to Stripe Checkout and comes back to /shop/orders. Hidden while the admin has the shop off.

function ProductCard({ p, to }: { p: ShopProduct; to: string }) {
  return (
    <Link to={to} className="card" style={{ display: "flex", gap: 12, padding: 10, textDecoration: "none", color: "inherit", border: "1px solid var(--gold-border)", borderRadius: 10, background: "#111" }}>
      {p.image_url ? <img src={p.image_url} alt="" style={{ width: 84, height: 84, objectFit: "cover", borderRadius: 8, border: "1px solid var(--gold-border)" }} /> : <div style={{ width: 84, height: 84 }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800 }}>{p.title}</div>
        <div style={{ color: "var(--gold)", fontWeight: 800 }}>{money(p.price_cents)} {(p.shipping_cents ?? 0) > 0 ? <span className="muted" style={{ fontWeight: 400 }}>+ {money(p.shipping_cents)} shipping</span> : <span className="muted" style={{ fontWeight: 400 }}>· free shipping</span>}</div>
        <div className="muted" style={{ fontSize: 12 }}>{[p.in_stock === false ? "Sold out" : null, (p.commission_rate ?? 0) > 0 ? `Earn ${p.commission_rate}%` : null, (p.sold_count ?? 0) > 0 ? `${p.sold_count} sold` : null, p.seller_name].filter(Boolean).join(" · ")}</div>
      </div>
    </Link>
  );
}

export function ShopPage({ tab: initialTab }: { tab?: "shop" | "showcase" | "orders" | "earnings" }) {
  const { user, isLoggedIn } = useSession();
  const navigate = useNavigate();
  const { userId: showcaseUserIdParam } = useParams();
  const [params] = useSearchParams();
  const showcaseUserId = showcaseUserIdParam ? Number(showcaseUserIdParam) : null;
  const [tab, setTab] = useState<"shop" | "showcase" | "orders" | "earnings">(initialTab ?? "shop");
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [products, setProducts] = useState<ShopProduct[] | null>(null);
  const [orders, setOrders] = useState<ShopOrder[] | null>(null);
  const [earnings, setEarnings] = useState<ShopEarnings | null>(null);
  const [samples, setSamples] = useState<ShopSampleRequest[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => { if (initialTab) setTab(initialTab); }, [initialTab]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { if (isLoggedIn) fetchShopSettings().then(setSettings).catch(() => setSettings({})); }, [isLoggedIn]);

  const load = useCallback(() => {
    if (!user) return;
    if (showcaseUserId) { fetchShowcase(showcaseUserId).then(setProducts).catch(() => setProducts([])); return; }
    if (tab === "shop") fetchShopCatalog(user.id, q).then(setProducts).catch(() => setProducts([]));
    if (tab === "showcase") { fetchShowcase(user.id).then(setProducts).catch(() => setProducts([])); fetchMySampleRequests(user.id).then(setSamples).catch(() => undefined); }
    if (tab === "orders") fetchMyShopOrders(user.id).then(setOrders).catch(() => setOrders([]));
    if (tab === "earnings") fetchMyShopEarnings(user.id).then(setEarnings).catch(() => undefined);
  }, [user, tab, q, showcaseUserId]);
  useEffect(() => { setProducts(null); load(); }, [load]);

  // Back from Stripe Checkout: /shop/orders?order=BB-…&result=success — say so once.
  useEffect(() => {
    const o = params.get("order"); const r = params.get("result");
    if (o && r) setToast(r === "success" ? `Payment received — order ${o} is confirmed.` : `Payment cancelled — nothing was charged for ${o}.`);
  }, [params]);

  if (!isLoggedIn || !user) return <div className="page"><Notice>Sign in to open the Shop. <Link to="/login">Sign in</Link></Notice></div>;
  if (settings && settings.shop_enabled === false) return <div className="page"><Notice>Bingg Bongg Shop isn't open yet.</Notice></div>;

  const goTab = (t: typeof tab) => { setTab(t); navigate(t === "shop" ? "/shop" : `/shop/${t}`); };

  return (
    <div className="page">
      {toast && <Notice>{toast}</Notice>}
      <div className="row" style={{ alignItems: "center", gap: 12 }}>
        <h1 className="page-title" style={{ margin: 0 }}>{showcaseUserId ? "Shop" : "Bingg Bongg Shop"}</h1>
        <span style={{ flex: 1 }} />
        {/* The two business-side ways in (Steve, 2026-10-16). Selling follows the admin's own
            sellers switch; being an agent does not, because agents are recruited directly and
            are not waiting on supplier sign-up being open to the public. */}
        {!showcaseUserId && isLoggedIn && settings?.sellers_enabled && <Link to="/shop/seller" className="btn ghost small">Sell here</Link>}
        {!showcaseUserId && isLoggedIn && <Link to="/shop/agent" className="btn ghost small">Agents</Link>}
      </div>
      {!showcaseUserId && (
        <div className="row" style={{ gap: 6, margin: "10px 0" }}>
          {(["shop", "showcase", "orders", "earnings"] as const).map((t) => (
            <button key={t} type="button" className={tab === t ? "btn small" : "btn small ghost"} onClick={() => goTab(t)}>{t === "shop" ? "Shop" : t === "showcase" ? "Showcase" : t === "orders" ? "Orders" : "Earnings"}</button>
          ))}
        </div>
      )}

      {(showcaseUserId || tab === "shop") && (
        <>
          {!showcaseUserId && <input className="input" placeholder="Search products" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 10 }} />}
          {products === null ? <Loading /> : products.length === 0 ? <p className="muted">Nothing here yet.</p> : (
            <div style={{ display: "grid", gap: 10 }}>{products.map((p) => <ProductCard key={p.id} p={p} to={`/shop/product/${p.id}${showcaseUserId ? `?streamer=${showcaseUserId}` : ""}`} />)}</div>
          )}
        </>
      )}

      {!showcaseUserId && tab === "showcase" && (
        <>
          <p className="muted" style={{ fontSize: 13 }}>Products you sell on your lives. Pin one while live and it shows in your room's shopping bag; every sale from it pays you a commission.</p>
          {products === null ? <Loading /> : products.length === 0 ? <p className="muted">Your Showcase is empty — open Shop and use "Add to my Showcase" on anything you'd like to sell.</p> : (
            <div style={{ display: "grid", gap: 10 }}>
              {products.map((p) => (
                <div key={p.id}>
                  <ProductCard p={p} to={`/shop/product/${p.id}`} />
                  <div className="row" style={{ gap: 8, marginTop: 6 }}>
                    <button type="button" className={p.pinned_live ? "btn small" : "btn small ghost"} onClick={() => pinShowcaseItem(user.id, p.id, !p.pinned_live).then((r) => { setToast(r.message ?? ""); load(); })}>{p.pinned_live ? "Pinned on live ✓" : "Pin on live"}</button>
                    <button type="button" className="btn small ghost" onClick={() => removeFromShowcase(user.id, p.id).then(load)}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {samples.length > 0 && (
            <>
              <h3 style={{ color: "var(--gold)", marginTop: 18 }}>My sample requests</h3>
              {samples.map((s) => <div key={s.id} className="card" style={{ padding: 10, marginBottom: 8, border: "1px solid var(--gold-border)", borderRadius: 10 }}><b>{s.product?.title}</b><div className="muted" style={{ fontSize: 13 }}>{s.status}{s.tracking_number ? ` · ${s.tracking_number}` : ""}{s.go_live_deadline_at ? ` · go live by ${s.go_live_deadline_at.slice(0, 10)}` : ""}{s.decline_reason ? ` · ${s.decline_reason}` : ""}</div></div>)}
            </>
          )}
        </>
      )}

      {!showcaseUserId && tab === "orders" && (orders === null ? <Loading /> : orders.length === 0 ? <p className="muted">No orders yet.</p> : (
        <div style={{ display: "grid", gap: 10 }}>
          {orders.map((o) => (
            <div key={o.id} className="card" style={{ padding: 12, border: "1px solid var(--gold-border)", borderRadius: 10, background: "#111" }}>
              <div style={{ color: "var(--gold)", fontWeight: 800 }}>{o.order_number} · {o.status.replace("_", " ")}</div>
              {o.items.map((i) => <div key={i.shop_product_id} style={{ fontSize: 13 }}>{i.title} ×{i.quantity}  {money(i.line_cents)}</div>)}
              <div className="muted" style={{ fontSize: 12 }}>Total {money(o.total_cents)}{(o.refunded_cents ?? 0) > 0 ? ` · refunded ${money(o.refunded_cents)}` : ""}{o.created_at ? ` · ${o.created_at.slice(0, 10)}` : ""}</div>
              {o.tracking_number && (o.tracking_url ? <a href={o.tracking_url} target="_blank" rel="noreferrer" style={{ color: "var(--gold)", fontSize: 13 }}>Tracking: {o.carrier ?? ""} {o.tracking_number}</a> : <div style={{ color: "var(--gold)", fontSize: 13 }}>Tracking: {o.carrier ?? ""} {o.tracking_number}</div>)}
              {(o.status === "paid" || o.status === "processing") && <button type="button" className="btn small ghost" style={{ marginTop: 6 }} onClick={() => { if (confirm("Cancel this order? You'll be refunded in full.")) cancelShopOrder(user.id, o.order_number).then((r) => { setToast(r.message ?? ""); load(); }); }}>Cancel order</button>}
            </div>
          ))}
        </div>
      ))}

      {!showcaseUserId && tab === "earnings" && (earnings === null ? <Loading /> : (
        <div style={{ display: "grid", gap: 10 }}>
          <div className="card" style={{ padding: 14, border: "2px solid var(--gold-border)", borderRadius: 10, background: "#111" }}>
            <div style={{ color: "var(--gold)", fontWeight: 800, fontSize: 20 }}>Payable now {money(earnings.payable_cents)}</div>
            <div className="muted" style={{ fontSize: 12 }}>Pending {money(earnings.pending_cents)} (released after the return window) · Paid {money(earnings.paid_cents)}</div>
          </div>
          <div><b>To get paid you need:</b></div>
          <div style={{ color: earnings.stripe_connected ? "var(--gold)" : undefined }}>{earnings.stripe_connected ? "✓" : "○"} A bank account connected through Stripe {!earnings.stripe_connected && <button type="button" className="btn small ghost" style={{ marginLeft: 8 }} onClick={() => startStripeConnect(user.id).then((r) => { const u = r.url as string | undefined; if (r.status && u) window.location.href = u; else setToast(r.message ?? "Couldn't start Stripe."); })}>Connect bank account</button>}</div>
          <div style={{ color: earnings.tax_form_status === "accepted" ? "var(--gold)" : undefined }}>{earnings.tax_form_status === "accepted" ? "✓" : "○"} A tax form on file ({earnings.tax_form_status === "missing" ? "W-9 for the US, W-8BEN elsewhere — submit it from the phone app" : earnings.tax_form_status})</div>
          {earnings.payout_ready && earnings.payable_cents > 0 && <button type="button" className="btn" onClick={() => requestShopEarningsPayout(user.id).then((r) => { setToast(r.message ?? ""); load(); })}>Request payout of {money(earnings.payable_cents)}</button>}
          {earnings.payouts.length > 0 && <><h3 style={{ color: "var(--gold)", margin: "10px 0 0" }}>Payouts</h3>{earnings.payouts.map((p) => <div key={p.id} style={{ fontSize: 13 }}>{money(p.amount_cents)} · {p.status}{p.sent_at ? ` · sent ${p.sent_at.slice(0, 10)}` : p.created_at ? ` · requested ${p.created_at.slice(0, 10)}` : ""}</div>)}</>}
          <h3 style={{ color: "var(--gold)", margin: "10px 0 0" }}>Commissions</h3>
          {earnings.commissions.length === 0 && <p className="muted">No sales yet. Pin products from your Showcase while you're live.</p>}
          {earnings.commissions.map((c, i) => <div key={i} style={{ fontSize: 13 }}>{c.order_number}  {money(c.amount_cents)} ({c.rate}%) · {c.status}{c.status === "pending" && c.payable_at ? ` until ${c.payable_at.slice(0, 10)}` : ""}</div>)}
          <p className="muted" style={{ fontSize: 12 }}>Tell your viewers you earn a commission on what you sell — it's the rule, and they'll trust you more for it.</p>
        </div>
      ))}
    </div>
  );
}

export function ShopProductPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { user, isLoggedIn } = useSession();
  const navigate = useNavigate();
  const streamerUserId = Number(params.get("streamer") ?? 0) || null;
  const roomName = params.get("room");
  const [p, setP] = useState<ShopProduct | null | undefined>(undefined);
  const [qty, setQty] = useState(1);
  const [addresses, setAddresses] = useState<ShopAddress[]>([]);
  const [addressId, setAddressId] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({ full_name: "", phone: "", line1: "", line2: "", city: "", state: "", postal_code: "", country_code: "" });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => { fetchShopProduct(Number(id)).then(setP); }, [id]);
  useEffect(() => { if (user) fetchShopAddresses(user.id).then((a) => { setAddresses(a); setAddressId((a.find((x) => x.is_default) ?? a[0])?.id ?? 0); }).catch(() => undefined); }, [user]);

  if (p === undefined) return <div className="page"><Loading /></div>;
  if (!p) return <div className="page"><Notice error>That product isn't available.</Notice></div>;
  const sub = p.price_cents * qty; const ship = (p.shipping_cents ?? 0) * qty;

  async function saveAddress() {
    if (!user) return;
    const r = await saveShopAddress(user.id, form);
    if (!r.status) { setStatus(r.message ?? "Couldn't save."); return; }
    const a = await fetchShopAddresses(user.id); setAddresses(a); setAddressId(r.data?.id ?? a[0]?.id ?? 0); setShowForm(false);
  }
  async function pay() {
    if (!user) { navigate("/login", { state: { from: window.location.pathname + window.location.search } }); return; }
    if (!addressId) { setStatus("Choose a shipping address."); return; }
    setBusy(true); setStatus("Taking you to Stripe…");
    const r = await createShopOrder(user.id, p!.id, qty, addressId, streamerUserId, roomName).catch(() => null);
    const url = (r?.payment as { checkout_url?: string } | undefined)?.checkout_url;
    if (!r?.status || !url) { setBusy(false); setStatus(r?.message ?? "Couldn't start the payment."); return; }
    window.location.href = url;
  }

  return (
    <div className="page">
      <div style={{ display: "flex", gap: 8, overflowX: "auto" }}>
        {((p.images?.length ? p.images : [p.image_url ?? ""])).map((u, i) => <img key={i} src={u} alt="" style={{ width: 260, height: 260, objectFit: "cover", borderRadius: 10, border: "1px solid var(--gold-border)", flex: "0 0 auto" }} />)}
      </div>
      <h1 className="page-title" style={{ marginBottom: 4 }}>{p.title}</h1>
      <div style={{ color: "var(--gold)", fontWeight: 800, fontSize: 22 }}>{money(p.price_cents)} {p.compare_at_cents && p.compare_at_cents > p.price_cents && <s className="muted" style={{ fontSize: 14, fontWeight: 400 }}>{money(p.compare_at_cents)}</s>}</div>
      <div className="muted" style={{ fontSize: 13 }}>{[(p.shipping_cents ?? 0) > 0 ? `Shipping ${money(p.shipping_cents)}` : "Free shipping", p.ships_in_days_min != null && p.ships_in_days_max != null ? `arrives in ${p.ships_in_days_min}–${p.ships_in_days_max} days` : null, `sold by ${p.seller_name ?? "Bingg Bongg"}`].filter(Boolean).join(" · ")}</div>
      {streamerUserId && streamerUserId !== user?.id && <p style={{ color: "var(--gold)", fontSize: 12 }}>Buying from this Showcase supports the streamer — they earn a commission on this sale.</p>}
      <p style={{ whiteSpace: "pre-wrap" }}>{p.description}</p>
      <div className="row" style={{ gap: 12, alignItems: "center" }}>
        <span className="muted">Quantity</span>
        <button type="button" className="btn small ghost" onClick={() => setQty((v) => Math.max(1, v - 1))}>−</button><b>{qty}</b><button type="button" className="btn small ghost" onClick={() => setQty((v) => Math.min(20, v + 1))}>+</button>
      </div>
      {isLoggedIn && (
        <div style={{ margin: "14px 0" }}>
          <b>Ship to</b>
          {addresses.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No address yet — add one below.</p>}
          {addresses.map((a) => <div key={a.id} style={{ padding: 6, cursor: "pointer", color: a.id === addressId ? "var(--gold)" : undefined }} onClick={() => setAddressId(a.id)}>{a.id === addressId ? "● " : "○ "}{addressLine(a)}</div>)}
          <button type="button" className="btn small ghost" onClick={() => setShowForm((v) => !v)}>+ Add address</button>
          {showForm && (
            <div style={{ display: "grid", gap: 6, marginTop: 8, maxWidth: 420 }}>
              {([["full_name", "Full name"], ["phone", "Phone"], ["line1", "Street address"], ["line2", "Apt, unit (optional)"], ["city", "City"], ["state", "State / province"], ["postal_code", "Postal code"], ["country_code", "Country code (US, PH, …)"]] as const).map(([k, label]) => (
                <input key={k} className="input" placeholder={label} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
              ))}
              <button type="button" className="btn small" onClick={saveAddress}>Save address</button>
            </div>
          )}
        </div>
      )}
      <div className="muted" style={{ fontSize: 13 }}>Subtotal {money(sub)} · Shipping {ship > 0 ? money(ship) : "free"} · <b style={{ color: "var(--gold)" }}>Total {money(sub + ship)}</b></div>
      {status && <p style={{ color: "var(--gold)" }}>{status}</p>}
      <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <button type="button" className="btn" disabled={busy || p.in_stock === false} onClick={pay}>{p.in_stock === false ? "Sold out" : `Pay ${money(sub + ship)} with Stripe`}</button>
        {isLoggedIn && user && streamerUserId !== user.id && <button type="button" className="btn ghost" onClick={() => addToShowcase(user.id, p.id).then((r) => setStatus(r.message ?? ""))}>Add to my Showcase</button>}
        {isLoggedIn && user && p.samples_enabled && <button type="button" className="btn ghost" onClick={() => { const a = addresses.find((x) => x.is_default) ?? addresses[0]; if (!a) { setStatus("Add a shipping address first."); return; } const msg = prompt("Why you? (optional — your audience, what you'd show)") ?? ""; requestShopSample(user.id, p.id, a.id, msg).then((r) => setStatus(r.message ?? "")); }}>Request a free sample</button>}
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>Paid securely on Stripe's own page. Bingg Bongg never sees your card number.</p>
    </div>
  );
}
