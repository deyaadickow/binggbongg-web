// /free-coins — "🪙 Free Coins" (Steve, 2026-11-10). Two black/gold cards: "Free coins we give you"
// and "Money you earn", one row per item the server lists (lib/freeCoins.ts), each opening the
// screen where you earn it. Reached from the directory tile and the Wallet.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { PageTitle } from "../components/PageTitle";
import { useT, type StringKey } from "../lib/i18n";
import { useSession } from "../lib/session";
import { PRELAUNCH_DEFAULTS, usePrelaunch } from "../lib/prelaunch";
import { fetchFreeCoins, type EarnKey, type FreeCoins, type GiveKey, type GiveRow } from "../lib/freeCoins";

const GIVE_LABEL: Record<GiveKey, StringKey> = {
  signup: "fc_signup",
  video_upload: "fc_video_upload",
  photo_upload: "fc_photo_upload",
  follow: "fc_follow",
  referral: "fc_referral",
};

const EARN_LABEL: Record<EarnKey, StringKey> = {
  battle_host_bonus: "fc_battle_host_bonus",
  share_earn: "fc_share_earn",
};

/** Where each row takes you. Sign-up opens nothing for a member; a guest goes to sign up. */
function giveHref(key: GiveKey, signedIn: boolean): string | null {
  switch (key) {
    case "signup": return signedIn ? null : "/login";
    case "video_upload": return "/upload";
    case "photo_upload": return "/upload-photos";
    case "follow": return "/search";
    case "referral": return "/referral-program";
  }
}

const EARN_HREF: Record<EarnKey, string> = {
  battle_host_bonus: "/battles",
  share_earn: "/settings/referrals",
};

function Row({ to, label, sub, value }: { to: string | null; label: string; sub?: string | null; value: string }) {
  const inner: ReactNode = (
    <>
      <span className="fc-label">
        <span className="fc-name">{label}</span>
        {sub && <span className="fc-sub">{sub}</span>}
      </span>
      <span className="fc-leader" aria-hidden />
      <span className="fc-value">{value}</span>
      {to && <span className="fc-chev" aria-hidden>›</span>}
    </>
  );
  return to
    ? <Link to={to} className="fc-row">{inner}</Link>
    : <div className="fc-row">{inner}</div>;
}

export function FreeCoinsPage() {
  const { t, lang } = useT();
  const { isLoggedIn } = useSession();
  const prelaunch = usePrelaunch();
  const [data, setData] = useState<FreeCoins | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback((force: boolean) => {
    setFailed(false);
    setData(null);
    let live = true;
    fetchFreeCoins(force)
      .then((d) => { if (live) setData(d); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);
  useEffect(() => load(false), [load]);

  const num = (n: number) => n.toLocaleString(lang === "tl" ? "fil" : lang);
  const coins = (n: number) => (n === 1 ? t("fc_one_coin") : t("fc_n_coins", num(n)));
  const limit = (r: GiveRow) =>
    r.perDay == null ? null : r.key === "follow" ? t("fc_follow_limit", num(r.perDay)) : t("fc_per_day", num(r.perDay));

  return (
    <div className="page" style={{ maxWidth: 640 }}>
      <PageTitle>{t("fc_title")}</PageTitle>
      {failed ? (
        <div className="card pad sb-card">
          <span className="sb-card-line">{t("fc_load_failed")}</span>
          <button type="button" className="btn" style={{ alignSelf: "center", marginTop: 4 }} onClick={() => load(true)}>
            {t("fc_retry")}
          </button>
        </div>
      ) : !data ? (
        <div className="fc-spin" role="status" aria-label={t("loading")} />
      ) : (
        <>
          {/* Steve, 2026-11-11: sign-up Bonus BBs are off; a new member gets 1,000 FBBs to practice with. */}
          <div className="card pad sb-card fc-card">
            <Row to={isLoggedIn ? "/pre-launch" : "/login"} label={t("fc_signup")} sub={t("fc_signup_fbbs_sub")}
              value={`${num(prelaunch?.newMemberPbbs ?? PRELAUNCH_DEFAULTS.newMemberPbbs)} FBBs`} />
          </div>
          {data.give.length > 0 && (
            <div className="card pad sb-card fc-card">
              <b className="sb-card-title">{t("fc_give_title")}</b>
              {data.give.map((r) => (
                <Row key={r.key} to={giveHref(r.key, isLoggedIn)} label={t(GIVE_LABEL[r.key])} sub={limit(r)} value={coins(r.coins)} />
              ))}
            </div>
          )}
          {data.earn.length > 0 && (
            <div className="card pad sb-card fc-card">
              <b className="sb-card-title">{t("fc_earn_title")}</b>
              {data.earn.map((r) => (
                <Row key={r.key} to={EARN_HREF[r.key]} label={t(EARN_LABEL[r.key])} value={t("fc_bonus", num(r.percent))} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
