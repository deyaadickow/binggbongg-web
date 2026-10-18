// Settings on the web — one page per row of the phones' Settings screen. The ones wired to
// real endpoints work today; the rest are "coming soon" placeholders so every link exists
// (Steve, 2026-09-24: "add them anyway and work it out one at a time").
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_BASE, currentAuthHeaders, displayName, mediaUrl, post, type UserSummary } from "../lib/api";
import { useSession } from "../lib/session";
import { Avatar, Loading, Notice, UserRow } from "../components/Common";
import { useToast, showGoldAlert } from "../components/GoldToast";
import { SideLinkItem, SiteFooter, sidebarSections } from "../components/Sidebar";
import { fetchMyVirtualBattles, fetchVirtualGiftRecord, sendVirtualThankYou, type VirtualBattleData, type VirtualGiftRecord } from "../lib/battles";
import { VirtualGiftRecordOverlay, personName } from "../components/BattleEngines";
import { GoldSelect } from "../components/GoldSelect";
import { useT, type StringKey } from "../lib/i18n";

const SITE = "https://www.binggbongg.com";


function Page({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="page" style={wide ? undefined : { maxWidth: 720 }}>
      <h1 className="page-title">{title}</h1>
      {children}
    </div>
  );
}

function NeedLogin() {
  const { t, tn } = useT();
  return <div className="page"><Notice>{tn("sign_in_to_open_this_page", <Link to="/login">{t("sign_in")}</Link>)}</Notice></div>;
}

/** The whole Settings list as a page — what phones and narrow screens use instead of the sidebar. */
export function SettingsHubPage() {
  const { t } = useT();
  const { user, isLoggedIn, signOut } = useSession();
  return (
    <Page title={t("settings")}>
      {sidebarSections(user?.id ?? null).map((sec, i) => (
        <div key={i} className="card" style={{ marginBottom: 12, overflow: "hidden" }}>
          {sec.title && <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)" }}><b style={{ color: "var(--gold)" }}>{sec.title}</b></div>}
          {sec.links.filter((l) => !l.needsLogin || isLoggedIn).map((l) => <SideLinkItem key={l.label} link={l} onSignOut={signOut} big />)}
        </div>
      ))}
      {/* The sidebar that normally carries this is hidden under 900px, and a phone is how most
          people see the site — so who operates it has to be reachable here too. */}
      <SiteFooter />
    </Page>
  );
}

export function ComingSoonPage({ titleKey, noteKey }: { titleKey: StringKey; noteKey: StringKey }) {
  // Keys, not text: this is rendered from App, which is where the LanguageProvider itself lives,
  // so a t() called up there would read the context from above the provider and always answer in
  // English. Translating here keeps it under the provider.
  const { t } = useT();
  return (
    <Page title={t(titleKey)}>
      <div className="card pad">
        <p className="soft" style={{ marginTop: 0 }}>{t(noteKey)}</p>
        <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>{t("this_page_is_on_the_way_for_the_web_it_a")}</p>
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
  const { t } = useT();
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
    <Page title={t("account_settings")}>
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
            <label className="soft" style={{ fontSize: 13 }}>{t("name")}</label>
            <input className="input" value={fullname} onChange={(e) => setFullname(e.target.value)} maxLength={60} style={{ width: "100%", marginBottom: 10 }} />
            <label className="soft" style={{ fontSize: 13 }}>{t("bio")}</label>
            <textarea className="input" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={200} rows={3} style={{ width: "100%", marginBottom: 10 }} />
            <button className="btn" disabled={busy} onClick={() => save({ fullname, bio })}>{t("save_profile")}</button>
          </div>
        </>
      )}
      {el}
    </Page>
  );
}

// ---- Share profile + QR --------------------------------------------------------------------
export function ShareProfilePage() {
  const { t } = useT();
  const { user, isLoggedIn } = useSession();
  const { setToast, el } = useToast();
  if (!isLoggedIn || !user) return <NeedLogin />;
  const link = `${SITE}/profile/${user.id}`;
  const copy = () => navigator.clipboard.writeText(link).then(() => setToast("Link copied.")).catch(() => setToast("Couldn't copy — select the link and copy it."));
  return (
    <Page title={t("share_profile")}>
      <div className="card pad">
        <div className="row" style={{ marginBottom: 12 }}><Avatar user={user} size="lg" /><div><div style={{ fontWeight: 800 }}>{displayName(user)}</div><div className="muted">@{user.username}</div></div></div>
        <input className="input" readOnly value={link} style={{ width: "100%", marginBottom: 10 }} onFocus={(e) => e.target.select()} />
        <div className="row">
          <button className="btn" onClick={copy}>{t("copy_link")}</button>
          {typeof navigator.share === "function" && <button className="btn ghost" onClick={() => navigator.share({ title: displayName(user), url: link }).catch(() => undefined)}>{t("share")}</button>}
        </div>
      </div>
      {el}
    </Page>
  );
}

