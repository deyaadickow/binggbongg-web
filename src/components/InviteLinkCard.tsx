// "Your invite link" (Steve, 2026-11-12: "We should add this invite link on every member on our app. And explain to
// them by inviting your friends or followers can make you $100 for this referral. Also they can copy the
// Invite/Referral smart link and paste it on any social media platform or anywhere else.")
// Shown on Referral Program and Ads for Referrals. Money copy follows the program rule: 5% until $cap.
import { showGoldAlert } from "./GoldToast";
import { useT } from "../lib/i18n";
import { copyText, inviteUrlFor, shareInvite } from "../lib/invite";

export function InviteLinkCard({ code, url, cap = 100 }: { code: string | null | undefined; url?: string | null; cap?: number }) {
  const { t } = useT();
  const link = url || inviteUrlFor(code);
  if (!code || !link) return null;

  async function copy() {
    showGoldAlert((await copyText(link!)) ? t("inv_link_copied") : t("couldn_t_copy_select_the_link_and_copy_i"));
  }
  async function share() {
    const o = await shareInvite(link!, t("inv_share_text", code!));
    if (o === "copied") showGoldAlert(t("inv_link_copied"));
    else if (o === "failed") showGoldAlert(t("couldn_t_copy_select_the_link_and_copy_i"));
  }

  return (
    <section className="afr-card inv-link-card">
      <h2>🔗 {t("inv_your_link")}</h2>
      <p>{t("inv_link_explain", cap)}</p>
      <a className="inv-link-url" href={link} target="_blank" rel="noreferrer">{link.replace(/^https:\/\//, "")}</a>
      <div className="inv-link-btns">
        <button className="btn gold" onClick={() => void copy()}>📋 {t("inv_copy_link")}</button>
        <button className="btn" onClick={() => void share()}>📤 {t("inv_share_link")}</button>
      </div>
    </section>
  );
}
