// Dog Race in a live room (Steve, 2026-11-16) — see lib/dogRace.ts for his words and the contract.
//
//  - useDogRace: the room's race, polled every 2 s while one exists and every 10 s otherwise.
//  - DogRaceStartDialog: the host's minutes picker (3..10) from the Battle menu.
//  - DogRaceLobbyCard: everyone in the room — countdown, N / 24, Reserve my spot (free) / Leave.
//  - DogRaceGrid: over the room's video area while the race runs — one looping dog video per
//    player, the PLAYER's name (no dog names), a red gift box, the place badge (gold for 1st),
//    BOOST ⚡ and a faster video when a gift lands, and the gift's own effect inside that tile only.
//  - DogRaceResults: every player 1st..Nth with their BBs and who gifted them, most first.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { ApiError, displayName, giftPrice, mediaUrl, type Gift, type UserSummary } from "../lib/api";
import {
  clock, dogRaceGrid, fetchDogRace, parseDogRace, fetchDogRaceResults, leaveDogRace, reserveDogRaceSpot, sendDogRaceGift, startDogRace,
  type DogRacePlayer, type DogRaceState,
} from "../lib/dogRace";
import { useT, type StringKey } from "../lib/i18n";
import { loadGifts } from "../lib/gifts";
import { chatChannel, sendChat } from "../lib/firebase";
import { Avatar } from "./Common";
import { Overlay } from "./BattleEngines";
import { GiftSheet } from "./GiftSheet";
import { TapTapBurst, isTapTapGift, tapTapBurstDuration } from "./TapTapBurst";

const POLL_RACE_MS = 2000;
const POLL_IDLE_MS = 10000;
const BOOST_MS = 2000;
const BOOST_RATE = 1.6;

const nameOf = (p: { fullname?: string; username?: string }) => displayName({ fullname: p.fullname, username: p.username } as Partial<UserSummary>);

/** 1st / 2nd / 3rd in English; every other language spells a place its own way (dr_place_n). */
export function placeLabel(n: number, lang: string, t: (k: StringKey, ...a: (string | number)[]) => string): string {
  if (lang === "en") {
    const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
    return `${n}${s}`;
  }
  return t("dr_place_n", n);
}

// ---------------------------------------------------------------------------------------------
// The room's race
// ---------------------------------------------------------------------------------------------

export function useDogRace(roomName: string, userId: number | null, onToast: (m: string) => void) {
  const { t } = useT();
  const [race, setRace] = useState<DogRaceState | null>(null);
  const raceRef = useRef<DogRaceState | null>(null);
  const toastRef = useRef(onToast);
  toastRef.current = onToast;
  const cancelledToldFor = useRef(0);
  const timer = useRef(0);
  const alive = useRef(true);

  const apply = useCallback((next: DogRaceState | null) => {
    const prev = raceRef.current;
    // "Not enough players — race cancelled", once per race, and only to someone who saw its lobby.
    if (next?.status === "cancelled") {
      if (prev && prev.id === next.id && prev.status === "lobby" && cancelledToldFor.current !== next.id) {
        cancelledToldFor.current = next.id;
        toastRef.current(t("dr_cancelled"));
      }
      next = null;
    }
    raceRef.current = next;
    setRace(next);
  }, [t]);

  const refresh = useCallback(async () => {
    if (!userId || !roomName) return;
    try {
      const r = await fetchDogRace(userId, roomName);
      // A failed read (old server, network) keeps what we have rather than tearing the grid down.
      if (alive.current && r.ok) apply(r.race);
    } catch { /* keep the last answer */ }
  }, [userId, roomName, apply]);

  useEffect(() => {
    alive.current = true;
    if (!userId || !roomName) return;
    const loop = async () => {
      await refresh();
      if (!alive.current) return;
      timer.current = window.setTimeout(loop, raceRef.current ? POLL_RACE_MS : POLL_IDLE_MS);
    };
    void loop();
    return () => { alive.current = false; window.clearTimeout(timer.current); };
  }, [userId, roomName, refresh]);

  return { race, refresh, apply };
}

