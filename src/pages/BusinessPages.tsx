// Bingg Bongg Business (Steve, 2026-10-01): "BUSINESS PAGE tab on main page ... Advertise brick &
// mortar or online services - By Country State City ... Each business gets a home page: Big
// banner on top of the page side to side. Under that the description, business name address
// phone email website link. Under that 'Upload Photos' 'Upload Video' links. Under that 'Photos'
// by default, 'Videos' when they click. $1.99/day Payments every 90 days ... cancel anytime no
// refund ... Verified gold check after $180 paid ... Buttons Call Directions Maps Visit Website."
// Plus the same day: "show all businesses in their own city, state, and country first. until
// they search" and the $60 one-time referral fee.
//
// Four pages in one file, the way the wallet pages are grouped: the Business tab, a business's
// page, the member's own pages, and the create/edit form.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useSession } from "../lib/session";
import { Loading, Notice } from "../components/Common";
import { PickerSheet } from "../components/PickerSheet";
import { MAIN_MARKET_CODES } from "../lib/videoads";
import { videoThumbnail } from "../lib/upload";
import {
  DAYS, cancelBusiness, createBusiness, createBusinessFolder, deleteBusinessFolder, deleteBusinessMedia, fetchBusinessCategories, fetchBusinessDetail, fetchBusinesses,
  fetchBusinessPricing, fetchCities, fetchMyBusinesses, fullAddress, hoursOf, loadCountries, nearLabel, placeLine, renameBusinessFolder, renewBusiness,
  statusText, updateBusiness, uploadBusinessMedia, usd,
  type Business, type BusinessCategory, type BusinessForm, type BusinessMedia, type BusinessPricing, type CountryRow, type MyBusinesses, type Near,
} from "../lib/business";

// Steve, 2026-10-01: "Make the countries into our design" — the native <select> is gone; every
// dropdown is the black/gold searchable PickerSheet the Create Ad page uses, opened from a pill.
function PickerPill({ label, active, onClick }: { label: string; active?: boolean; onClick: () => void }) {
  return <button type="button" className="btn small" style={active ? { background: "var(--gold)", color: "#0d0d0d" } : undefined} onClick={onClick}>{label} ▾</button>;
}

function splitMain(countries: CountryRow[]) {
  const main = MAIN_MARKET_CODES.map((code) => countries.find((c) => c.iso2 === code)).filter(Boolean) as CountryRow[];
  const rest = countries.filter((c) => !MAIN_MARKET_CODES.includes(c.iso2!));
  return { main: main.map((c) => ({ code: c.iso2!, name: c.name! })), rest: rest.map((c) => ({ code: c.iso2!, name: c.name! })) };
}

function VerifiedCheck() {
  return <span title="Verified business" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: 999, background: "var(--gold)", color: "#0d0d0d", fontSize: 12, fontWeight: 800, marginLeft: 8 }}>✓</span>;
}

