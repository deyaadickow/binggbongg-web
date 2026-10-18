import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { giftPrice, mediaUrl, post, type Gift, type Post, type UserSummary } from "../lib/api";
import { useSession } from "../lib/session";
import { loadGifts } from "../lib/gifts";
import { TapTapBurst, isTapTapGift, tapTapBurstDuration, burstLabel } from "./TapTapBurst";
import { tt, useT  } from "../lib/i18n";

/**
 * The gift button on a video, and the gift page it opens.
 *
 * Steve, 2026-10-01: "We need to add gift boxes on all video on for you page on the web." The
 * phones have had this on every feed video from the start (Android BlankFragment's gift icon,
 * iOS ThumbsUpPopup); the web feed had likes and views only. This is the phones' gift page as
 * rebuilt on 2026-10-01: Purchase Coins pill with the balance, then a 3-column grid of square
 * black gold-bordered tiles — image, price, name — twelve to a screen.
 *
 * Sends through sendCoinsToPost exactly as the phones do (my_user_id, coins, post_id). The
 * server refuses gifting your own post and an overdrawn balance; both are also caught here
 * first so the member gets a plain message rather than a round trip.
 */
export function PostGiftButton({ post: item, className = "btn small", onSent, onOpenChange }: { post: Post; className?: string; onSent?: (gift: Gift) => void; onOpenChange?: (open: boolean) => void }) {
  const { t } = useT();
  const { user, isLoggedIn } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const own = !!user && user.id === item.user_id;
  if (own) return null;
  // Steve, 2026-10-14, on his phone: "the gift box is grayed out." He was signed out — a gift
  // needs a signed-in member — but a disabled button whose only explanation is a hover tooltip
  // says nothing on a phone. Signed out, the button now goes to Sign in and brings the member
  // straight back to this video afterwards (LoginPage reads `from`).
  return (
    <>
      <button className={className} title={isLoggedIn ? "Send a gift" : "Sign in to send a gift"}
        onClick={() => {
          if (!isLoggedIn) { navigate("/login", { state: { from: location.pathname + location.search } }); return; }
          setOpen(true);
          onOpenChange?.(true);
        }}>
        {t("gift")}</button>
      {open && <GiftSheet post={item} onClose={() => { setOpen(false); onOpenChange?.(false); }} onSent={onSent} />}
    </>
  );
}

/**
 * The gift shown over the video once it has been sent — iOS ThumbsUpPopup's "You have sent"
 * card (gift image, price, name) for 2.8 seconds. Steve, 2026-10-01: "when i'm giving a gift,
 * it's not showing the gift on top of the video." The host puts this inside the video's own
 * positioned box (the card thumbnail or the video stage), where it fills it.
 */
export function GiftFlash({ gift, onDone }: { gift: Gift; onDone: () => void }) {
  const { t } = useT();
  // Eddie, 2026-09-19 / Steve, 2026-10-06: a TapTap gift bursts one icon per coin instead of
  // showing the single card — and now does so everywhere a gift is given, not just live rooms.
  const burst = isTapTapGift(gift);

  useEffect(() => {
    const t = setTimeout(onDone, burst ? tapTapBurstDuration(gift) : 2800);
    return () => clearTimeout(t);
  }, [gift, onDone, burst]);

  if (burst) return <TapTapBurst gift={gift} />;

  return (
    <div className="gift-flash" aria-live="polite">
      <div className="gift-flash-card">
        <div className="gift-flash-title">{t("you_have_sent")}</div>
        {gift.image ? <img src={mediaUrl(gift.image)} alt="" /> : <span style={{ fontSize: 64 }}>🎁</span>}
        <b>{giftPrice(gift)}</b>
        <span>{gift.name ?? "Gift"}</span>
      </div>
    </div>
  );
}

function GiftSheet({ post: item, onClose, onSent }: { post: Post; onClose: () => void; onSent?: (gift: Gift) => void }) {
  const { t } = useT();
  const { user, refresh } = useSession();
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ text: string; wallet?: boolean } | null>(null);
  // The balance shown (and checked) here is the server's, fetched when the sheet opens — coins
  // bought or received while this tab sat open would otherwise still read as the old number.
  // Fetched into THIS sheet's state, not through the session's refresh(): that swaps the whole
  // session user object, and the video page reloads its post whenever that object changes,
  // which tore this sheet down a second after it opened (Steve, 2026-10-15: "I click on the
  // gift box I see it for one second and disappears").
  const [serverCoins, setServerCoins] = useState<number | null>(null);
  const coins = serverCoins ?? Number(user?.no_redeem_wallet ?? 0);

  useEffect(() => {
    loadGifts().then(setGifts).catch(() => setNotice({ text: "Couldn't load the gifts. Please try again." }));
    if (user) {
      post<UserSummary>("fetchMyUserDetails", { my_user_id: user.id })
        .then((r) => { if (r.status && r.data) setServerCoins(Number(r.data.no_redeem_wallet ?? 0)); })
        .catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function send(gift: Gift) {
    if (!user || busy !== null) return;
    const price = giftPrice(gift);
    if (coins < price) {
      setNotice({ text: `${gift.name ?? "That gift"} is ${price} coins and you have ${coins}.`, wallet: true });
      return;
    }
    setBusy(gift.id);
    try {
      const res = await post("sendCoinsToPost", { my_user_id: user.id, coins: price, post_id: item.id });
      if (!res.status) throw new Error(res.message ?? tt("couldn_t_send_that_gift"));
      await refresh();
      // Close straight away so the gift shows over the video, as the phones do.
      onClose();
      onSent?.(gift);
    } catch (err) {
      setNotice({ text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="modal-backdrop gift-backdrop" onClick={onClose}>
      <div className="modal-sheet gift-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t("send_a_gift")}>
        <div className="row" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0, textAlign: "left" }}>{t("send_a_gift")}</h3>
          <span className="spacer" />
          <button className="btn small ghost" onClick={onClose}>{t("close")}</button>
        </div>
        <Link to="/wallet" className="gift-purchase">
          <span>{t("purchase_votes")}</span>
          <span className="coin" aria-hidden>🪙</span>
          <span className="spacer" />
          <b>{coins}</b>
        </Link>
        {notice && (
          <div className="gift-notice">
            {notice.text}{notice.wallet && <> <Link to="/wallet">{t("buy_coins")}</Link></>}
          </div>
        )}
        <div className="gift-grid">
          {gifts.map((g) => (
            <button key={g.id} onClick={() => send(g)} disabled={busy !== null} className={busy === g.id ? "busy" : ""}>
              {g.image ? <img src={mediaUrl(g.image)} alt="" loading="lazy" /> : <span style={{ fontSize: 30 }}>🎁</span>}
              <b>{giftPrice(g)}</b>
              <span>{g.name ?? "Gift"}</span>
              {burstLabel(g) && <em className="gift-burst-badge">{burstLabel(g)}</em>}
            </button>
          ))}
          {gifts.length === 0 && !notice && <div className="muted" style={{ gridColumn: "1 / -1", textAlign: "center" }}>{t("loading_gifts")}</div>}
        </div>
      </div>
    </div>
  );
}
