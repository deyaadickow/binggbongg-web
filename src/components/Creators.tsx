// Creators and money (Steve, 2026-11-17): the Subscribe sheet and button, the locked video card,
// the "Ep N" chip, the subscriber badge, the host's "Subscribers only" live switch and the viewer's
// live gate. All black and gold, the app's gold popups, prices always "N BBs".
import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { mediaUrl, type Post, type PostLock } from "../lib/api";
import { useSession } from "../lib/session";
import { tt, useT } from "../lib/i18n";
import { socialUser } from "../lib/social";
import { showGoldAlert, showGoldConfirm } from "./GoldToast";
import { Loading } from "./Common";
import {
  CreatorError, buySeries, cancelSubscription, checkLiveAccess, fetchCreatorOptions, fetchCreatorPlan, fetchSubscriberBadges,
  localDate, setLiveSubscribersOnly, subscribeToCreator, truthy, type CreatorOptions, type CreatorPlanInfo, type LiveAccess,
} from "../lib/creators";

/** The member these features act for (on the dev server also the Social mock's pretend member). */
export function useCreatorMe() {
  const { user } = useSession();
  return socialUser(user);
}

/** One place for every refusal: low balance offers the Buy BBs screen (the Wallet), anything else
 *  is the gold popup with the server's own sentence. */
export async function showCreatorError(e: unknown, navigate: (to: string) => void): Promise<void> {
  const err = e as CreatorError;
  if (err?.code === "low_balance") {
    const yes = await showGoldConfirm({ message: err.message || tt("cm_low_balance"), confirmLabel: tt("cm_buy_bbs"), cancelLabel: tt("cm_not_now") });
    if (yes) navigate("/wallet");
    return;
  }
  if (err?.code === "no_plan" || err?.code === "no_lives_perk") {
    const yes = await showGoldConfirm({ message: err.message || tt("cm_set_up_first"), confirmLabel: tt("cm_my_subscription"), cancelLabel: tt("cm_not_now") });
    if (yes) navigate("/subscriptions");
    return;
  }
  showGoldAlert(err?.message || tt("something_went_wrong"));
}

function perkLines(info: CreatorPlanInfo, opts: CreatorOptions | null): string[] {
  const plan = info.plan;
  if (!plan) return [];
  const labels = (opts?.perks ?? []).filter((p) => plan.perks[p.key]).map((p) => p.label);
  return [...labels, ...plan.extra_perks];
}

/** "Subscribe · 199 BBs/month" — the black/gold sheet. Also the "Subscribed ✓" sheet with Cancel. */
export function SubscribeSheet({ creatorId, creatorName, onClose, onChanged }: {
  creatorId: number;
  creatorName?: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const { t } = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const me = useCreatorMe();
  const [info, setInfo] = useState<CreatorPlanInfo | null | undefined>(undefined);
  const [opts, setOpts] = useState<CreatorOptions | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => fetchCreatorPlan(creatorId).then(setInfo).catch(() => setInfo(null));
  useEffect(() => { void load(); fetchCreatorOptions().then(setOpts); }, [creatorId]); // eslint-disable-line react-hooks/exhaustive-deps

  const sub = info?.my_subscription ?? null;
  const paidUp = !!sub && truthy(sub.is_paid_up) && sub.status !== "expired";
  const renews = !!sub && truthy(sub.renews);

  async function subscribe() {
    if (!me) { onClose(); navigate("/login", { state: { from: location.pathname } }); return; }
    if (busy) return;
    setBusy(true);
    try {
      const r = await subscribeToCreator(me.id, creatorId);
      onClose();
      onChanged?.();
      showGoldAlert(r.welcome ? `${r.message || t("cm_subscribed")}\n\n“${r.welcome}”` : r.message || t("cm_subscribed"));
    } catch (e) {
      await showCreatorError(e, navigate);
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!me || busy) return;
    const yes = await showGoldConfirm({ message: t("cm_cancel_q", localDate(sub?.current_period_end)), confirmLabel: t("cm_cancel_subscription"), cancelLabel: t("cm_keep_it"), danger: true });
    if (!yes) return;
    setBusy(true);
    try {
      const msg = await cancelSubscription(me.id, creatorId);
      await load();
      onChanged?.();
      showGoldAlert(msg || t("cm_cancelled"));
    } catch (e) {
      await showCreatorError(e, navigate);
    } finally {
      setBusy(false);
    }
  }

  const plan = info?.plan ?? null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet cm-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {info === undefined ? <Loading /> : !plan ? (
          <>
            <p className="cm-gold center">{t("cm_no_offer")}</p>
            <button className="btn block" onClick={onClose}>{t("close")}</button>
          </>
        ) : (
          <>
            <div className="cm-sheet-title">{paidUp ? `${t("cm_subscribed")} ✓` : t("cm_subscribe_to", creatorName || t("cm_this_creator"))}</div>
            <div className="cm-price">{t("cm_price_month", plan.price_bbs)}</div>
            {paidUp ? (
              <p className="cm-gold center" style={{ margin: "6px 0 14px" }}>
                {renews ? t("cm_renews_on", localDate(sub!.current_period_end)) : t("cm_ends_on", localDate(sub!.current_period_end))}
              </p>
            ) : (
              <p className="cm-gold center" style={{ margin: "6px 0 14px", opacity: 0.85 }}>{t("cm_renews_monthly")}</p>
            )}
            <div className="cm-perk-head">{t("cm_subscribers_get")}</div>
            <ul className="cm-perks">
              {perkLines(info!, opts).map((line) => <li key={line}>★ {line}</li>)}
            </ul>
            {paidUp ? (
              renews ? (
                <button className="btn block" disabled={busy} onClick={() => void cancel()} style={{ marginTop: 14 }}>{t("cm_cancel_subscription")}</button>
              ) : (
                <button className="btn gold block" disabled={busy} onClick={() => void subscribe()} style={{ marginTop: 14 }}>{t("cm_renew_again")}</button>
              )
            ) : (
              <button className="btn gold block" disabled={busy} onClick={() => void subscribe()} style={{ marginTop: 14 }}>
                {busy ? "…" : `${t("cm_subscribe")} · ${t("cm_price_month", plan.price_bbs)}`}
              </button>
            )}
            <button className="btn ghost block" onClick={onClose} style={{ marginTop: 8 }}>{t("close")}</button>
          </>
        )}
      </div>
    </div>
  );
}