export function QrCodePage() {
  const { t } = useT();
  const { user, isLoggedIn } = useSession();
  if (!isLoggedIn || !user) return <NeedLogin />;
  const link = `${SITE}/profile/${user.id}`;
  // Public profile link only — rendered by a QR image service until a local generator lands.
  const img = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&color=F0C420&bgcolor=000000&data=${encodeURIComponent(link)}`;
  return (
    <Page title={t("my_qr_code")}>
      <div className="card pad" style={{ display: "grid", placeItems: "center", gap: 10 }}>
        <img src={img} alt={t("qr_code_for_your_profile")} width={240} height={240} style={{ border: "1.5px solid var(--gold-border)", borderRadius: 12 }} />
        <div style={{ fontWeight: 800 }}>{displayName(user)}</div>
        <div className="muted" style={{ fontSize: 13 }}>{t("scan_to_open_your_profile_on_bingg_bongg")}</div>
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
  const { t, tn } = useT();
  const { user, isLoggedIn } = useSession();
  const [list, setList] = useState<Referral[] | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const { setToast, el } = useToast();
  const load = useCallback(() => {
    if (!user) return;
    post<Referral[]>("fetchMyReferrals", { user_id: user.id, start: 0, count: 100 }).then((r) => setList(r.data ?? [])).catch(() => setList([]));
    // The member's own referral code (refer_code, e.g. STEVED123456) — the one an advertiser types
    // into "Referral Code (optional)" while uploading a video ad.
    post<{ refer_code?: string }>("fetchMyUserDetails", { my_user_id: user.id }).then((r) => setCode(r.data?.refer_code ?? null)).catch(() => undefined);
  }, [user]);
  useEffect(load, [load]);
  if (!isLoggedIn || !user) return <NeedLogin />;
  return (
    <Page title={t("referrals")}>
      <div className="card pad" style={{ marginBottom: 12 }}>
        <div className="muted" style={{ fontSize: 13 }}>{t("your_referral_code_anyone_who_signs_up_w")}</div>
        <div className="row" style={{ marginTop: 8, flexWrap: "wrap" }}>
          <span className="pill" style={{ fontSize: 15 }}>{code ?? "…"}</span>
          <button className="btn small ghost" disabled={!code} onClick={() => navigator.clipboard.writeText(code ?? "").then(() => setToast("Copied.")).catch(() => undefined)}>{t("copy")}</button>
          <span className="muted" style={{ fontSize: 12 }}>{tn("your_username_works_for_signups", <b>@{user.username}</b>)}</span>
        </div>
      </div>
      <div className="card pad" style={{ marginBottom: 12 }}>
        <b style={{ color: "var(--gold)" }}>{t("what_referrals_earn_you")}</b>
        <ul className="soft" style={{ fontSize: 14, margin: "8px 0 0", paddingLeft: 18 }}>
          <li>{tn("referral_perk_simulcast", <b>{t("simulcast_for_free")}</b>, <Link to="/settings/simulcast">{t("see_your_simulcast_status")}</Link>)}</li>
          <li>{tn("referral_perk_video_ad", <b>{t("video_ad_commission")}</b>)}</li>
          <li>{tn("referral_perk_share_and_earn", <b>{t("share_earn_10")}</b>)}</li>
        </ul>
      </div>
      <div className="card">
        <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)" }}><b style={{ color: "var(--gold)" }}>{list ? t("people_you_referred_count", list.length) : t("people_you_referred")}</b></div>
        {list === null ? <Loading /> : list.length === 0 ? <p className="muted" style={{ padding: 14 }}>{t("nobody_yet")}</p> : list.map((r) => r.user ? <UserRow key={r.id} user={r.user} /> : null)}
      </div>
      {el}
    </Page>
  );
}

// ---- Blocked profiles -----------------------------------------------------------------------
export function BlockedProfilesPage() {
  const { t } = useT();
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
    <Page title={t("blocked_profiles")}>
      <div className="card">
        {list === null ? <Loading /> : list.length === 0 ? <p className="muted" style={{ padding: 14 }}>{t("you_haven_t_blocked_anyone")}</p>
          : list.map((u) => <UserRow key={u.id} user={u} trailing={<button className="btn small ghost" onClick={() => unblock(u.id)}>{t("unblock")}</button>} />)}
      </div>
      {el}
    </Page>
  );
}

// ---- My Moderators --------------------------------------------------------------------------
interface ModRow { id: number; moderator_user_id: number; moderator?: UserSummary }
export function ModeratorsPage() {
  const { t } = useT();
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
    <Page title={t("my_moderators")}>
      <p className="muted" style={{ fontSize: 13 }}>{t("moderators_can_pause_chat_and_keep_your")}</p>
      <div className="card pad" style={{ marginBottom: 12 }}>
        <input className="input" placeholder={t("search_a_member_to_add")} value={q} onChange={(e) => setQ(e.target.value)} style={{ width: "100%" }} />
        {results.map((u) => <UserRow key={u.id} user={u} trailing={<button className="btn small" onClick={() => change("addPersonalModerator", u.id)}>{t("add")}</button>} />)}
      </div>
      <div className="card">
        <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)" }}><b style={{ color: "var(--gold)" }}>{list ? t("your_moderators_count", list.length) : t("your_moderators")}</b></div>
        {list === null ? <Loading /> : list.length === 0 ? <p className="muted" style={{ padding: 14 }}>{t("no_moderators_yet")}</p>
          : list.map((m) => m.moderator ? <UserRow key={m.id} user={m.moderator} trailing={<button className="btn small ghost" onClick={() => change("removePersonalModerator", m.moderator_user_id)}>{t("remove")}</button>} /> : null)}
      </div>
      {el}
    </Page>
  );
}

// ---- Simulcast ------------------------------------------------------------------------------
interface SimDest { platform: string; label: string; guaranteed: boolean; note?: string; default_rtmp_url?: string; rtmp_url?: string; has_key: boolean; is_enabled: boolean }
interface SimOverview { enabled: boolean; show_platform_tiles?: boolean; free_year_referrals?: number; lifetime_referrals?: number; daily_price: number; monthly_price: number; status: string; is_entitled: boolean; paid_until?: string | null; cash_wallet: number; referrals_this_month: number; referrals_needed_for_free_month: number; next_month_free: boolean; destinations: SimDest[] }
export function SimulcastPage() {
  const { t } = useT();
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
  // Steve, 2026-09-26: "one video tile for each platform on Simulcast ... make this an option".
  // The tiles themselves show in the phone apps' live room (the web doesn't simulcast yet).
  async function toggleTiles(on: boolean) {
    try {
      const r = await post("saveSimulcastOptions", { user_id: user?.id, show_platform_tiles: on ? 1 : 0 });
      if (!r.status) throw new Error(r.message ?? "Couldn't save.");
      load();
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
    <Page title={t("simulcast")}>
      <p className="muted" style={{ fontSize: 13 }}>{t("go_live_once_on_bingg_bongg_and_be_live")}</p>
      {!ov ? <Loading /> : (
        <>
          {/* Steve, 2026-09-24: "Bingg Bongg should be on top of the list … once you connect with
              Bingg Bongg we will be able to connect you to all these social media platforms at the
              same time." */}
          <div className="card pad" style={{ marginBottom: 10, borderWidth: 2 }}>
            <div className="row">
              <div style={{ flex: 1 }}>
                <b style={{ color: "var(--gold)", fontSize: 17 }}>{t("simulcast_bingg_bongg_live")}</b>
                <div className="soft" style={{ fontSize: 13 }}>{t("simulcast_bingg_bongg_note")}</div>
              </div>
              <span className="pill live">{t("simulcast_connected")}</span>
            </div>
          </div>
          <div className="card pad" style={{ marginBottom: 12 }}>
            <div className="row" style={{ flexWrap: "wrap", gap: 16 }}>
              <div><div className="muted" style={{ fontSize: 12 }}>{t("status")}</div><div style={{ fontWeight: 800, color: "var(--gold)" }}>{ov.is_entitled ? "Active" : ov.status}</div></div>
              <div><div className="muted" style={{ fontSize: 12 }}>{t("price")}</div><div style={{ fontWeight: 800 }}>{t("price_per_day_and_month", Number(ov.daily_price).toFixed(2), Number(ov.monthly_price).toFixed(2))}</div></div>
              {ov.paid_until && <div><div className="muted" style={{ fontSize: 12 }}>{t("paid_until")}</div><div style={{ fontWeight: 800 }}>{String(ov.paid_until).slice(0, 10)}</div></div>}
              <div><div className="muted" style={{ fontSize: 12 }}>{t("referrals_this_month")}</div><div style={{ fontWeight: 800 }}>{ov.referrals_this_month} / {ov.referrals_needed_for_free_month}{ov.next_month_free ? " · next month free!" : ""}</div></div>
              <label className="row" style={{ gap: 8, cursor: "pointer", width: "100%" }}>
                <input type="checkbox" checked={ov.show_platform_tiles ?? true} onChange={(e) => toggleTiles(e.target.checked)} />
                <span style={{ fontSize: 13 }}>{t("show_a_tile_for_each_platform_while_i_m")}</span>
              </label>
            </div>
            <div className="soft" style={{ fontSize: 13, marginTop: 10 }}>
              {t("every_n_referrals_free_month", ov.referrals_needed_for_free_month)}
              {ov.free_year_referrals ? ` ${t("n_lifetime_referrals_free_year", ov.free_year_referrals)}` : ""}
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
                {d.has_key && <button className="btn small ghost" style={{ color: "var(--red)", borderColor: "var(--red)" }} onClick={() => remove(d.platform)}>{t("remove")}</button>}
              </div>
              {editing === d.platform && (
                <div style={{ marginTop: 10 }}>
                  <label className="soft" style={{ fontSize: 13 }}>{t("stream_url_rtmp_or_rtmps")}</label>
                  <input className="input" value={rtmp} onChange={(e) => setRtmp(e.target.value)} style={{ width: "100%", marginBottom: 8 }} />
                  <label className="soft" style={{ fontSize: 13 }}>{t("simulcast_key_hint")}</label>
                  <input className="input" type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={d.has_key ? "Leave empty to keep the saved key" : ""} style={{ width: "100%", marginBottom: 8 }} />
                  <div className="row"><button className="btn small" onClick={() => save(d.platform, true)}>{t("save_address")}</button><button className="btn small ghost" onClick={() => setEditing(null)}>{t("cancel")}</button></div>
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
interface VideoAdStats { summary_text?: string; total_views?: number; period_views?: number; days_left?: number; spend_so_far?: number; cost_per_view?: number; period_clicks?: number; cost_per_click?: number; click_rate?: number; last_period_views?: number; last_period_clicks?: number; last_period_spend?: number; last_period_cost_per_view?: number }
interface VideoAd { id: number; company_name?: string; status?: string; thumb_path?: string; advertiser_monthly_price?: number; next_billing_date?: string; started_at?: string; stats?: VideoAdStats }

interface AdCash { balance?: number; minimum_deposit?: number; ad_credit_balance?: number; ad_credit_expires_at?: string | null; advertising_spendable?: number; transactions?: { id: number; amount: number; type: string; note?: string; created_at?: string }[] }
/** Money with thousands separators. A partner credit runs to six figures, and "$100000.00" is
 *  genuinely hard to read at a glance. */
const usd = (n: number) => `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "2027-09-30" -> "30 September 2027", built in LOCAL time.
 *  new Date("2027-09-30") parses as UTC midnight, so anywhere west of Greenwich it renders as the
 *  29th — which is exactly what the first version of this did. Splitting the parts avoids the
 *  shift entirely. Falls back to the raw string rather than dropping the date. */
function longDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

export function AdvertisePage() {
  const { t } = useT();
  const { user, isLoggedIn } = useSession();
  const [ads, setAds] = useState<VideoAd[] | null>(null);
  const [cash, setCash] = useState<AdCash | null>(null);
  useEffect(() => {
    if (!user) return;
    post<VideoAd[]>("fetchMyVideoAds", { my_user_id: user.id }).then((r) => setAds(r.data ?? [])).catch(() => setAds([]));
    // .data, not the envelope — this cast used to be `r as unknown as AdCash`, which put the
    // whole {status, data} object into `cash`, so `cash.balance` was always undefined and the
    // card showed $0.00 no matter how much the member had deposited.
    post<AdCash>("fetchMyAdCashAccount", { my_user_id: user.id }).then((r) => setCash(r.data ?? {})).catch(() => undefined);
  }, [user]);
  if (!isLoggedIn || !user) return <NeedLogin />;
  return (
    <Page title={t("advertise")}>
      {/* Steve, 2026-09-30: "The same that you did for ios and android do it for the [web]" — both
          apps' Advertise pages are now a centred balance card (big gold amount, its label under
          it, no "Ad" in the wording) with the funding action as a gold-ringed capsule BELOW the
          card rather than a small button tucked inside it. Matched here. */}
      <div className="card pad center" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 800, color: "var(--gold)", fontSize: 30, lineHeight: 1.1 }}>{usd(cash?.balance ?? 0)}</div>
        <div style={{ color: "var(--gold)", fontSize: 13, marginTop: 2 }}>{t("ad_cash_account_balance")}</div>
        {/* Steve, 2026-09-30: admin-granted advertising credit is a SEPARATE balance that can only
            buy video ads — never a Shop listing or Photos storage — and it can expire. Shown as its
            own line rather than added into the figure above, because merging them would tell a
            partner they have money they can't actually spend on everything. */}
        {Number(cash?.ad_credit_balance ?? 0) > 0 && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--gold-border)" }}>
            <div style={{ fontWeight: 800, color: "var(--gold-bright)", fontSize: 22, lineHeight: 1.1 }}>
              + {usd(cash?.ad_credit_balance ?? 0)}
            </div>
            <div style={{ color: "var(--gold)", fontSize: 13, marginTop: 2 }}>{t("advertising_credit")}</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              {t("for_video_ads_only")}
              {cash?.ad_credit_expires_at ? t("expires_on_suffix", longDate(cash.ad_credit_expires_at)) : ""}
            </div>
          </div>
        )}
      </div>
      <div className="center" style={{ marginBottom: 12 }}>
        <button className="btn" onClick={async () => {
          // Same flow as the app: a 30-minute deposit session whose token opens the Fund page.
          const r = await post<unknown>("startAdCashDepositSession", { my_user_id: user.id }).catch(() => null);
          const url = (r as { url?: string } | null)?.url;
          if (url) window.open(url, "_blank", "noopener"); else showGoldAlert(r?.message ?? "Couldn't open the funding page.");
        }}>{t("add_money_to_your_cash_account")}</button>
        {/* The apps pair that capsule with a "+ Create Ad" one — Steve, 2026-09-30: "Build it the
            same way it works on ios". Same flow now lives at /settings/advertise/new. */}
        <div style={{ marginTop: 10 }}><Link className="btn" to="/settings/advertise/new">{t("create_ad")}</Link></div>
      </div>
      <div className="card">
        <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)" }}><b style={{ color: "var(--gold)" }}>{ads ? t("my_ads_count", ads.length) : t("my_ads")}</b></div>
        {ads === null ? <Loading /> : ads.length === 0 ? <p className="muted" style={{ padding: 14 }}>{t("no_ads_yet")}</p> : ads.map((a) => (
          <div key={a.id} className="row" style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)" }}>
            <div style={{ flex: 1 }}><b>{a.company_name ?? `Ad #${a.id}`}</b><div className="muted" style={{ fontSize: 12 }}>{a.status ?? ""}{a.advertiser_monthly_price ? ` · $${Number(a.advertiser_monthly_price).toFixed(2)}/month` : ""}{a.next_billing_date ? ` · next bill ${String(a.next_billing_date).slice(0, 10)}` : ""}</div></div>
            {a.stats?.summary_text && (
              /* Steve, 2026-10-04 set the exact wording; the server writes the whole block so
                 the website and both apps read identically. */
              <div style={{ minWidth: 260, marginRight: 10, whiteSpace: "pre-line", fontSize: 13 }}>
                {a.stats.summary_text}
              </div>
            )}
            <span className="pill">{a.status ?? "—"}</span>
          </div>
        ))}
      </div>
    </Page>
  );
}

