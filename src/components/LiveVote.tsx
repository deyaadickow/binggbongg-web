// Live Vote (Steve, 2026-11-22) — the host's setup sheet and the card everyone in the room sees.
// The question big at the top, one big coloured button per answer (game-show tiles), every tap
// +1 vote and a little "+1" pop. Counts and a fill bar on each button when the host shows them;
// the host always sees them. The host can flip "show the votes" while it runs and end it.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Confetti, MuteButton } from "./GameShow";
import { sfx, useStopGameSoundsOnUnmount } from "../lib/gameSounds";
import { useT } from "../lib/i18n";
import { NOT_ENOUGH_COINS, type CastResult, type LiveVote } from "../lib/livevote";

const gold = "var(--gold, #F0C420)";
const TILE_COLORS = ["#D85A30", "#1D9E75", "#378ADD", "#BA7517", "#8E44AD", "#C0396B", "#2E9BFF", "#4F7F4F"];
const PRICES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const MAX_OPTIONS = 20;
const MAX_BBS = 10000;

export function LiveVoteStartDialog({ onClose, onStart }: {
  onClose: () => void;
  onStart: (s: { question: string; options: string[]; bbsPerVote: number; showCounts: boolean }) => Promise<void>;
}) {
  const { t } = useT();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [price, setPrice] = useState<number | "own">(1);
  const [own, setOwn] = useState("");
  const [showCounts, setShowCounts] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const filled = options.map((o) => o.trim()).filter(Boolean);
  const bbs = price === "own" ? Math.floor(Number(own)) : price;

  async function start() {
    if (!question.trim()) { setErr(t("lv_need_question")); return; }
    if (filled.length < 2) { setErr(t("lv_need_two")); return; }
    if (!Number.isFinite(bbs) || bbs < 1 || bbs > MAX_BBS) { setErr(t("lv_bbs_range")); return; }
    setErr(null);
    setBusy(true);
    try { await onStart({ question: question.trim(), options: filled, bbsPerVote: bbs, showCounts }); } finally { setBusy(false); }
  }

  const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 12, border: `2px solid ${gold}`,
    background: "#000", color: gold, fontSize: 16, fontWeight: 700, outline: "none" };
  const chip = (on: boolean): React.CSSProperties => ({ minWidth: 44, padding: "9px 0", borderRadius: 12, border: `2px solid ${gold}`, cursor: "pointer",
    background: on ? gold : "transparent", color: on ? "#000" : gold, fontWeight: 900, fontSize: 16 });

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 95, background: "rgba(0,0,0,.7)", display: "grid", placeItems: "center", padding: 12 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(460px, 100%)", maxHeight: "calc(100vh - 40px)", overflowY: "auto", boxSizing: "border-box",
        background: "#000", border: `2px solid ${gold}`, borderRadius: 18, padding: 16, color: gold, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <b style={{ flex: 1, fontSize: 20 }}>🗳️ {t("lv_title")}</b>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: gold, fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>

        <label style={{ fontWeight: 800 }}>{t("lv_question")}</label>
        <textarea value={question} maxLength={300} rows={2} placeholder={t("lv_question_hint")} onChange={(e) => setQuestion(e.target.value)}
                  style={{ ...input, resize: "vertical", fontFamily: "inherit" }} />

        <label style={{ fontWeight: 800 }}>{t("lv_answers")}</label>
        {options.map((o, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ width: 14, height: 40, borderRadius: 6, flex: "none", background: TILE_COLORS[i % TILE_COLORS.length] }} />
            <input value={o} maxLength={60} placeholder={t("lv_answer_n", i + 1)} style={input}
                   onChange={(e) => setOptions((l) => l.map((x, k) => (k === i ? e.target.value : x)))} />
            {options.length > 2 && (
              <button onClick={() => setOptions((l) => l.filter((_, k) => k !== i))} aria-label={t("lv_remove")}
                      style={{ background: "none", border: "none", color: gold, fontSize: 20, cursor: "pointer", flex: "none" }}>✕</button>
            )}
          </div>
        ))}
        {options.length < MAX_OPTIONS && (
          <button onClick={() => setOptions((l) => [...l, ""])}
                  style={{ padding: "10px 0", borderRadius: 999, border: `2px dashed ${gold}`, background: "transparent", color: gold, fontWeight: 900, fontSize: 15, cursor: "pointer" }}>
            {t("lv_add_answer")}
          </button>
        )}

        <label style={{ fontWeight: 800 }}>{t("lv_bbs_per_vote")}</label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
          {PRICES.map((p) => <button key={p} style={chip(price === p)} onClick={() => setPrice(p)}>{p}</button>)}
        </div>
        <button style={{ ...chip(price === "own"), padding: "10px 0" }} onClick={() => setPrice("own")}>{t("lv_own_number")}</button>
        {price === "own" && (
          <input inputMode="numeric" value={own} placeholder={t("lv_custom_bbs_hint")} style={input}
                 onChange={(e) => setOwn(e.target.value.replace(/\D/g, "").slice(0, 5))} />
        )}

        <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 800, cursor: "pointer" }}>
          <input type="checkbox" checked={showCounts} onChange={(e) => setShowCounts(e.target.checked)} style={{ width: 22, height: 22, accentColor: "#F0C420" }} />
          {t("lv_show_counts")}
        </label>

        {err && <div style={{ color: "#FFB4B4", fontWeight: 700 }}>{err}</div>}
        <button onClick={() => void start()} disabled={busy}
                style={{ padding: "13px 0", borderRadius: 999, border: "none", background: gold, color: "#000", fontWeight: 900, fontSize: 17, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
          {busy ? "…" : t("lv_start")}
        </button>
      </div>
    </div>
  );
}

