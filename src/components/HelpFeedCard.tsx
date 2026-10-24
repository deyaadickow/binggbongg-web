// A Help campaign sitting in the main feed (Steve, 2026-10-23: "we can show one of the help
// videos every 20 to 30 videos shown on main feed").
//
// Styled as an ordinary feed card on purpose. On the phones that is a hard requirement — the
// feed's Auto Scroll once dead-ended on every non-video card it met — and keeping the web the
// same means one mental model rather than three.
import { Link } from "react-router-dom";
import { mediaUrl } from "../lib/api";
import type { HelpCampaign } from "../lib/help";

export function HelpFeedCard({ campaign }: { campaign: HelpCampaign }) {
  return (
    <Link to={`/help/${campaign.id}`} className="card pad" style={{ display: "block", textDecoration: "none" }}>
      <div className="row" style={{ gap: 10 }}>
        {campaign.profile_image && (
          <img src={mediaUrl(campaign.profile_image)} alt="" width={40} height={40}
               style={{ borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: "var(--gold)" }}>Help</div>
          <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {campaign.fullname || campaign.username || ""}
          </div>
        </div>
      </div>
      {/* The video's own still, now that the campaign carries its post. Without it this read as
          a text notice in a feed of videos, which is not what it is. */}
      {campaign.post?.thumbnail && (
        <img src={mediaUrl(campaign.post.thumbnail)} alt="" loading="lazy"
             style={{ width: "100%", maxHeight: 320, objectFit: "cover", borderRadius: 10, marginTop: 10, display: "block" }} />
      )}
      {campaign.description && (
        <div className="soft" style={{ fontSize: 13, marginTop: 8, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {campaign.description}
        </div>
      )}
      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        {campaign.days_left > 0 ? `${campaign.days_left} days left` : "Closing today"} · {campaign.raised_coins.toLocaleString()} coins
      </div>
    </Link>
  );
}