/** The server's "now", ticking once a second. */
function useServerNow(skewMs: number): number {
  const [now, setNow] = useState(() => Date.now() + skewMs);
  useEffect(() => {
    setNow(Date.now() + skewMs);
    const id = window.setInterval(() => setNow(Date.now() + skewMs), 1000);
    return () => window.clearInterval(id);
  }, [skewMs]);
  return now;
}

// ---------------------------------------------------------------------------------------------
// Host: start one
// ---------------------------------------------------------------------------------------------

const MINUTES = [3, 4, 5, 6, 7, 8, 9, 10];

export function DogRaceStartDialog({ userId, roomName, onClose, onStarted, onToast }: {
  userId: number; roomName: string; onClose: () => void; onStarted: (r: DogRaceState | null) => void; onToast: (m: string) => void;
}) {
  const { t } = useT();
  const [minutes, setMinutes] = useState(5);
  const [busy, setBusy] = useState(false);
  async function start() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await startDogRace(userId, roomName, minutes);
      if (!r.ok) {
        onToast(r.reason === "race_running" ? t("dr_already_running") : r.reason === "not_host" ? t("dr_only_host") : r.message || t("dr_couldnt_start"));
        return;
      }
      onStarted(r.race);
      onToast(t("dr_started"));
      onClose();
    } catch (e) {
      onToast(e instanceof ApiError && e.status === 409 ? t("dr_already_running") : e instanceof ApiError && e.status === 403 ? t("dr_only_host") : t("dr_couldnt_start"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Overlay title={`🐕 ${t("dr_title")}`} onClose={onClose} width={460}>
      <p style={{ marginTop: 0, color: "#fff", fontSize: 15, lineHeight: 1.45 }}>{t("dr_start_note")}</p>
      <div style={{ color: "var(--gold)", fontWeight: 700, marginBottom: 8 }}>{t("dr_pick_minutes")}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 14 }}>
        {MINUTES.map((m) => (
          <button key={m} className={m === minutes ? "btn small" : "btn small ghost"} onClick={() => setMinutes(m)}>{t("dr_n_minutes", m)}</button>
        ))}
      </div>
      <button className="btn block" disabled={busy} onClick={start}>{busy ? "…" : t("dr_start")}</button>
    </Overlay>
  );
}

// ---------------------------------------------------------------------------------------------
// Everyone: the lobby card
// ---------------------------------------------------------------------------------------------

