// Video Ad Gig (Steve, 2026-10-17):
//
//   "Influencers ready to work. A new page will be called 'Video Ad Gig'. Making a 15, 30, 45
//    and 60 seconds videos ads for any member's business, service or personal.
//    The buyer will need to add money to their spending cash account. Influencers will earn 50%
//    of the gig. All participating influencers will need to upload a video to a new page on main
//    feed called 'Video Ad Gig' and will try to convince the buyers why they should purchase the
//    gig from them."
//
// Two pages: the feed tab where you pick an influencer and buy, and My Gigs, which is both
// sides of the deal — the ads you bought and the work you took on.
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useSession } from "../lib/session";
import { Loading, Notice } from "../components/Common";
import { mediaUrl } from "../lib/api";
import {
  acceptVideoAdGigOrder, applyForVideoAdGig, cancelVideoAdGigOrder, deliverVideoAdGigOrder,
  fetchMyVideoAdGig, fetchMyVideoAdGigOrders, fetchVideoAdGigs, orderVideoAdGig,
  respondVideoAdGigOrder,
  type GigCard, type GigOffer, type GigOrder,
} from "../lib/videoAdGigs";
import { useT } from "../lib/i18n";

const money = (v: number) => "$" + Number(v ?? 0).toFixed(2);
const gold = { background: "var(--gold-border)", color: "#000", borderColor: "var(--gold-border)" };
const ghost = { background: "transparent", color: "var(--gold)", borderColor: "var(--gold-border)" };

// ---- The feed tab ---------------------------------------------------------------------------

export function VideoAdGigPage() {
  const { t } = useT();
  const { user, isLoggedIn } = useSession();
  const [rows, setRows] = useState<GigCard[] | null>(null);
  const [offer, setOffer] = useState<GigOffer | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [ordering, setOrdering] = useState<GigCard | null>(null);
  // Same one-way door as Shows (Steve, 2026-10-17: every click stacked another history entry
  // and getting out took as many backs as clicks). Arriving from My Gigs hides the way back in.
  const cameFromMine = useLocation().state?.from === "my-gigs";

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      fetchVideoAdGigs(query.trim())
        .then((r) => { if (!live) return; setRows(r.rows); setEnabled(r.enabled); if (r.offer) setOffer(r.offer); setError(""); })
        .catch(() => { if (live) { setRows([]); setError("Couldn't load the Video Ad Gig page."); } });
    }, query ? 350 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [query]);

  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h1 className="page-title">{t("video_ad_gig")}</h1>
        {isLoggedIn && !cameFromMine && (
          <Link to="/my-gigs" state={{ from: "gigs" }} className="btn small" style={ghost}>{t("gig_my_gigs")}</Link>
        )}
      </div>

      {!enabled && <p className="soft">{t("gig_not_open")}</p>}

      {enabled && offer && <GigOfferCard offer={offer} />}

      {enabled && (
        <input
          className="input"
          value={query}
          placeholder={t("gig_search_hint")}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: "100%", margin: "10px 0 14px" }}
        />
      )}

      {error && <Notice>{error}</Notice>}
      {enabled && rows === null && <Loading />}
      {enabled && rows !== null && rows.length === 0 && !error && (
        query.trim()
          ? <p className="soft">Nobody matches “{query.trim()}”.</p>
          : <p className="soft">No influencers yet. {isLoggedIn && <Link to="/my-gigs" style={{ color: "var(--gold)" }}>{t("put_your_own_video_up")}</Link>}</p>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {(rows ?? []).map((g) => (
          <GigRow key={g.id} gig={g} onOrder={() => setOrdering(g)} canOrder={isLoggedIn && g.user_id !== user?.id} />
        ))}
      </div>

      {ordering && offer && user && (
        <OrderDialog gig={ordering} offer={offer} myUserId={user.id} onClose={() => setOrdering(null)} />
      )}
    </div>
  );
}