// ---- Find a Battle --------------------------------------------------------------------------
interface BattleUser { id: number; fullname?: string; username?: string; profile_image?: string | null; country?: string; presence: "live" | "active"; team_label?: string | null }
interface BattleSearchResult { status: boolean; active?: boolean; eligible?: boolean; country?: string | null; country_flag?: string; my_country?: string | null; data?: BattleUser[] }
interface CountryRow { country: string; flag: string; count: number; is_mine: boolean }

export function FindABattlePage() {
  const { t, tn } = useT();
  const { user, isLoggedIn } = useSession();
  const [tab, setTab] = useState<"country" | "global">("country");
  const [countries, setCountries] = useState<CountryRow[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [result, setResult] = useState<BattleSearchResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    post<CountryRow[]>("fetchBattleSearchCountries", { user_id: user.id }).then((r) => {
      const list = r.data ?? [];
      setCountries(list);
      const mine = list.find((c) => c.is_mine);
      if (mine) setSelectedCountry(mine.country);
    }).catch(() => undefined);
  }, [user]);

  const fetchList = useCallback(async (scope: "country" | "global", country?: string) => {
    if (!user) return;
    setLoading(true);
    try {
      const params: Record<string, unknown> = { user_id: user.id, scope };
      if (scope === "country" && country) params.country = country;
      const r = await post<BattleSearchResult>("fetchBattleSearchList", params);
      setResult(r.status ? (r.data ?? null) as unknown as BattleSearchResult : null);
    } catch { setResult(null); } finally { setLoading(false); }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (tab === "country" && selectedCountry) fetchList("country", selectedCountry);
    else if (tab === "global") fetchList("global");
  }, [tab, selectedCountry, user, fetchList]);

  if (!isLoggedIn || !user) return <NeedLogin />;

  const users = (result as unknown as { data?: BattleUser[] } | null)?.data ?? [];

  return (
    <Page title={t("find_a_battle")}>
      <p className="muted" style={{ fontSize: 13 }}>{tn("find_a_battle_explainer", <a href="/settings/account" style={{ color: "var(--gold)" }}>{t("account_settings")}</a>)}</p>
      <div className="row" style={{ gap: 8, marginBottom: 12 }}>
        {(["country", "global"] as const).map((t) => (
          <button key={t} className={`btn small${tab === t ? "" : " ghost"}`} onClick={() => setTab(t)}>{t === "country" ? "By Country" : "Global"}</button>
        ))}
      </div>
      {tab === "country" && (
        <div className="card pad" style={{ marginBottom: 10 }}>
          <GoldSelect
            ariaLabel={t("battle_tab_country")}
            placeholder={t("battle_tab_country")}
            searchable
            value={selectedCountry ?? ""}
            options={countries.map((c) => ({ value: c.country, label: `${c.flag} ${c.country} (${c.count})` }))}
            onChange={setSelectedCountry}
          />
        </div>
      )}
      <div className="card">
        {loading ? <Loading /> : users.length === 0
          ? <p className="muted" style={{ padding: 14 }}>{t("nobody_here_right_now_check_back_in_a_fe")}</p>
          : users.map((u) => (
            <a key={u.id} href={`/profile/${u.id}`} className="row" style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)", textDecoration: "none", color: "inherit" }}>
              <Avatar user={{ ...u, profile_image: u.profile_image ?? undefined }} size="lg" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.fullname ?? u.username ?? `User ${u.id}`}</div>
                <div className="muted" style={{ fontSize: 12 }}>@{u.username}{u.country ? ` · ${u.country}` : ""}</div>
              </div>
              <span className={`pill${u.presence === "live" ? " live" : ""}`}>{u.presence === "live" ? "● LIVE" : "Active"}</span>
            </a>
          ))}
      </div>
    </Page>
  );
}

