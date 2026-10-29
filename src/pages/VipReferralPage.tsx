// VIP Referral Member (Steve, 2026-10-29): "If you are interested to be a VIP referral member,
// Apply here... we will let you know if you qualify within 24 hours. Whoever applies will
// automatically qualify because they took the time to apply. Once they are approved, then we will
// let them know how they can advertise on all platforms with the flyers we already have with their
// referral code."
//
// One page, driven by the server's me.vip.status: signed out -> the pitch and Sign in; none -> the
// pitch and the application; pending -> "we'll let you know"; revoked -> contact Support;
// approved -> the VIP kit (code, flyers, ready-made posts, tips, stats). The approval itself is a
// server job, about two hours after applying. Never promise income: "earn UP TO $100".
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { PageTitle } from "../components/PageTitle";
import { Loading } from "../components/Common";
import { VipBadge, VipBadgePopup } from "../components/VipBadge";
import { useSession } from "../lib/session";
import { useT, type StringKey } from "../lib/i18n";
import { applyVipReferrer, fetchReferralProgram, type ReferralProgram } from "../lib/referral";

const GOLD = "#F0C420";
const card: React.CSSProperties = { background: "#0b0b0d", border: `2px solid ${GOLD}`, borderRadius: 16, padding: 16, color: "#fff" };
const goldBtn: React.CSSProperties = { padding: "10px 18px", borderRadius: 999, border: "none", background: GOLD, color: "#000", fontWeight: 900, fontSize: 15, cursor: "pointer" };
const ghostBtn: React.CSSProperties = { padding: "10px 18px", borderRadius: 999, border: `2px solid ${GOLD}`, background: "transparent", color: GOLD, fontWeight: 900, fontSize: 15, cursor: "pointer" };
const heading: React.CSSProperties = { fontWeight: 900, color: GOLD, fontSize: 18, marginBottom: 10 };

// i18n-exempt: platform names are brand names, the same in every language. "Other" is translated.
const PLATFORMS = ["TikTok", "Facebook", "Instagram", "YouTube", "WhatsApp", "Messenger", "X"];
const OTHER = "Other";

// i18n-exempt: the labels are brand names; the post texts themselves are translated.
const POSTS: { label: string; key: StringKey }[] = [
  { label: "TikTok / Instagram", key: "vip_post_tiktok" },
  { label: "Facebook", key: "vip_post_facebook" },
  { label: "WhatsApp / Messenger", key: "vip_post_whatsapp" },
  { label: "X", key: "vip_post_x" },
];
const TIPS: StringKey[] = ["vip_tip_1", "vip_tip_2", "vip_tip_3", "vip_tip_4"];

