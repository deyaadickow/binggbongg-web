// VIP Agent (Steve, 2026-11-14): "How can we signup an agent as a VIP agent. and give him this information to fill
// out for his influencer to signup. with this information grayed out, follower, %, Months per member and $ amount.
// all admin has to do it approve it."
//
// One page, driven by the server's me.status: signed out -> the pitch + Sign in; none/declined -> the pitch + apply;
// pending -> "we'll let you know"; ended -> contact Support; active -> the deal (greyed out), the "Add an influencer"
// form (username, platform, handle, followers) and the agent's influencers with their status. Black and gold.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageTitle } from "../components/PageTitle";
import { Loading } from "../components/Common";
import { useSession } from "../lib/session";
import { useT } from "../lib/i18n";
import { applyVipAgent, fetchVipAgent, submitVipInfluencer, type VipAgentDeal, type VipAgentState } from "../lib/vipAgent";

const GOLD = "#F0C420";
const card: React.CSSProperties = { background: "#0b0b0d", border: `2px solid ${GOLD}`, borderRadius: 16, padding: 16, color: "#fff" };
const goldBtn: React.CSSProperties = { padding: "11px 20px", borderRadius: 999, border: "none", background: GOLD, color: "#000", fontWeight: 900, fontSize: 15, cursor: "pointer" };
const heading: React.CSSProperties = { fontWeight: 900, color: GOLD, fontSize: 18, marginBottom: 6 };
const label: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6, color: GOLD, fontWeight: 700, fontSize: 13 };
const input: React.CSSProperties = { background: "#000", border: `1.5px solid ${GOLD}`, borderRadius: 10, color: "#fff", padding: "10px 12px", fontSize: 15, width: "100%", boxSizing: "border-box" };
const greyed: React.CSSProperties = { ...input, background: "#1c1c1f", border: "1.5px solid #444", color: "#9a9a9a", cursor: "not-allowed" };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 };

const num = (n: number) => n.toLocaleString("en-US");
// $5,000 for whole dollars, $342.50 (never $342.5) when there are cents.
const money = (n: number) => { const d = Number.isInteger(n) ? 0 : 2; return "$" + n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); };

function DealBox({ deal }: { deal: VipAgentDeal }) {
  const { t } = useT();
  const field = (k: Parameters<typeof t>[0], v: string) => (
    <label style={label}>{t(k)}<input style={greyed} value={v} disabled readOnly /></label>
  );
  return (
    <div style={card}>
      <div style={heading}>{t("vag_deal")}</div>
      <p style={{ margin: "0 0 12px", color: "#bbb", fontSize: 14 }}>{t("vag_deal_note")}</p>
      <div style={grid}>
        {field("vag_inf_min", num(deal.min_followers))}
        {field("vag_inf_percent", `${deal.percent}%`)}
        {field("vag_inf_months", deal.months > 0 ? String(deal.months) : t("vag_inf_months_none"))}
        {field("vag_inf_total", money(deal.total_cap))}
      </div>
      <div style={{ ...grid, marginTop: 12 }}>
        {field("vag_you_from", `${deal.agent_from_percent}%`)}
        {field("vag_you_top", `${deal.agent_top_percent}%`)}
        {field("vag_you_cap", money(deal.agent_cap))}
      </div>
    </div>
  );
}