// ---- Contest pending requests ---------------------------------------------------------------
interface ContestInvite { id: number; talent_contest_id?: number; talent_contest?: { name?: string; description?: string }; invited_by?: { fullname?: string; username?: string; profile_image?: string } | null; created_at?: string }

export function ContestRequestsPage() {
  const { t } = useT();
  const { user, isLoggedIn } = useSession();
  const [list, setList] = useState<ContestInvite[] | null>(null);
  const { setToast, el } = useToast();
  const load = useCallback(() => {
    if (!user) return;
    post<ContestInvite[]>("fetchUserInvitesToUserCreatedTalentContests", { user_id: user.id, start: 0, count: 50 }).then((r) => setList(r.data ?? [])).catch(() => setList([]));
  }, [user]);
  useEffect(load, [load]);
  if (!isLoggedIn || !user) return <NeedLogin />;
  async function reject(inviteId: number) {
    if (!user) return;
    try {
      const r = await post("rejectTalentContestInvite", { user_id: user.id, invite_id: inviteId });
      if (!r.status) throw new Error(r.message ?? "Couldn't reject invite.");
      setToast("Invite removed."); load();
    } catch (e) { setToast((e as Error).message); }
  }
  return (
    <Page title={t("contest_pending_requests")}>
      <p className="muted" style={{ fontSize: 13 }}>{t("invitations_to_talent_contests_that_are")}</p>
      <div className="card">
        {list === null ? <Loading /> : list.length === 0
          ? <p className="muted" style={{ padding: 14 }}>{t("no_pending_invites")}</p>
          : list.map((inv) => (
            <div key={inv.id} className="row" style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)", flexWrap: "wrap", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{inv.talent_contest?.name ?? `Contest #${inv.talent_contest_id}`}</div>
                {inv.talent_contest?.description && <div className="muted" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inv.talent_contest.description}</div>}
                {inv.invited_by && <div className="muted" style={{ fontSize: 12 }}>{t("invited_by", inv.invited_by.fullname ?? `@${inv.invited_by.username}`)}</div>}
              </div>
              <button className="btn small ghost" style={{ color: "var(--red)", borderColor: "var(--red)" }} onClick={() => reject(inv.id)}>{t("remove")}</button>
            </div>
          ))}
      </div>
      {el}
    </Page>
  );
}