/** The profile's Subscribe button — only when the creator offers a subscription. */
export function SubscribeButton({ creatorId, creatorName, onChanged }: { creatorId: number; creatorName?: string; onChanged?: () => void }) {
  const { t } = useT();
  const [info, setInfo] = useState<CreatorPlanInfo | null>(null);
  const [open, setOpen] = useState(false);
  const load = () => fetchCreatorPlan(creatorId).then(setInfo).catch(() => setInfo(null));
  useEffect(() => { void load(); }, [creatorId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!info?.plan || info.is_me || !info.plan.is_active) return null;
  const sub = info.my_subscription;
  const subscribed = !!sub && truthy(sub.is_paid_up) && sub.status !== "expired";
  return (
    <>
      <button className="btn cm-sub-btn" onClick={() => setOpen(true)}>
        {subscribed ? `${t("cm_subscribed")} ✓` : `${t("cm_subscribe")} · ${t("cm_price_month", info.plan.price_bbs)}`}
      </button>
      {open && <SubscribeSheet creatorId={creatorId} creatorName={creatorName} onClose={() => setOpen(false)}
        onChanged={() => { void load(); onChanged?.(); }} />}
    </>
  );
}

/** Small "Ep N" chip on an unlocked series episode; opens the series. */
export function EpisodeChip({ post, style }: { post: Pick<Post, "series_info">; style?: React.CSSProperties }) {
  const { t } = useT();
  const navigate = useNavigate();
  const s = post.series_info;
  if (!s?.id) return null;
  // A span, not a link: on a feed card it sits inside the card's own link to the video.
  const open = (e: React.SyntheticEvent) => { e.preventDefault(); e.stopPropagation(); navigate(`/series/${s.id}`); };
  return (
    <span role="link" tabIndex={0} className="cm-ep-chip" style={style} title={s.title} onClick={open}
      onKeyDown={(e) => { if (e.key === "Enter") open(e); }}>
      {t("cm_ep_n", s.episode_no)}
    </span>
  );
}

/** The gold 🔒 a locked post wears on a thumbnail. */
export function LockBadge({ lock }: { lock?: PostLock | null }) {
  if (!lock) return null;
  return <span className="cm-lock-badge" aria-label="Locked">🔒</span>;
}

/** What a locked post shows in the player instead of the video (`video` is "" — never played). */
export function LockedCard({ post, onUnlocked }: { post: Post; onUnlocked: () => void }) {
  const { t } = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const me = useCreatorMe();
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = post.locked;
  if (!lock) return null;

  async function buy(postId?: number) {
    if (lock?.reason !== "series") return;
    if (!me) { navigate("/login", { state: { from: location.pathname } }); return; }
    if (busy) return;
    const price = postId ? lock.series.episode_price_bbs : lock.series.series_price_bbs;
    const yes = await showGoldConfirm({
      message: postId ? t("cm_unlock_episode_q", lock.episode_no ?? 0, price ?? 0) : t("cm_buy_series_q", lock.series.title, price ?? 0),
      confirmLabel: postId ? t("cm_unlock_episode") : t("cm_buy_series"), cancelLabel: t("cancel"),
    });
    if (!yes) return;
    setBusy(true);
    try {
      const r = await buySeries(me.id, lock.series.id, postId);
      showGoldAlert(r.message || t("cm_unlocked"));
      onUnlocked();
    } catch (e) {
      await showCreatorError(e, navigate);
    } finally {
      setBusy(false);
    }
  }

  const s = lock.reason === "series" ? lock.series : null;
  const canSeries = !!s && (s.pricing === "series" || s.pricing === "both") && !!s.series_price_bbs;
  const canEpisode = !!s && (s.pricing === "episode" || s.pricing === "both") && !!s.episode_price_bbs;
  return (
    <div className="cm-locked">
      {post.thumbnail && <img className="cm-locked-bg" src={mediaUrl(post.thumbnail)} alt="" />}
      <div className="cm-locked-body">
        <div className="cm-locked-icon">🔒</div>
        {lock.reason === "subscribers" ? (
          <>
            <div className="cm-locked-title">{t("cm_subscribers_only")}</div>
            <button className="btn gold" onClick={() => setSheet(true)}>{t("cm_subscribe")} · {t("cm_price_month", lock.sub_price_bbs)}</button>
          </>
        ) : (
          <>
            <div className="cm-locked-title">{s!.title} · {t("cm_episode_n", lock.episode_no ?? 0)}</div>
            {canSeries && <button className="btn gold" disabled={busy} onClick={() => void buy()}>{t("cm_buy_series")} · {s!.series_price_bbs} BBs</button>}
            {canEpisode && <button className="btn gold" disabled={busy} onClick={() => void buy(post.id)}>{t("cm_unlock_episode")} · {s!.episode_price_bbs} BBs</button>}
            {!!s!.free_for_subscribers && (
              <button className="btn" onClick={() => setSheet(true)}>{t("cm_free_for_subscribers")}</button>
            )}
            <Link className="btn ghost" to={`/series/${s!.id}`}>{t("cm_see_series")}</Link>
          </>
        )}
      </div>
      {sheet && <SubscribeSheet creatorId={lock.creator_id} creatorName={post.user?.fullname || post.user?.username}
        onClose={() => setSheet(false)} onChanged={onUnlocked} />}
    </div>
  );
}

/** Paid-up subscribers among these commenters (only when the creator turned the badge perk on). */
export function useSubscriberBadges(creatorId: number | undefined, userIds: number[]): Set<number> {
  const [set, setSet] = useState<Set<number>>(new Set());
  const key = [...new Set(userIds)].sort((a, b) => a - b).join(",");
  useEffect(() => {
    if (!creatorId || !key) { setSet(new Set()); return; }
    let alive = true;
    fetchSubscriberBadges(creatorId, key.split(",").map(Number)).then((s) => { if (alive) setSet(s); });
    return () => { alive = false; };
  }, [creatorId, key]);
  return set;
}

export function SubscriberChip() {
  const { t } = useT();
  return <span className="cm-sub-chip">★ {t("cm_subscriber")}</span>;
}

/** Host only: "Subscribers only" on/off for the room (needs the lives perk). */
export function SubscribersOnlyLiveToggle({ myId, roomName }: { myId: number; roomName: string }) {
  const { t } = useT();
  const navigate = useNavigate();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      const msg = await setLiveSubscribersOnly(myId, roomName, !on);
      setOn(!on);
      if (msg) showGoldAlert(msg);
    } catch (e) {
      await showCreatorError(e, navigate);
    } finally {
      setBusy(false);
    }
  }
  return (
    <button className={`btn small${on ? "" : " ghost"}`} disabled={busy} onClick={() => void toggle()}
      style={{ borderColor: "var(--gold-border)", color: "var(--gold)" }}>
      🔒 {t("cm_subscribers_only")}: {on ? t("cm_on") : t("cm_off")}
    </button>
  );
}