function BusinessCard({ b }: { b: Business }) {
  return (
    <Link to={`/business/${b.id}`} className="card" style={{ display: "block", color: "inherit" }}>
      <div style={{ aspectRatio: "16 / 7", background: "#000" }}>
        {b.banner_url && <img src={b.banner_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} loading="lazy" />}
      </div>
      <div style={{ padding: "10px 12px 12px" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <b style={{ color: "var(--gold)", fontSize: 16, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.name}</b>
          {b.is_verified && <VerifiedCheck />}
        </div>
        <div className="muted" style={{ fontSize: 13 }}>{[b.category?.name, placeLine(b)].filter(Boolean).join(" · ")}</div>
      </div>
    </Link>
  );
}

// ---- The Business tab ---------------------------------------------------------------------

export function BusinessTabPage() {
  const { user } = useSession();
  const [countries, setCountries] = useState<CountryRow[]>([]);
  const [categories, setCategories] = useState<BusinessCategory[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [countryCode, setCountryCode] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [city, setCity] = useState("");
  const [categoryId, setCategoryId] = useState(0);
  const [query, setQuery] = useState("");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Business[] | null>(null);
  const [near, setNear] = useState<Near | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | "country" | "state" | "city" | "category">(null);

  useEffect(() => { loadCountries().then(setCountries).catch(() => undefined); fetchBusinessCategories().then(setCategories).catch(() => undefined); }, []);

  const states = useMemo(() => countries.find((c) => c.iso2 === countryCode)?.states ?? [], [countries, countryCode]);

  useEffect(() => {
    if (!countryCode || !stateCode) { setCities([]); return; }
    fetchCities(countryCode, stateCode).then(setCities).catch(() => setCities([]));
  }, [countryCode, stateCode]);

  useEffect(() => {
    setItems(null);
    setError(null);
    fetchBusinesses({ country_code: countryCode || undefined, state_code: stateCode || undefined, city: city || undefined, category_id: categoryId || undefined, q: q || undefined, my_user_id: user?.id })
      .then((r) => { setItems(r.data); setNear(r.near); })
      .catch((e) => { setError((e as Error).message); setItems([]); });
  }, [countryCode, stateCode, city, categoryId, q, user?.id]);

  const nearText = nearLabel(near);
  return (
    <div className="page">
      {/* Steve, 2026-10-01: "remove the link + your business page from main page" — a member adds
          their own business from the Business tab on their profile page instead. */}
      <h1 className="page-title">Business</h1>

      <form className="row" style={{ gap: 8, marginBottom: 10 }} onSubmit={(e) => { e.preventDefault(); setQ(query.trim()); }}>
        <input className="input" style={{ flex: 1 }} placeholder="Search businesses" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="btn small" type="submit">Search</button>
      </form>

      <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <PickerPill label={countryCode ? (countries.find((c) => c.iso2 === countryCode)?.name ?? countryCode) : "Country"} active={!!countryCode} onClick={() => setSheet("country")} />
        {countryCode && <PickerPill label={stateCode ? (states.find((s) => s.state_code === stateCode)?.name ?? stateCode) : "State"} active={!!stateCode} onClick={() => setSheet("state")} />}
        {stateCode && <PickerPill label={city || "City"} active={!!city} onClick={() => setSheet("city")} />}
        <PickerPill label={categoryId ? (categories.find((c) => c.id === categoryId)?.name ?? "Category") : "Category"} active={!!categoryId} onClick={() => setSheet("category")} />
        {(countryCode || categoryId || q) && <button className="btn small ghost" onClick={() => { setCountryCode(""); setStateCode(""); setCity(""); setCategoryId(0); setQ(""); setQuery(""); }}>Clear</button>}
      </div>
      {sheet === "country" && <PickerSheet title="Country" noun="countries" items={splitMain(countries).rest} pinned={splitMain(countries).main} pinnedLabel="Main markets" restLabel="All countries" selected={countryCode} onPick={(code) => { setCountryCode(code); setStateCode(""); setCity(""); }} onClose={() => setSheet(null)} />}
      {sheet === "state" && <PickerSheet title="State" noun="states" items={states.map((st) => ({ code: st.state_code!, name: st.name! }))} selected={stateCode} onPick={(code) => { setStateCode(code); setCity(""); }} onClose={() => setSheet(null)} />}
      {sheet === "city" && <PickerSheet title="City" noun="cities" items={cities.map((c) => ({ code: c, name: c }))} selected={city} onPick={setCity} onClose={() => setSheet(null)} />}
      {sheet === "category" && <PickerSheet title="Category" noun="categories" items={[{ code: "0", name: "All categories" }, ...categories.map((c) => ({ code: String(c.id), name: c.name }))]} selected={String(categoryId)} onPick={(code) => setCategoryId(Number(code))} onClose={() => setSheet(null)} />}

      {nearText && items && items.length > 0 && <p className="muted" style={{ fontSize: 13, color: "var(--gold)" }}>Showing businesses near you first — {nearText}</p>}
      {error && <Notice error>{error}</Notice>}
      {items === null ? <Loading /> : items.length === 0 ? (
        <Notice>No businesses here yet. Be the first — add a business page from the Business tab on your profile.</Notice>
      ) : (
        <div className="grid wide">{items.map((b) => <BusinessCard key={b.id} b={b} />)}</div>
      )}
    </div>
  );
}

// ---- A business's page --------------------------------------------------------------------

export function BusinessPage() {
  const { id } = useParams();
  const { user } = useSession();
  const navigate = useNavigate();
  const businessId = Number(id);
  const [b, setB] = useState<Business | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showVideos, setShowVideos] = useState(false);
  // null = the built-in Photos/Videos tabs; otherwise the member-made folder being shown.
  const [folderId, setFolderId] = useState<number | null>(null);
  const [toast, setToast] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [viewing, setViewing] = useState<BusinessMedia | null>(null);
  const [pricing, setPricing] = useState<BusinessPricing | null>(null);

  const load = useCallback(() => {
    fetchBusinessDetail(businessId, user?.id).then(setB).catch((e) => setError((e as Error).message));
  }, [businessId, user?.id]);
  useEffect(() => { load(); }, [load]);

  const isOwner = !!user && !!b && user.id === b.user_id;
  useEffect(() => { if (isOwner) fetchBusinessPricing().then(setPricing).catch(() => undefined); }, [isOwner]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 4000); return () => clearTimeout(t); }, [toast]);

  async function upload(type: "photo" | "video", file: File) {
    if (!user || !b) return;
    try {
      setProgress(0);
      const thumb = type === "video" ? await videoThumbnail(file) : null;
      await uploadBusinessMedia(user.id, b.id, type, file, thumb, folderId, setProgress);
      if (folderId === null) setShowVideos(type === "video");
      load();
      setToast("Uploaded.");
    } catch (e) { setToast((e as Error).message); } finally { setProgress(null); }
  }

  async function renew() {
    if (!user || !b || !pricing) return;
    if (!window.confirm(`Renew for ${pricing.term_days} days? ${usd(pricing.term_price)} will be charged from your Cash Account now. No refunds.`)) return;
    try { setToast(await renewBusiness(user.id, b.id)); load(); } catch (e) { setToast((e as Error).message); }
  }

  async function takeDown() {
    if (!user || !b) return;
    if (!window.confirm("Take your page down? It disappears right away, the days you paid for are not refunded, and you can renew any time to bring it back.")) return;
    try { setToast(await cancelBusiness(user.id, b.id)); load(); } catch (e) { setToast((e as Error).message); }
  }

  async function remove(m: BusinessMedia) {
    if (!user || !window.confirm(`Delete this ${m.type}?`)) return;
    try { await deleteBusinessMedia(user.id, m.id); setViewing(null); load(); } catch (e) { setToast((e as Error).message); }
  }

  if (error) return <div className="page"><Notice error>{error}</Notice></div>;
  if (!b) return <div className="page"><Loading /></div>;

  const address = fullAddress(b);
  const hours = hoursOf(b);
  // Photos / Videos, then every folder the member made — Steve, 2026-10-01: "give members the
  // ability to add folders ... 'Daily Special' 'Weekly Specials' 'Monthly Specials'". A folder
  // holds both photos and videos, so its tab shows everything filed under it.
  const folders = b.folders ?? [];
  const activeFolder = folders.some((f) => f.id === folderId) ? folderId : null;
  const media = activeFolder !== null
    ? (b.media ?? []).filter((m) => m.folder_id === activeFolder)
    : (b.media ?? []).filter((m) => !m.folder_id && (m.type === "video") === showVideos);

  async function addFolder() {
    if (!user || !b) return;
    const name = window.prompt("New folder — a tab on your page, for example Daily Special, Weekly Specials, Monthly Specials. It can hold photos and videos.");
    if (!name?.trim()) return;
    try { const id = await createBusinessFolder(user.id, b.id, name.trim()); setFolderId(id); load(); }
    catch (e) { setToast((e as Error).message); }
  }

  async function renameFolder() {
    if (!user || !b || activeFolder === null) return;
    const current = folders.find((f) => f.id === activeFolder)?.name ?? "";
    const name = window.prompt("Rename folder", current);
    if (!name?.trim()) return;
    try { await renameBusinessFolder(user.id, activeFolder, name.trim()); load(); }
    catch (e) { setToast((e as Error).message); }
  }

  async function removeFolder() {
    if (!user || !b || activeFolder === null) return;
    if (!window.confirm("Delete this folder? The folder goes away. Its photos and videos are kept — they move back to your Photos and Videos tabs.")) return;
    try { setToast(await deleteBusinessFolder(user.id, activeFolder)); setFolderId(null); load(); }
    catch (e) { setToast((e as Error).message); }
  }
  const site = b.website ? (b.website.startsWith("http") ? b.website : `https://${b.website}`) : "";

  return (
    <div className="page" style={{ maxWidth: 900 }}>
      {b.banner_url && <img src={b.banner_url} alt="" style={{ width: "100%", aspectRatio: "16 / 6", objectFit: "cover", borderRadius: "var(--radius)", border: "1.5px solid var(--gold-border)", display: "block" }} />}

      {isOwner && (
        <div className="card pad" style={{ marginTop: 12 }}>
          <b style={{ color: b.is_live ? "var(--gold)" : "#FF8A80" }}>{statusText(b)}</b>
          <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <label className="btn small">Upload Photos<input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload("photo", f); e.target.value = ""; }} /></label>
            <label className="btn small">Upload Video<input type="file" accept="video/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload("video", f); e.target.value = ""; }} /></label>
            <button className="btn small" onClick={() => navigate(`/settings/business/edit/${b.id}`)}>Edit</button>
            <button className="btn small" onClick={renew} disabled={!pricing}>Renew</button>
            {b.is_live && <button className="btn small ghost" onClick={takeDown}>Take down</button>}
          </div>
          {progress !== null && <div className="muted" style={{ marginTop: 8 }}>Uploading… {Math.round(progress * 100)}%</div>}
        </div>
      )}

      <div className="card pad" style={{ marginTop: 12 }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <h1 className="page-title" style={{ margin: 0 }}>{b.name}</h1>
          {b.is_verified && <VerifiedCheck />}
        </div>
        <div className="muted" style={{ fontSize: 13 }}>{[b.category?.name, placeLine(b)].filter(Boolean).join(" · ")}</div>
        {b.description && <p className="soft" style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>{b.description}</p>}
        <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
          {address && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} target="_blank" rel="noreferrer">📍 {address}</a>}
          {b.phone && <a href={`tel:${b.phone}`}>📞 {b.phone}</a>}
          {b.email && <a href={`mailto:${b.email}`}>✉️ {b.email}</a>}
          {site && <a href={site} target="_blank" rel="noreferrer">🔗 {b.website}</a>}
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 14 }}>
          {b.phone && <a className="btn small" href={`tel:${b.phone}`}>Call</a>}
          {address && <a className="btn small" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`} target="_blank" rel="noreferrer">Directions</a>}
          {address && <a className="btn small" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} target="_blank" rel="noreferrer">Maps</a>}
          {site && <a className="btn small" href={site} target="_blank" rel="noreferrer">Visit Website</a>}
        </div>
      </div>

      {Object.values(hours).some(Boolean) && (
        <div className="card pad" style={{ marginTop: 12 }}>
          <b style={{ color: "var(--gold)", fontSize: 16 }}>Hours</b>
          <table style={{ marginTop: 8, borderCollapse: "collapse" }}><tbody>
            {DAYS.map(([k, label]) => <tr key={k}><td className="muted" style={{ paddingRight: 24, paddingBottom: 4 }}>{label}</td><td>{hours[k] || "—"}</td></tr>)}
          </tbody></table>
        </div>
      )}

      <div className="card pad" style={{ marginTop: 12 }}>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button className={`btn small${activeFolder === null && !showVideos ? "" : " ghost"}`} onClick={() => { setFolderId(null); setShowVideos(false); }}>Photos</button>
          <button className={`btn small${activeFolder === null && showVideos ? "" : " ghost"}`} onClick={() => { setFolderId(null); setShowVideos(true); }}>Videos</button>
          {folders.map((f) => (
            <button key={f.id} className={`btn small${activeFolder === f.id ? "" : " ghost"}`} onClick={() => setFolderId(f.id)}>{f.name}</button>
          ))}
          {isOwner && <button className="btn small ghost" onClick={addFolder}>+ Folder</button>}
        </div>
        {isOwner && activeFolder !== null && (
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <button className="btn small ghost" onClick={renameFolder}>Rename</button>
            <button className="btn small ghost" onClick={removeFolder}>Delete folder</button>
          </div>
        )}
        {media.length === 0 ? <p className="muted" style={{ marginTop: 10 }}>{activeFolder !== null ? "Nothing in this folder yet." : showVideos ? "No videos yet." : "No photos yet."}</p> : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8, marginTop: 10 }}>
            {media.map((m) => (
              <button key={m.id} onClick={() => setViewing(m)} style={{ aspectRatio: "1 / 1", padding: 0, border: "1.5px solid var(--gold-border)", borderRadius: 10, overflow: "hidden", background: "#000", cursor: "pointer", position: "relative" }}>
                <img src={m.type === "video" ? (m.thumb_url ?? "") : m.file_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                {m.type === "video" && <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 28 }}>▶</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {viewing && (
        <div className="modal-backdrop" style={{ alignItems: "center" }} onClick={() => setViewing(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: "92vw", maxHeight: "90vh" }}>
            {viewing.type === "video" ? <video src={viewing.file_url} controls autoPlay style={{ maxWidth: "92vw", maxHeight: "80vh" }} /> : <img src={viewing.file_url} alt="" style={{ maxWidth: "92vw", maxHeight: "80vh", objectFit: "contain" }} />}
            <div className="row" style={{ gap: 8, justifyContent: "center", marginTop: 10 }}>
              {isOwner && <button className="btn small ghost" onClick={() => remove(viewing)}>Delete</button>}
              <button className="btn small" onClick={() => setViewing(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div style={{ position: "fixed", left: "50%", bottom: 24, transform: "translateX(-50%)", background: "#0d0d0d", color: "var(--gold)", border: "1.5px solid var(--gold-border)", borderRadius: 999, padding: "10px 18px", zIndex: 120 }}>{toast}</div>}
    </div>
  );
}

/**
 * One member's live pages, for the Business tab on their public profile — Steve, 2026-10-01:
 * "Add a business tab in the public profile page for everyone to see his business."
 */
export function MemberBusinessesPanel({ userId }: { userId: number }) {
  const [items, setItems] = useState<Business[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setItems(null);
    fetchBusinesses({ user_id: userId })
      .then((r) => setItems(r.data))
      .catch((e) => { setError((e as Error).message); setItems([]); });
  }, [userId]);

  if (error) return <Notice error>{error}</Notice>;
  if (items === null) return <Loading />;
  if (items.length === 0) return <p className="muted" style={{ padding: "24px 0", textAlign: "center" }}>No business pages yet.</p>;
  return <div className="grid wide">{items.map((b) => <BusinessCard key={b.id} b={b} />)}</div>;
}

// ---- The member's own pages ---------------------------------------------------------------

/**
 * The member's own pages, as a panel — Steve, 2026-10-01: "Add a 'Business' tab in the personal
 * profile page, from there they can add their business." ProfilePage renders this inside its own
 * Business tab; MyBusinessesPage below is the same panel as a standalone page for
 * /settings/business.
 */
export function MyBusinessesPanel() {
  const { user, isLoggedIn } = useSession();
  const [mine, setMine] = useState<MyBusinesses | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchMyBusinesses(user.id).then(setMine).catch((e) => setError((e as Error).message));
  }, [user]);

  if (!isLoggedIn) return <Notice>Sign in to list your business. <Link to="/login">Sign in</Link></Notice>;
  if (error) return <Notice error>{error}</Notice>;
  if (!mine) return <Loading />;
  const p = mine.pricing;

  return (
    <>
      <div className="card pad" style={{ textAlign: "center" }}>
        <b style={{ color: "var(--gold)", fontSize: 18 }}>Your Business Page</b>
        {p && <div style={{ color: "var(--gold)", marginTop: 6 }}>{usd(p.price_per_day)}/day · {usd(p.term_price)} for {p.term_days} days, paid up front</div>}
        <div style={{ color: "var(--gold)", marginTop: 4 }}>Cash Account balance: {usd(mine.cash_balance)}</div>
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Cancel anytime. No refunds. Your page shows a gold verified check while it is paid up.</div>
        <div className="row" style={{ gap: 8, justifyContent: "center", flexWrap: "wrap", marginTop: 12 }}>
          <Link className="btn small" to="/settings/advertise">Add money to your cash account</Link>
          {p?.enabled !== false && <Link className="btn small" style={{ background: "var(--gold)", color: "#0d0d0d" }} to="/settings/business/new">+ Create a business page</Link>}
        </div>
      </div>

      {mine.referral_code && (
        <div className="card pad" style={{ textAlign: "center", marginTop: 12 }}>
          <b style={{ color: "var(--gold)", fontSize: 16 }}>Refer a business, earn {usd(mine.referral_fee)}</b>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>When a business signs up with your code you get {usd(mine.referral_fee)}, one time, straight into your wallet.</div>
          <div style={{ fontSize: 22, fontWeight: 800, marginTop: 8, letterSpacing: "0.08em" }}>{mine.referral_code}</div>
          <div style={{ color: "var(--gold)", fontSize: 13, marginTop: 4 }}>Earned so far: {usd(mine.referral_earned)} from {mine.referral_count} business{mine.referral_count === 1 ? "" : "es"}</div>
          <button className="btn small" style={{ marginTop: 10 }} onClick={() => { navigator.clipboard?.writeText(`List your business on Bingg Bongg and use my referral code ${mine.referral_code} when you sign up. https://www.binggbongg.com`).then(() => setCopied(true)).catch(() => undefined); }}>{copied ? "Copied!" : "Copy your invite"}</button>
        </div>
      )}

      {mine.data.length === 0 ? <Notice>You don't have a business page yet.</Notice> : (
        <div className="grid wide" style={{ marginTop: 12 }}>
          {mine.data.map((b) => (
            <div key={b.id} className="card">
              <div style={{ aspectRatio: "16 / 6", background: "#000" }}>{b.banner_url && <img src={b.banner_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}</div>
              <div style={{ padding: "10px 12px 12px" }}>
                <div style={{ display: "flex", alignItems: "center" }}><b style={{ color: "var(--gold)", fontSize: 16 }}>{b.name}</b>{b.is_verified && <VerifiedCheck />}</div>
                <div className="muted" style={{ fontSize: 13, color: b.is_live ? undefined : "#FF8A80" }}>{statusText(b)} · {b.views} views</div>
                <div className="row" style={{ gap: 8, marginTop: 10 }}>
                  <Link className="btn small" to={`/business/${b.id}`}>Open page</Link>
                  {!b.is_live && b.status !== "suspended" && <Link className="btn small" style={{ background: "var(--gold)", color: "#0d0d0d" }} to={`/business/${b.id}`}>Renew</Link>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export function MyBusinessesPage() {
  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <h1 className="page-title">Bingg Bongg Business</h1>
      <MyBusinessesPanel />
    </div>
  );
}

// ---- Create / edit --------------------------------------------------------------------------

export function CreateBusinessPage() {
  const { user, isLoggedIn } = useSession();
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const editingId = id ? Number(id) : null;
  const [countries, setCountries] = useState<CountryRow[]>([]);
  const [categories, setCategories] = useState<BusinessCategory[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [pricing, setPricing] = useState<BusinessPricing | null>(null);
  const [banner, setBanner] = useState<File | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [form, setForm] = useState<BusinessForm>({ name: "", category_id: 0, description: "", is_online: false, country_code: "", state_code: "", city: "", address_line: "", phone: "", email: "", website: "", hours: {}, referral_code: params.get("ref") ?? "" });
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(!editingId);
  const [sheet, setSheet] = useState<null | "country" | "state" | "city" | "category">(null);

  useEffect(() => { loadCountries().then(setCountries).catch(() => undefined); fetchBusinessCategories().then(setCategories).catch(() => undefined); fetchBusinessPricing().then(setPricing).catch(() => undefined); }, []);
  useEffect(() => {
    if (!editingId || !user) return;
    fetchBusinessDetail(editingId, user.id).then((b) => {
      setForm({ name: b.name, category_id: b.category_id ?? 0, description: b.description ?? "", is_online: b.is_online, country_code: b.country_code ?? "", state_code: b.state_code ?? "", city: b.city ?? "", address_line: b.address_line ?? "", phone: b.phone ?? "", email: b.email ?? "", website: b.website ?? "", hours: hoursOf(b) });
      setBannerUrl(b.banner_url ?? null);
      setLoaded(true);
    }).catch((e) => setError((e as Error).message));
  }, [editingId, user]);

  const states = useMemo(() => countries.find((c) => c.iso2 === form.country_code)?.states ?? [], [countries, form.country_code]);
  useEffect(() => {
    if (!form.country_code || !form.state_code) { setCities([]); return; }
    fetchCities(form.country_code, form.state_code).then(setCities).catch(() => setCities([]));
  }, [form.country_code, form.state_code]);

  function set<K extends keyof BusinessForm>(k: K, v: BusinessForm[K]) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);
    if (!form.name.trim()) return setError("Give your business a name.");
    if (!form.category_id) return setError("Choose a category.");
    if (!form.country_code) return setError("Choose a country.");
    if (!editingId && !banner) return setError("Choose a banner image.");
    setBusy(true);
    try {
      const b = editingId ? await updateBusiness(user.id, editingId, form, banner, setProgress) : await createBusiness(user.id, form, banner!, setProgress);
      navigate(`/business/${b.id}`, { replace: true });
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); setProgress(null); }
  }

  if (!isLoggedIn) return <div className="page"><Notice>Sign in to list your business. <Link to="/login">Sign in</Link></Notice></div>;
  if (!loaded) return <div className="page">{error ? <Notice error>{error}</Notice> : <Loading />}</div>;

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <h1 className="page-title">{editingId ? "Edit business page" : "Create a business page"}</h1>
      <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
        <div className="card pad">
          <b style={{ color: "var(--gold)" }}>Banner</b>
          <div className="muted" style={{ fontSize: 12 }}>Shows side to side across the top of your page.</div>
          <div style={{ aspectRatio: "16 / 6", background: "#000", border: "1.5px solid var(--gold-border)", borderRadius: 10, overflow: "hidden", marginTop: 8 }}>
            {(banner || bannerUrl) && <img src={banner ? URL.createObjectURL(banner) : bannerUrl!} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
          </div>
          <label className="btn small" style={{ marginTop: 8 }}>{editingId ? "Change banner" : "Choose banner"}<input type="file" accept="image/*" hidden onChange={(e) => setBanner(e.target.files?.[0] ?? null)} /></label>
        </div>

        <div className="card pad" style={{ display: "grid", gap: 8 }}>
          <b style={{ color: "var(--gold)" }}>Business</b>
          <input className="input" placeholder="Business name" value={form.name} onChange={(e) => set("name", e.target.value)} required />
          <div><PickerPill label={form.category_id ? (categories.find((c) => c.id === form.category_id)?.name ?? "Category") : "Category"} active={!!form.category_id} onClick={() => setSheet("category")} /></div>
          <textarea className="input" rows={4} placeholder="Describe your business" value={form.description} onChange={(e) => set("description", e.target.value)} />
          <input className="input" placeholder="Phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          <input className="input" placeholder="Email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          <input className="input" placeholder="Website or any link" value={form.website} onChange={(e) => set("website", e.target.value)} />
        </div>

        <div className="card pad" style={{ display: "grid", gap: 8 }}>
          <b style={{ color: "var(--gold)" }}>Where</b>
          <div className="muted" style={{ fontSize: 12 }}>People find you by country, state and city.</div>
          <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={form.is_online} onChange={(e) => set("is_online", e.target.checked)} /> Online service</label>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <PickerPill label={form.country_code ? (countries.find((c) => c.iso2 === form.country_code)?.name ?? form.country_code) : "Country"} active={!!form.country_code} onClick={() => setSheet("country")} />
            {form.country_code && <PickerPill label={form.state_code ? (states.find((s) => s.state_code === form.state_code)?.name ?? form.state_code) : "State"} active={!!form.state_code} onClick={() => setSheet("state")} />}
            {form.state_code && <PickerPill label={form.city || "City"} active={!!form.city} onClick={() => setSheet("city")} />}
          </div>
          <input className="input" placeholder={form.is_online ? "Street address (optional for online)" : "Street address"} value={form.address_line} onChange={(e) => set("address_line", e.target.value)} />
        </div>

        <div className="card pad" style={{ display: "grid", gap: 6 }}>
          <b style={{ color: "var(--gold)" }}>Hours</b>
          <div className="muted" style={{ fontSize: 12 }}>For example 9:00 AM - 5:00 PM, or Closed. Leave blank to hide.</div>
          {DAYS.map(([k, label]) => (
            <div key={k} className="row" style={{ gap: 8 }}>
              <span className="muted" style={{ width: 90 }}>{label}</span>
              <input className="input" style={{ flex: 1 }} placeholder="Closed" value={form.hours[k] ?? ""} onChange={(e) => set("hours", { ...form.hours, [k]: e.target.value })} />
            </div>
          ))}
        </div>

        {!editingId && (
          <div className="card pad" style={{ display: "grid", gap: 6 }}>
            <b style={{ color: "var(--gold)" }}>Referred by a member?</b>
            <div className="muted" style={{ fontSize: 12 }}>Enter their referral code and they earn a one-time thank-you from Bingg Bongg. It costs you nothing.</div>
            <input className="input" placeholder="Referral code (optional)" value={form.referral_code ?? ""} onChange={(e) => set("referral_code", e.target.value.toUpperCase())} />
          </div>
        )}

        <div className="card pad" style={{ textAlign: "center" }}>
          <div style={{ color: "var(--gold)" }}>{editingId ? "Edits are free — your paid days are unchanged." : pricing ? `${usd(pricing.term_price)} for ${pricing.term_days} days (${usd(pricing.price_per_day)}/day)` : "Loading price…"}</div>
          {error && <Notice error>{error}</Notice>}
          <button className="btn" type="submit" disabled={busy} style={{ marginTop: 10, background: "var(--gold)", color: "#0d0d0d" }}>{busy ? (progress !== null ? `Uploading… ${Math.round(progress * 100)}%` : "Working…") : editingId ? "Save changes" : "Pay & publish"}</button>
          {!editingId && <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Charged from your Cash Account. Cancel anytime, no refunds.</div>}
        </div>
      </form>
      {sheet === "country" && <PickerSheet title="Country" noun="countries" items={splitMain(countries).rest} pinned={splitMain(countries).main} pinnedLabel="Main markets" restLabel="All countries" selected={form.country_code} onPick={(code) => { set("country_code", code); set("state_code", ""); set("city", ""); }} onClose={() => setSheet(null)} />}
      {sheet === "state" && <PickerSheet title="State" noun="states" items={states.map((st) => ({ code: st.state_code!, name: st.name! }))} selected={form.state_code} onPick={(code) => { set("state_code", code); set("city", ""); }} onClose={() => setSheet(null)} />}
      {sheet === "city" && <PickerSheet title="City" noun="cities" items={cities.map((c) => ({ code: c, name: c }))} selected={form.city} onPick={(c) => set("city", c)} onClose={() => setSheet(null)} />}
      {sheet === "category" && <PickerSheet title="Category" noun="categories" items={categories.map((c) => ({ code: String(c.id), name: c.name }))} selected={String(form.category_id)} onPick={(code) => set("category_id", Number(code))} onClose={() => setSheet(null)} />}
    </div>
  );
}
