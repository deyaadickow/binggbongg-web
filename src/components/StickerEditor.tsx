// The "Stickers" row on the upload page (Steve, 2026-11-17): a Poll, an "Add Yours" and a Link —
// one of each per video — and a small 9:16 preview where the poll and the link are dragged to
// where they should sit over the video. Joining someone's Add Yours and replying to a comment show
// here too, as they will look.
import { useEffect, useRef, useState } from "react";
import { useT } from "../lib/i18n";
import { validHttpsUrl, type ReplyComment } from "../lib/social";
import { AddYoursCard, LinkPill, PollCard, ReplyBubble } from "./SocialStickers";

export interface StickerState {
  poll: { on: boolean; question: string; options: string[]; x: number; y: number };
  addYours: { on: boolean; prompt: string };
  link: { on: boolean; url: string; label: string; x: number; y: number };
}
export const EMPTY_STICKERS: StickerState = {
  poll: { on: false, question: "", options: ["", ""], x: 0.5, y: 0.3 },
  addYours: { on: false, prompt: "" },
  link: { on: false, url: "https://", label: "", x: 0.5, y: 0.62 },
};

/** "" when the stickers are fine to send, else what to fix. */
export function stickerProblem(s: StickerState, t: (k: "soc_poll_needs" | "soc_link_https" | "soc_add_yours_needs") => string): string {
  if (s.poll.on && (!s.poll.question.trim() || s.poll.options.filter((o) => o.trim()).length < 2)) return t("soc_poll_needs");
  if (s.addYours.on && !s.addYours.prompt.trim()) return t("soc_add_yours_needs");
  if (s.link.on && !validHttpsUrl(s.link.url)) return t("soc_link_https");
  return "";
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** The uploadPost params for the stickers that are on. */
export function stickerParams(s: StickerState, joinId?: number | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (s.poll.on) {
    out.poll_question = s.poll.question.trim().slice(0, 100);
    out.poll_options = JSON.stringify(s.poll.options.map((o) => o.trim().slice(0, 40)).filter(Boolean).slice(0, 4));
    out.poll_x = r3(s.poll.x); out.poll_y = r3(s.poll.y);
  }
  if (joinId) out.add_yours_id = joinId;
  else if (s.addYours.on) out.add_yours_prompt = s.addYours.prompt.trim().slice(0, 80);
  if (s.link.on) {
    out.link_url = s.link.url.trim();
    if (s.link.label.trim()) out.link_label = s.link.label.trim().slice(0, 40);
    out.link_x = r3(s.link.x); out.link_y = r3(s.link.y);
  }
  return out;
}

export function StickerEditor({ value, onChange, file, join, reply, open: openInitially }: {
  value: StickerState;
  onChange: (s: StickerState) => void;
  file: File | null;
  /** Joining someone's Add Yours (from its card or page). */
  join?: { id: number; prompt: string } | null;
  /** The comment this video answers. */
  reply?: Pick<ReplyComment, "id" | "post_id" | "comment" | "user_name" | "fullname"> | null;
  open?: boolean;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(!!openInitially);
  useEffect(() => {
    if (!openInitially) return;
    setOpen(true);
    // The directory's "Polls & stickers" tile lands here: bring the row into view.
    const timer = window.setTimeout(() => document.getElementById("stickers")?.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
    return () => window.clearTimeout(timer);
  }, [openInitially]);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<"poll" | "link" | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  useEffect(() => {
    if (!file) { setVideoUrl(""); return; }
    const u = URL.createObjectURL(file);
    setVideoUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  // Two changes in one tick (two quick taps) must not undo each other: merge into the latest.
  const latest = useRef(value);
  latest.current = value;
  const set = (patch: Partial<StickerState>) => { latest.current = { ...latest.current, ...patch }; onChange(latest.current); };
  const any = value.poll.on || value.addYours.on || value.link.on || !!join || !!reply;

  function move(e: React.PointerEvent) {
    const which = drag.current;
    const el = box.current;
    if (!which || !el) return;
    const r = el.getBoundingClientRect();
    const x = Math.max(0.1, Math.min(0.9, (e.clientX - r.left) / r.width));
    const y = Math.max(0.08, Math.min(0.92, (e.clientY - r.top) / r.height));
    if (which === "poll") set({ poll: { ...value.poll, x, y } });
    else set({ link: { ...value.link, x, y } });
  }

  const chip = (on: boolean, label: string, toggle: () => void, disabled?: boolean) => (
    <button type="button" className={`sticker-chip${on ? " on" : ""}`} onClick={toggle} disabled={disabled} aria-pressed={on}>{label}</button>
  );

  return (
    <div className="card pad" id="stickers" style={{ marginBottom: 12 }}>
      <button type="button" className="row" onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", background: "none", border: 0, padding: 0, cursor: "pointer", color: "var(--gold)", fontWeight: 800, fontSize: 15 }}>
        <span style={{ flex: 1, textAlign: "left" }}>✨ {t("soc_stickers")}</span>
        <span>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <>
          <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            {chip(value.poll.on, `📊 ${t("soc_poll")}`, () => set({ poll: { ...value.poll, on: !value.poll.on } }))}
            {chip(value.addYours.on || !!join, `➕ ${t("soc_add_yours")}`, () => set({ addYours: { ...value.addYours, on: !value.addYours.on } }), !!join)}
            {chip(value.link.on, `🔗 ${t("soc_link")}`, () => set({ link: { ...value.link, on: !value.link.on } }))}
          </div>

          {value.poll.on && (
            <div className="sticker-form">
              <label className="soft" style={{ fontSize: 13 }}>{t("soc_poll_question")}</label>
              <input className="input" maxLength={100} value={value.poll.question} placeholder={t("soc_poll_question_ph")}
                onChange={(e) => set({ poll: { ...value.poll, question: e.target.value } })} />
              {value.poll.options.map((o, i) => (
                <div key={i} className="row" style={{ gap: 6 }}>
                  <input className="input" maxLength={40} value={o} placeholder={t("soc_answer_n", i + 1)}
                    onChange={(e) => set({ poll: { ...value.poll, options: value.poll.options.map((x, j) => (j === i ? e.target.value : x)) } })} />
                  {value.poll.options.length > 2 && (
                    <button type="button" className="btn small ghost" aria-label={t("soc_remove")}
                      onClick={() => set({ poll: { ...value.poll, options: value.poll.options.filter((_, j) => j !== i) } })}>✕</button>
                  )}
                </div>
              ))}
              {value.poll.options.length < 4 && (
                <button type="button" className="btn small" onClick={() => set({ poll: { ...value.poll, options: [...value.poll.options, ""] } })}>＋ {t("soc_add_answer")}</button>
              )}
            </div>
          )}

          {join ? (
            <div className="sticker-form"><span style={{ color: "var(--gold)" }}>{t("soc_joining_add_yours", join.prompt)}</span></div>
          ) : value.addYours.on && (
            <div className="sticker-form">
              <label className="soft" style={{ fontSize: 13 }}>{t("soc_add_yours_prompt")}</label>
              <input className="input" maxLength={80} value={value.addYours.prompt} placeholder={t("soc_add_yours_ph")}
                onChange={(e) => set({ addYours: { ...value.addYours, prompt: e.target.value } })} />
            </div>
          )}

          {value.link.on && (
            <div className="sticker-form">
              <label className="soft" style={{ fontSize: 13 }}>{t("soc_link_url")}</label>
              <input className="input" inputMode="url" value={value.link.url} placeholder="https://"
                onChange={(e) => set({ link: { ...value.link, url: e.target.value } })} />
              <label className="soft" style={{ fontSize: 13 }}>{t("soc_link_label")}</label>
              <input className="input" maxLength={40} value={value.link.label} placeholder={t("soc_link_label_ph")}
                onChange={(e) => set({ link: { ...value.link, label: e.target.value } })} />
            </div>
          )}

          {any && (
            <>
              <div className="muted" style={{ fontSize: 12, margin: "10px 0 6px", textAlign: "center" }}>{t("soc_drag_hint")}</div>
              <div ref={box} className="sticker-preview" onPointerMove={move} onPointerUp={() => (drag.current = null)} onPointerLeave={() => (drag.current = null)}>
                {videoUrl ? <video src={videoUrl} muted autoPlay loop playsInline /> : <div className="sticker-preview-empty">{t("soc_your_video")}</div>}
                {reply && <ReplyBubble reply={reply} preview />}
                {value.poll.on && (
                  <div className="sticker-drag" style={{ left: `${value.poll.x * 100}%`, top: `${value.poll.y * 100}%` }}
                    onPointerDown={(e) => { e.preventDefault(); drag.current = "poll"; (e.currentTarget.parentElement as HTMLElement).setPointerCapture?.(e.pointerId); }}>
                    <PollCard preview postId={0} style={{ position: "static", transform: "none", width: 150 }}
                      initial={{ question: value.poll.question || t("soc_poll_question"), options: value.poll.options.map((text, i) => ({ text: text || t("soc_answer_n", i + 1), votes: 0 })), total: 0, my_vote: null }} />
                  </div>
                )}
                {value.link.on && (
                  <div className="sticker-drag" style={{ left: `${value.link.x * 100}%`, top: `${value.link.y * 100}%` }}
                    onPointerDown={(e) => { e.preventDefault(); drag.current = "link"; (e.currentTarget.parentElement as HTMLElement).setPointerCapture?.(e.pointerId); }}>
                    <LinkPill preview style={{ position: "static", transform: "none" }}
                      link={{ url: value.link.url, label: value.link.label || (validHttpsUrl(value.link.url) ? undefined : t("soc_link")) }} />
                  </div>
                )}
                {(join || value.addYours.on) && (
                  <AddYoursCard preview ay={{ id: join?.id ?? 0, prompt: join?.prompt ?? (value.addYours.prompt || t("soc_add_yours_ph")), uses: 0 }} />
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