export function DogRaceLobbyCard({ race, myId, onChanged, onRefresh, onToast }: {
  race: DogRaceState; myId: number | null; onChanged: (r: DogRaceState) => void; onRefresh: () => void; onToast: (m: string) => void;
}) {
  const { t } = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const now = useServerNow(race.skewMs);
  const [busy, setBusy] = useState(false);
  const left = race.lobby_ends_at ? race.lobby_ends_at - now : 0;
  const full = race.player_count >= race.max_players;
  const inRace = race.me.in_race || (myId != null && race.players.some((p) => p.user_id === myId));

  async function act(kind: "reserve" | "leave") {
    if (!myId) { navigate("/login", { state: { from: location.pathname + location.search } }); return; }
    if (busy) return;
    setBusy(true);
    try {
      const r = kind === "reserve" ? await reserveDogRaceSpot(myId, race.id) : await leaveDogRace(myId, race.id);
      if (!r.ok) {
        if (r.reason !== "not_in") onToast(r.reason === "full" ? t("dr_full", race.max_players) : r.reason === "not_lobby" ? t("dr_not_lobby") : r.reason === "already_in" ? t("dr_you_are_in") : r.message || t("dr_try_again"));
      } else if (r.race) onChanged(r.race);
      if (r.ok && kind === "reserve") onToast(t("dr_you_are_in"));
    } catch (e) {
      onToast(e instanceof ApiError && e.status === 409 ? t("dr_full", race.max_players) : t("dr_try_again"));
    } finally {
      setBusy(false);
      onRefresh();
    }
  }

  return (
    <div className="dr-lobby" role="status">
      <div className="dr-lobby-title">🐕 {t("dr_lobby_title", clock(left))}</div>
      <div className="dr-lobby-row">
        <span className="dr-lobby-count">{t("dr_spots", race.player_count, race.max_players)}</span>
        <span className="spacer" />
        {inRace
          ? <button className="btn small ghost" disabled={busy} onClick={() => act("leave")}>{t("dr_leave")}</button>
          : full
            ? <span className="dr-lobby-full">{t("dr_full", race.max_players)}</span>
            : <button className="btn small" disabled={busy} onClick={() => act("reserve")}>{t("dr_reserve")}</button>}
      </div>
      {inRace && <div className="dr-lobby-in">✓ {t("dr_you_are_in")}</div>}
      {race.players.length > 0 && (
        <div className="dr-lobby-names">{race.players.map((p) => nameOf(p)).join(" · ")}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Everyone: the race grid over the video area
// ---------------------------------------------------------------------------------------------

type TileFx = { key: string; gift: Gift };

export function DogRaceGrid({ race, myId, roomName, hostUserId, senderName, senderPhoto, onToast, onGifted, onRace }: {
  race: DogRaceState; myId: number | null; roomName: string; hostUserId: number;
  senderName: string; senderPhoto: string;
  onToast: (m: string) => void; onGifted: () => void; onRace: (r: DogRaceState) => void;
}) {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const now = useServerNow(race.skewMs);
  const [giftTo, setGiftTo] = useState<DogRacePlayer | null>(null);
  const [fx, setFx] = useState<Record<number, TileFx>>({});
  const [boost, setBoost] = useState<Record<number, number>>({});
  const [gifts, setGifts] = useState<Gift[]>([]);
  useEffect(() => { loadGifts().then(setGifts).catch(() => undefined); }, []);

  const racing = race.status === "racing";
  const left = racing && race.ends_at ? race.ends_at - now : 0;
  const { cols, rows } = dogRaceGrid(race.players.length);

  const boostTile = useCallback((uid: number) => {
    setBoost((b) => ({ ...b, [uid]: Date.now() + BOOST_MS }));
    window.setTimeout(() => setBoost((b) => {
      if ((b[uid] ?? 0) > Date.now()) return b;
      const n = { ...b }; delete n[uid]; return n;
    }), BOOST_MS + 50);
  }, []);
  const playFx = useCallback((uid: number, gift: Gift, key: string) => {
    setFx((f) => ({ ...f, [uid]: { key, gift } }));
    const ms = isTapTapGift(gift) ? Math.min(tapTapBurstDuration(gift), 9000) : 2600;
    window.setTimeout(() => setFx((f) => (f[uid]?.key === key ? (() => { const n = { ...f }; delete n[uid]; return n; })() : f)), ms);
  }, []);

  // Everyone's gifts: race_state.recent_gifts (newest 20). Each id higher than the last one seen
  // plays its effect in that player's tile and BOOSTs the dog. The first read only sets the
  // baseline (no replay on entry); my own gifts already played the moment they were sent.
  const lastGiftId = useRef<number | null>(null);
  const lastBbs = useRef<Map<number, number>>(new Map());
  useEffect(() => {
    const list = race.recent_gifts;
    const top = list.length ? list[list.length - 1].id : 0;
    const seen = lastGiftId.current;
    lastGiftId.current = Math.max(seen ?? 0, top);
    const boosted = new Set<number>();
    if (seen !== null) {
      for (const g of list) {
        if (g.id <= seen || g.from_user_id === myId) continue;
        const p = race.players.find((x) => x.slot === g.slot) ?? race.players.find((x) => x.user_id === g.to_user_id);
        if (!p) continue;
        const known = gifts.find((x) => Number(x.id) === g.gift_id);
        const gift: Gift = known ?? { id: g.gift_id, name: g.gift_name, image: g.icon_url || undefined, votes: g.bbs };
        playFx(p.user_id, gift, `g-${g.id}`);
        boostTile(p.user_id);
        boosted.add(p.user_id);
      }
    }
    // An older server without recent_gifts: a dog whose BBs went up still gets its BOOST.
    for (const p of race.players) {
      const before = lastBbs.current.get(p.user_id);
      if (!list.length && before !== undefined && p.bbs > before && !boosted.has(p.user_id)) boostTile(p.user_id);
      lastBbs.current.set(p.user_id, p.bbs);
    }
  }, [race, gifts, myId, boostTile, playFx]);

  const openGift = (p: DogRacePlayer) => {
    if (!myId) { navigate("/login", { state: { from: location.pathname + location.search } }); return; }
    if (p.user_id === myId) return;
    setGiftTo(p);
  };

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    // The room's video area has its own hold menu, double-tap hearts and swipe; none of them may
    // fire from a race tile (or from the gift page, which is portalled but still bubbles here).
    <div className="dr-race" onPointerDown={stop} onDoubleClick={stop} onClick={stop} onContextMenu={stop}>
      <div className="dr-top">
        <span className="dr-top-title">🐕 {t("dr_title")}</span>
        <span className="spacer" />
        {racing
          ? <span className="dr-top-clock">⏱ {clock(left)}</span>
          : <span className="dr-top-clock">{t("dr_finished")}</span>}
      </div>
      <div className="dr-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
        {race.players.map((p) => (
          <DogTile key={p.user_id} p={p} boosting={(boost[p.user_id] ?? 0) > Date.now() || !!fx[p.user_id]}
            place={placeLabel(p.place, lang, t)} first={p.place === 1 && p.bbs > 0}
            canGift={racing && p.user_id !== myId} onGift={() => openGift(p)} fx={fx[p.user_id] ?? null}
            boostText={t("dr_boost")} small={race.players.length > 9} />
        ))}
      </div>
      {giftTo && myId && createPortal(
        <div onPointerDown={stop} onClick={stop} onDoubleClick={stop}>
          <GiftSheet
            onClose={() => setGiftTo(null)}
            onSent={(gift) => {
              const to = giftTo;
              boostTile(to.user_id);
              playFx(to.user_id, gift, `mine-${Date.now()}`);
              onToast(t("dr_gift_sent", gift.name ?? "", nameOf(to)));
              // A line in the room's chat so everyone knows who is pushing which dog. A plain
              // line (positive sender id), NOT a gift line: a gift line plays its effect over the
              // whole room, and a Dog Race gift belongs to its tile only.
              void sendChat(chatChannel(roomName, hostUserId), myId, senderName,
                `🐕 sent a ${gift.name ?? "gift"} to ${nameOf(to)}'s dog! ⚡`, senderPhoto).catch(() => undefined);
              onGifted();
            }}
            sendOverride={async (_coins, gift) => {
              const res = await sendDogRaceGift({ myId, toUserId: giftTo.user_id, giftId: gift.id, coins: giftPrice(gift), roomName, raceId: race.id });
              // The answer carries the whole race (dog_race) — the new BBs and places at once.
              const next = res.status ? parseDogRace(res.dog_race) : null;
              if (next) onRace(next);
              return res;
            }} />
        </div>,
        document.body,
      )}
    </div>
  );
}

function DogTile({ p, boosting, place, first, canGift, onGift, fx, boostText, small }: {
  p: DogRacePlayer; boosting: boolean; place: string; first: boolean; canGift: boolean; onGift: () => void;
  fx: TileFx | null; boostText: string; small: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const video = p.dog.video ? mediaUrl(p.dog.video) : "";
  const poster = p.dog.poster ? mediaUrl(p.dog.poster) : undefined;

  // Lazy: a tile's video loads and plays only while the tile is on screen; otherwise its poster.
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.1 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.playbackRate = boosting ? BOOST_RATE : 1;
    if (visible) v.play().catch(() => undefined);
    else v.pause();
  }, [visible, boosting]);

  return (
    <div ref={boxRef} className={`dr-tile${first ? " first" : ""}${boosting ? " boosting" : ""}${small ? " small" : ""}`}>
      {video && visible
        ? <video ref={ref} src={video} poster={poster} muted loop playsInline autoPlay preload="auto"
            onLoadedMetadata={(e) => { e.currentTarget.playbackRate = boosting ? BOOST_RATE : 1; }} />
        : poster ? <img src={poster} alt="" /> : <div className="dr-tile-blank">🐕</div>}
      <span className={`dr-place${first ? " gold" : ""}`}>{place}</span>
      {boosting && <span className="dr-boost">{boostText}</span>}
      {fx && (isTapTapGift(fx.gift)
        ? <TapTapBurst key={fx.key} gift={fx.gift} contained sizeMin={small ? 18 : 26} sizeRange={small ? 8 : 14} />
        : (
          <div key={fx.key} className="dr-fx-card">
            {fx.gift.image ? <img src={mediaUrl(fx.gift.image)} alt="" /> : <span>🎁</span>}
          </div>
        ))}
      <div className="dr-strip">
        <span className="dr-name">{nameOf(p)}</span>
        <span className="dr-bbs">{p.bbs.toLocaleString()}</span>
      </div>
      {canGift && (
        // Steve, 2026-11-16: "We need to add our original red gift box" — the same gift box every
        // Chat Battle / Country Battle tile carries (BattleGrid's .cb-gift), not a new icon.
        <button type="button" className="cb-gift dr-gift" aria-label="🎁" onClick={(e) => { e.stopPropagation(); onGift(); }}>🎁</button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Everyone: the results
// ---------------------------------------------------------------------------------------------

export function DogRaceResults({ race, myId, onClose }: { race: DogRaceState; myId: number | null; onClose: () => void }) {
  const { t, lang } = useT();
  const [full, setFull] = useState<DogRaceState | null>(null);
  useEffect(() => {
    if (!myId) return;
    let ok = true;
    fetchDogRaceResults(myId, race.id).then((r) => { if (ok && r) setFull(r); });
    return () => { ok = false; };
  }, [myId, race.id]);
  const shown = full ?? race;
  const players = useMemo(() => [...shown.players].sort((a, b) => a.place - b.place || b.bbs - a.bbs), [shown]);
  const winner = shown.winner ?? (players[0] && players[0].bbs > 0 ? { user_id: players[0].user_id, username: nameOf(players[0]), bbs: players[0].bbs } : null);
  const winnerName = winner ? nameOf(players.find((p) => p.user_id === winner.user_id) ?? { username: winner.username }) : "";

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet dr-results" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t("dr_results")}>
        <h3 style={{ color: "var(--gold)", marginTop: 0, textAlign: "center" }}>🐕 {t("dr_results")}</h3>
        {winner && <p className="dr-winner">🏆 {t("dr_winner", winnerName, winner.bbs.toLocaleString())}</p>}
        <div className="dr-results-list">
          {players.map((p) => (
            <div key={p.user_id} className={`dr-result${p.place === 1 ? " first" : ""}`}>
              <div className="row">
                <span className={`dr-place static${p.place === 1 ? " gold" : ""}`}>{placeLabel(p.place, lang, t)}</span>
                <Avatar user={{ fullname: p.fullname, username: p.username, profile_image: p.profile } as Partial<UserSummary>} />
                {/* Steve, 2026-11-16: the BBs once per player — name, @username under it, the
                    score once on the right. */}
                <span className="dr-result-who">
                  <b>{p.fullname || p.username}</b>
                  {p.fullname && p.username && <span className="muted">@{p.username}</span>}
                </span>
                <span className="dr-result-bbs">{t("dr_bbs", p.bbs.toLocaleString())}</span>
              </div>
              <div className="dr-gifters">
                {p.gifters.length === 0
                  ? <span className="muted">{t("dr_no_gifts")}</span>
                  : <>
                      <span className="muted">{t("dr_gifted_by")} </span>
                      {p.gifters.map((g, i) => (
                        <span key={g.user_id || i}>{i > 0 ? " · " : ""}{nameOf(g)} <b style={{ color: "var(--gold)" }}>{g.bbs.toLocaleString()}</b></span>
                      ))}
                    </>}
              </div>
            </div>
          ))}
        </div>
        <button className="btn block" style={{ marginTop: 12 }} onClick={onClose}>{t("close")}</button>
      </div>
    </div>,
    document.body,
  );
}
