// /invite/:code — the Invite / Referral link (Steve, 2026-11-12). What a friend sees when a member sends them
// their link by SMS, email, Messenger, WhatsApp or any social post:
//   who invited them, our video ad in their language (ending "add my referral code, it's right below this video"),
//   the code with a copy button, and ONE big button for their phone's store (iPhone -> App Store,
//   Android -> Google Play, a computer -> both + "join on the web").
// Black and gold. No money words here (the money is explained inside the app). Signed out is the normal case.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { showGoldAlert } from "../components/GoldToast";
import { phoneOs } from "../lib/getApp";
import { useT } from "../lib/i18n";
import { cleanCode, copyText, fetchInvite, rememberInviteCode, type Invite } from "../lib/invite";

export function InvitePage() {
  const { t, lang } = useT();
  const params = useParams();
  const code = cleanCode(params.code);
  const [data, setData] = useState<Invite | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "bad" | "error">("loading");
  const os = phoneOs();

  useEffect(() => {
    document.body.classList.add("signup-black");
    return () => document.body.classList.remove("signup-black");
  }, []);

  useEffect(() => {
    if (!code) { setState("bad"); return; }
    let live = true;
    setState("loading");
    fetchInvite(code, lang)
      .then((d) => {
        if (!live) return;
        if (!d) { setState("bad"); return; }
        setData(d);
        setState("ok");
        rememberInviteCode(d.referral_code);
      })
      .catch(() => live && setState("error"));
    return () => { live = false; };
  }, [code, lang]);

  async function copy() {
    if (!data) return;
    showGoldAlert((await copyText(data.referral_code)) ? t("inv_code_copied") : t("couldn_t_copy_select_the_link_and_copy_i"));
  }

  if (state !== "ok" || !data) {
    return (
      <div className="page inv-page">
        <div className="inv-state" role="status">
          {state === "loading" && t("loading")}
          {state === "bad" && t("inv_not_found")}
          {state === "error" && t("inv_error")}
        </div>
        {state !== "loading" && <Link className="btn gold inv-store-btn" to="/">{t("inv_open_site")}</Link>}
      </div>
    );
  }

  const name = data.member.full_name || data.member.username;
  return (
    <div className="page inv-page">
      <div className="inv-who">
        {data.member.profile
          ? <img className="inv-avatar" src={data.member.profile} alt="" />
          : <span className="inv-avatar inv-avatar-none" aria-hidden>{name.slice(0, 1).toUpperCase()}</span>}
        <div>
          <b className="inv-name">{name}</b>
          <span className="inv-sub">{t("inv_invited_you")}</span>
        </div>
      </div>

      {data.video && (
        <video className="inv-video" src={data.video.video_url} poster={data.video.poster_url ?? undefined}
          controls playsInline preload="metadata" />
      )}

      <section className="inv-code" aria-label={t("inv_code_label")}>
        <span className="inv-code-hint">⬇ {t("inv_add_my_code")}</span>
        <div className="inv-code-row">
          <b className="inv-code-value">{data.referral_code}</b>
          <button className="inv-copy" onClick={() => void copy()} aria-label={t("rp_copy")}>📋 {t("rp_copy")}</button>
        </div>
      </section>

      <div className="inv-stores">
        {os !== "android" && (
          <a className="btn gold inv-store-btn" href={data.app_store_url} onClick={() => void copyText(data.referral_code)}>
             {t("lp_cta_ios")}
          </a>
        )}
        {os !== "ios" && (
          <a className="btn gold inv-store-btn" href={data.play_url}>▶ {t("lp_cta_play")}</a>
        )}
        {os === null && (
          <Link className="btn inv-web-btn" to={`/login?mode=create&ref=${encodeURIComponent(data.referral_code)}`}>{t("inv_join_web")}</Link>
        )}
      </div>
      <p className="inv-steps">{t("inv_steps")}</p>
    </div>
  );
}