// ---- Support --------------------------------------------------------------------------------
// Support (Steve, 2026-09-26: "Bingg Bongg Assistant" — Claude answers members instantly, in
// their language; money / account / safety topics are handed to a person). The reply comes back
// on the send call itself (data.reply) and on getUserSupport for the latest message.
interface SupportReply { id: number; reply?: string | null; replied_by?: string | null; needs_human?: boolean }
/** "Reason For This Support" (Steve, 2026-10-17) — the list is the server's, so he can add a
 *  reason from the admin panel without a release on any platform. */
interface SupportReasonRow { id: number; label: string }
export function SupportPage() {
  const { t, tn } = useT();
  const [msg, setMsg] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reply, setReply] = useState<SupportReply | null>(null);
  const [askedForPerson, setAskedForPerson] = useState(false);
  const [reasons, setReasons] = useState<SupportReasonRow[]>([]);
  const [reason, setReason] = useState("");
  const { user } = useSession();

  // The dropdown only appears once the list arrives, so a backend without the endpoint yet
  // leaves the page exactly as it was rather than showing an empty box.
  useEffect(() => {
    let live = true;
    post<SupportReasonRow[]>("fetchSupportReasons", {})
      .then((r) => {
        if (!live) return;
        const list = r.data ?? [];
        setReasons(list);
        // Arrived from somewhere that knows what this is about — the CvC page's "Suggest a
        // country battle", for one. The reason is matched against the live list rather than
        // trusted, so a label that has since been renamed or removed simply does not preselect.
        const wanted = new URLSearchParams(window.location.search).get("reason");
        if (wanted) {
          const hit = list.find((x) => x.label.toLowerCase() === wanted.toLowerCase());
          if (hit) setReason(hit.label);
        }
      })
      .catch(() => undefined);
    return () => { live = false; };
  }, []);

  // Steve, 2026-09-27: the page opens fresh every time — the answer card only shows right after
  // sending; every earlier question and answer lives in Archive (no getUserSupport on load).

  async function send() {
    if (!msg.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await post<SupportReply>("sendSupportMessage", { message: msg.trim(), reason, user_id: user?.id ?? 0 });
      if (r.data?.reply) { setReply(r.data); setAskedForPerson(false); }
      setSent(true);
    } catch {
      setError("Failed to send message. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function askForPerson() {
    if (!reply || !user) return;
    setAskedForPerson(true);
    await post("supportAssistantFeedback", { message_id: reply.id, user_id: user.id }).catch(() => undefined);
  }

  const byAssistant = reply?.replied_by === "assistant";
  const replyCard = reply?.reply ? (
    <div className="card pad" style={{ marginBottom: 12, borderColor: "var(--gold-border)" }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: "var(--gold)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
        {byAssistant ? "💝 Bingg Bongg Assistant" : "Admin support replied"}
      </div>
      <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{reply.reply}</p>
      {byAssistant && (
        <div style={{ marginTop: 10 }}>
          {reply.needs_human || askedForPerson ? (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>{t("a_bingg_bongg_team_member_will_get_back")}</p>
          ) : (
            <button className="btn small" onClick={askForPerson} style={{ background: "transparent", color: "var(--gold)" }}>
              {t("this_didn_t_help_talk_to_a_person")}</button>
          )}
        </div>
      )}
    </div>
  ) : null;

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      {/* Steve, 2026-09-26: "on top next to support text on the right side add the text 'Archive'
          ... when they click on Archive they will see all the old messages and their answers." */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h1 className="page-title">{t("support")}</h1>
        <Link to="/settings/support/archive" className="btn small" style={{ background: "transparent", color: "var(--gold)", borderColor: "var(--gold-border)" }}>{t("archive")}</Link>
      </div>
      {sent && replyCard}
      {sent ? (
        <div className="card pad">
          <p className="soft" style={{ margin: 0 }}>
            {reply?.reply ? "Message sent. Ask another question any time." : "Message sent. The Bingg Bongg team will get back to you."}
          </p>
          <button className="btn small" onClick={() => { setSent(false); setMsg(""); }} style={{ marginTop: 10, background: "transparent", color: "var(--gold)" }}>{t("send_another_message")}</button>
        </div>
      ) : (
        <div className="card pad">
          {/* Steve, 2026-10-17: black plate, white border, gold text, centred — the dimmed
              grey was hard to read. */}
          <p style={{ marginTop: 0, marginBottom: 12, fontSize: 13, textAlign: "center", color: "var(--gold)", background: "#000", border: "1.5px solid #fff", borderRadius: 12, padding: 12 }}>
            {tn("support_intro", <Link to="/settings/support/archive" style={{ color: "var(--gold)", textDecoration: "underline" }}>{t("archive")}</Link>)}
          </p>
          {/* Steve, 2026-10-17: "In between the boxes add another drop-down box that says
              'Reason For This Support'." */}
          {reasons.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <GoldSelect
                value={reason}
                options={reasons.map((r) => ({ value: r.label, label: r.label }))}
                onChange={setReason}
                placeholder={t("reason_for_this_support")}
                ariaLabel={t("reason_for_this_support")}
              />
            </div>
          )}
          <textarea className="input" rows={5} placeholder={t("describe_your_issue")} value={msg} onChange={(e) => setMsg(e.target.value)} style={{ width: "100%", marginBottom: 10 }} />
          {error && <p style={{ color: "#f55", fontSize: 13, marginBottom: 8 }}>{error}</p>}
          <button className="btn" onClick={send} disabled={busy || !msg.trim()} style={{ background: "var(--gold-border)", color: "#000", borderColor: "var(--gold-border)" }}>
            {busy ? "Sending…" : "Send message"}
          </button>
        </div>
      )}
    </div>
  );
}

// Support → Archive (Steve, 2026-09-26): every message the member sent, newest first, with the
// answer it got (assistant or team) or "waiting for a reply".
interface SupportHistoryRow extends SupportReply { message?: string; replied_at?: string | null; created_at?: string }
function prettyDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}
export function SupportArchivePage() {
  const { t } = useT();
  const { user } = useSession();
  const [rows, setRows] = useState<SupportHistoryRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!user) return;
    post<SupportHistoryRow[]>("getUserSupportHistory", { user_id: user.id })
      .then((r) => setRows(r.status ? (r.data ?? []) : []))
      .catch(() => setFailed(true));
  }, [user]);

  if (!user) return <NeedLogin />;
  return (
    <Page title={t("support_archive")}>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>{t("every_message_you_sent_to_support_and_th")}</p>
      {failed && <Notice>{t("couldn_t_load_your_archive_please_try_ag")}</Notice>}
      {!failed && rows === null && <Loading />}
      {rows && rows.length === 0 && <p className="soft">{t("no_messages_yet_anything_you_send_to_sup")}</p>}
      {rows?.map((row) => {
        const byAssistant = row.replied_by === "assistant";
        return (
          <div key={row.id} className="card pad" style={{ marginBottom: 12, borderColor: "var(--gold-border)" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "var(--gold)", marginBottom: 4 }}>{t("you_and_date", prettyDate(row.created_at))}</div>
            <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{row.message}</p>
            <div style={{ height: 1, background: "var(--gold-border)", opacity: 0.35, margin: "10px 0" }} />
            {row.reply ? (
              <>
                <div style={{ fontSize: 12, fontWeight: 800, color: "var(--gold)", marginBottom: 4 }}>
                  {byAssistant ? "Bingg Bongg Assistant" : "Bingg Bongg Support"}{row.replied_at ? ` · ${prettyDate(row.replied_at)}` : ""}
                </div>
                <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{row.reply}</p>
                {byAssistant && row.needs_human && <p className="muted" style={{ margin: "8px 0 0", fontSize: 13 }}>{t("a_bingg_bongg_team_member_will_follow_up")}</p>}
              </>
            ) : (
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>{t("waiting_for_a_reply_from_the_bingg_bongg")}</p>
            )}
          </div>
        );
      })}
    </Page>
  );
}

