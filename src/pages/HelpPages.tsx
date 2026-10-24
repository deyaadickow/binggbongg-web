// Help (Steve, 2026-10-23). A member in trouble uploads a 60-second video and asks for GIFTS.
//
// The web carries this first on purpose: it is the only surface with no review gate, so Help can
// be live on launch day while the phone builds work their way through Apple and Google. Steve:
// "This feature will be one of the talking points that every one is going to share."
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { mediaUrl, type Post } from "../lib/api";
import { useSession } from "../lib/session";
import { useT } from "../lib/i18n";
import { Loading, Notice } from "../components/Common";
import { PageTitle } from "../components/PageTitle";
import { PostGiftButton } from "../components/GiftSheet";

import { createUploadUrls, putToSignedUrl, videoDuration, videoThumbnail } from "../lib/upload";
import {
  createHelpCampaign, fetchHelpCampaign, fetchHelpCampaigns,
  fetchHelpStatus, giftToHelpCampaign,
  type HelpCampaign, type HelpContributor, type HelpStatus,
} from "../lib/help";

/** Coins -> dollars at the live gift rate is a server concern; the UI shows coins, as the app does. */
function coins(n: number): string {
  return n.toLocaleString();
}

function CampaignCard({ c }: { c: HelpCampaign }) {
  return (
    <Link to={`/help/${c.id}`} className="card pad" style={{ display: "block", marginBottom: 12, textDecoration: "none" }}>
      <div className="row" style={{ gap: 10 }}>
        {c.profile_image && (
          <img src={mediaUrl(c.profile_image)} alt="" width={44} height={44}
               style={{ borderRadius: "50%", objectFit: "cover", flexShrink: 0,
                        border: "1.5px solid var(--gold-border)" }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, color: "var(--gold)", overflow: "hidden",
                        textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {c.fullname || c.username || "—"}
          </div>
          <div className="muted" style={{ fontSize: 13 }}>
            {c.days_left > 0 ? `${c.days_left} days left` : "Closing today"}
            {" · "}
            <b style={{ color: "var(--gold)", fontVariantNumeric: "tabular-nums" }}>{coins(c.raised_coins)}</b> coins
          </div>
        </div>
      </div>
      {c.post?.thumbnail && (
        <img src={mediaUrl(c.post.thumbnail)} alt="" loading="lazy"
             style={{ width: "100%", maxHeight: 260, objectFit: "cover", borderRadius: 10,
                      marginTop: 10, display: "block", border: "1px solid var(--gold-border)" }} />
      )}
      {c.description && (
        <div className="soft" style={{ fontSize: 14, marginTop: 8, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {c.description}
        </div>
      )}
    </Link>
  );
}

/** The Help tab in the directory. */
export function HelpListPage() {
  const { t } = useT();
  const [rows, setRows] = useState<HelpCampaign[] | null>(null);
  const { user } = useSession();
  const [status, setStatus] = useState<HelpStatus | null>(null);

  useEffect(() => {
    fetchHelpCampaigns(0, 30).then((r) => setRows(r.rows));
    if (user) fetchHelpStatus(user.id).then(setStatus);
  }, [user?.id]);

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <PageTitle>Help</PageTitle>
      <div className="card pad" style={{ marginBottom: 12 }}>
        <div className="soft" style={{ fontSize: 14 }}>
          {t("help_intro")}
        </div>
        {/* Only offered when the server says they may. blocked_reason is its wording, not ours. */}
        {status && !status.blocked_reason && (
          <Link to="/help/start" className="btn gold small" style={{ marginTop: 10 }}>{t("help_ask_for_help")}</Link>
        )}
        {status?.blocked_reason && status.campaign && (
          <Link to={`/help/${status.campaign.id}`} className="btn small ghost" style={{ marginTop: 10 }}>
            Your Help campaign
          </Link>
        )}
      </div>

      {/* The server's own sentence, shown the way the phones show it — it is the only place a
          member learns why they cannot ask (the country list, a fraud ban, the lockout). The web
          had been dropping it silently on this page and only showing it on /help/start. */}
      {status?.blocked_reason && !status.campaign && (
        <div style={{ marginBottom: 12 }}><Notice>{status.blocked_reason}</Notice></div>
      )}

      {rows === null ? <Loading /> : rows.length === 0 ? (
        <Notice>Nobody is asking for help right now.</Notice>
      ) : rows.map((c) => <CampaignCard key={c.id} c={c} />)}
    </div>
  );
}

/** One campaign: the video, the story, the gift button, and who has given. */
export function HelpCampaignPage() {
  const { id } = useParams();
  const campaignId = Number(id);
  const navigate = useNavigate();
  const { user, isLoggedIn } = useSession();
  const [c, setC] = useState<HelpCampaign | null | "missing">(null);
  const [givers, setGivers] = useState<HelpContributor[]>([]);
  const [anon, setAnon] = useState(false);
  const [note, setNote] = useState("");

  const load = useCallback(() => {
    if (!Number.isFinite(campaignId)) { setC("missing"); return; }
    fetchHelpCampaign(campaignId).then((r) => {
      setC(r ?? "missing");
      if (r) setGivers(r.contributors ?? []);
    });
  }, [campaignId]);
  useEffect(() => { load(); }, [load]);

  if (c === null) return <div className="page"><Loading /></div>;
  if (c === "missing") return <div className="page"><Notice>That Help campaign couldn't be found.</Notice></div>;

  const mine = user?.id === c.user_id;
  // GiftSheet only reads id and user_id off a post, and user_id is what makes it hide the button
  // on your own — which is exactly the rule here too.
  const asPost = { id: c.post_id ?? 0, user_id: c.user_id } as Post;

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <PageTitle>{c.fullname || c.username || "Help"}</PageTitle>

      <div className="card pad" style={{ marginBottom: 12 }}>
        <div className="muted" style={{ fontSize: 13 }}>
          {c.status === "active"
            ? (c.days_left > 0 ? `${c.days_left} days left` : "Closing today")
            : "This campaign has closed"}
        </div>
        <div style={{ fontSize: 22, marginTop: 6, fontWeight: 800, color: "var(--gold)",
                      fontVariantNumeric: "tabular-nums" }}>
          {coins(c.raised_coins)} <span style={{ fontSize: 14, fontWeight: 600 }}>coins received</span>
          {c.goal_amount ? <span className="muted"> · goal ${c.goal_amount.toLocaleString()}</span> : null}
        </div>
        {c.description && <div className="soft" style={{ fontSize: 14, marginTop: 10, whiteSpace: "pre-wrap" }}>{c.description}</div>}

        <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          {c.post_id != null && <Link className="btn small ghost" to={`/video/${c.post_id}`}>Watch the video</Link>}
          {c.is_open && isLoggedIn && !mine && (
            <PostGiftButton
              post={asPost}
              className="btn gold small"
              sendOverride={async (price) => {
                const res = await giftToHelpCampaign(user!.id, c.id, price, anon);
                if (res.status) { setNote("Your gift was sent."); load(); }
                return res;
              }}
            />
          )}
        </div>

        {c.is_open && isLoggedIn && !mine && (
          <label className="row" style={{ gap: 8, marginTop: 10, fontSize: 13 }}>
            <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} />
            <span className="soft">Give without showing my name</span>
          </label>
        )}
        {!isLoggedIn && <Notice>Sign in to send a gift.</Notice>}
        {mine && <div className="muted" style={{ fontSize: 13, marginTop: 10 }}>This is your campaign.</div>}
        {note && <div className="soft" style={{ fontSize: 13, marginTop: 8 }}>{note}</div>}
      </div>

      <div className="card pad">
        <div className="card-title" style={{ marginBottom: 8 }}>Who has helped</div>
        {givers.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>No gifts yet.</div>
        ) : givers.map((g, i) => (
          <div key={`${g.user_id ?? "anon"}-${i}`} className="row" style={{ gap: 10, padding: "8px 0", borderTop: i ? "1px solid var(--line)" : undefined }}>
            {g.profile_image
              ? <img src={mediaUrl(g.profile_image)} alt="" width={32} height={32} style={{ borderRadius: "50%", objectFit: "cover", border: "1px solid var(--gold-border)" }} />
              : <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#1a1a1a" }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              {g.user_id
                ? <Link to={`/profile/${g.user_id}`} style={{ fontWeight: 600 }}>{g.fullname}</Link>
                : <span style={{ fontWeight: 600 }} className="soft">{g.fullname}</span>}
            </div>
            <div style={{ fontVariantNumeric: "tabular-nums", fontWeight: 800, color: "var(--gold)" }}>{coins(g.total_coins)}</div>
          </div>
        ))}
      </div>

      <button className="btn small ghost" style={{ marginTop: 12 }} onClick={() => navigate("/help")}>All Help</button>
    </div>
  );
}

/** Start a campaign: upload the video, then open it. Reached from Settings, as Steve specified. */
export function StartHelpPage() {
  const { user } = useSession();
  const navigate = useNavigate();
  const [status, setStatus] = useState<HelpStatus | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [goal, setGoal] = useState("");
  const [stage, setStage] = useState("");
  const [err, setErr] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (user) fetchHelpStatus(user.id).then(setStatus); }, [user?.id]);

  async function submit() {
    if (!user || !file) return;
    setErr(""); setStage("Checking the video…");
    try {
      const seconds = await videoDuration(file);
      const max = status?.video_seconds ?? 60;
      // Checked here as well as server-side so a member does not wait through a whole upload to
      // be told the video is too long.
      if (seconds > max + 1) { setErr(`Your Help video can be up to ${max} seconds. That one is ${Math.round(seconds)}.`); setStage(""); return; }

      setStage("Uploading…");
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const [videoSlot, thumbSlot] = await createUploadUrls(user.id, [
        { file_name: safe, content_type: file.type || "video/mp4" },
        { file_name: safe.replace(/\.[^.]+$/, "") + "-thumb.jpg", content_type: "image/jpeg" },
      ]);
      if (!videoSlot || !thumbSlot) throw new Error("Couldn't prepare the upload.");
      await putToSignedUrl(videoSlot, file);
      const thumb = await videoThumbnail(file);
      await putToSignedUrl(thumbSlot, new File([thumb], "thumb.jpg", { type: "image/jpeg" }));

      // One call, not two. createHelpCampaign takes the S3 keys and creates the post itself —
      // it must NOT go through uploadPost, which requires a contest_cat_id this screen has no
      // category to supply.
      setStage("Starting your campaign…");
      const made = await createHelpCampaign(
        user.id,
        { videoKey: videoSlot.key, thumbKey: thumbSlot.key },
        description,
        goal ? Number(goal) : null,
      );
      if (!made.status) throw new Error(made.message ?? "Couldn't start your campaign.");
      navigate("/help");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setStage("");
    }
  }

  if (!user) return <div className="page"><Notice>Sign in first.</Notice></div>;
  if (!status) return <div className="page"><Loading /></div>;
  // The server's sentence, verbatim. It knows whether the feature is on, whether this member is
  // blocked, whether their country is in, and when their 90 days are up.
  if (status.blocked_reason) return <div className="page"><Notice>{status.blocked_reason}</Notice></div>;

  return (
    <div className="page" style={{ maxWidth: 640 }}>
      <PageTitle>Ask for help</PageTitle>
      <div className="card pad">
        <div className="soft" style={{ fontSize: 14 }}>
          Record up to {status.video_seconds} seconds telling people what you are going through and
          what you need. It stays up for {status.campaign_days} days, and anyone in the world can
          send you a gift.
        </div>

        <input ref={inputRef} type="file" accept="video/*" style={{ display: "none" }}
               onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button className="btn small ghost" style={{ marginTop: 12 }} onClick={() => inputRef.current?.click()}>
          {file ? file.name : "Choose your video"}
        </button>

        <div style={{ marginTop: 12 }}>
          <label className="muted" style={{ fontSize: 12 }}>Your story (optional — it can be translated for readers in other languages)</label>
          <textarea className="form-control" rows={5} value={description}
                    onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div style={{ marginTop: 12 }}>
          <label className="muted" style={{ fontSize: 12 }}>Goal amount (optional)</label>
          <input className="form-control" inputMode="decimal" value={goal}
                 onChange={(e) => setGoal(e.target.value.replace(/[^0-9.]/g, ""))} />
        </div>

        <button className="btn" style={{ marginTop: 16 }} disabled={!file || !!stage} onClick={submit}>
          {stage || "Start my Help campaign"}
        </button>
        {err && <div className="soft" style={{ fontSize: 13, marginTop: 10 }}>{err}</div>}
      </div>
    </div>
  );
}
