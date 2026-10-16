import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSession } from "../lib/session";
import { Loading, Notice } from "../components/Common";
import { addressLine, money, startStripeConnect, type ShopOrder, type ShopProduct, type ShopSampleRequest } from "../lib/shop";
import {
  applyShopSeller, createSellerProduct, fetchMySellerStatus, fetchSellerOrders, fetchSellerSampleRequests,
  MAX_PRODUCT_IMAGES, mySellerProducts, respondSellerSampleRequest, shipSellerOrder,
  type NewProductForm, type SellerStatus,
} from "../lib/sellerAgent";

// The supplier's own portal. Suppliers set their own prices and ship their own orders; Bingg
// Bongg takes its cut at checkout and the streamer who sold the item takes theirs.
//
// Deliberately a web page and not a phone screen: loading a catalogue, copying tracking numbers
// off a courier's site and working through a day's orders are all desk jobs.

type Tab = "products" | "orders" | "samples";

const STATUS_WORDS: Record<string, string> = {
  pending_review: "We're reviewing your application.",
  approved: "Approved — you can list products.",
  rejected: "This application wasn't approved.",
  suspended: "This seller account is suspended. Please contact support.",
};

export function SellerPage() {
  const { user, isLoggedIn } = useSession();
  const myUserId = user?.id ?? 0;

  const [seller, setSeller] = useState<SellerStatus | null>(null);
  const [sellersEnabled, setSellersEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("products");

  const [products, setProducts] = useState<ShopProduct[] | null>(null);
  const [orders, setOrders] = useState<ShopOrder[] | null>(null);
  const [samples, setSamples] = useState<ShopSampleRequest[] | null>(null);

  const loadStatus = useCallback(async () => {
    if (!myUserId) return;
    try {
      const { seller: s, sellersEnabled: open } = await fetchMySellerStatus(myUserId);
      setSeller(s);
      setSellersEnabled(open);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [myUserId]);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  // Only an approved seller has anything in these lists, so there is no point asking for them
  // while an application is still being reviewed.
  const approved = seller?.status === "approved";
  const reload = useCallback(async () => {
    if (!myUserId || !approved) return;
    try {
      const [p, o, s] = await Promise.all([
        mySellerProducts(myUserId),
        fetchSellerOrders(myUserId),
        fetchSellerSampleRequests(myUserId).catch(() => []),
      ]);
      setProducts(p); setOrders(o); setSamples(s);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [myUserId, approved]);

  useEffect(() => { void reload(); }, [reload]);

  if (!isLoggedIn) {
    return <div className="page"><h1 className="page-title">Sell on Bingg Bongg</h1><Notice>Please sign in to apply.</Notice></div>;
  }
  if (loading) return <div className="page"><Loading /></div>;

  if (!sellersEnabled && !seller) {
    return (
      <div className="page">
        <h1 className="page-title">Sell on Bingg Bongg</h1>
        <Notice>Seller sign-up isn't open yet. Check back soon.</Notice>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="row" style={{ alignItems: "center", gap: 12 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Sell on Bingg Bongg</h1>
        <span style={{ flex: 1 }} />
        <Link to="/shop" className="btn ghost small">Back to the shop</Link>
      </div>

      {error && <Notice error>{error}</Notice>}
      {notice && <Notice>{notice}</Notice>}

      {!seller ? (
        <SellerApplication myUserId={myUserId} onDone={(m) => { setNotice(m); void loadStatus(); }} onError={setError} />
      ) : !approved ? (
        <Notice>{STATUS_WORDS[seller.status] ?? seller.status}</Notice>
      ) : (
        <>
          <SellerHeader myUserId={myUserId} seller={seller} onError={setError} />

          <div className="row" style={{ gap: 8, margin: "16px 0", flexWrap: "wrap" }}>
            <button type="button" className={tab === "products" ? "btn" : "btn ghost"} onClick={() => setTab("products")}>Products</button>
            <button type="button" className={tab === "orders" ? "btn" : "btn ghost"} onClick={() => setTab("orders")}>
              Orders{orders && orders.some((o) => o.status === "paid" || o.status === "processing") ? ` (${orders.filter((o) => o.status === "paid" || o.status === "processing").length} to ship)` : ""}
            </button>
            <button type="button" className={tab === "samples" ? "btn" : "btn ghost"} onClick={() => setTab("samples")}>Samples</button>
          </div>

          {tab === "products" && <SellerProducts myUserId={myUserId} products={products} onChanged={reload} onNotice={setNotice} onError={setError} />}
          {tab === "orders" && <SellerOrders myUserId={myUserId} orders={orders} onChanged={reload} onNotice={setNotice} onError={setError} />}
          {tab === "samples" && <SellerSamples myUserId={myUserId} samples={samples} onChanged={reload} onNotice={setNotice} onError={setError} />}
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

function SellerHeader({ myUserId, seller, onError }: { myUserId: number; seller: SellerStatus; onError: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="row" style={{ alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>{seller.name}</div>
          <div className="muted" style={{ fontSize: 13 }}>
            {seller.status === "approved" ? "Approved seller" : seller.status}
          </div>
        </div>
        {seller.stripe_connected ? (
          <span className="pill">Bank account connected</span>
        ) : (
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                // startStripeConnect answers with the hosted onboarding link rather than a
                // redirect, so the page has to send the seller there itself.
                const r = await startStripeConnect(myUserId);
                const url = r.url as string | undefined;
                if (r.status && url) window.location.href = url;
                else { onError(r.message ?? "Couldn't start Stripe."); setBusy(false); }
              } catch (e) { onError((e as Error).message); setBusy(false); }
            }}
          >
            Connect your bank account
          </button>
        )}
      </div>
      {!seller.stripe_connected && (
        <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
          You can list products now, but nobody can buy them until your bank account is connected.
        </div>
      )}
    </div>
  );
}

function SellerApplication({ myUserId, onDone, onError }: { myUserId: number; onDone: (m: string) => void; onError: (m: string) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="card"
      style={{ padding: 16, display: "grid", gap: 12, maxWidth: 520 }}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try { onDone(await applyShopSeller(myUserId, { name: name.trim(), contact_email: email.trim(), country_code: country.trim().toUpperCase() })); }
        catch (err) { onError((err as Error).message); }
        finally { setBusy(false); }
      }}
    >
      <p className="muted" style={{ margin: 0 }}>
        You set your own prices and ship your own orders. Bingg Bongg takes its share at checkout
        and pays you the rest straight to your bank.
      </p>
      <Field label="Your name or company name">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
      </Field>
      <Field label="Contact email">
        <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={190} required />
      </Field>
      <Field label="Country code" hint="Two letters, like PH or US.">
        <input className="input" value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} maxLength={2} minLength={2} required style={{ textTransform: "uppercase" }} />
      </Field>
      <button type="submit" className="btn" disabled={busy || !name.trim() || !email.trim() || country.trim().length !== 2}>
        {busy ? "Sending…" : "Apply to sell"}
      </button>
    </form>
  );
}

function SellerProducts({ myUserId, products, onChanged, onNotice, onError }: {
  myUserId: number; products: ShopProduct[] | null; onChanged: () => void; onNotice: (m: string) => void; onError: (m: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  if (products === null) return <Loading />;

  return (
    <>
      <div className="row" style={{ alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontWeight: 800 }}>{products.length} product{products.length === 1 ? "" : "s"}</div>
        <span style={{ flex: 1 }} />
        <button type="button" className={adding ? "btn ghost" : "btn"} onClick={() => setAdding((v) => !v)}>
          {adding ? "Cancel" : "Add a product"}
        </button>
      </div>

      {adding && (
        <NewProduct
          myUserId={myUserId}
          onDone={(m) => { setAdding(false); onNotice(m); onChanged(); }}
          onError={onError}
        />
      )}

      {products.length === 0 ? (
        <Notice>No products yet. Add your first one and we'll review it.</Notice>
      ) : (
        <div className="grid wide">
          {products.map((p) => (
            <div key={p.id} className="card row" style={{ padding: 12, gap: 12 }}>
              {p.image_url && <img src={p.image_url} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800 }}>{p.title}</div>
                <div style={{ color: "var(--gold)", fontWeight: 800 }}>{money(p.price_cents)}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {[statusWord(p.status), (p.sold_count ?? 0) > 0 ? `${p.sold_count} sold` : null].filter(Boolean).join(" · ")}
                </div>
                {/* The whole point of a rejection is that the seller can fix it, so the reason
                    sits on the card rather than behind a tap. */}
                {p.status === "rejected" && p.rejection_reason && (
                  <div style={{ marginTop: 6, fontSize: 12, color: "var(--red, #e5484d)" }}>{p.rejection_reason}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** A listing's own state, in words a supplier would use rather than the database's. */
function statusWord(status?: string): string {
  if (status === "active") return "On sale";
  if (status === "pending_review") return "Waiting for review";
  if (status === "rejected") return "Not approved";
  if (status === "inactive") return "Switched off";
  return status ?? "";
}

function NewProduct({ myUserId, onDone, onError }: { myUserId: number; onDone: (m: string) => void; onError: (m: string) => void }) {
  const [f, setF] = useState<NewProductForm>({ title: "", description: "", price_cents: 0, shipping_cents: 0, stock: "", samples_enabled: false });
  const [price, setPrice] = useState("");
  const [shipping, setShipping] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [video, setVideo] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);

  const priceCents = Math.round((parseFloat(price) || 0) * 100);
  const shippingCents = Math.round((parseFloat(shipping) || 0) * 100);

  return (
    <form
      className="card"
      style={{ padding: 16, display: "grid", gap: 12, marginBottom: 16 }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (images.length === 0) { onError("Add at least one photo."); return; }
        if (priceCents < 100) { onError("The price has to be at least $1.00."); return; }
        setBusy(true); setProgress(0);
        try {
          await createSellerProduct(myUserId, { ...f, price_cents: priceCents, shipping_cents: shippingCents }, images, video, setProgress);
          onDone("Listing submitted for review.");
        } catch (err) { onError((err as Error).message); }
        finally { setBusy(false); }
      }}
    >
      <Field label="Title">
        <input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={200} required />
      </Field>
      <Field label="Description">
        <textarea className="input" style={{ paddingTop: 10, paddingBottom: 10, minHeight: 110 }} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={5000} rows={4} required />
      </Field>
      <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 150 }}><Field label="Price ($)">
          <input className="input" type="number" step="0.01" min="1" value={price} onChange={(e) => setPrice(e.target.value)} required />
        </Field></div>
        <div style={{ flex: 1, minWidth: 150 }}><Field label="Shipping ($)">
          <input className="input" type="number" step="0.01" min="0" value={shipping} onChange={(e) => setShipping(e.target.value)} />
        </Field></div>
        <div style={{ flex: 1, minWidth: 150 }}><Field label="Stock" hint="Leave blank if you never run out.">
          <input className="input" type="number" min="0" value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} placeholder="unlimited" />
        </Field></div>

      </div>
      <label className="row" style={{ gap: 8, alignItems: "center" }}>
        <input type="checkbox" checked={f.samples_enabled} onChange={(e) => setF({ ...f, samples_enabled: e.target.checked })} />
        <span>Let streamers ask for a free sample to show on their live</span>
      </label>
      <Field label="Photos" hint={`Up to ${MAX_PRODUCT_IMAGES}. The first one is the main picture.`}>
        <input type="file" accept="image/*" multiple onChange={(e) => setImages(Array.from(e.target.files ?? []).slice(0, MAX_PRODUCT_IMAGES))} />
      </Field>
      {images.length > 0 && <div className="muted" style={{ fontSize: 12 }}>{images.length} photo{images.length === 1 ? "" : "s"} chosen</div>}
      <Field label="Video" hint="Optional.">
        <input type="file" accept="video/mp4,video/quicktime" onChange={(e) => setVideo(e.target.files?.[0] ?? null)} />
      </Field>
      {busy && progress > 0 && <div className="muted" style={{ fontSize: 13 }}>Uploading… {Math.round(progress * 100)}%</div>}
      <button type="submit" className="btn" disabled={busy}>{busy ? "Sending…" : "Submit for review"}</button>
      <div className="muted" style={{ fontSize: 12 }}>
        Every photo is checked automatically before a listing goes live. Anything that fails the
        check is rejected and you'll be told why.
      </div>
    </form>
  );
}

function SellerOrders({ myUserId, orders, onChanged, onNotice, onError }: {
  myUserId: number; orders: ShopOrder[] | null; onChanged: () => void; onNotice: (m: string) => void; onError: (m: string) => void;
}) {
  if (orders === null) return <Loading />;
  if (orders.length === 0) return <Notice>No orders yet.</Notice>;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {orders.map((o) => <SellerOrderCard key={o.order_number} myUserId={myUserId} order={o} onChanged={onChanged} onNotice={onNotice} onError={onError} />)}
    </div>
  );
}

function SellerOrderCard({ myUserId, order, onChanged, onNotice, onError }: {
  myUserId: number; order: ShopOrder; onChanged: () => void; onNotice: (m: string) => void; onError: (m: string) => void;
}) {
  const needsShipping = order.status === "paid" || order.status === "processing";
  const [open, setOpen] = useState(false);
  const [tracking, setTracking] = useState("");
  const [carrier, setCarrier] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="row" style={{ gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontWeight: 800 }}>{order.order_number}</div>
          <div className="muted" style={{ fontSize: 13 }}>{order.status} · {money(order.total_cents)}</div>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            {order.items.map((it, i) => <li key={i}>{it.quantity} × {it.title}</li>)}
          </ul>
          {order.ship_to && <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>Ship to: {addressLine(order.ship_to)}</div>}
          {order.tracking_number && <div className="muted" style={{ fontSize: 13 }}>Tracking: {order.carrier} {order.tracking_number}</div>}
        </div>
        {needsShipping && (
          <button type="button" className={open ? "btn ghost" : "btn"} onClick={() => setOpen((v) => !v)}>
            {open ? "Cancel" : "Mark as shipped"}
          </button>
        )}
      </div>

      {open && (
        <form
          style={{ display: "grid", gap: 10, marginTop: 12 }}
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              onNotice(await shipSellerOrder(myUserId, order.order_number, { tracking_number: tracking.trim(), carrier: carrier.trim(), tracking_url: url.trim() }));
              setOpen(false);
              onChanged();
            } catch (err) { onError((err as Error).message); }
            finally { setBusy(false); }
          }}
        >
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 170 }}><Field label="Tracking number">
              <input className="input" value={tracking} onChange={(e) => setTracking(e.target.value)} required />
            </Field></div>
            <div style={{ flex: 1, minWidth: 150 }}><Field label="Courier">
              <input className="input" value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="J&T, LBC, DHL…" />
            </Field></div>
            <div style={{ flex: 1, minWidth: 190 }}><Field label="Tracking link" hint="Optional.">
              <input className="input" type="url" value={url} onChange={(e) => setUrl(e.target.value)} />
            </Field></div>
          </div>
          <button type="submit" className="btn" disabled={busy || !tracking.trim()}>{busy ? "Saving…" : "It's on its way"}</button>
        </form>
      )}
    </div>
  );
}

function SellerSamples({ myUserId, samples, onChanged, onNotice, onError }: {
  myUserId: number; samples: ShopSampleRequest[] | null; onChanged: () => void; onNotice: (m: string) => void; onError: (m: string) => void;
}) {
  const [busyId, setBusyId] = useState<number | null>(null);
  if (samples === null) return <Loading />;
  if (samples.length === 0) return <Notice>No sample requests. Streamers can ask for a free sample of any product you've allowed it on.</Notice>;

  const respond = async (id: number, action: "approve" | "decline") => {
    const reason = action === "decline" ? (window.prompt("Why are you turning this down? (optional)", "") ?? "") : "";
    setBusyId(id);
    try { onNotice(await respondSellerSampleRequest(myUserId, id, action, reason)); onChanged(); }
    catch (e) { onError((e as Error).message); }
    finally { setBusyId(null); }
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {samples.map((s) => (
        <div key={s.id} className="card row" style={{ padding: 14, gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontWeight: 800 }}>{s.product?.title ?? "Product"}</div>
            <div className="muted" style={{ fontSize: 13 }}>{s.status}{s.decline_reason ? ` · ${s.decline_reason}` : ""}</div>
          </div>
          {s.status === "requested" && (
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn" disabled={busyId === s.id} onClick={() => respond(s.id, "approve")}>Send a sample</button>
              <button type="button" className="btn ghost" disabled={busyId === s.id} onClick={() => respond(s.id, "decline")}>No thanks</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