// ---- Legal pages (Terms of Use, Privacy Policy) ---------------------------------------------
// Content comes from the admin panel, so an edit there shows here immediately with no web
// deploy. Same single source the phone apps read.
function LegalPage({ title, endpoint }: { title: string; endpoint: string }) {
  const { t } = useT();
  const [html, setHtml] = useState<string | null>(null);
  const [updated, setUpdated] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    setFailed(false);
    (async () => {
      try {
        const res = await post<{ content?: string; updated_at?: string }>(endpoint);
        if (cancelled) return;
        setHtml(res.data?.content ?? "");
        setUpdated(res.data?.updated_at ?? "");
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [endpoint]);

  return (
    <Page title={title}>
      <div className="card pad">
        {failed ? (
          <p className="muted" style={{ margin: 0 }}>{t("could_not_load_the_page", title)}</p>
        ) : html === null ? (
          <p className="muted" style={{ margin: 0 }}>{t("imagePickerLoading")}</p>
        ) : html.trim() === "" ? (
          <p className="muted" style={{ margin: 0 }}>{t("page_not_published_yet", title)}</p>
        ) : (
          <>
            {updated && (
              <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
                {t("last_updated", new Date(updated).toLocaleDateString())}
              </p>
            )}
            <div className="terms-content" dangerouslySetInnerHTML={{ __html: html }} />
          </>
        )}
      </div>
    </Page>
  );
}

export function TermsOfUsePage() {
  const { t } = useT();
  return <LegalPage title={t("terms_of_use")} endpoint="fetchTermsOfUse" />;
}

export function PrivacyPolicyPage() {
  const { t } = useT();
  return <LegalPage title={t("privacy_policy")} endpoint="fetchPrivacyPolicy" />;
}

export function ContactUsPage() {
  const { t } = useT();
  return <LegalPage title={t("contact_us")} endpoint="fetchContactUs" />;
}

export function AboutUsPage() {
  const { t } = useT();
  return <LegalPage title={t("about_us")} endpoint="fetchAboutUs" />;
}

export function FaqPage() {
  const { t } = useT();
  return <LegalPage title={t("faq")} endpoint="fetchFaq" />;
}

/** Steve, 2026-09-30: "Create a link in setting called 'App Features Explainer' — And we should
 *  explain every feature that we offer and how it works exactly." Admin-editable like the pages
 *  above, so it keeps up with the features with no redeploy. */
export function AppFeaturesPage() {
  const { t } = useT();
  return <LegalPage title={t("app_features_explainer")} endpoint="fetchAppFeatures" />;
}

// ---- Delete account -------------------------------------------------------------------------
export function DeleteAccountPage() {
  const { t, tn } = useT();
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
    <Page title={t("delete_account")}>
      <div className="card pad">
        <p className="soft" style={{ marginTop: 0 }}>{t("this_permanently_deletes_your_profile_vi")}</p>
        <label className="soft" style={{ fontSize: 13 }}>{tn("type_word_to_confirm", <b>{t("delete_confirm_word")}</b>)}</label>
        <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} style={{ width: "100%", margin: "6px 0 12px" }} />
        <button className="btn" style={{ borderColor: "var(--red)", color: "var(--red)" }} disabled={typed !== t("delete_confirm_word") || busy} onClick={del}>{t("delete_my_account")}</button>
      </div>
      {el}
    </Page>
  );
}


