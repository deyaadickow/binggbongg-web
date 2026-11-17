// Q&A on a profile (Steve, 2026-11-17: "All" — TikTok-style features). Viewers ask the member a
// question (150 characters at most) and see the questions with the answer videos; on your OWN
// profile the unanswered ones come first, each with "Answer with video" — the normal upload page
// and camera, the question shown as a white speech bubble, uploaded with answer_question_id.
// ⋯ removes a question (the creator, or the member who asked it).
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { mediaUrl } from "../lib/api";
import { useT } from "../lib/i18n";
import { Avatar, Loading } from "./Common";
import { showGoldAlert, showGoldConfirm } from "./GoldToast";
import { askQuestion, deleteProfileQuestion, fetchProfileQuestions, QUESTION_MAX, QUESTION_MIN, type QaQuestion } from "../lib/qa";

export function QaPanel({ creatorId, creatorName, isMe, myId, onCount }: {
  creatorId: number;
  creatorName: string;
  isMe: boolean;
  /** The member looking (the dev mock's pretend member on the dev server); null for a guest. */
  myId: number | null;
  onCount?: (n: number) => void;
}) {
  const { t } = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const [rows, setRows] = useState<QaQuestion[] | null>(null);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [menu, setMenu] = useState(0);

  useEffect(() => {
    let alive = true;
    setRows(null);
    setError("");
    fetchProfileQuestions(creatorId, myId)
      .then((r) => { if (alive) { setRows(r.rows); onCount?.(r.total); } })
      .catch((e) => { if (alive) { setRows([]); setError((e as Error).message || t("qa_load_failed")); } });
    return () => { alive = false; };
  }, [creatorId, myId]); // eslint-disable-line react-hooks/exhaustive-deps

  function signIn() {
    navigate("/login", { state: { from: location.pathname + location.search } });
  }

  async function ask() {
    if (!myId) { signIn(); return; }
    const q = text.trim();
    if (q.length < QUESTION_MIN) { showGoldAlert(t("qa_too_short")); return; }
    setSending(true);
    try {
      const row = await askQuestion(myId, creatorId, q.slice(0, QUESTION_MAX));
      setText("");
      setRows((cur) => {
        const next = [{ ...row, is_mine: true }, ...(cur ?? []).filter((x) => x.id !== row.id)];
        onCount?.(next.length);
        return next;
      });
      showGoldAlert(t("qa_sent", creatorName));
    } catch (e) {
      showGoldAlert((e as Error).message || t("something_went_wrong"));
    } finally {
      setSending(false);
    }
  }

  async function remove(q: QaQuestion) {
    setMenu(0);
    if (!myId) return;
    const yes = await showGoldConfirm({ message: t("qa_remove_q"), confirmLabel: t("qa_remove"), cancelLabel: t("cancel"), danger: true });
    if (!yes) return;
    try {
      await deleteProfileQuestion(myId, q.id);
      setRows((cur) => {
        const next = (cur ?? []).filter((x) => x.id !== q.id);
        onCount?.(next.length);
        return next;
      });
    } catch (e) {
      showGoldAlert((e as Error).message || t("something_went_wrong"));
    }
  }

  function answer(q: QaQuestion) {
    document.querySelectorAll("video").forEach((v) => v.pause());
    navigate("/upload", { state: { answerQuestion: {
      id: q.id, question: q.question, asker_name: q.asker?.username || q.asker?.fullname || "",
    } } });
  }

  return (
    <div className="qa-panel">
      {!isMe && (
        <div className="card pad qa-ask">
          <div className="qa-ask-title">{t("qa_ask_title", creatorName)}</div>
          <textarea className="input" rows={2} maxLength={QUESTION_MAX} value={text}
            onChange={(e) => setText(e.target.value)} placeholder={t("qa_ask_placeholder")}
            style={{ width: "100%" }} />
          <div className="row" style={{ alignItems: "center", gap: 10, marginTop: 6 }}>
            <span className="muted" style={{ fontSize: 12, flex: 1 }}>{text.length}/{QUESTION_MAX}</span>
            <button className="btn gold" disabled={sending || (!!myId && text.trim().length < QUESTION_MIN)} onClick={() => void ask()}>
              {sending ? t("qa_sending") : t("qa_ask")}
            </button>
          </div>
        </div>
      )}
      {isMe && <p className="muted" style={{ textAlign: "center", fontSize: 13, margin: "10px 0" }}>{t("qa_own_note")}</p>}

      {rows === null ? <div style={{ padding: "24px 0" }}><Loading /></div>
        : error ? <p className="muted" style={{ padding: "24px 0", textAlign: "center" }}>{error}</p>
        : rows.length === 0 ? (
          <p className="muted" style={{ padding: "24px 0", textAlign: "center" }}>{isMe ? t("qa_none_own") : t("qa_none")}</p>
        ) : (
          <div className="qa-list">
            {rows.map((q) => {
              const canRemove = isMe || q.is_mine;
              return (
                <div key={q.id} className="qa-row">
                  <Link to={q.asker?.id ? `/profile/${q.asker.id}` : "#"} className="qa-avatar"><Avatar user={q.asker ? { ...q.asker, profile_image: q.asker.profile_image ?? undefined } : undefined} /></Link>
                  <div className="qa-body">
                    <div className="qa-who">
                      {q.asker?.id ? <Link to={`/profile/${q.asker.id}`}>@{q.asker.username || q.asker.fullname}</Link> : <span>{t("qa_member")}</span>}
                      {q.is_mine && <span className="qa-you">{t("qa_your_question")}</span>}
                    </div>
                    <div className="qa-question">{q.question}</div>
                    {q.answered && q.answer_post ? (
                      <button type="button" className="qa-answered" onClick={() => navigate(`/video/${q.answer_post!.id}`)}>
                        {q.answer_post.thumbnail ? <img src={mediaUrl(q.answer_post.thumbnail)} alt="" /> : <span className="qa-answered-noimg">▶</span>}
                        <span>✓ {t("qa_answered")}</span>
                      </button>
                    ) : isMe && q.can_answer ? (
                      <button type="button" className="btn small gold" style={{ marginTop: 6 }} onClick={() => answer(q)}>🎥 {t("qa_answer_with_video")}</button>
                    ) : (
                      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{t("qa_waiting")}</div>
                    )}
                  </div>
                  {canRemove && (
                    <div style={{ position: "relative", flexShrink: 0 }}>
                      <button type="button" className="qa-more" aria-label={t("options")} onClick={() => setMenu(menu === q.id ? 0 : q.id)}>⋯</button>
                      {menu === q.id && (
                        <div className="qa-menu">
                          <button type="button" className="btn ghost small" onClick={() => void remove(q)}>{t("qa_remove")}</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}
