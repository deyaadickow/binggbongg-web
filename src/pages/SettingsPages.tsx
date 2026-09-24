// Settings on the web — one page per row of the phones' Settings screen. The ones wired to
// real endpoints work today; the rest are "coming soon" placeholders so every link exists
// (Steve, 2026-09-24: "add them anyway and work it out one at a time").
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { displayName, post, type UserSummary } from "../lib/api";
import { useSession } from "../lib/session";
import { Avatar, Loading, Notice, UserRow } from "../components/Common";
import { SideLinkItem, sidebarSections } from "../components/Sidebar";

const SITE = "https://www.binggbongg.com";

function useToast() {
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  return { toast, setToast, el: toast ? <div className="notice" style={{ position: "fixed", left: 16, right: 16, bottom: 16, maxWidth: 480, margin: "0 auto", zIndex: 30 }}>{toast}</div> : null };
}

function Page({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="page" style={wide ? undefined : { maxWidth: 720 }}>
      <h1 className="page-title">{title}</h1>
      {children}
    </div>
  );
}

function NeedLogin() {
  return <div className="page"><Notice>Sign in to open this page. <Link to="/login">Sign in</Link></Notice></div>;
}

/** The whole Settings list as a page — what phones and narrow screens use instead of the sidebar. */
export function SettingsHubPage() {
  const { user, isLoggedIn, signOut } = useSession();
  return (
    <Page title="Settings">
      {sidebarSections(user?.id ?? null).map((sec, i) => (
        <div key={i} className="card" style={{ marginBottom: 12, overflow: "hidden" }}>
          {sec.title && <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)" }}><b style={{ color: "var(--gold)" }}>{sec.title}</b></div>}
          {sec.links.filter((l) => !l.needsLogin || isLoggedIn).map((l) => <SideLinkItem key={l.label} link={l} onSignOut={signOut} big />)}
        </div>
      ))}
    </Page>
  );
}

export function ComingSoonPage({ title, note }: { title: string; note: string }) {
  return (
    <Page title={title}>
      <div className="card pad">
        <p className="soft" style={{ marginTop: 0 }}>{note}</p>
        <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>This page is on the way for the web. It already works in the Bingg Bongg app on your phone.</p>
      </div>
    </Page>
  );
}

// ---- Account settings (the toggles at the top of the phones' Settings) --------------------
interface MyUser extends UserSummary {
  is_notification?: number | string | null;
  show_liked_videos?: number | string | null;
  show_following_list?: number | string | null;
  allow_virtual_games?: number | string | null;
  wants_to_battle?: number | string | null;
}
const TOGGLES: { key: keyof MyUser; label: string; hint: string }[] = [
  { key: "is_notification", label: "Notify me", hint: "Push notifications from the app." },
  { key: "show_liked_videos", label: "Show your liked videos to users", hint: "Others can see the videos you liked on your profile." },
  { key: "show_following_list", label: "Show your following list to users", hint: "Others can see who you follow." },
  { key: "allow_virtual_games", label: "Allow virtual games", hint: "Let hosts invite you to virtual games." },
  { key: "wants_to_battle", label: "I want someone to battle with", hint: "Show you in Find a Battle so hosts can challenge you." },
];
const on = (v: unknown) => v === 1 || v === "1" || v === true;