// ---- My Virtual Battle Look (Steve, 2026-09-27) -------------------------------------------
// The photo or short looping video shown on my card when a host puts me in a Virtual Battle and
// I'm not live. Profile photo is used until one is uploaded.
interface VirtualLook { virtual_media_url?: string | null; virtual_media_type?: string | null }
export function VirtualLookPage() {
  const { t } = useT();
  const { user, refresh } = useSession();
  const [look, setLook] = useState<VirtualLook>({ virtual_media_url: (user as (UserSummary & VirtualLook) | null)?.virtual_media_url, virtual_media_type: (user as (UserSummary & VirtualLook) | null)?.virtual_media_type });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  if (!user) return <NeedLogin />;

  async function upload(file: File) {
    if (file.type.startsWith("video/") && file.size > 60 * 1024 * 1024) { setNote("Videos must be under 60 MB — a short looping clip works best."); return; }
    setBusy(true); setNote("Uploading…");
    try {
      const form = new FormData();
      form.append("my_user_id", String(user!.id));
      form.append("media", file);
      const res = await fetch(API_BASE + "saveVirtualBattleLook", { method: "POST", headers: currentAuthHeaders(), body: form });
      const body = await res.json() as { status?: boolean; message?: string; data?: VirtualLook };
      if (!body.status) throw new Error(body.message ?? "Couldn't upload that.");
      setLook(body.data ?? {});
      setNote("Saved — this is your virtual battle look.");
      refresh();
    } catch (e) { setNote((e as Error).message); } finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true);
    try {
      const res = await post("removeVirtualBattleLook", { my_user_id: user!.id });
      if (!res.status) throw new Error(res.message ?? "Couldn't do that right now.");
      setLook({}); setNote("Removed — your profile photo will be used."); refresh();
    } catch (e) { setNote((e as Error).message); } finally { setBusy(false); }
  }
  const url = look.virtual_media_url || "";
  return (
    <Page title={t("my_virtual_battle_look")}>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>{t("when_a_host_puts_you_in_a_virtual_battle")}</p>
      <div className="card pad" style={{ display: "grid", gap: 12, justifyItems: "center", borderColor: "var(--gold-border)" }}>
        {url && look.virtual_media_type === "video"
          ? <video src={url} muted loop autoPlay playsInline style={{ width: 220, height: 220, objectFit: "cover", borderRadius: 14, border: "2px solid var(--gold-border)" }} />
          : <img src={url || mediaUrl(user.profile_image)} alt="" style={{ width: 220, height: 220, objectFit: "cover", borderRadius: 14, border: "2px solid var(--gold-border)", background: "#000" }} />}
        <div style={{ color: "var(--gold)", fontWeight: 800, fontSize: 13 }}>{note || (url ? (look.virtual_media_type === "video" ? "Your looping video" : "Your photo") : "Using your profile photo")}</div>
        <label className="btn" style={{ background: "var(--gold-border)", color: "#000", borderColor: "#000", cursor: "pointer" }}>
          {busy ? "Working…" : "Choose a photo or video"}
          <input type="file" accept="image/*,video/*" style={{ display: "none" }} disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
        </label>
        <button className="btn ghost" disabled={busy} onClick={remove}>{t("remove_and_use_my_profile_photo")}</button>
      </div>
    </Page>
  );
}


