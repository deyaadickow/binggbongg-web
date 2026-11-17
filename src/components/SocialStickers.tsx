// The stickers a video can carry (Steve, 2026-11-17): a poll, an "Add Yours" chain, a link, and —
// when the video answers a comment — that comment as a white speech bubble. Drawn over the video
// on the video page at the creator's chosen spot (x, y from 0 to 1).
import { useEffect, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "../lib/session";
import { useT } from "../lib/i18n";
import { showGoldAlert, showGoldConfirm } from "./GoldToast";
import {
  fetchPollResults, linkDomain, socialUser, votePoll,
  type AddYours, type LinkSticker, type Poll, type ReplyComment, type SocialPost,
} from "../lib/social";

const at = (x?: number, y?: number): CSSProperties => ({
  left: `${Math.round((x ?? 0.5) * 100)}%`, top: `${Math.round((y ?? 0.5) * 100)}%`,
});

/** Every sticker the post has, over the video. `hidden` follows the page's "clear the screen". */
export function VideoStickers({ post, hidden }: { post: SocialPost; hidden?: boolean }) {
  if (hidden) return null;
  return (
    <>
      {post.reply_comment && <ReplyBubble reply={post.reply_comment} />}
      {/* Q&A (Steve, 2026-11-17): the question this video answers, as the same white bubble. */}
      {post.qa_question && !post.reply_comment && <QuestionBubble q={post.qa_question} />}
      {post.poll && <PollCard key={`poll-${post.id}`} postId={post.id} initial={post.poll} />}
      {post.link_sticker && <LinkPill link={post.link_sticker} />}
      {post.add_yours && <AddYoursCard ay={post.add_yours} />}
    </>
  );
}

export function ReplyBubble({ reply, preview }: { reply: Pick<ReplyComment, "post_id" | "comment" | "user_name" | "fullname">; preview?: boolean }) {
  const { t } = useT();
  const navigate = useNavigate();
  const name = reply.user_name || reply.fullname || "";
  return (
    <button type="button" className={`reply-bubble${preview ? " preview" : ""}`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => { if (!preview && reply.post_id) navigate(`/video/${reply.post_id}?comments=1`); }}>
      <span className="reply-bubble-head">{t("soc_reply_to_comment", name)}</span>
      <span className="reply-bubble-text">{reply.comment || "…"}</span>
    </button>
  );
}

/** The profile question a video answers ("@name asked" + the question). On the video it opens the
 *  creator's Q&A; on the upload page and the camera it is a preview. */
export function QuestionBubble({ q, preview }: { q: { question: string; user_name?: string; fullname?: string; creator_user_id?: number }; preview?: boolean }) {
  const { t } = useT();
  const navigate = useNavigate();
  const name = q.user_name || q.fullname || "";
  return (
    <button type="button" className={`reply-bubble${preview ? " preview" : ""}`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => { if (!preview && q.creator_user_id) navigate(`/profile/${q.creator_user_id}?tab=qa`); }}>
      <span className="reply-bubble-head">{t("qa_user_asked", name)}</span>
      <span className="reply-bubble-text">{q.question || "…"}</span>
    </button>
  );
}

export function PollCard({ postId, initial, preview, style }: { postId: number; initial: Poll; preview?: boolean; style?: CSSProperties }) {
  const { t } = useT();
  const navigate = useNavigate();
  const { user } = useSession();
  const me = socialUser(user);
  const [state, setPoll] = useState<Poll>(initial);
  // The upload page's preview follows what is being typed.
  const poll = preview ? initial : state;
  const [busy, setBusy] = useState(false);
  const voted = poll.my_vote !== null && poll.my_vote !== undefined;

  // Already voted? Then the results show straight away.
  useEffect(() => {
    if (preview || !me) return;
    let alive = true;
    fetchPollResults(postId, me.id).then((p) => { if (alive && p) setPoll((cur) => ({ ...p, x: cur.x, y: cur.y })); });
    return () => { alive = false; };
  }, [postId, me?.id, preview]); // eslint-disable-line react-hooks/exhaustive-deps

  async function vote(i: number) {
    if (preview || busy) return;
    if (!me) { navigate("/login"); return; }
    setBusy(true);
    try {
      const p = await votePoll(me.id, postId, i);
      setPoll((cur) => ({ ...p, my_vote: p.my_vote ?? i, x: cur.x, y: cur.y }));
    } catch (e) {
      showGoldAlert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const total = Math.max(0, poll.options.reduce((n, o) => n + o.votes, 0));
  return (
    <div className="poll-card" style={style ?? at(poll.x, poll.y)} onPointerDown={(e) => { if (!preview) e.stopPropagation(); }}>
      <div className="poll-q">{poll.question}</div>
      {poll.options.map((o, i) => {
        const pct = total ? Math.round((o.votes / total) * 100) : 0;
        const mine = poll.my_vote === i;
        return voted ? (
          <button key={i} type="button" className={`poll-opt result${mine ? " mine" : ""}`} onClick={() => void vote(i)} disabled={busy}
            aria-label={`${o.text} ${pct}%`}>
            <span className="poll-fill" style={{ width: `${pct}%` }} />
            <span className="poll-text">{mine ? "✓ " : ""}{o.text}</span>
            <span className="poll-pct">{pct}%</span>
          </button>
        ) : (
          <button key={i} type="button" className="poll-opt" onClick={() => void vote(i)} disabled={busy}>{o.text}</button>
        );
      })}
      {voted && <div className="poll-total">{t("soc_n_votes", total)}</div>}
    </div>
  );
}

export function LinkPill({ link, preview, style }: { link: LinkSticker; preview?: boolean; style?: CSSProperties }) {
  const { t } = useT();
  const domain = linkDomain(link);
  async function open() {
    if (preview) return;
    // Pause the video under the popup; the member decides whether to leave.
    document.querySelectorAll("video").forEach((v) => v.pause());
    const yes = await showGoldConfirm({ message: t("soc_leaving", domain), confirmLabel: t("soc_open"), cancelLabel: t("cancel") });
    if (yes) window.open(link.url, "_blank", "noopener,noreferrer");
  }
  return (
    <button type="button" className="link-pill" style={style ?? at(link.x, link.y)}
      onPointerDown={(e) => { if (!preview) e.stopPropagation(); }} onClick={() => void open()}>
      🔗 {link.label?.trim() || domain}
    </button>
  );
}

export function AddYoursCard({ ay, preview }: { ay: AddYours; preview?: boolean }) {
  const { t } = useT();
  const navigate = useNavigate();
  const { user } = useSession();
  const me = socialUser(user);
  return (
    <div className="addyours-card" onPointerDown={(e) => { if (!preview) e.stopPropagation(); }}>
      <button type="button" className="addyours-text" onClick={() => { if (!preview) navigate(`/add-yours/${ay.id}`); }}>
        <span className="addyours-tag">{t("soc_add_yours")}</span>
        <span className="addyours-prompt">{ay.prompt}</span>
        <span className="addyours-count">{t("soc_n_posts", Number(ay.uses || 0))}</span>
      </button>
      <button type="button" className="btn small gold" onClick={() => {
        if (preview) return;
        if (!me) { navigate("/login"); return; }
        navigate("/upload", { state: { addYours: { id: ay.id, prompt: ay.prompt } } });
      }}>{t("soc_add_yours_btn")}</button>
    </div>
  );
}