export function VipAgentPage() {
  const { t } = useT();
  const { user, isLoggedIn } = useSession();
  const userId = user?.id ?? null;
  const [st, setSt] = useState<VipAgentState | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [agree, setAgree] = useState(false);
  const [f, setF] = useState({ username: "", platform: "", handle: "", followers: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Keyed on the id, never the user object: the session replaces that object on every refresh.
  useEffect(() => {
    if (!isLoggedIn || !userId) { setSt(null); return; }
    setSt(undefined);
    fetchVipAgent(userId).then(setSt).catch(() => setSt(null));
  }, [userId, isLoggedIn]);

  const wrap = (children: React.ReactNode) => (
    <div style={{ padding: 16, maxWidth: 860, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
      <PageTitle>👑 {t("vag_title")}</PageTitle>
      {children}
    </div>
  );
  const note = msg && <div style={{ ...card, borderColor: msg.ok ? GOLD : "#e5534b", color: msg.ok ? GOLD : "#ff8a80", fontWeight: 700 }}>{msg.text}</div>;

  if (!isLoggedIn) {
    return wrap(<>
      <div style={card}><p style={{ margin: 0, fontSize: 16, lineHeight: 1.5 }}>{t("vag_pitch", "500,000")}</p></div>
      <div style={card}>
        <p style={{ marginTop: 0 }}>{t("vag_sign_in")}</p>
        <Link to="/login" style={{ ...goldBtn, display: "inline-block", textDecoration: "none" }}>{t("sign_in")}</Link>
      </div>
    </>);
  }
  if (st === undefined) return wrap(<Loading />);
  if (st === null) return wrap(<p className="muted">{t("rp_couldnt_load")}</p>);

  const { deal, me } = st;
  const pitch = <div style={card}><p style={{ margin: 0, fontSize: 16, lineHeight: 1.5 }}>{t("vag_pitch", num(deal.min_followers))}</p></div>;

  const apply = async () => {
    if (!userId || busy) return;
    setBusy(true); setMsg(null);
    try {
      const r = await applyVipAgent(userId, name.trim(), about.trim());
      setMsg({ ok: r.ok, text: r.message });
      if (r.data) setSt(r.data);
    } finally { setBusy(false); }
  };
  const send = async () => {
    if (!userId || busy) return;
    setBusy(true); setMsg(null);
    try {
      const r = await submitVipInfluencer(userId, { ...f, username: f.username.trim() });
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) setF({ username: "", platform: "", handle: "", followers: "" });
      if (r.data) setSt(r.data);
    } finally { setBusy(false); }
  };

  if (me.status === "pending") return wrap(<>{pitch}<DealBox deal={deal} /><div style={{ ...card, color: GOLD, fontWeight: 800 }}>{t("vag_pending")}</div></>);
  if (me.status === "ended") return wrap(<>{pitch}<div style={{ ...card, fontWeight: 700 }}>{t("vag_ended")}</div></>);

  if (me.status !== "active") {
    return wrap(<>
      {pitch}
      <DealBox deal={deal} />
      {me.status === "declined" && <div style={{ ...card, fontWeight: 700 }}>{t("vag_declined")}</div>}
      {me.status === "none" && (deal.enabled ? (
        <div style={card}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={label}>{t("vag_name")}<input style={input} value={name} onChange={(e) => setName(e.target.value)} maxLength={191} /></label>
            <label style={label}>{t("vag_about")}<textarea style={{ ...input, minHeight: 90, resize: "vertical" }} value={about} onChange={(e) => setAbout(e.target.value)} maxLength={2000} /></label>
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", color: "#ddd", fontSize: 14, lineHeight: 1.4, cursor: "pointer" }}>
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 3, accentColor: GOLD }} />
              {t("vag_rules")}
            </label>
            <div><button style={{ ...goldBtn, opacity: agree && !busy ? 1 : 0.5 }} disabled={!agree || busy} onClick={apply}>{t("vag_apply")}</button></div>
          </div>
        </div>
      ) : <div style={card}>{t("vag_closed")}</div>)}
      {note}
    </>);
  }

  const statusText = (s: VipAgentState["influencers"][number]) =>
    s.status === "pending" ? t("vag_st_pending") : s.status === "declined" ? t("vag_st_declined") : s.deal_active ? t("vag_st_approved") : t("vag_st_ended");
  const canSend = f.username.trim() && f.platform.trim() && f.handle.trim() && f.followers.trim() && !busy;

  return wrap(<>
    <DealBox deal={deal} />
    <div style={card}>
      <div style={heading}>{t("vag_add")}</div>
      <p style={{ margin: "0 0 12px", color: "#bbb", fontSize: 14 }}>{t("vag_add_note")}</p>
      <div style={grid}>
        <label style={label}>{t("vag_username")}<input style={input} value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} autoCapitalize="none" /></label>
        <label style={label}>{t("vag_platform")}<input style={input} value={f.platform} onChange={(e) => setF({ ...f, platform: e.target.value })} placeholder="TikTok" /></label>
        <label style={label}>{t("vag_handle")}<input style={input} value={f.handle} onChange={(e) => setF({ ...f, handle: e.target.value })} placeholder="@" /></label>
        <label style={label}>{t("vag_followers")}<input style={input} value={f.followers} onChange={(e) => setF({ ...f, followers: e.target.value })} inputMode="numeric" placeholder={num(deal.min_followers)} /></label>
      </div>
      <div style={{ marginTop: 14 }}><button style={{ ...goldBtn, opacity: canSend ? 1 : 0.5 }} disabled={!canSend} onClick={send}>{t("vag_send")}</button></div>
    </div>
    {note}
    <div style={card}>
      <div style={heading}>{t("vag_mine")}</div>
      {st.influencers.length === 0 ? <p className="muted" style={{ margin: 0 }}>{t("vag_none_yet")}</p> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {st.influencers.map((i) => (
            <div key={i.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", borderBottom: "1px solid #222", paddingBottom: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800 }}>{i.name} {i.username && <span style={{ color: "#888", fontWeight: 400 }}>@{i.username}</span>}</div>
                <div style={{ color: "#999", fontSize: 13 }}>{i.platform} {i.handle} · {num(i.followers)}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: i.status === "declined" ? "#ff8a80" : GOLD, fontWeight: 800 }}>{statusText(i)}</div>
                {i.status === "approved" && <div style={{ color: "#bbb", fontSize: 13 }}>{t("vag_you_earned", money(i.agent_paid))}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  </>);
}
