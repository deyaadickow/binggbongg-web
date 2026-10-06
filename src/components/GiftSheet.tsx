import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { giftPrice, mediaUrl, post, type Gift, type Post } from "../lib/api";
import { useSession } from "../lib/session";
import { loadGifts } from "../lib/gifts";
import { TapTapBurst, isTapTapGift, tapTapBurstDuration } from "./TapTapBurst";

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
export function PostGiftButton({ post: item, className = "btn small", onSent }: { post: Post; className?: string; onSent?: (gift: Gift) => void }) {
  const { user, isLoggedIn } = useSession();
  const [open, setOpen] = useState(false);
  const own = !!user && user.id === item.user_id;
  if (own) return null;
  return (
    <>
      <button className={className} onClick={() => setOpen(true)} disabled={!isLoggedIn} title={isLoggedIn ? "Send a gift" : "Sign in to send a gift"}>
        🎁 Gift
      </button>
      {open && <GiftSheet post={item} onClose={() => setOpen(false)} onSent={onSent} />}
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
        <div className="gift-flash-title">You have sent</div>
        {gift.image ? <img src={mediaUrl(gift.image)} alt="" /> : <span style={{ fontSize: 64 }}>🎁</span>}
        <b>{giftPrice(gift)}</b>
        <span>{gift.name ?? "Gift"}</span>
      </div>
    </div>
  );
}

function GiftSheet({ post: item, onClose, onSent }: { post: Post; onClose: () => void; onSent?: (gift: Gift) => void }) {
  const { user, refresh } = useSession();
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ text: string; wallet?: boolean } | null>(null);
  const coins = user?.no_redeem_wallet ?? 0;

  useEffect(() => {
    loadGifts().then(setGifts).catch(() => setNotice({ text: "Couldn't load the gifts. Please try again." }));
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
      if (!res.status) throw new Error(res.message ?? "Couldn't send that gift.");
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
      <div className="modal-sheet gift-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Send a gift">
        <div className="row" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0, textAlign: "left" }}>Send a gift</h3>
          <span className="spacer" />
          <button className="btn small ghost" onClick={onClose}>Close</button>
        </div>
        <Link to="/wallet" className="gift-purchase">
          <span>Purchase Coins</span>
          <span className="coin" aria-hidden>🪙</span>
          <span className="spacer" />
          <b>{coins}</b>
        </Link>
        {notice && (
          <div className="gift-notice">
            {notice.text}{notice.wallet && <> <Link to="/wallet">Buy coins</Link></>}
          </div>
        )}
        <div className="gift-grid">
          {gifts.map((g) => (
            <button key={g.id} onClick={() => send(g)} disabled={busy !== null} className={busy === g.id ? "busy" : ""}>
              {g.image ? <img src={mediaUrl(g.image)} alt="" loading="lazy" /> : <span style={{ fontSize: 30 }}>🎁</span>}
              <b>{giftPrice(g)}</b>
              <span>{g.name ?? "Gift"}</span>
            </button>
          ))}
          {gifts.length === 0 && !notice && <div className="muted" style={{ gridColumn: "1 / -1", textAlign: "center" }}>Loading gifts…</div>}
        </div>
      </div>
    </div>
  );
}