/** Viewers: checkLiveAccess before joining; not allowed → the Subscribe sheet instead of the room. */
export function LiveAccessGate({ roomName, skip, children }: { roomName: string; skip?: boolean; children: ReactNode }) {
  const { t } = useT();
  const navigate = useNavigate();
  const [access, setAccess] = useState<LiveAccess | null>(skip ? { allowed: true } : null);
  const [sheet, setSheet] = useState(true);
  const check = () => checkLiveAccess(roomName).then(setAccess);
  useEffect(() => { if (!skip) void check(); }, [roomName, skip]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!access) return <div className="page"><Loading /></div>;
  if (access.allowed) return <>{children}</>;
  return (
    <div className="page" style={{ maxWidth: 520 }}>
      <div className="card pad center" style={{ marginTop: 24 }}>
        <div className="cm-locked-icon">🔒</div>
        <p className="cm-gold" style={{ fontSize: 18, fontWeight: 800 }}>{access.message || t("cm_live_subscribers_only")}</p>
        <div className="row" style={{ justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
          <button className="btn gold" onClick={() => setSheet(true)}>{t("cm_subscribe")} · {t("cm_price_month", access.sub_price_bbs)}</button>
          <button className="btn ghost" onClick={() => navigate("/live")}>{t("live_now")}</button>
        </div>
      </div>
      {sheet && <SubscribeSheet creatorId={access.creator_id} onClose={() => setSheet(false)} onChanged={() => void check()} />}
    </div>
  );
}

/** A row of gold price chips (no native <select>). */
export function PriceChips({ prices, value, onChange, perMonth }: { prices: number[]; value: number | null; onChange: (v: number) => void; perMonth?: boolean }) {
  const { t } = useT();
  return (
    <div className="cm-chips">
      {prices.map((p) => (
        <button key={p} type="button" className={`cm-chip${value === p ? " active" : ""}`} onClick={() => onChange(p)}>
          {perMonth ? t("cm_price_month", p) : `${p} BBs`}
        </button>
      ))}
    </div>
  );
}