/** The offer, in the words of the thing itself — every figure comes from the server. */
function GigOfferCard({ offer }: { offer: GigOffer }) {
  const { t } = useT();
  return (
    <div className="card pad" style={{ borderColor: "var(--gold-border)", marginBottom: 12 }}>
      <div style={{ fontWeight: 900, color: "var(--gold)", marginBottom: 8 }}>
        {t("gig_offer_title")}</div>
      <ul className="soft" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
        <li>{t("influencers_make_a_video_ad_for_your_bus")}</li>
        <li>{t("watch_their_videos_below_pick_the_one_yo")}</li>
        <li>{t("pay_from_your_spending_cash_account_we_h")}</li>
        <li>{t("nobody_takes_it_on_or_it_isn_t_delivered")}</li>
      </ul>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        {offer.prices.map((p) => (
          <div key={p.seconds} className="card pad" style={{ padding: "8px 14px", textAlign: "center", borderColor: "var(--gold-border)" }}>
            <div style={{ fontWeight: 900, color: "var(--gold)" }}>{money(p.price)}</div>
            <div className="muted" style={{ fontSize: 12 }}>{p.seconds} seconds</div>
          </div>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 10, marginBottom: 0 }}>
        Influencers earn {offer.influencer_share_percent}% of the gig, paid when you accept the
        finished ad — or automatically after {offer.accept_days} day{offer.accept_days === 1 ? "" : "s"} if you don't.
      </p>
    </div>
  );
}

function GigRow({ gig, onOrder, canOrder }: { gig: GigCard; onOrder: () => void; canOrder: boolean }) {
  const { t } = useT();
  return (
    <div className="card pad" style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
      <div style={{ width: 220, maxWidth: "100%" }}>
        {gig.video ? (
          <video
            src={mediaUrl(gig.video)}
            poster={gig.thumbnail ? mediaUrl(gig.thumbnail) : undefined}
            controls
            playsInline
            preload="metadata"
            style={{ width: "100%", borderRadius: 10, background: "#000", aspectRatio: "9 / 16", objectFit: "cover" }}
          />
        ) : (
          <div className="muted" style={{ fontSize: 12 }}>{t("no_video_yet")}</div>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontWeight: 900, color: "var(--gold)", fontSize: 17 }}>
          {gig.influencer_name ?? "—"} {gig.is_verified ? "✓" : ""}
        </div>
        {gig.influencer_username && <div className="muted" style={{ fontSize: 12 }}>@{gig.influencer_username}</div>}
        {gig.headline && <div style={{ marginTop: 6, fontWeight: 700 }}>{gig.headline}</div>}
        {gig.about && <p className="soft" style={{ fontSize: 13, marginTop: 6, whiteSpace: "pre-wrap" }}>{gig.about}</p>}
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          {gig.completed_count} ad{gig.completed_count === 1 ? "" : "s"} finished
        </div>
        {canOrder && (
          <button className="btn small" style={{ ...gold, marginTop: 10 }} onClick={onOrder}>
            {t("order_a_video_ad")}</button>
        )}
      </div>
    </div>
  );
}

function OrderDialog({ gig, offer, myUserId, onClose }: {
  gig: GigCard; offer: GigOffer; myUserId: number; onClose: () => void;
}) {
  const { t } = useT();
  const [seconds, setSeconds] = useState(offer.prices[0]?.seconds ?? 15);
  const [businessName, setBusinessName] = useState("");
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const price = offer.prices.find((p) => p.seconds === seconds)?.price ?? 0;

  const submit = async () => {
    setBusy(true); setError("");
    try {
      const r = await orderVideoAdGig(myUserId, { gig_id: gig.id, seconds, business_name: businessName, brief });
      setDone(r.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't place that order.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.72)", display: "flex",
      alignItems: "center", justifyContent: "center", padding: 16, zIndex: 60,
    }}>
      <div className="card pad" onClick={(e) => e.stopPropagation()}
           style={{ maxWidth: 480, width: "100%", maxHeight: "86vh", overflowY: "auto", borderColor: "var(--gold-border)" }}>
        <div style={{ fontWeight: 900, color: "var(--gold)", fontSize: 18, marginBottom: 4 }}>
          Order from {gig.influencer_name ?? "this influencer"}
        </div>

        {done ? (
          <>
            <p className="soft" style={{ fontSize: 14 }}>{done}</p>
            <Link to="/my-gigs" state={{ from: "gigs" }} className="btn" style={gold}>{t("see_my_gigs")}</Link>
          </>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
              {offer.prices.map((p) => (
                <button key={p.seconds} className="btn small"
                        onClick={() => setSeconds(p.seconds)}
                        style={p.seconds === seconds ? gold : ghost}>
                  {p.seconds}s · {money(p.price)}
                </button>
              ))}
            </div>

            <label className="soft" style={{ fontSize: 13 }}>{t("gig_business_hint")}</label>
            <input className="input" value={businessName} maxLength={191}
                   onChange={(e) => setBusinessName(e.target.value)} style={{ width: "100%", marginBottom: 10 }} />

            <label className="soft" style={{ fontSize: 13 }}>{t("gig_brief_hint")}</label>
            <textarea className="input" rows={4} value={brief} placeholder={t("what_you_sell_who_it_s_for_anything_that")}
                      onChange={(e) => setBrief(e.target.value)} style={{ width: "100%", marginBottom: 10 }} />

            {error && <Notice error>{error}</Notice>}

            <p className="muted" style={{ fontSize: 12 }}>
              {money(price)} comes out of your Spending Cash Account now and we hold it. The
              influencer has {offer.response_days} day{offer.response_days === 1 ? "" : "s"} to take it
              on and {offer.delivery_days} to deliver. You get it all back if neither happens.
            </p>

            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" style={gold} disabled={busy} onClick={submit}>
                {busy ? "Ordering…" : `Pay ${money(price)}`}
              </button>
              <button className="btn" style={ghost} onClick={onClose}>{t("cancel")}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---- My Gigs: both sides ---------------------------------------------------------------------

export function MyVideoAdGigsPage() {
  const { t } = useT();
  const { user, isLoggedIn } = useSession();
  const userId = user?.id ?? 0;
  const cameFromGigs = useLocation().state?.from === "gigs";

  const [bought, setBought] = useState<GigOrder[] | null>(null);
  const [cashAccount, setCashAccount] = useState(0);
  const [mine, setMine] = useState<GigCard | null>(null);
  const [work, setWork] = useState<GigOrder[]>([]);
  const [offer, setOffer] = useState<GigOffer | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const reload = useCallback(() => {
    if (!userId) return;
    fetchMyVideoAdGigOrders(userId)
      .then((r) => { setBought(r.orders); setCashAccount(r.cashAccount); if (r.offer) setOffer(r.offer); })
      .catch(() => setBought([]));
    fetchMyVideoAdGig(userId)
      .then((r) => { setMine(r.gig); setWork(r.orders); setEnabled(r.enabled); if (r.offer) setOffer(r.offer); })
      .catch(() => { /* the buyer half still works without this */ });
  }, [userId]);

  useEffect(reload, [reload]);

  const run = async (fn: () => Promise<string>) => {
    setError(""); setNotice("");
    try { setNotice(await fn()); reload(); }
    catch (e) { setError(e instanceof Error ? e.message : "That didn't work."); }
  };

  if (!isLoggedIn) return <div className="page"><p className="soft">{t("please_sign_in_to_see_your_gigs")}</p></div>;

  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h1 className="page-title">{t("gig_my_gigs")}</h1>
        {!cameFromGigs && <Link to="/gigs" state={{ from: "my-gigs" }} className="btn small" style={ghost}>{t("video_ad_gig")}</Link>}
      </div>

      {!enabled && <p className="soft">{t("gig_not_open")}</p>}
      {notice && <div className="card pad" style={{ marginBottom: 12, borderColor: "var(--gold-border)" }}><p style={{ margin: 0, color: "var(--gold)" }}>{notice}</p></div>}
      {error && <Notice error>{error}</Notice>}

      {/* Steve, 2026-10-17: "This member is an influencer that is trying to sell gigs. Please
          remove Ads I bought, no need for that. Just leave Ads i sold and list all the gigs he
          sold if any." The seller's page, no tabs — but a member who HAS bought one still sees
          it underneath, because Accept is what pays the influencer and the only way to get the
          finished video. */}
      <MyListing gig={mine} offer={offer} userId={userId} onSaved={(m) => { setNotice(m); reload(); }} />
      <h2 style={{ fontSize: 16, marginTop: 18, color: "var(--gold)" }}>{t("gig_tab_working")}</h2>
      {work.length === 0 && <p className="soft">{t("no_gigs_sold_yet")}</p>}
      <div style={{ display: "grid", gap: 10 }}>
        {work.map((o) => (
          <WorkRow key={o.id} order={o} userId={userId}
                   onRespond={(a) => run(() => respondVideoAdGigOrder(userId, o.id, a))}
                   onDelivered={(m) => { setNotice(m); reload(); }} />
            ))}
      </div>
      {bought !== null && bought.length > 0 && (
        <>
          <h2 style={{ fontSize: 16, marginTop: 24, color: "var(--gold)" }}>{t("gig_tab_bought")}</h2>
          <p className="muted" style={{ fontSize: 12 }}>Spending Cash Account: {money(cashAccount)}</p>
          <div style={{ display: "grid", gap: 10 }}>
            {(bought ?? []).map((o) => (
              <OrderRow key={o.id} order={o}
                        onAccept={() => run(() => acceptVideoAdGigOrder(userId, o.id))}
                        onCancel={() => run(() => cancelVideoAdGigOrder(userId, o.id))} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function OrderRow({ order, onAccept, onCancel }: { order: GigOrder; onAccept: () => void; onCancel: () => void }) {
  const { t } = useT();
  return (
    <div className="card pad">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 800 }}>{order.seconds}-second ad · {money(order.price)}</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {order.other_name ?? "—"} · {order.order_number}
          </div>
        </div>
        <div className="soft" style={{ fontSize: 13 }}>{order.status_label}</div>
      </div>

      {order.brief && <p className="soft" style={{ fontSize: 13, marginTop: 8, whiteSpace: "pre-wrap" }}>{order.brief}</p>}

      {order.video && (
        <video src={mediaUrl(order.video)} controls playsInline preload="metadata"
               style={{ width: "100%", maxWidth: 320, marginTop: 10, borderRadius: 10, background: "#000" }} />
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        {order.status === "delivered" && <button className="btn small" style={gold} onClick={onAccept}>{t("accept_this_ad")}</button>}
        {order.status === "delivered" && order.video && (
          <a className="btn small" style={ghost} href={mediaUrl(order.video)} download target="_blank" rel="noopener">{t("download")}</a>
        )}
        {order.status === "pending" && <button className="btn small" style={ghost} onClick={onCancel}>{t("cancel_refund")}</button>}
        {order.status === "completed" && order.video && (
          <a className="btn small" style={ghost} href={mediaUrl(order.video)} download target="_blank" rel="noopener">{t("download")}</a>
        )}
      </div>

      {order.status === "delivered" && order.auto_accept_at && (
        <p className="muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
          If you don't accept it, this accepts itself on {String(order.auto_accept_at).slice(0, 10)}.
        </p>
      )}
      {order.refund_amount > 0 && (
        <p className="muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
          {money(order.refund_amount)} was put back in your Cash Account{order.cancel_reason ? ` — ${order.cancel_reason}` : ""}.
        </p>
      )}
    </div>
  );
}

function WorkRow({ order, userId, onRespond, onDelivered }: {
  order: GigOrder; userId: number; onRespond: (a: "accept" | "decline") => void; onDelivered: (m: string) => void;
}) {
  const { t } = useT();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  const deliver = async () => {
    if (!file) return;
    setBusy(true); setError(""); setProgress(0);
    try {
      onDelivered(await deliverVideoAdGigOrder(userId, order.id, file, setProgress));
      setFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't deliver that.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card pad" style={order.is_late ? { borderColor: "#f55" } : undefined}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 800 }}>
            {order.seconds}-second ad · you earn {money(order.influencer_amount)}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            For {order.other_name ?? "—"}{order.business_name ? ` · ${order.business_name}` : ""} · {order.order_number}
          </div>
        </div>
        <div className="soft" style={{ fontSize: 13 }}>{order.is_late ? "Late" : order.status_label}</div>
      </div>

      {order.brief && <p className="soft" style={{ fontSize: 13, marginTop: 8, whiteSpace: "pre-wrap" }}>{order.brief}</p>}

      {order.status === "pending" && (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button className="btn small" style={gold} onClick={() => onRespond("accept")}>{t("take_this_gig")}</button>
          <button className="btn small" style={ghost} onClick={() => onRespond("decline")}>{t("no_thanks")}</button>
        </div>
      )}

      {(order.status === "accepted" || order.status === "delivered") && (
        <div style={{ marginTop: 10 }}>
          <input type="file" accept="video/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <button className="btn small" style={{ ...gold, marginLeft: 8 }} disabled={!file || busy} onClick={deliver}>
            {busy ? `Uploading ${Math.round(progress * 100)}%` : order.status === "delivered" ? "Send a new cut" : "Deliver the ad"}
          </button>
          {error && <Notice error>{error}</Notice>}
          {order.due_at && order.status === "accepted" && (
            <p className="muted" style={{ fontSize: 12, marginTop: 6, marginBottom: 0 }}>
              Due {String(order.due_at).slice(0, 10)}.
            </p>
          )}
        </div>
      )}

      {order.status === "completed" && (
        <p className="muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
          Paid — {money(order.influencer_amount)} is in your earnings.
        </p>
      )}
    </div>
  );
}

/** The influencer's own listing: apply, or replace the pitch video. */
function MyListing({ gig, offer, userId, onSaved }: {
  gig: GigCard | null; offer: GigOffer | null; userId: number; onSaved: (message: string) => void;
}) {
  const { t } = useT();
  const [headline, setHeadline] = useState("");
  const [about, setAbout] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setHeadline(gig?.headline ?? "");
    setAbout(gig?.about ?? "");
  }, [gig]);

  const save = async () => {
    setBusy(true); setError(""); setProgress(0);
    try {
      const r = await applyForVideoAdGig(userId, { headline, about, video: file }, setProgress);
      setFile(null); setEditing(false);
      onSaved(r.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send that.");
    } finally {
      setBusy(false);
    }
  };

  const statusLine: Record<string, string> = {
    pending_review: "Waiting for us to look at it.",
    approved: "You're on the Video Ad Gig page.",
    rejected: "Not approved.",
    suspended: "Paused.",
  };

  if (gig && !editing) {
    return (
      <div className="card pad">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900, color: "var(--gold)" }}>{gig.headline}</div>
          <div className="soft" style={{ fontSize: 13 }}>{statusLine[gig.status ?? ""] ?? gig.status}</div>
        </div>
        {gig.rejected_reason && <p style={{ color: "#f55", fontSize: 13 }}>{gig.rejected_reason}</p>}
        {gig.about && <p className="soft" style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{gig.about}</p>}
        {gig.video && (
          <video src={mediaUrl(gig.video)} controls playsInline preload="metadata"
                 style={{ width: "100%", maxWidth: 240, borderRadius: 10, background: "#000" }} />
        )}
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          {gig.completed_count} ad{gig.completed_count === 1 ? "" : "s"} finished
          {offer ? ` · you earn ${offer.influencer_share_percent}% of every gig` : ""}
        </div>
        <button className="btn small" style={{ ...ghost, marginTop: 10 }} onClick={() => setEditing(true)}>{t("change_my_video_or_pitch")}</button>
      </div>
    );
  }

  return (
    <div className="card pad">
      <div style={{ fontWeight: 900, color: "var(--gold)", marginBottom: 6 }}>
        {gig ? "Change my pitch" : "Make video ads for members"}
      </div>
      {!gig && offer && (
        <p className="soft" style={{ fontSize: 13 }}>
          Put up a short video telling buyers why they should pick you. You earn{" "}
          {offer.influencer_share_percent}% of every gig — that's{" "}
          {offer.prices.map((p) => money(p.price * offer.influencer_share_percent / 100)).join(" / ")}{" "}
          for a {offer.prices.map((p) => p.seconds).join(" / ")}-second ad.
        </p>
      )}

      <label className="soft" style={{ fontSize: 13 }}>{t("your_one_line")}</label>
      <input className="input" value={headline} maxLength={120} placeholder={t("i_make_ads_that_sell")}
             onChange={(e) => setHeadline(e.target.value)} style={{ width: "100%", marginBottom: 10 }} />

      <label className="soft" style={{ fontSize: 13 }}>{t("gig_about_hint")}</label>
      <textarea className="input" rows={4} value={about}
                onChange={(e) => setAbout(e.target.value)} style={{ width: "100%", marginBottom: 10 }} />

      <label className="soft" style={{ fontSize: 13 }}>{t("your_pitch_video")}</label>
      <input type="file" accept="video/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={{ display: "block", marginBottom: 10 }} />

      {error && <Notice error>{error}</Notice>}

      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn" style={gold} disabled={busy || !headline.trim() || (!gig && !file)} onClick={save}>
          {busy ? (progress > 0 ? `Uploading ${Math.round(progress * 100)}%` : "Sending…") : gig ? "Send for review" : "Apply"}
        </button>
        {gig && <button className="btn" style={ghost} onClick={() => setEditing(false)}>{t("cancel")}</button>}
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 10, marginBottom: 0 }}>
        {t("gig_pitch_note")}</p>
    </div>
  );
}
