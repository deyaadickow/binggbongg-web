import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { giftPrice, mediaUrl, post, type Gift, type Post } from "../lib/api";
import { useSession } from "../lib/session";
import { loadGifts } from "../lib/gifts";

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
export function PostGiftButton({ post: item, className = "btn small" }: { post: Post; className?: string }) {
  const { user, isLoggedIn } = useSession();
  const [open, setOpen] = useState(false);
  const own = !!user && user.id === item.user_id;
  if (own) return null;
  return (
    <>
      <button className={className} onClick={() => setOpen(true)} disabled={!isLoggedIn} title={isLoggedIn ? "Send a gift" : "Sign in to send a gift"}>
        🎁 Gift
      </button>
      {open && <GiftSheet post={item} onClose={() => setOpen(false)} />}
    </>
  );
}

function GiftSheet({ post: item, onClose }: { post: Post; onClose: () => void }) {
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
      setNotice({ text: `Sent ${gift.name ?? "a gift"} (${price} coins). Thank you!` });
      setTimeout(onClose, 1400);
    } catch (err) {
      setNotice({ text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
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
