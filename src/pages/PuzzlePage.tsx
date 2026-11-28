// Bingg Bongg Puzzle page (Steve, 2026-11-28): "one page per member numbered 1–1000 ... Caught line
// turns a different colour + 'Got This One' + optional link to the item's page." Plus the extras he
// said yes to: Top Puzzle Finders, send a spare to a friend who is missing it, the share card.
//
// Open to everyone (lib/publicRoutes.ts) — a shared "I found #742!" link lands here; signed out it
// shows the 1,000 items and a sign-in line.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { PageTitle } from "../components/PageTitle";
import { Avatar, Loading } from "../components/Common";
import { PuzzleItemPicture, PuzzlePieceArt } from "../components/Puzzle";
import { displayName, type UserSummary } from "../lib/api";
import { useSession } from "../lib/session";
import { useT } from "../lib/i18n";
import {
  fetchPuzzle, fetchPuzzleLeaders, fetchSendTargets, onPuzzleCatch, puzzleVideoPath, sendPiece,
  type PzBoard, type PzItem, type PzPage, type PzUser,
} from "../lib/puzzle";

type Tab = "mine" | "board" | "how";
type Filter = "all" | "got" | "missing" | "spares";
const fmt = (n: number) => Math.round(Number(n) || 0).toLocaleString();
const asUser = (u: PzUser) => ({ ...u, profile_image: u.profile_image ?? undefined }) as Partial<UserSummary>;

