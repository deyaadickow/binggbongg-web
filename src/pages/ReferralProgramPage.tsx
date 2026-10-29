// Referral Program (Steve, 2026-10-28): a country picker, each country's description in its language,
// the member's referral code (their username), the people they referred and what they have earned,
// adding a code (first 30 days), and the flyers with the member's code drawn in, to download and post.
// The big printable flyer is web-only (Steve: "Do the same thing with the big flyer but only on the web").
import { useEffect, useMemo, useState } from "react";
import { PageTitle } from "../components/PageTitle";
import { Loading } from "../components/Common";
import { useSession } from "../lib/session";
import { useT } from "../lib/i18n";
import { enterReferralCode, fetchReferralProgram, flyerWithCode, type CodeBox, type ReferralCountry, type ReferralProgram } from "../lib/referral";

const GOLD = "#F0C420";
const card: React.CSSProperties = { background: "#0b0b0d", border: `2px solid ${GOLD}`, borderRadius: 16, padding: 16, color: "#fff" };
const goldBtn: React.CSSProperties = { padding: "10px 18px", borderRadius: 999, border: "none", background: GOLD, color: "#000", fontWeight: 900, fontSize: 15, cursor: "pointer" };
const ghostBtn: React.CSSProperties = { padding: "10px 18px", borderRadius: 999, border: `2px solid ${GOLD}`, background: "transparent", color: GOLD, fontWeight: 900, fontSize: 15, cursor: "pointer" };