// ---- My Virtual Battles (Steve, 2026-09-27: "where does the judge see who battled with him
// and how many gift he got and from who?") — every battle I was in; a row opens its gift record.
export function MyVirtualBattlesPage() {
  const { t, tn } = useT();
  const { user } = useSession();
  const [battles, setBattles] = useState<VirtualBattleData[] | null>(null);
  const [record, setRecord] = useState<VirtualGiftRecord | null>(null);
  const [note, setNote] = useState("");
  useEffect(() => { if (user) fetchMyVirtualBattles(user.id).then(setBattles).catch(() => setBattles([])); }, [user]);
  if (!user) return <NeedLogin />;
  const myId = user.id;
  return (
    <Page title={t("my_virtual_battles")}>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>{t("every_virtual_battle_you_were_in_open_on")}</p>
      {note && <Notice>{note}</Notice>}
      {battles === null && <Loading />}
      {battles && battles.length === 0 && <p className="soft">{t("no_virtual_battles_yet")}</p>}
      {battles?.map((b) => {
        const me = b.participants.find((p) => p.user_id === myId);
        const others = b.participants.filter((p) => p.user_id !== myId).map((p) => personName(p)).join(", ");
        const winner = b.participants.find((p) => p.user_id === b.winner_user_id);
        const outcome = b.status !== "completed" ? "In progress" : b.winner_user_id === null ? "Tie" : b.winner_user_id === myId ? "🏆 You won" : `${winner ? personName(winner) : "Someone"} won`;
        return (
          <button key={b.virtual_battle_id} className="card pad" style={{ width: "100%", textAlign: "left", marginBottom: 10, borderColor: "var(--gold-border)", cursor: "pointer" }}
            onClick={() => fetchVirtualGiftRecord(myId, b.virtual_battle_id).then(setRecord).catch((e) => setNote((e as Error).message))}>
            <div className="row" style={{ justifyContent: "space-between", fontSize: 12, color: "var(--gold)", fontWeight: 800 }}>
              <span>{b.started_at ? new Date(b.started_at).toLocaleString() : ""}</span><span>{outcome}</span>
            </div>
            <div style={{ marginTop: 4 }}>{tn("with_people", <b>{others || "—"}</b>)}</div>
            <div className="muted" style={{ fontSize: 13 }}>{t("you_received_n_coins", (me?.current_score ?? 0).toLocaleString())}</div>
          </button>
        );
      })}
      {record && (
        <VirtualGiftRecordOverlay record={record} myUserId={myId} onClose={() => setRecord(null)}
          onThank={async (to, message) => { try { setNote(await sendVirtualThankYou(myId, record.battle.virtual_battle_id, to, message)); } catch (e) { setNote((e as Error).message); } }} />
      )}
    </Page>
  );
}