export function VipReferralPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoggedIn } = useSession();
  const userId = user?.id ?? null;
  const [prog, setProg] = useState<ReferralProgram | null | undefined>(undefined);
  const [picked, setPicked] = useState<string[]>([]);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [badgeInfo, setBadgeInfo] = useState(false);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 2600); return () => clearTimeout(id); }, [toast]);
  // Keyed on the id, never the user object: the session replaces that object on every refresh.
  useEffect(() => {
    setProg(undefined);
    fetchReferralProgram(isLoggedIn ? userId : null).then(setProg).catch(() => setProg(null));
  }, [userId, isLoggedIn]);

  const title = <PageTitle>👑 {t("vip_title")}</PageTitle>;
  const wrap = (children: React.ReactNode) => (
    <div style={{ padding: 16, maxWidth: 820, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
      {title}{children}
      {badgeInfo && <VipBadgePopup viewerIsVip onClose={() => setBadgeInfo(false)} />}
      {toast && <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#000", border: `1.5px solid ${GOLD}`, color: "#fff", padding: "10px 18px", borderRadius: 999, zIndex: 2000, fontWeight: 800, maxWidth: "calc(100vw - 32px)", textAlign: "center" }}>{toast}</div>}
    </div>
  );
  if (prog === undefined) return wrap(<Loading />);
  if (prog === null) return wrap(<p className="muted">{t("rp_couldnt_load")}</p>);

  const money = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
  const vipCap = money(prog.vip_cap ?? 100);
  const cap = money(prog.cap ?? 25);
  const percent = String(prog.percent ?? 5);
  const me = isLoggedIn ? prog.me : null;
  const status = me?.vip?.status ?? "none";
  const code = me?.code ?? "";

  const copy = (text: string) =>
    navigator.clipboard.writeText(text).then(() => setToast(t("rp_copied"))).catch(() => undefined);
  const share = (text: string) => {
    const nav = navigator as Navigator;
    if (nav.share) nav.share({ text }).catch(() => undefined); else void copy(text);
  };
  const when = (iso: string | null | undefined) => {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d.toLocaleString();
  };

  async function apply() {
    if (!userId || !agree || busy) return;
    setBusy(true); setMessage(null);
    try {
      const r = await applyVipReferrer(userId, picked);
      // A success moves the page on to "Thanks for applying", so its message is a toast; a failure
      // stays under the Apply button where the member is looking.
      if (r.ok) setToast(r.message ?? t("vip_applied_ok")); else setMessage(r.message ?? t("vip_apply_failed"));
      if (r.program) setProg(r.program);
      else if (r.ok) fetchReferralProgram(userId).then((p) => { if (p) setProg(p); }).catch(() => undefined);
    } finally { setBusy(false); }
  }

  const pitch = <div style={{ ...card, fontSize: 16, lineHeight: 1.5 }}>{t("vip_pitch", vipCap, cap)}</div>;

  // Signed out: the pitch, and the app's normal sign-in (which comes straight back here).
  if (!isLoggedIn || !me) {
    return wrap(<>
      {pitch}
      <div style={{ ...card, display: "flex", justifyContent: "center" }}>
        <button style={goldBtn} onClick={() => navigate("/login", { state: { from: location.pathname + location.search } })}>{t("vip_sign_in_to_apply")}</button>
      </div>
    </>);
  }

  if (status === "pending") {
    const at = when(me.vip?.applied_at);
    return wrap(<>
      <div style={{ ...card, fontSize: 17, lineHeight: 1.5, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 6 }}>⏳</div>
        <div style={{ fontWeight: 800 }}>{t("vip_pending")}</div>
        {at && <div style={{ fontSize: 14, color: "#EDE6D2", marginTop: 8 }}>{t("vip_applied_at", at)}</div>}
      </div>
    </>);
  }

  if (status === "revoked") {
    return wrap(<>
      <div style={{ ...card, fontSize: 17, lineHeight: 1.5, textAlign: "center", display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
        <div>{t("vip_revoked")}</div>
        <Link to="/settings/support" style={{ ...goldBtn, textDecoration: "none" }}>{t("vip_contact_support")}</Link>
      </div>
    </>);
  }

  if (status === "approved") {
    return wrap(<>
      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
        <VipBadge size={32} onClick={() => setBadgeInfo(true)} />
        <div style={{ fontSize: 16, lineHeight: 1.5 }}>{t("vip_kit_line", percent, vipCap)}</div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1, color: "#EDE6D2", marginBottom: 6 }}>{t("rp_your_code")}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 28, fontWeight: 900, color: GOLD, wordBreak: "break-all" }}>{code}</span>
          <button style={goldBtn} onClick={() => void copy(code)}>{t("rp_copy")}</button>
        </div>
      </div>

      <div style={card}>
        <div style={heading}>🖼️ {t("vip_your_flyers")}</div>
        <div style={{ fontSize: 15, lineHeight: 1.5, marginBottom: 12 }}>{t("vip_flyers_note")}</div>
        <Link to="/referral-program" style={{ ...goldBtn, textDecoration: "none", display: "inline-block" }}>{t("vip_open_flyers")}</Link>
      </div>

      <div style={card}>
        <div style={heading}>📣 {t("vip_posts_title")}</div>
        <div style={{ fontSize: 14, color: "#EDE6D2", marginBottom: 12 }}>{t("vip_posts_note")}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {POSTS.map((p) => {
            const text = t(p.key, code);
            return (
              <div key={p.key} style={{ border: "1.5px solid rgba(240,196,32,.45)", borderRadius: 12, padding: 12 }}>
                <div style={{ fontWeight: 900, color: GOLD, marginBottom: 6 }}>{p.label}</div>
                <div style={{ fontSize: 15, lineHeight: 1.5, whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{text}</div>
                <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                  <button style={goldBtn} onClick={() => void copy(text)}>{t("rp_copy")}</button>
                  <button style={ghostBtn} onClick={() => share(text)}>{t("rp_share")}</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={card}>
        <div style={heading}>💡 {t("vip_tips_title")}</div>
        <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8, fontSize: 15, lineHeight: 1.45 }}>
          {TIPS.map((k) => <li key={k}>{t(k)}</li>)}
        </ul>
      </div>

      <div style={card}>
        <div style={heading}>📊 {t("vip_stats_title")}</div>
        <div style={{ fontSize: 16, display: "flex", flexDirection: "column", gap: 6 }}>
          <div>👥 {t("rp_referred_n", me.referred_count)}</div>
          <div>💰 {t("rp_earned", money(me.bonus_earned))}</div>
        </div>
      </div>
    </>);
  }

  // Not applied yet.
  const paused = prog.vip_enabled === false;
  const toggle = (p: string) => setPicked((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  return wrap(<>
    {pitch}
    {paused ? (
      <div style={{ ...card, borderColor: "#888" }}>{t("vip_paused")}</div>
    ) : (
      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>{t("vip_where_share")}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[...PLATFORMS, OTHER].map((p) => {
              const on = picked.includes(p);
              return (
                <button key={p} type="button" aria-pressed={on} onClick={() => toggle(p)}
                        style={{ padding: "8px 14px", borderRadius: 999, cursor: "pointer", fontWeight: 800, fontSize: 14,
                                 border: `2px solid ${GOLD}`, background: on ? GOLD : "transparent", color: on ? "#000" : "#fff" }}>
                  {on ? "✓ " : ""}{p === OTHER ? t("vip_platform_other") : p}
                </button>
              );
            })}
          </div>
        </div>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 15, lineHeight: 1.45, cursor: "pointer" }}>
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)}
                 style={{ width: 22, height: 22, flex: "none", marginTop: 1, accentColor: GOLD }} />
          <span>{t("vip_agree")}</span>
        </label>
        <button style={{ ...goldBtn, alignSelf: "center", minWidth: 180, opacity: agree && !busy ? 1 : 0.5, cursor: agree && !busy ? "pointer" : "not-allowed" }}
                disabled={!agree || busy} onClick={() => void apply()}>
          {busy ? t("vip_applying") : t("vip_apply")}
        </button>
        {message && <div style={{ fontSize: 15, color: GOLD, textAlign: "center" }}>{message}</div>}
      </div>
    )}
  </>);
}