export function LiveVotePanel({ vote, myUserId, onVote, onToggleCounts, onEnd, onClose }: {
  vote: LiveVote; myUserId: number | null;
  onVote: (i: number) => Promise<CastResult | null>;
  onToggleCounts: (show: boolean) => void;
  onEnd: () => void; onClose: () => void;
}) {
  useStopGameSoundsOnUnmount();
  const { t } = useT();
  const [collapsed, setCollapsed] = useState(false);
  const [pops, setPops] = useState<{ id: number; i: number }[]>([]);
  const [needCoins, setNeedCoins] = useState(false);
  const [burst, setBurst] = useState(0);
  const busy = useRef(false);
  const open = vote.status === "open";
  const prev = useRef(vote.status);
  useEffect(() => {
    if (prev.current === "open" && vote.status !== "open") { sfx.fanfare(); setBurst(Date.now()); }
    prev.current = vote.status;
  }, [vote.status]);

  const canVote = open && vote.can_vote && !vote.is_host && !!myUserId;
  const countsVisible = vote.options.some((o) => o.votes !== null);
  const max = Math.max(1, ...vote.options.map((o) => o.votes ?? 0));
  const leader = countsVisible && !open && (vote.votes_total ?? 0) > 0
    ? vote.options.reduce((a, b) => ((b.votes ?? 0) > (a.votes ?? 0) ? b : a)) : null;
  const bbs = (n: number) => t(n === 1 ? "n_coin" : "n_coins", n);

  async function tap(i: number) {
    if (!canVote || busy.current) return;
    busy.current = true;
    setNeedCoins(false);
    const id = Date.now() + Math.random();
    setPops((p) => [...p, { id, i }]);
    window.setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 900);
    sfx.tick();
    try {
      const r = await onVote(i);
      if (r?.message === NOT_ENOUGH_COINS) setNeedCoins(true);
    } finally { busy.current = false; }
  }

  return (
    <div style={{ position: "fixed", top: 120, left: "50%", transform: "translateX(-50%)", zIndex: 87, width: "min(430px, calc(100vw - 24px))", boxSizing: "border-box",
                  background: "rgba(0,0,0,.92)", border: `2px solid ${gold}`, borderRadius: 18, padding: 12, color: "#fff", maxHeight: "calc(100vh - 200px)", overflowY: "auto" }}>
      <Confetti burst={burst} />
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <b style={{ color: gold, fontSize: 16, flex: 1, minWidth: 0 }}>🗳️ {t("lv_title")}</b>
        {open && <span style={{ fontSize: 12.5, fontWeight: 800, color: gold, border: `1px solid ${gold}`, borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap" }}>{bbs(vote.bbs_per_vote)}</span>}
        <MuteButton />
        <button onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? "Expand" : "Collapse"} style={{ background: "none", border: "none", color: gold, fontSize: 20, cursor: "pointer", padding: "0 4px" }}>{collapsed ? "+" : "–"}</button>
        {!open && <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: gold, fontSize: 18, cursor: "pointer" }}>✕</button>}
      </div>
      {!collapsed && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
          <div style={{ fontSize: 20, fontWeight: 900, lineHeight: 1.3, textAlign: "center", color: gold, overflowWrap: "anywhere" }}>{vote.question}</div>
          {!open && <div style={{ textAlign: "center", fontSize: 18, fontWeight: 900 }}>{t("lv_results")}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: vote.options.length > 6 ? 6 : 8 }}>
            {vote.options.map((o, i) => {
              const color = TILE_COLORS[i % TILE_COLORS.length];
              const isLeader = leader !== null && leader.index === o.index;
              const fill = o.votes !== null ? Math.round(100 * o.votes / max) : 0;
              return (
                <button key={o.index} type="button" aria-disabled={!canVote} onClick={() => void tap(o.index)} className="gs-anim"
                        style={{ position: "relative", overflow: "hidden", minHeight: vote.options.length > 6 ? 46 : 56, padding: "9px 12px", borderRadius: 14, textAlign: "left", color: "#fff",
                                 background: color, border: `3px solid ${isLeader ? "#fff" : "transparent"}`, cursor: canVote ? "pointer" : "default",
                                 boxShadow: isLeader ? "0 0 0 3px #2FBF5B, 0 0 18px rgba(47,191,91,.7)" : "0 3px 0 rgba(0,0,0,.35)",
                                 opacity: !open && leader && !isLeader ? 0.6 : 1, touchAction: "manipulation", WebkitTapHighlightColor: "transparent", userSelect: "none" }}>
                  {o.votes !== null && <span style={{ position: "absolute", inset: 0, width: `${fill}%`, background: "rgba(255,255,255,.22)", transition: "width .4s" }} />}
                  <span style={{ position: "relative", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 17, fontWeight: 900, lineHeight: 1.2, overflowWrap: "break-word", textShadow: "0 1px 2px rgba(0,0,0,.35)" }}>
                      {isLeader ? "👑 " : ""}{o.text}
                    </span>
                    {o.votes !== null && (
                      <b style={{ flex: "none", background: "rgba(0,0,0,.35)", borderRadius: 8, padding: "3px 8px", fontSize: 15, fontVariantNumeric: "tabular-nums" }}>
                        {o.votes}{o.percent !== null ? ` · ${o.percent}%` : ""}
                      </b>
                    )}
                  </span>
                  {o.my_votes > 0 && <span style={{ position: "relative", display: "block", fontSize: 12, opacity: 0.9, marginTop: 3 }}>{t("lv_your_votes", o.my_votes)}</span>}
                  {pops.filter((p) => p.i === o.index).map((p) => (
                    <span key={p.id} style={{ position: "absolute", right: 14, top: 4, fontWeight: 900, fontSize: 22, color: "#fff", textShadow: "0 2px 4px #000",
                                              animation: "lv-up .9s ease-out forwards", pointerEvents: "none" }}>+1</span>
                  ))}
                </button>
              );
            })}
          </div>
          <style>{"@keyframes lv-up{0%{transform:translateY(0) scale(.8);opacity:1}100%{transform:translateY(-34px) scale(1.3);opacity:0}}"}</style>

          <div style={{ fontSize: 14, fontWeight: 700, textAlign: "center", opacity: 0.92 }}>
            {open
              ? vote.is_host ? t("lv_host_room_voting")
                : !myUserId ? t("quiz_sign_in_to_play")
                : t("lv_tap_to_vote", bbs(vote.bbs_per_vote))
              : leader ? t("lv_winner", leader.text) : t("lv_ended")}
          </div>
          {vote.votes_total !== null && <div style={{ fontSize: 13, textAlign: "center", opacity: 0.85 }}>{t("lv_total_votes", vote.votes_total)}</div>}
          {!countsVisible && <div style={{ fontSize: 13, textAlign: "center", opacity: 0.8 }}>{t("lv_votes_hidden")}</div>}
          {needCoins && (
            <div style={{ textAlign: "center", fontSize: 14, fontWeight: 700, color: "#FFB4B4" }}>
              {t("lv_not_enough_bbs")} <Link to="/wallet" style={{ color: gold }}>{t("buy_coins")}</Link>
            </div>
          )}

          {vote.is_host && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid rgba(240,196,32,.3)", paddingTop: 10 }}>
              <div style={{ textAlign: "center", fontSize: 20, fontWeight: 900, color: gold }}>{t("quiz_coins_earned", vote.coins_total ?? 0)}</div>
              {open && (
                <>
                  <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontWeight: 800, color: gold, cursor: "pointer" }}>
                    <input type="checkbox" checked={vote.show_counts} onChange={(e) => onToggleCounts(e.target.checked)} style={{ width: 20, height: 20, accentColor: "#F0C420" }} />
                    {t("lv_show_counts")}
                  </label>
                  <button onClick={onEnd} style={{ padding: "11px 0", borderRadius: 999, border: "none", background: gold, color: "#000", fontWeight: 900, fontSize: 16, cursor: "pointer" }}>{t("lv_end_vote")}</button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