function Flyer({ url, box, code, fileName, big, onNotice }: { url: string; box: CodeBox | null; code: string | null; fileName: string; big?: boolean; onNotice: (m: string) => void }) {
  const { t } = useT();
  const [blob, setBlob] = useState<Blob | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true; let made: string | null = null;
    setBlob(null); setSrc(null);
    flyerWithCode(url, box, code).then((b) => {
      if (!alive) return;
      if (b) { made = URL.createObjectURL(b); setBlob(b); setSrc(made); } else setSrc(url);
    });
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [url, box, code]);
  const download = () => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = fileName; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    onNotice(t("rp_downloaded"));
  };
  const share = async () => {
    if (!blob) return;
    const file = new File([blob], fileName, { type: "image/png" });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) { try { await nav.share({ files: [file], text: t("rp_share_text", code ?? "") }); } catch { /* cancelled */ } }
    else download();
  };
  const print = () => {
    if (!src) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!doctype html><title>Bingg Bongg flyer</title><style>@page{size:8.5in 11in;margin:0}html,body{margin:0}img{width:100%;display:block}</style><img src="${src}" onload="setTimeout(function(){window.print()},300)">`);
    w.document.close();
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
      {src ? <img src={src} alt={t("rp_flyer_alt")} style={{ width: "100%", maxWidth: big ? 760 : 420, borderRadius: 8, display: "block" }} /> : <Loading />}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
        <button style={goldBtn} disabled={!blob} onClick={download}>{big ? t("rp_download") : t("rp_save_to_phone")}</button>
        {big ? <button style={ghostBtn} disabled={!src} onClick={print}>{t("rp_print")}</button> : <button style={ghostBtn} disabled={!blob} onClick={() => void share()}>{t("rp_share")}</button>}
      </div>
    </div>
  );
}

export function ReferralProgramPage() {
  const { t } = useT();
  const { user, isLoggedIn } = useSession();
  const [prog, setProg] = useState<ReferralProgram | null | undefined>(undefined);
  const [pick, setPick] = useState<string | null>(null);
  const [codeIn, setCodeIn] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // Steve, 2026-10-28: members can put their code on the flyer themselves — pre-filled with their
  // username, editable (and typeable when signed out); the flyers redraw a moment after typing stops.
  const [typed, setTyped] = useState<string | null>(null);
  const [flyerCode, setFlyerCode] = useState<string>("");
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 2600); return () => clearTimeout(id); }, [toast]);
  useEffect(() => { fetchReferralProgram(user?.id ?? null).then((p) => setProg(p)).catch(() => setProg(null)); }, [user?.id]);
  const fieldValue = typed ?? prog?.me?.code ?? "";
  useEffect(() => { const id = setTimeout(() => setFlyerCode(fieldValue.trim().slice(0, 30)), 300); return () => clearTimeout(id); }, [fieldValue]);

  const country: ReferralCountry | null = useMemo(() => {
    if (!prog || prog.countries.length === 0) return null;
    const mine = (prog.me?.country ?? "").trim().toLowerCase();
    return prog.countries.find((c) => c.country_code === pick)
      ?? prog.countries.find((c) => mine && (c.name.toLowerCase() === mine || c.country_code.toLowerCase() === mine))
      ?? prog.countries[0];
  }, [prog, pick]);

  if (prog === undefined) return <div style={{ padding: 16 }}><PageTitle backTo="/features">💸 {t("rp_title")}</PageTitle><Loading /></div>;
  if (prog === null) return <div style={{ padding: 16 }}><PageTitle backTo="/features">💸 {t("rp_title")}</PageTitle><p className="muted">{t("rp_couldnt_load")}</p></div>;
  const me = prog.me;
  const code = me?.code ?? null;
  const money = (n: number) => `$${n.toFixed(2)}`;

  async function addCode() {
    if (!user || !codeIn.trim() || busy) return;
    setBusy(true);
    try {
      const r = await enterReferralCode(user.id, codeIn.trim());
      setToast(r.message ?? (r.ok ? t("rp_code_added") : t("rp_code_failed")));
      if (r.program) { setProg(r.program); setCodeIn(""); }
    } finally { setBusy(false); }
  }

  return (
    <div style={{ padding: 16, maxWidth: 820, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
      <PageTitle backTo="/features">💸 {t("rp_title")}</PageTitle>

      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
        {prog.countries.map((c) => {
          const on = country?.country_code === c.country_code;
          return (
            <button key={c.country_code} onClick={() => setPick(c.country_code)}
                    style={{ flex: "none", padding: "8px 16px", borderRadius: 999, cursor: "pointer", fontWeight: 800, fontSize: 15,
                             border: `2px solid ${GOLD}`, background: on ? GOLD : "transparent", color: on ? "#000" : "#fff" }}>{c.flag} {c.name}</button>
          );
        })}
      </div>

      {!prog.enabled && <div style={{ ...card, borderColor: "#888" }}>{t("rp_paused")}</div>}
      {country && <div style={{ ...card, whiteSpace: "pre-line", fontSize: 16, lineHeight: 1.5 }}>{country.description}</div>}

      <div style={card}>
        {isLoggedIn && code ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1, color: "#EDE6D2" }}>{t("rp_your_code")}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 28, fontWeight: 900, color: GOLD, wordBreak: "break-all" }}>{code}</span>
              <button style={goldBtn} onClick={() => navigator.clipboard.writeText(code).then(() => setToast(t("rp_copied"))).catch(() => undefined)}>{t("rp_copy")}</button>
              <button style={ghostBtn} onClick={() => { const text = t("rp_share_text", code); const nav = navigator as Navigator; if (nav.share) nav.share({ text }).catch(() => undefined); else navigator.clipboard.writeText(text).then(() => setToast(t("rp_copied"))).catch(() => undefined); }}>{t("rp_share")}</button>
            </div>
            <div style={{ fontSize: 15 }}>👥 {t("rp_referred_n", me!.referred_count)} · 💰 {t("rp_earned", money(me!.bonus_earned))}</div>
            {me!.referred_by && <div style={{ fontSize: 14, color: "#EDE6D2" }}>{t("rp_referred_by", me!.referred_by.name)}</div>}
            {me!.referred.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 220, overflowY: "auto" }}>
                {me!.referred.map((r) => (
                  <div key={r.user_id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 14, padding: "4px 0", borderBottom: "1px solid rgba(240,196,32,.2)" }}>
                    <span>{r.name}{r.username ? <span style={{ opacity: .6 }}> @{r.username}</span> : null}</span>
                    <span style={{ color: GOLD, fontWeight: 800, whiteSpace: "nowrap" }}>{t("rp_of_cap", money(r.bonus_paid), money(prog.cap))}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : <div style={{ fontSize: 16 }}>{t("rp_sign_in")}</div>}
      </div>

      {me?.can_enter_code && (
        <div style={card}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>{t("rp_enter_title")}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={codeIn} onChange={(e) => setCodeIn(e.target.value)} placeholder={t("rp_enter_placeholder")}
                   style={{ flex: 1, minWidth: 0, padding: "10px 14px", borderRadius: 999, border: `2px solid ${GOLD}`, background: "#000", color: "#fff", fontSize: 15 }} />
            <button style={goldBtn} disabled={busy || !codeIn.trim()} onClick={() => void addCode()}>{t("rp_add")}</button>
          </div>
        </div>
      )}

      {(country?.flyer_phone || country?.flyer_letter) && (
        <div style={card}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>{t("rp_code_on_flyer")}</div>
          <input value={fieldValue} maxLength={30} onChange={(e) => setTyped(e.target.value)} placeholder={t("rp_code_placeholder")}
                 style={{ width: "100%", boxSizing: "border-box", padding: "10px 14px", borderRadius: 999, border: `2px solid ${GOLD}`, background: "#000", color: "#fff", fontSize: 16, fontWeight: 800 }} />
        </div>
      )}
      {country?.flyer_phone && (
        <div style={card}>
          <div style={{ fontWeight: 900, color: GOLD, fontSize: 18, marginBottom: 10 }}>{t("rp_phone_flyer")}</div>
          <Flyer url={country.flyer_phone} box={country.phone_code_box} code={flyerCode || null} fileName={`Bingg Bongg referral flyer${flyerCode ? ` - ${flyerCode}` : ""}.png`} onNotice={setToast} />
        </div>
      )}
      {country?.flyer_letter && (
        <div style={card}>
          <div style={{ fontWeight: 900, color: GOLD, fontSize: 18, marginBottom: 4 }}>🖨️ {t("rp_big_flyer")}</div>
          <div style={{ fontSize: 14, color: "#EDE6D2", marginBottom: 10 }}>{t("rp_big_flyer_note")}</div>
          <Flyer big url={country.flyer_letter} box={country.letter_code_box} code={flyerCode || null} fileName={`Bingg Bongg big flyer${flyerCode ? ` - ${flyerCode}` : ""}.png`} onNotice={setToast} />
        </div>
      )}
      {toast && <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#000", border: `1.5px solid ${GOLD}`, color: "#fff", padding: "10px 18px", borderRadius: 999, zIndex: 2000, fontWeight: 800 }}>{toast}</div>}
    </div>
  );
}