export function AccountSettingsPage() {
  const { user, isLoggedIn, refresh } = useSession();
  const [me, setMe] = useState<MyUser | null>(null);
  const [fullname, setFullname] = useState("");
  const [bio, setBio] = useState("");
  const [busy, setBusy] = useState(false);
  const { setToast, el } = useToast();
  useEffect(() => {
    if (!user) return;
    post<MyUser>("fetchMyUserDetails", { my_user_id: user.id }).then((r) => {
      if (r.status && r.data) { setMe(r.data); setFullname(r.data.fullname ?? ""); setBio(r.data.bio ?? ""); }
    }).catch(() => undefined);
  }, [user]);
  if (!isLoggedIn || !user) return <NeedLogin />;
  async function save(fields: Record<string, unknown>) {
    if (!user) return;
    setBusy(true);
    try {
      const r = await post<MyUser>("updateUserDetails", { user_id: user.id, ...fields });
      if (!r.status) throw new Error(r.message ?? "Couldn't save.");
      setMe((m) => ({ ...(m ?? {} as MyUser), ...(r.data ?? {}), ...fields } as MyUser));
      setToast("Saved.");
      refresh();
    } catch (e) { setToast((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Page title="Account settings">
      {!me ? <Loading /> : (
        <>
          <div className="card" style={{ marginBottom: 12 }}>
            {TOGGLES.map((t) => (
              <label key={t.key} className="row" style={{ padding: "12px 14px", borderBottom: "1px solid var(--line)", cursor: "pointer" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{t.label}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{t.hint}</div>
                </div>
                <input type="checkbox" className="switch" disabled={busy} checked={on(me[t.key])} onChange={(e) => save({ [t.key]: e.target.checked ? 1 : 0 })} />
              </label>
            ))}
          </div>
          <div className="card pad">
            <div className="row" style={{ marginBottom: 12 }}><Avatar user={me} size="lg" /><div><div style={{ fontWeight: 800 }}>{displayName(me)}</div><div className="muted">@{me.username}</div></div></div>
            <label className="soft" style={{ fontSize: 13 }}>Name</label>
            <input className="input" value={fullname} onChange={(e) => setFullname(e.target.value)} maxLength={60} style={{ width: "100%", marginBottom: 10 }} />
            <label className="soft" style={{ fontSize: 13 }}>Bio</label>
            <textarea className="input" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={200} rows={3} style={{ width: "100%", marginBottom: 10 }} />
            <button className="btn" disabled={busy} onClick={() => save({ fullname, bio })}>Save profile</button>
          </div>
        </>
      )}
      {el}
    </Page>
  );
}

// ---- Share profile + QR --------------------------------------------------------------------
export function ShareProfilePage() {
  const { user, isLoggedIn } = useSession();
  const { setToast, el } = useToast();
  if (!isLoggedIn || !user) return <NeedLogin />;
  const link = `${SITE}/profile/${user.id}`;
  const copy = () => navigator.clipboard.writeText(link).then(() => setToast("Link copied.")).catch(() => setToast("Couldn't copy — select the link and copy it."));
  return (
    <Page title="Share profile">
      <div className="card pad">
        <div className="row" style={{ marginBottom: 12 }}><Avatar user={user} size="lg" /><div><div style={{ fontWeight: 800 }}>{displayName(user)}</div><div className="muted">@{user.username}</div></div></div>
        <input className="input" readOnly value={link} style={{ width: "100%", marginBottom: 10 }} onFocus={(e) => e.target.select()} />
        <div className="row">
          <button className="btn" onClick={copy}>Copy link</button>
          {typeof navigator.share === "function" && <button className="btn ghost" onClick={() => navigator.share({ title: displayName(user), url: link }).catch(() => undefined)}>Share…</button>}
        </div>
      </div>
      {el}
    </Page>
  );
}

export function QrCodePage() {
  const { user, isLoggedIn } = useSession();
  if (!isLoggedIn || !user) return <NeedLogin />;
  const link = `${SITE}/profile/${user.id}`;
  // Public profile link only — rendered by a QR image service until a local generator lands.
  const img = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&color=F0C420&bgcolor=000000&data=${encodeURIComponent(link)}`;
  return (
    <Page title="My QR code">
      <div className="card pad" style={{ display: "grid", placeItems: "center", gap: 10 }}>
        <img src={img} alt="QR code for your profile" width={240} height={240} style={{ border: "1.5px solid var(--gold-border)", borderRadius: 12 }} />
        <div style={{ fontWeight: 800 }}>{displayName(user)}</div>
        <div className="muted" style={{ fontSize: 13 }}>Scan to open your profile on Bingg Bongg.</div>
      </div>
    </Page>
  );
}

// ---- Referrals ------------------------------------------------------------------------------
// Steve, 2026-09-24: the original cash-reward referral program is paused (backend flag
// referral_cash_program_enabled). Referrals now count for Simulcast free months/years, video-ad
// referral commissions and Share & Earn 10% — so no earnings boxes here, just the code and list.
interface Referral { id: number; user?: UserSummary; created_at?: string }
export function ReferralsPage() {
  const { user, isLoggedIn } = useSession();
  const [list, setList] = useState<Referral[] | null>(null);
  const { setToast, el } = useToast();
  const load = useCallback(() => {
    if (!user) return;
    post<Referral[]>("fetchMyReferrals", { user_id: user.id, start: 0, count: 100 }).then((r) => setList(r.data ?? [])).catch(() => setList([]));
  }, [user]);
  useEffect(load, [load]);
  if (!isLoggedIn || !user) return <NeedLogin />;
  return (
    <Page title="Referrals">
      <div className="card pad" style={{ marginBottom: 12 }}>
        <div className="muted" style={{ fontSize: 13 }}>Your referral code is your username. Anyone who signs up with it becomes your referral.</div>
        <div className="row" style={{ marginTop: 8 }}><span className="pill">@{user.username}</span><button className="btn small ghost" onClick={() => navigator.clipboard.writeText(user.username ?? "").then(() => setToast("Copied.")).catch(() => undefined)}>Copy</button></div>
      </div>
      <div className="card pad" style={{ marginBottom: 12 }}>
        <b style={{ color: "var(--gold)" }}>What referrals earn you</b>
        <ul className="soft" style={{ fontSize: 14, margin: "8px 0 0", paddingLeft: 18 }}>
          <li><b>Simulcast for free.</b> 3 referrals in a month make your next month free. 36 lifetime referrals earn a free year. <Link to="/settings/simulcast">See your Simulcast status</Link>.</li>
          <li><b>Video-ad commission.</b> When someone you referred buys a video ad, you get a one-time referral commission for that ad.</li>
          <li><b>Share &amp; Earn 10%.</b> Share a live room with the button in the room. Gifts sent by the people who came through your link pay you 10%.</li>
        </ul>
      </div>
      <div className="card">
        <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)" }}><b style={{ color: "var(--gold)" }}>People you referred{list ? ` (${list.length})` : ""}</b></div>
        {list === null ? <Loading /> : list.length === 0 ? <p className="muted" style={{ padding: 14 }}>Nobody yet.</p> : list.map((r) => r.user ? <UserRow key={r.id} user={r.user} /> : null)}
      </div>
      {el}
    </Page>
  );
}

// ---- Blocked profiles -----------------------------------------------------------------------
export function BlockedProfilesPage() {
  const { user, isLoggedIn } = useSession();
  const [list, setList] = useState<UserSummary[] | null>(null);
  const { setToast, el } = useToast();
  const load = useCallback(() => {
    if (!user) return;
    post<UserSummary[]>("fetchBlockedUsers", { user_id: user.id }).then((r) => setList(r.data ?? [])).catch(() => setList([]));
  }, [user]);
  useEffect(load, [load]);
  if (!isLoggedIn || !user) return <NeedLogin />;
  async function unblock(id: number) {
    if (!user || !list) return;
    const remaining = list.filter((u) => u.id !== id).map((u) => u.id).join(",");
    try {
      const r = await post("updateUserBlockList", { user_id: user.id, blocked_users: remaining || "0" });
      if (!r.status) throw new Error(r.message ?? "Couldn't unblock.");
      setToast("Unblocked."); load();
    } catch (e) { setToast((e as Error).message); }
  }
  return (
    <Page title="Blocked profiles">
      <div className="card">
        {list === null ? <Loading /> : list.length === 0 ? <p className="muted" style={{ padding: 14 }}>You haven't blocked anyone.</p>
          : list.map((u) => <UserRow key={u.id} user={u} trailing={<button className="btn small ghost" onClick={() => unblock(u.id)}>Unblock</button>} />)}
      </div>
      {el}
    </Page>
  );
}

// ---- My Moderators --------------------------------------------------------------------------
interface ModRow { id: number; moderator_user_id: number; moderator?: UserSummary }
export function ModeratorsPage() {
  const { user, isLoggedIn } = useSession();
  const [list, setList] = useState<ModRow[] | null>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<UserSummary[]>([]);
  const { setToast, el } = useToast();
  const load = useCallback(() => {
    if (!user) return;
    post<unknown>("fetchMyModerators", { my_user_id: user.id }).then((r) => setList(((r as { moderators?: ModRow[] }).moderators) ?? [])).catch(() => setList([]));
  }, [user]);
  useEffect(load, [load]);
  useEffect(() => {
    if (!q.trim() || !user) { setResults([]); return; }
    const t = setTimeout(() => post<UserSummary[]>("searchUser", { keyword: q.trim(), start: 0, count: 10, my_user_id: user.id }).then((r) => setResults((r.data ?? []).filter((u) => u.id !== user.id))).catch(() => undefined), 300);
    return () => clearTimeout(t);
  }, [q, user]);
  if (!isLoggedIn || !user) return <NeedLogin />;
  async function change(endpoint: "addPersonalModerator" | "removePersonalModerator", id: number) {
    if (!user) return;
    try {
      const r = await post(endpoint, { my_user_id: user.id, moderator_user_id: id });
      if (!r.status) throw new Error(r.message ?? "Couldn't update moderators.");
      setToast(endpoint === "addPersonalModerator" ? "Moderator added." : "Moderator removed."); setQ(""); load();
    } catch (e) { setToast((e as Error).message); }
  }
  return (
    <Page title="My Moderators">
      <p className="muted" style={{ fontSize: 13 }}>Moderators can pause chat and keep your live room in order. They get a shield badge in your room.</p>
      <div className="card pad" style={{ marginBottom: 12 }}>
        <input className="input" placeholder="Search a member to add" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: "100%" }} />
        {results.map((u) => <UserRow key={u.id} user={u} trailing={<button className="btn small" onClick={() => change("addPersonalModerator", u.id)}>Add</button>} />)}
      </div>
      <div className="card">
        <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)" }}><b style={{ color: "var(--gold)" }}>Your moderators{list ? ` (${list.length})` : ""}</b></div>
        {list === null ? <Loading /> : list.length === 0 ? <p className="muted" style={{ padding: 14 }}>No moderators yet.</p>
          : list.map((m) => m.moderator ? <UserRow key={m.id} user={m.moderator} trailing={<button className="btn small ghost" onClick={() => change("removePersonalModerator", m.moderator_user_id)}>Remove</button>} /> : null)}
      </div>
      {el}
    </Page>
  );
}

// ---- Simulcast ------------------------------------------------------------------------------
interface SimDest { platform: string; label: string; guaranteed: boolean; note?: string; default_rtmp_url?: string; rtmp_url?: string; has_key: boolean; is_enabled: boolean }
interface SimOverview { enabled: boolean; free_year_referrals?: number; lifetime_referrals?: number; daily_price: number; monthly_price: number; status: string; is_entitled: boolean; paid_until?: string | null; cash_wallet: number; referrals_this_month: number; referrals_needed_for_free_month: number; next_month_free: boolean; destinations: SimDest[] }
export function SimulcastPage() {
  const { user, isLoggedIn } = useSession();
  const [ov, setOv] = useState<SimOverview | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [rtmp, setRtmp] = useState("");
  const [key, setKey] = useState("");
  const { setToast, el } = useToast();
  const load = useCallback(() => { post<SimOverview>("fetchSimulcastOverview", { user_id: user?.id }).then((r) => { if (r.status && r.data) setOv(r.data); }).catch(() => undefined); }, [user]);
  useEffect(load, [load]);
  if (!isLoggedIn || !user) return <NeedLogin />;
  async function save(platform: string, enabled: boolean) {
    try {
      const r = await post("saveSimulcastDestination", { platform, rtmp_url: rtmp, stream_key: key, is_enabled: enabled ? 1 : 0 });
      if (!r.status) throw new Error(r.message ?? "Couldn't save.");
      setToast("Saved."); setEditing(null); setKey(""); load();
    } catch (e) { setToast((e as Error).message); }
  }
  async function remove(platform: string) {
    try {
      const r = await post("deleteSimulcastDestination", { platform });
      if (!r.status) throw new Error(r.message ?? "Couldn't remove.");
      setToast("Removed."); load();
    } catch (e) { setToast((e as Error).message); }
  }
  async function toggle(d: SimDest, enabled: boolean) {
    try {
      const r = await post("saveSimulcastDestination", { platform: d.platform, is_enabled: enabled ? 1 : 0 });
      if (!r.status) throw new Error(r.message ?? "Couldn't update.");
      load();
    } catch (e) { setToast((e as Error).message); }
  }
  return (
    <Page title="Simulcast">
      <p className="muted" style={{ fontSize: 13 }}>Go live once on Bingg Bongg and be live on YouTube, Facebook, Twitch, Instagram and TikTok at the same time. Paste each platform's stream key once; every live you start is sent there too.</p>
      {!ov ? <Loading /> : (
        <>
          {/* Steve, 2026-09-24: "Bingg Bongg should be on top of the list … once you connect with
              Bingg Bongg we will be able to connect you to all these social media platforms at the
              same time." */}
          <div className="card pad" style={{ marginBottom: 10, borderWidth: 2 }}>
            <div className="row">
              <div style={{ flex: 1 }}>
                <b style={{ color: "var(--gold)", fontSize: 17 }}>Bingg Bongg Live</b>
                <div className="soft" style={{ fontSize: 13 }}>Once you connect with Bingg Bongg we will be able to connect you to all these social media platforms at the same time.</div>
              </div>
              <span className="pill live">● CONNECTED</span>
            </div>
          </div>
          <div className="card pad" style={{ marginBottom: 12 }}>
            <div className="row" style={{ flexWrap: "wrap", gap: 16 }}>
              <div><div className="muted" style={{ fontSize: 12 }}>Status</div><div style={{ fontWeight: 800, color: "var(--gold)" }}>{ov.is_entitled ? "Active" : ov.status}</div></div>
              <div><div className="muted" style={{ fontSize: 12 }}>Price</div><div style={{ fontWeight: 800 }}>${Number(ov.daily_price).toFixed(2)}/day · ${Number(ov.monthly_price).toFixed(2)}/month</div></div>
              {ov.paid_until && <div><div className="muted" style={{ fontSize: 12 }}>Paid until</div><div style={{ fontWeight: 800 }}>{String(ov.paid_until).slice(0, 10)}</div></div>}
              <div><div className="muted" style={{ fontSize: 12 }}>Referrals this month</div><div style={{ fontWeight: 800 }}>{ov.referrals_this_month} / {ov.referrals_needed_for_free_month}{ov.next_month_free ? " · next month free!" : ""}</div></div>
            </div>
            <div className="soft" style={{ fontSize: 13, marginTop: 10 }}>
              Every {ov.referrals_needed_for_free_month} referrals to this Simulcast get you a free month.{ov.free_year_referrals ? ` ${ov.free_year_referrals} lifetime referrals get you a free year.` : ""}
            </div>
          </div>
          {ov.destinations.map((d) => (
            <div key={d.platform} className="card pad" style={{ marginBottom: 10 }}>
              <div className="row">
                <div style={{ flex: 1 }}>
                  <b>{d.label}</b>{!d.guaranteed && <span className="muted" style={{ fontSize: 12 }}> · {d.note ?? "may need a third-party RTMP bridge"}</span>}
                  <div className="muted" style={{ fontSize: 12 }}>{d.has_key ? (d.is_enabled ? "Key saved · sending" : "Key saved · paused") : "No stream key yet"}</div>
                </div>
                {d.has_key && <input type="checkbox" className="switch" checked={d.is_enabled} onChange={(e) => toggle(d, e.target.checked)} />}
                <button className="btn small ghost" onClick={() => { setEditing(editing === d.platform ? null : d.platform); setRtmp(d.rtmp_url ?? d.default_rtmp_url ?? ""); setKey(""); }}>{d.has_key ? "Change" : "Set up"}</button>
                {d.has_key && <button className="btn small ghost" style={{ color: "var(--red)", borderColor: "var(--red)" }} onClick={() => remove(d.platform)}>Remove</button>}
              </div>
              {editing === d.platform && (
                <div style={{ marginTop: 10 }}>
                  <label className="soft" style={{ fontSize: 13 }}>Stream URL (rtmp:// or rtmps://)</label>
                  <input className="input" value={rtmp} onChange={(e) => setRtmp(e.target.value)} style={{ width: "100%", marginBottom: 8 }} />
                  <label className="soft" style={{ fontSize: 13 }}>Stream key</label>
                  <input className="input" type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={d.has_key ? "Leave empty to keep the saved key" : ""} style={{ width: "100%", marginBottom: 8 }} />
                  <div className="row"><button className="btn small" onClick={() => save(d.platform, true)}>Save</button><button className="btn small ghost" onClick={() => setEditing(null)}>Cancel</button></div>
                </div>
              )}
            </div>
          ))}
        </>
      )}
      {el}
    </Page>
  );
}

// ---- Advertise ------------------------------------------------------------------------------
interface VideoAd { id: number; company_name?: string; status?: string; thumb_path?: string; advertiser_monthly_price?: number; next_billing_date?: string; started_at?: string }
interface AdCash { balance?: number; minimum_deposit?: number; transactions?: { id: number; amount: number; type: string; note?: string; created_at?: string }[] }
export function AdvertisePage() {
  const { user, isLoggedIn } = useSession();
  const [ads, setAds] = useState<VideoAd[] | null>(null);
  const [cash, setCash] = useState<AdCash | null>(null);
  useEffect(() => {
    if (!user) return;
    post<VideoAd[]>("fetchMyVideoAds", { my_user_id: user.id }).then((r) => setAds(r.data ?? [])).catch(() => setAds([]));
    post<unknown>("fetchMyAdCashAccount", { my_user_id: user.id }).then((r) => setCash(r as unknown as AdCash)).catch(() => undefined);
  }, [user]);
  if (!isLoggedIn || !user) return <NeedLogin />;
  return (
    <Page title="Advertise">
      <div className="card pad" style={{ marginBottom: 12 }}>
        <div className="row">
          <div style={{ flex: 1 }}>
            <div className="muted" style={{ fontSize: 12 }}>Ad cash account</div>
            <div style={{ fontWeight: 800, color: "var(--gold)", fontSize: 22 }}>${Number(cash?.balance ?? 0).toFixed(2)}</div>
          </div>
          <button className="btn small" onClick={async () => {
            // Same flow as the app: a 30-minute deposit session whose token opens the Fund page.
            const r = await post<unknown>("startAdCashDepositSession", { my_user_id: user.id }).catch(() => null);
            const url = (r as { url?: string } | null)?.url;
            if (url) window.open(url, "_blank", "noopener"); else window.alert(r?.message ?? "Couldn't open the funding page.");
          }}>Fund account ↗</button>
        </div>
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>Creating a new video ad from the web is coming next. For now, create ads from the app; they show here.</p>
      </div>
      <div className="card">
        <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)" }}><b style={{ color: "var(--gold)" }}>My ads{ads ? ` (${ads.length})` : ""}</b></div>
        {ads === null ? <Loading /> : ads.length === 0 ? <p className="muted" style={{ padding: 14 }}>No ads yet.</p> : ads.map((a) => (
          <div key={a.id} className="row" style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)" }}>
            <div style={{ flex: 1 }}><b>{a.company_name ?? `Ad #${a.id}`}</b><div className="muted" style={{ fontSize: 12 }}>{a.status ?? ""}{a.advertiser_monthly_price ? ` · $${Number(a.advertiser_monthly_price).toFixed(2)}/month` : ""}{a.next_billing_date ? ` · next bill ${String(a.next_billing_date).slice(0, 10)}` : ""}</div></div>
            <span className="pill">{a.status ?? "—"}</span>
          </div>
        ))}
      </div>
    </Page>
  );
}

// ---- Delete account -------------------------------------------------------------------------
export function DeleteAccountPage() {
  const { user, isLoggedIn, signOut } = useSession();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { setToast, el } = useToast();
  if (!isLoggedIn || !user) return <NeedLogin />;
  async function del() {
    if (!user) return;
    if (!window.confirm("Delete your Bingg Bongg account for good? This cannot be undone.")) return;
    setBusy(true);
    try {
      const r = await post("deleteMyAccount", { user_id: user.id });
      if (!r.status) throw new Error(r.message ?? "Couldn't delete the account.");
      signOut(); navigate("/", { replace: true });
    } catch (e) { setToast((e as Error).message); setBusy(false); }
  }
  return (
    <Page title="Delete account">
      <div className="card pad">
        <p className="soft" style={{ marginTop: 0 }}>This permanently deletes your profile, videos, photos, followers and remaining coins. There is no way back.</p>
        <label className="soft" style={{ fontSize: 13 }}>Type <b>DELETE</b> to confirm</label>
        <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} style={{ width: "100%", margin: "6px 0 12px" }} />
        <button className="btn" style={{ borderColor: "var(--red)", color: "var(--red)" }} disabled={typed !== "DELETE" || busy} onClick={del}>Delete my account</button>
      </div>
      {el}
    </Page>
  );
}