export function PuzzlePage() {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { user, isLoggedIn } = useSession();
  const userId = isLoggedIn ? user?.id ?? 0 : 0;
  const [page, setPage] = useState<PzPage | null>(null);
  const [board, setBoard] = useState<PzBoard | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<Tab>("mine");
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [sendFor, setSendFor] = useState<PzItem | null>(null);
  const focus = Number(params.get("item") || 0);
  const sendParam = Number(params.get("send") || 0);
  const scrolled = useRef(0);

  const load = useCallback(async () => {
    try {
      const p = await fetchPuzzle(userId || null, lang);
      setPage(p);
      setFailed(!p);
    } catch { setFailed(true); }
  }, [userId, lang]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => onPuzzleCatch(() => { void load(); }), [load]);
  useEffect(() => {
    if (tab !== "board") return;
    void fetchPuzzleLeaders(userId || null).then(setBoard).catch(() => undefined);
  }, [tab, userId]);

  // ?send=742 from the catch popup: open the send sheet once the page is in.
  useEffect(() => {
    if (!page || !sendParam) return;
    const it = page.items.find((x) => x.no === sendParam);
    if (it) setSendFor(it);
    params.delete("send");
    setParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, sendParam]);
  // ?item=742: scroll to that line and flash it.
  useEffect(() => {
    if (!page || !focus || scrolled.current === focus) return;
    scrolled.current = focus;
    window.setTimeout(() => document.getElementById(`pz-${focus}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 150);
  }, [page, focus]);

  const shown = useMemo(() => {
    if (!page) return [];
    const s = q.trim().toLowerCase();
    return page.items.filter((it) => {
      if (filter === "got" && !it.got) return false;
      if (filter === "missing" && it.got) return false;
      if (filter === "spares" && (it.copies ?? 0) < 2) return false;
      if (!s) return true;
      return String(it.no) === s.replace(/^#/, "") || it.name.toLowerCase().includes(s) || it.plain_name.toLowerCase().includes(s);
    });
  }, [page, filter, q]);

  const video = page ? puzzleVideoPath(page.video_play_id) : null;
  const pct = page ? Math.min(100, (page.found / page.total) * 100) : 0;

  const tabBtn = (k: Tab, label: string) => (
    <button type="button" onClick={() => setTab(k)} style={{
      flex: 1, minHeight: 42, borderRadius: 999, fontWeight: 800, fontSize: 14, cursor: "pointer", padding: "0 8px",
      border: "2px solid #D4AF37", background: tab === k ? "linear-gradient(90deg,#F0C420,#D4AF37)" : "#000",
      color: tab === k ? "#000" : "#F0C420",
    }}>{label}</button>
  );
  const chip = (k: Filter, label: string) => (
    <button type="button" onClick={() => setFilter(k)} style={{
      minHeight: 34, borderRadius: 999, padding: "0 14px", fontWeight: 800, fontSize: 13, cursor: "pointer",
      border: "1.5px solid #D4AF37", background: filter === k ? "#F0C420" : "#000", color: filter === k ? "#000" : "#F0C420",
    }}>{label}</button>
  );

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <PageTitle backTo="/features">
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <PuzzlePieceArt size={34} />
          {t("pz_title")}
        </span>
      </PageTitle>

      <div className="card pad" style={{ background: "#000", textAlign: "center", borderWidth: 2 }}>
        {!page && !failed ? <Loading /> : failed && !page ? (
          <div>
            <p style={{ color: "#fff", margin: "4px 0 12px" }}>{t("pz_load_failed")}</p>
            <button className="btn gold" onClick={() => void load()}>{t("pz_retry")}</button>
          </div>
        ) : page && (
          <>
            <div style={{ color: "#FFDD55", fontSize: 30, fontWeight: 900 }} data-testid="puzzle-progress">{t("pz_progress", fmt(page.found), fmt(page.total))}</div>
            <div style={{ height: 12, background: "#222", borderRadius: 99, margin: "10px 0 6px", overflow: "hidden", border: "1px solid #3a2f0a" }}>
              <div style={{ width: `${pct}%`, minWidth: page.found ? 6 : 0, height: "100%", background: "linear-gradient(90deg,#FFE066,#F0C420)" }} />
            </div>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>
              {t("pz_left", fmt(page.left))}
              {userId > 0 && page.enabled && <> · {t("pz_today", page.today, page.daily_cap)}</>}
              {page.rank > 0 && <> · #{page.rank}</>}
            </div>
            {page.new_member && page.enabled && <div style={{ color: "#FFDD55", fontWeight: 800, fontSize: 14, marginTop: 6 }}>⭐ {t("pz_new_member")}</div>}
            {!page.switch_on && !page.enabled && <div style={{ color: "#FFDD55", fontWeight: 900, fontSize: 16, marginTop: 8 }}>🧩 {t("pz_off")}</div>}
            {!userId && <div style={{ marginTop: 10 }}><Link className="btn gold" to="/login">{t("pz_sign_in")}</Link></div>}
            {video && <div style={{ marginTop: 10 }}><button className="btn" onClick={() => navigate(video)}>▶ {t("pz_watch_video")}</button></div>}
          </>
        )}
      </div>

      {page && (
        <div className="card pad" style={{ background: "#0b0b0b", marginTop: 12 }}>
          <div style={{ color: "#F0C420", fontWeight: 900, fontSize: 16, marginBottom: 6 }}>🎁 {t("pz_milestones")}</div>
          <div style={{ display: "grid", gap: 6 }}>
            {page.milestones.map((m) => (
              <div key={m.at} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 10,
                background: m.done ? "rgba(240,196,32,.18)" : "#141414", color: m.done ? "#FFDD55" : "#ddd", fontWeight: 700,
              }}>
                <span>{m.done ? "✅" : page.found >= m.at ? "🎉" : "⬜"}</span>
                <span>{t("pz_milestone_row", fmt(m.at), fmt(m.fbbs))}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, margin: "14px 0 10px" }}>
        {tabBtn("mine", t("pz_tab_mine"))}
        {tabBtn("board", t("pz_tab_board"))}
        {tabBtn("how", t("pz_tab_how"))}
      </div>

      {tab === "mine" && page && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {chip("all", t("pz_filter_all"))}
            {chip("got", t("pz_filter_got"))}
            {chip("missing", t("pz_filter_missing"))}
            {chip("spares", t("pz_filter_spares"))}
          </div>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("pz_search")}
            style={{ width: "100%", marginBottom: 10 }} />
          <div style={{ display: "grid", gap: 6 }}>
            {shown.map((it) => <Line key={it.no} it={it} focus={it.no === focus} onSend={userId ? () => setSendFor(it) : undefined} />)}
          </div>
        </>
      )}

      {tab === "board" && (
        <div className="card pad" style={{ background: "#000" }}>
          {!board ? <Loading /> : board.leaders.length === 0 ? (
            <p style={{ color: "#fff", margin: 0 }}>{t("pz_no_board")}</p>
          ) : (
            <>
              <div style={{ color: "rgba(255,255,255,.7)", fontSize: 13, marginBottom: 8 }}>{t("pz_finders", fmt(board.finders))}</div>
              {board.me && (
                <div style={{ marginBottom: 10 }}><Leader l={board.me} you /></div>
              )}
              <div style={{ display: "grid", gap: 6 }}>
                {board.leaders.map((l) => <Leader key={l.user.id} l={l} you={l.user.id === userId} />)}
              </div>
            </>
          )}
        </div>
      )}

      {tab === "how" && (
        <div className="card pad" style={{ background: "#000", color: "#fff" }}>
          {(["pz_how_1", "pz_how_2", "pz_how_3", "pz_how_4", "pz_how_5", "pz_how_6"] as const).map((key, i) => (
            <div key={key} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "6px 0", fontSize: 16, fontWeight: 700 }}>
              <span style={{ color: "#000", background: "#F0C420", borderRadius: 99, minWidth: 26, height: 26, display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 900 }}>{i + 1}</span>
              <span>{t(key)}</span>
            </div>
          ))}
          {video && <div style={{ marginTop: 10, textAlign: "center" }}><button className="btn gold" onClick={() => navigate(video)}>▶ {t("pz_watch_video")}</button></div>}
        </div>
      )}

      {sendFor && userId > 0 && <SendSheet item={sendFor} userId={userId} onClose={() => setSendFor(null)} onSent={() => { setSendFor(null); void load(); }} />}
    </div>
  );
}

function Line({ it, focus, onSend }: { it: PzItem; focus: boolean; onSend?: () => void }) {
  const { t } = useT();
  const spares = Math.max(0, (it.copies ?? 0) - 1);
  return (
    <div id={`pz-${it.no}`} data-testid={`pz-line-${it.no}`} style={{
      display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 14,
      background: it.got ? "linear-gradient(90deg, rgba(240,196,32,.28), rgba(240,196,32,.08))" : "#111",
      border: `${focus ? 3 : 1.5}px solid ${it.got ? "#F0C420" : "#2a2a2a"}`,
      boxShadow: focus ? "0 0 16px rgba(240,196,32,.7)" : undefined,
    }}>
      <span style={{ width: 44, textAlign: "right", color: it.got ? "#FFDD55" : "#888", fontWeight: 900, fontSize: 15, flex: "none" }}>#{it.no}</span>
      <PuzzleItemPicture item={it} size={52} dim={!it.got} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: it.got ? "#fff" : "#bbb", fontWeight: 800, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis" }}>{it.name}</div>
        {it.got ? (
          <div style={{ color: "#FFDD55", fontWeight: 900, fontSize: 13 }}>
            ✓ {t("pz_got")}
            {spares > 0 && <span style={{ color: "#fff", fontWeight: 700 }}> · {t("pz_spares", spares)}</span>}
            {it.from && <span style={{ color: "#ccc", fontWeight: 600 }}> · {t("pz_from", it.from)}</span>}
          </div>
        ) : <div style={{ color: "#777", fontSize: 12.5, fontWeight: 600 }}>{t("pz_missing")}</div>}
      </div>
      {it.got && it.link && (
        <a href={it.link} target="_blank" rel="noopener noreferrer sponsored" className="btn" style={{ minHeight: 34, padding: "0 12px", fontSize: 13 }}>{t("pz_visit")}</a>
      )}
      {spares > 0 && onSend && (
        <button type="button" className="btn gold" onClick={onSend} style={{ minHeight: 34, padding: "0 12px", fontSize: 13 }}>🎁 {t("pz_send_btn")}</button>
      )}
    </div>
  );
}

function Leader({ l, you }: { l: PzBoard["leaders"][number]; you?: boolean }) {
  const { t } = useT();
  return (
    <Link to={`/profile/${l.user.id}`} style={{
      display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 12, textDecoration: "none",
      background: you ? "rgba(240,196,32,.2)" : "#111", border: `1.5px solid ${you ? "#F0C420" : "#2a2a2a"}`,
    }}>
      <span style={{ width: 34, textAlign: "center", color: "#FFDD55", fontWeight: 900 }}>{l.rank <= 3 ? ["🥇", "🥈", "🥉"][l.rank - 1] : `#${l.rank}`}</span>
      <Avatar user={asUser(l.user)} />
      <span style={{ flex: 1, minWidth: 0, color: "#fff", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {displayName(asUser(l.user))}{you ? ` (${t("pz_you")})` : ""}
      </span>
      <span style={{ color: "#FFDD55", fontWeight: 900 }}>{l.completed ? `🏆 ${t("pz_finished")}` : t("pz_found_n", fmt(l.found))}</span>
    </Link>
  );
}

function SendSheet({ item, userId, onClose, onSent }: { item: PzItem; userId: number; onClose: () => void; onSent: () => void }) {
  const { t, lang } = useT();
  const [q, setQ] = useState("");
  const [friends, setFriends] = useState<PzUser[] | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(0);
  useEffect(() => {
    const id = window.setTimeout(() => { void fetchSendTargets(userId, item.no, q).then((r) => setFriends(r.friends)); }, q ? 300 : 0);
    return () => window.clearTimeout(id);
  }, [userId, item.no, q]);
  async function send(f: PzUser) {
    setBusy(f.id);
    const r = await sendPiece(userId, item.no, f.id, lang);
    setBusy(0);
    setMsg(r.message);
    if (r.ok) window.setTimeout(onSent, 1400);
  }
  return (
    <div role="dialog" aria-modal="true" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9002, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(560px, 100%)", maxHeight: "80vh", overflowY: "auto", background: "#000", border: "2px solid #F0C420", borderRadius: "20px 20px 0 0", padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <PuzzleItemPicture item={item} size={56} />
          <div style={{ flex: 1, color: "#FFDD55", fontWeight: 900, fontSize: 18 }}>{t("pz_send_title", item.no)}<div style={{ color: "#fff", fontSize: 14 }}>{item.name}</div></div>
          <button className="btn" onClick={onClose}>{t("pz_close")}</button>
        </div>
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("pz_search")} style={{ width: "100%", margin: "12px 0" }} />
        {msg && <div style={{ color: "#FFDD55", fontWeight: 800, marginBottom: 10 }}>{msg}</div>}
        {friends === null ? <Loading /> : friends.length === 0 ? <p style={{ color: "#fff" }}>{t("pz_send_none")}</p> : (
          <div style={{ display: "grid", gap: 6 }}>
            {friends.map((f) => (
              <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, borderRadius: 12, background: "#111" }}>
                <Avatar user={asUser(f)} />
                <span style={{ flex: 1, color: "#fff", fontWeight: 800 }}>{displayName(asUser(f))}</span>
                <button className="btn gold" disabled={busy > 0} onClick={() => void send(f)}>{busy === f.id ? "…" : t("pz_send_btn")}</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
