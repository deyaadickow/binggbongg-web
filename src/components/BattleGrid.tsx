// The shared battle grid (Country Battle 2026-11-01, reused by Chat Battle 2026-11-03 and Country
// Battle v2): the 6/12/24-tile layouts, a tile (photo or video, name strip, gift box, star, ear),
// the 15–25 s rotation, star pins, the "cb_star"/"cb_stars" sound-follows-the-star signals, and
// the battle header.
//
// "top left tile will be the person for his account and the rest of the tile will be members
// popping up at random and keep changing"; "the shuffle will be every 15 to 25 seconds, it could
// be 3,5,7,10 or any amount of members at a time ... the only member will stay in that account is
// the account owner/the host. and even the host can show on some one else's screen."
// "add a small gift box to fit each tile for sending gifts."
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { PopNumber } from "./PopNumber";
import { TileGiftLayer } from "./TileGiftLayer";
import { initials, mediaUrl, type Gift } from "../lib/api";
import { useT } from "../lib/i18n";
import { GiftFlash } from "./GiftSheet";
import { SundayBonusPill } from "./SundayBonus";
import { battlerIdOf } from "../lib/countryBattleRoom";
import { cbText, gridShape, hostSpan, type CbStage } from "../lib/countryBattle";

export function TestBanner() {
  const { t } = useT();
  return <div className="cb-test">🧪 {t("cb_test")}</div>;
}

// ---- the grid -------------------------------------------------------------------------------

export interface CbTileData {
  userId: number;
  name: string;
  photo?: string | null;
  own?: boolean;
  /** Chat Battle: the battler a viewer followed in — pinned top-left with a gold border, but
   *  (unlike your own tile) it keeps its gift box. */
  home?: boolean;
  /** Chat Battle: the leaderboard's 30-second spotlight — a flashing gold border. */
  spot?: boolean;
  /** Pinned with a star by the battler on this screen: it never rotates out (useStarPins). */
  starred?: boolean;
  /** This member starred ME (the "cb_star" signal) and I have not starred them back. */
  starredMe?: boolean;
  /** Not heard on this screen: a tiny muted icon in the corner opposite the star. */
  muted?: boolean;
  /** Chat Battle round 2: a gift just landed on this tile — its icon pops up over the tile.
   *  `key` restarts the animation when a second gift lands before the first one has faded. */
  gift?: { icon: string | null; key: number } | null;
  /** Virtual Country Battles (Steve, 2026-11-24): a member who is NOT live, shown by their profile
   *  photo (no video) with a small gold "Virtual" badge. Gifts reach them like any tile's. */
  virtual?: boolean;
  /** Shown on a virtual tile's name strip: their battle score (BBs). */
  score?: number | null;
  /** Round 2c: their country's scenery (storage path), shown full-bleed when there is no profile photo. */
  scenery?: string | null;
  /** Round 2b: the host tile (the first, bigger one) — a small gold "Host" pill top-left. */
  host?: boolean;
}

/** Height the grid may use: from its own top edge (below the site's header and the battle
 *  header, whatever they measure on this screen) down to the bottom of the window, less the
 *  phones' fixed "get the app" bar and the hint line. Measured, not guessed — the site header is
 *  one row on a desktop and two on a phone. */
/**
 * Country Battle on a phone (Steve, 2026-11-24: "no mater how many tiles there is just make sure it covers the phone
 * screen leaving room for chat"): the height the tiles may fill — from the grid's top to the bottom of the screen,
 * less the get-app bar and `reserve` (the chat strip and the icon bar). `share` < 1 for the first Country VS Country
 * half (the second half takes what is left). Null on a wider screen, where tiles keep their shape.
 */
function useFillHeight(ref: React.RefObject<HTMLDivElement | null>, enabled: boolean, reserve = 34, share = 1, cols = 1, rows = 1, strict = false): number | null {
  const [h, setH] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!enabled) { setH(null); return; }
    const measure = () => {
      const el = ref.current;
      if (!el) return;
      if (window.innerWidth >= 700) { setH(null); return; }
      const top = el.getBoundingClientRect().top + window.scrollY;
      const bar = document.querySelector(".get-app-bar");
      const barH = bar && getComputedStyle(bar).display !== "none" ? bar.getBoundingClientRect().height : 0;
      const room = window.innerHeight - top - barH - reserve;
      // Never squash a tile flatter than about 1.1 tall per 1 wide: a big battle scrolls a little instead.
      const minRows = rows * Math.round((el.getBoundingClientRect().width / Math.max(1, cols)) * 1.1);
      // Country Battle rooms (`strict`, Steve: 5 chat lines + the icon bar on screen WITHOUT scrolling): exactly the
      // room left, however flat that makes the tiles — measured off the real chat strip and icon bar under the grid and
      // the top of the fixed get-app bar, so nothing is guessed.
      if (strict) {
        const r = el.getBoundingClientRect();
        const page = el.closest(".cb-page");
        const last = page?.querySelector(".cb-bar") ?? page?.querySelector(".chb-chat");
        const below = last ? last.getBoundingClientRect().bottom - r.bottom + 4 : reserve;
        const floor = bar && getComputedStyle(bar).display !== "none" ? bar.getBoundingClientRect().top : window.innerHeight;
        setH(Math.max(80, Math.floor(floor - (r.top + window.scrollY) - below)));
        return;
      }
      setH(Math.max(share < 1 ? 140 : 220, minRows, Math.floor(room * share)));
    };
    measure();
    window.addEventListener("resize", measure);
    const t1 = setTimeout(measure, 300);
    const t2 = setTimeout(measure, 900);
    return () => { window.removeEventListener("resize", measure); clearTimeout(t1); clearTimeout(t2); };
  }, [ref, enabled, reserve, share, cols, rows, strict]);
  return h;
}

function useAvailableHeight(ref: React.RefObject<HTMLDivElement | null>, reserve = 34, phoneFullWidth = false): number | null {
  const [h, setH] = useState<number | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = ref.current;
      if (!el) return;
      // On a phone the grid may take the full width instead (the page scrolls a little) so that
      // 24 tiles stay readable 4 across — the site header alone is a third of a 360-px screen.
      if (phoneFullWidth && window.innerWidth < 600) { setH(null); return; }
      const top = el.getBoundingClientRect().top + window.scrollY;
      const bar = document.querySelector(".get-app-bar");
      const barH = bar && getComputedStyle(bar).display !== "none" ? bar.getBoundingClientRect().height : 0;
      setH(Math.max(200, window.innerHeight - top - barH - reserve));
    };
    measure();
    window.addEventListener("resize", measure);
    const t = setTimeout(measure, 300); // the get-app bar mounts a moment later
    return () => { window.removeEventListener("resize", measure); clearTimeout(t); };
  }, [ref, reserve, phoneFullWidth]);
  return h;
}

function CbTile({ tile, listening, onTap, onGift, onOpen, attach, hasVideo, version, span, giftBox = true }: {
  tile: CbTileData;
  /** Design B: false on tiny tiles (more than 12) — no gift box; the screen's tap opens the gift sheet. */
  giftBox?: boolean;
  /** The double arrow: open this member (a virtual tile: their profile page). */
  onOpen?: () => void;
  /** Country Battle's host tile over the spots the last row would leave empty: columns, rows,
   *  and whether it fills its rows alone (then its 3:4-per-cell shape sets the rows' height). */
  span?: { cols: number; rows: number; alone: boolean };
  listening: boolean;
  onTap?: () => void;
  onGift?: () => void;
  attach?: (el: HTMLVideoElement) => () => void;
  hasVideo: boolean;
  version: number;
}) {
  const { t } = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  // The attach arrives as a NEW function on every render (the screen re-renders each second for
  // its countdown). Keyed on it, the camera was detached and re-attached every second — the
  // video blinking in and out (Steve, 2026-11-21). Now it re-attaches only when the member, their
  // video, or the room's tracks change, and the room hook skips a re-attach of the same track.
  const attachRef = useRef(attach);
  attachRef.current = attach;
  const canAttach = !!attach;
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !attachRef.current || !hasVideo) return;
    return attachRef.current(el);
  }, [tile.userId, canAttach, hasVideo, version]);
  const photo = tile.photo ? mediaUrl(tile.photo) : "";
  const realPhoto = photo && !/\/$/.test(photo);
  const [photoBroken, setPhotoBroken] = useState(false);
  // Steve, 2026-11-24 (round 2c): "The initials and a black background on each tile is too boring.
  // Please remove the initials and add a nice scenery from their own country on their tile." No
  // profile photo = their country's scenery, full-bleed; none (or it fails) = plain black.
  const scenery = tile.scenery ? mediaUrl(tile.scenery) : "";
  const [sceneryBroken, setSceneryBroken] = useState(false);
  const sceneryImg = scenery && !sceneryBroken
    ? (
      // Moving scenery (Steve 2026-11-24: "find gif, animating images, they would look 100 times better"): a slow
      // zoom-and-drift with a soft light sweep, each tile on its own timing from the member's id so none move together.
      <div className="cb-scenery-wrap" style={sceneryMotion(tile.userId)}>
        <img className="cb-photo cb-scenery" src={scenery} alt="" loading="lazy" onError={() => setSceneryBroken(true)} />
        <span className="cb-scenery-shine" />
      </div>
    )
    : null;
  // Design B (Steve approved the mockup, 2026-11-24) — the same on a virtual tile and a live one: the BBs big and gold
  // at the TOP CENTRE (the rolling number); just above the name, bottom-left the "Host" pill (the room's host) or the "V"
  // pill (a virtual tile; tap = "Virtual" for 3 s) — never both — and bottom-right the red gift box; the full name side
  // to side along the bottom. Tiny tiles (`giftBox` false) drop the gift box: a tap on the tile opens the gift sheet.
  const spanStyle: React.CSSProperties | undefined = span && (span.cols > 1 || span.rows > 1) ? {
    gridColumn: `span ${span.cols}`, gridRow: `span ${span.rows}`,
    ...(span.alone ? { aspectRatio: `${span.cols * 3} / ${span.rows * 4}` } : { aspectRatio: "auto", alignSelf: "stretch" }),
  } : undefined;
  const pill = tile.host ? <HostPill /> : tile.virtual ? <VBadge label={t("vcb_virtual")} /> : null;
  const gift = onGift && giftBox && !tile.own ? onGift : null;
  if (tile.virtual) {
    return (
      <div className={`cb-tile virtual${tile.host ? " host" : ""}${tile.spot ? " spot" : ""}`} role="button" tabIndex={0} onClick={onTap}
        style={spanStyle}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onTap?.(); } }}>
        {realPhoto && !photoBroken
          ? <img className="cb-photo" src={photo} alt="" loading="lazy" onError={() => setPhotoBroken(true)} />
          : sceneryImg ?? <div className="cb-vph" />}
        <TileGiftLayer uid={tile.userId} />
        {tile.gift && <TileGift key={tile.gift.key} icon={tile.gift.icon} />}
        {/* The » "be the host" arrows are gone (Steve, 2026-11-24: "I don't think the 2 arrows on the screen is
            needed, when the first real member joins the room he will be the host"). HOST_SWAP brings them back. */}
        {HOST_SWAP && onOpen && (
          <button type="button" className="cb-vopen" aria-label={tile.name} title={tile.name}
            onClick={(e) => { e.stopPropagation(); onOpen(); }}>»</button>
        )}
        <TileChrome score={tile.score} pill={pill} onGift={gift} name={tile.name} />
      </div>
    );
  }
  return (
    <div className={`cb-tile${tile.host ? " host" : ""}${tile.own ? " own" : ""}${tile.home ? " home" : ""}${tile.spot ? " spot" : ""}${tile.starred ? " starred" : ""}${tile.starredMe ? " starred-me" : ""}${listening ? " listening" : ""}`}
      role={tile.own ? undefined : "button"} tabIndex={tile.own ? undefined : 0}
      onClick={tile.own ? undefined : onTap}
      style={spanStyle}
      onKeyDown={(e) => { if (!tile.own && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onTap?.(); } }}>
      {/* The member's photo while their video connects (and for good, if it never does). */}
      {realPhoto
        ? <img className="cb-photo" src={photo} alt="" loading="lazy" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
        : sceneryImg ?? <div className="cb-ph" style={{ background: tileBackdrop(tile.userId) }}><i>{initials(tile.name || "?")}</i></div>}
      {hasVideo && <video ref={videoRef} autoPlay playsInline muted />}
      {/* Steve, 2026-11-23: a gift plays only in the giver's and the receiver's tiles. */}
      <TileGiftLayer uid={tile.userId} />
      {tile.starred && <span className="cb-star" aria-hidden>★</span>}
      {listening && <span className="cb-ear" aria-hidden>🔊</span>}
      {tile.muted && !tile.own && <span className="cb-muted" aria-hidden>🔇</span>}
      {tile.starredMe && <span className="cb-starme">{t("chb_starred_you_tile")}</span>}
      {tile.gift && <TileGift key={tile.gift.key} icon={tile.gift.icon} />}
      <TileChrome score={tile.score} pill={pill} onGift={gift} name={tile.name} />
    </div>
  );
}

/** The gold "Host" pill (black text) — bottom-left above the name. */
export function HostPill() {
  const { t } = useT();
  return <span className="cb-vbadge cb-hostpill">{t("vcb_host")}</span>;
}

/**
 * Design B's tile chrome, shared by the Country Battle room and the Go Live multi-guest grid: the BBs top centre (only
 * when there is a figure), then along the bottom a row with `pill` on the left and the red gift box (plus `extra`, e.g.
 * the speaker icon) on the right, just above the full name.
 */
export function TileChrome({ score, pill, onGift, name, extra }: {
  score?: number | null; pill?: React.ReactNode; onGift?: (() => void) | null; name: React.ReactNode; extra?: React.ReactNode;
}) {
  return (
    <>
      {score != null && <span className="cb-bbs"><PopNumber value={score} /></span>}
      <span className="cb-foot">
        {(pill || onGift || extra) && (
          <span className="cb-foot-row">
            <span className="cb-foot-l">{pill}</span>
            <span className="cb-foot-r">
              {extra}
              {onGift && (
                <button type="button" className="cb-gift cb-gift-red" aria-label="🎁"
                  onClick={(e) => { e.stopPropagation(); onGift(); }}><GiftIcon /></button>
              )}
            </span>
          </span>
        )}
        <span className="cb-fname">{name}</span>
      </span>
    </>
  );
}

const HOST_SWAP = false;

/** The virtual pill as just "V" (Steve, 2026-11-24: "Virtual is too long of a word to be on the screen, we can shorten
 *  that to a "V" when anyone click the V it will show them entire word"): a tap opens it to the whole word for a
 *  few seconds, then it folds back to V. */
function VBadge({ label }: { label: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => setOpen(false), 3000);
    return () => window.clearTimeout(id);
  }, [open]);
  return (
    <button type="button" className={`cb-vbadge cb-vshort${open ? " open" : ""}`} aria-label={label} title={label}
      onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>
      {open ? label : label.trim().charAt(0).toUpperCase()}
    </button>
  );
}

/** The tile gift button's icon: a white gift box (Steve, 2026-11-24 round 2: "the gold gift box
 *  please make it red" — a red button, white icon and border). */
function GiftIcon() {
  return (
    <svg viewBox="0 0 24 24" width="62%" height="62%" aria-hidden="true" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="8" width="17" height="4.5" rx="1" />
      <path d="M5 12.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7.5" />
      <path d="M12 8v13" />
      <path d="M12 8c-1.6-3.6-5.6-4.4-5.6-1.8C6.4 7.6 9 8 12 8Zm0 0c1.6-3.6 5.6-4.4 5.6-1.8C17.6 7.6 15 8 12 8Z" />
    </svg>
  );
}

/** A gift's icon popping up over the tile it landed on (🎁 when it has no icon, or it fails). */
function TileGift({ icon }: { icon: string | null }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className="cb-tile-gift" aria-hidden>
      {icon && !broken ? <img src={mediaUrl(icon)} alt="" onError={() => setBroken(true)} /> : "🎁"}
    </span>
  );
}

/** Country Battle: the first (bigger, top-left) tile of a grid is the host tile (round 2b) — or, with rooms, the room's
 *  host's tile (`hostId`; null = no real member in the room, so no Host pill at all). */
function withHost(tile: CbTileData, host: boolean | null): CbTileData {
  if (host === null) return tile;
  return host ? (tile.host ? tile : { ...tile, host: true }) : tile.host ? { ...tile, host: false } : tile;
}

/** A dark tint per member, so photo-less tiles are told apart at a glance. */
function tileBackdrop(id: number): string {
  const hue = (id * 47) % 360;
  return `linear-gradient(160deg, hsl(${hue} 35% 22%), hsl(${(hue + 40) % 360} 30% 9%))`;
}

export function CountryBattleGrid({ stage, shape, tiles, listen, onTap, onGift, onOpen, attach, hasVideo, version = 0, flash, onFlashDone, reserve, phoneFullWidth, fillShare = 1, giftBox = true, hostId, strictFill = false }: {
  /** Country Battle rooms: fill exactly the height left above the chat and icon bar (no minimum tile shape). */
  strictFill?: boolean;
  /** Design B: false = tiny tiles, no gift box on them. */
  giftBox?: boolean;
  /** Country Battle rooms: whose tile carries the Host pill (null = nobody's). Undefined = the first tile's. */
  hostId?: number | null;
  stage: CbStage;
  tiles: CbTileData[];
  /** Who is heard on this screen (one tapped tile, or the starred members). */
  listen: number | null | number[];
  onTap?: (userId: number) => void;
  onGift?: (userId: number) => void;
  /** A virtual tile's double arrow (Virtual Country Battles): open that member. */
  onOpen?: (userId: number) => void;
  attach?: (userId: number, el: HTMLVideoElement) => () => void;
  hasVideo?: (userId: number) => boolean;
  version?: number;
  flash?: { userId: number; gift: Gift } | null;
  onFlashDone?: () => void;
  /** Pixels to keep free under the grid (the hint line; Chat Battle's chat strip). */
  reserve?: number;
  /** On a phone-width screen, use the full width rather than shrinking to fit the height. */
  phoneFullWidth?: boolean;
  /** Country Battle: the shape for the tile count (countShape); else the stage's. */
  shape?: { cap: number; cols: number };
  /** Country VS Country: the first half fills this share of the phone screen's room, the second the rest. */
  fillShare?: number;
}) {
  const { cols } = shape ?? gridShape(stage);
  const rows = Math.max(1, Math.ceil(tiles.length / cols));
  // Each tile is 3:4, so the whole grid is (cols*3):(rows*4). It is as wide as the page allows,
  // but never so wide that its last row falls below the bottom of the screen.
  const ratio = (cols * 3) / (rows * 4);
  // Country Battle: no empty spot — the first (host) tile takes them (hostSpan).
  const span = shape ? hostSpan(tiles.length, cols) : null;
  const stageRef = useRef<HTMLDivElement>(null);
  // Full phone width is for 4 across; fewer columns fit the screen's height instead.
  const avail = useAvailableHeight(stageRef, reserve, phoneFullWidth && (!shape || cols >= 4));
  const heard = new Set(Array.isArray(listen) ? listen : listen != null ? [listen] : []);
  // Country Battle on a phone: the tiles stretch to fill the screen down to the chat, whatever their number.
  const fillH = useFillHeight(stageRef, !!shape, reserve, fillShare, cols, rows, strictFill);
  return (
    <div ref={stageRef} className="cb-stage" style={fillH ? { width: "100%" } : { width: avail ? `min(100%, ${Math.round(avail * ratio)}px)` : "100%", minWidth: Math.min(240, cols * 70) }}>
      <div className={`cb-grid cols-${cols}${fillH ? " fill" : ""}${fillH && strictFill ? " strict" : ""}`}
        style={fillH ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`, height: fillH }
          : { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {tiles.map((tile) => (
          <CbTile key={`${tile.own ? "own" : tile.home ? "home" : tile.virtual ? "v" : "m"}-${tile.userId}`}
            tile={withHost(tile.muted == null && !tile.own ? { ...tile, muted: !heard.has(tile.userId) } : tile,
              hostId !== undefined ? hostId != null && tile.userId === hostId : !!shape && tile === tiles[0] ? true : null)} listening={heard.has(tile.userId)}
            giftBox={giftBox}
            onTap={onTap ? () => onTap(tile.userId) : undefined}
            onGift={onGift ? () => onGift(tile.userId) : undefined}
            onOpen={onOpen && tile.virtual ? () => onOpen(tile.userId) : undefined}
            attach={attach ? (el) => attach(tile.userId, el) : undefined}
            hasVideo={hasVideo ? hasVideo(tile.userId) : false}
            version={version} span={span && tile === tiles[0] ? span : undefined} />
        ))}
      </div>
      {/* The gift just sent, over the whole grid — a tile is too small to hold the card. */}
      {flash && onFlashDone && <GiftFlash gift={flash.gift} onDone={onFlashDone} />}
    </div>
  );
}

/**
 * Which members are on screen, and the shuffle.
 *
 * Every random 15–25 s, a random 3–10 of the shown tiles (never more than there are, never the
 * own tile — that is not in `pool`) are swapped for members not on screen. A member who leaves
 * is replaced in place, so the rest of the grid does not jump. A tile whose gift picker is open
 * (`hold`) is never swapped. If everyone fits, nothing rotates.
 *
 * `hold` may be several ids (Chat Battle holds the gift target AND the spotlit battler). `pin`
 * (Chat Battle's leaderboard spotlight) puts that member in the FIRST rotating slot now — the
 * member it displaces takes the pinned one's old slot, or leaves the screen — and is held there.
 */
export function useRotation(slots: number, pool: number[], hold: number | null | number[], pin: number | null = null): number[] {
  const [shown, setShown] = useState<number[]>([]);
  const poolRef = useRef(pool);
  const holdSet = new Set<number>(Array.isArray(hold) ? hold : hold != null ? [hold] : []);
  if (pin != null) holdSet.add(pin);
  const holdRef = useRef(holdSet);
  poolRef.current = pool;
  holdRef.current = holdSet;
  const poolKey = pool.join(",");

  useEffect(() => {
    if (pin == null || slots <= 0) return;
    setShown((cur) => {
      if (!poolRef.current.includes(pin)) return cur;
      // "The first rotating slot": the first one not held by a star (or the gift picker).
      const first = cur.findIndex((id) => id === pin || !holdRef.current.has(id));
      const at = cur.indexOf(pin);
      if (first === -1) {
        if (cur.length < slots) return [...cur, pin];
        return cur;
      }
      if (at === first) return cur;
      const next = [...cur];
      if (at >= 0) { next[at] = next[first]; next[first] = pin; }
      else next[first] = pin;
      return next;
    });
  }, [pin, slots, poolKey]);

  useEffect(() => {
    setShown((cur) => {
      const inPool = new Set(poolRef.current);
      const next: (number | null)[] = cur.slice(0, slots).map((id) => (inPool.has(id) ? id : null));
      const used = new Set(next.filter((x): x is number => x != null));
      const spare = shuffle(poolRef.current.filter((id) => !used.has(id)));
      for (let i = 0; i < next.length; i++) if (next[i] == null && spare.length) next[i] = spare.shift()!;
      const out = next.filter((x): x is number => x != null);
      while (out.length < slots && spare.length) out.push(spare.shift()!);
      return sameList(out, cur) ? cur : out;
    });
  }, [poolKey, slots]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        setShown((cur) => {
          const onScreen = new Set(cur);
          const spare = shuffle(poolRef.current.filter((id) => !onScreen.has(id)));
          if (spare.length === 0) return cur;
          const swappable = shuffle(cur.map((id, i) => ({ id, i })).filter((x) => !holdRef.current.has(x.id)));
          const k = Math.min(3 + Math.floor(Math.random() * 8), spare.length, swappable.length);
          if (k <= 0) return cur;
          const next = [...cur];
          for (let j = 0; j < k; j++) next[swappable[j].i] = spare[j];
          return next;
        });
        schedule();
      }, 15000 + Math.random() * 10000);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);

  return shown;
}

/** How often a few virtual tiles change: a random 15–20 s each time. */
export const VIRTUAL_ROTATE_MIN_MS = 15000;
export const VIRTUAL_ROTATE_MAX_MS = 20000;

/**
 * Virtual Country Battles (Steve, 2026-11-24): which virtual members fill the free spaces. The
 * server's `virtual` list is in a fixed order for the day. With more of them than spaces, every
 * 15–20 s only 20–30% of the tiles change ("please rotate the members on the tile once every 15 to
 * 20 seconds and not every 3 to 5 seconds. and only rotate like 20 to 30% at a time"): random slots
 * take the next members in the day's order who are not on screen; the rest stay put. `paused` (a
 * gift sheet open) holds them still.
 */
export function useVirtualWindow(ids: number[], slots: number, paused = false): number[] {
  const key = ids.join(",");
  const [shown, setShown] = useState<number[]>([]);
  const cursor = useRef(0);
  const n = ids.length;
  const want = Math.max(0, Math.min(slots, n));
  // Keep who is still there, fill the gaps in the day's order.
  useEffect(() => {
    setShown((prev) => {
      const inList = new Set(ids);
      const kept = prev.filter((id) => inList.has(id)).slice(0, want);
      const on = new Set(kept);
      const out = [...kept];
      for (let i = 0; out.length < want && i < n; i++) {
        const id = ids[(cursor.current + i) % n];
        if (!on.has(id)) { out.push(id); on.add(id); cursor.current = (cursor.current + i + 1) % n; i = -1; }
      }
      return sameList(out, prev) ? prev : out;
    });
  }, [key, want]); // eslint-disable-line react-hooks/exhaustive-deps
  const rotates = want > 0 && n > want;
  useEffect(() => {
    if (!rotates || paused) return;
    let timer = 0;
    const next = () => {
      timer = window.setTimeout(() => {
        setShown((prev) => {
          if (prev.length === 0) return prev;
          const share = 0.2 + Math.random() * 0.1;
          const count = Math.max(1, Math.ceil(prev.length * share));
          const slotsToSwap = shuffle(prev.map((_, i) => i)).slice(0, count);
          const on = new Set(prev);
          const out = [...prev];
          for (const slot of slotsToSwap) {
            for (let i = 0; i < n; i++) {
              const id = ids[(cursor.current + i) % n];
              if (!on.has(id)) { on.delete(out[slot]); out[slot] = id; on.add(id); cursor.current = (cursor.current + i + 1) % n; break; }
            }
          }
          return out;
        });
        next();
      }, VIRTUAL_ROTATE_MIN_MS + Math.random() * (VIRTUAL_ROTATE_MAX_MS - VIRTUAL_ROTATE_MIN_MS));
    };
    next();
    return () => clearTimeout(timer);
  }, [rotates, paused, key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (want <= 0) return [];
  if (!rotates) return ids.slice(0, want);
  return shown.length ? shown : ids.slice(0, want);
}

function shuffle<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}
const sameList = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Star pins (Steve, 2026-11-03): "when a host clicks on up to 3 members to chat with add a small
 * star to those members tile, they will be the only once that will not leave that chat until he
 * clicks them again and removes the star. and please do the same in the country battle as well."
 *
 * Only for a battler on their own screen (a viewer never pins). Up to 3; a 4th tap says so.
 * Kept on this device only — no server call — and a pin goes the moment its member is no longer
 * live in the battle. Pass the result to useRotation's `hold` so a starred tile never rotates out.
 */
export const MAX_STAR_PINS = 3;
export function useStarPins(pool: number[], enabled: boolean, onFull: () => void) {
  const [pins, setPins] = useState<number[]>([]);
  const poolKey = pool.join(",");
  // The member left (or the screen stopped being a battler's): their star goes.
  useEffect(() => {
    const inPool = new Set(pool);
    setPins((cur) => {
      const next = enabled ? cur.filter((id) => inPool.has(id)) : [];
      return sameList(next, cur) ? cur : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolKey, enabled]);
  const pinsRef = useRef(pins);
  pinsRef.current = pins;
  const onFullRef = useRef(onFull);
  onFullRef.current = onFull;
  /** Star or unstar a member. Returns true when they are starred afterwards. */
  const toggle = useCallback((id: number): boolean => {
    const cur = pinsRef.current;
    if (cur.includes(id)) { setPins(cur.filter((x) => x !== id)); return false; }
    if (cur.length >= MAX_STAR_PINS) { onFullRef.current(); return false; }
    setPins([...cur, id]);
    return true;
  }, []);
  return { pins, toggle };
}

/**
 * Sound follows the star (Steve, 2026-11-03: "They can also chat with each other, means their
 * speaker will be on"). A battler hears only the members they starred (plus a leaderboard
 * spotlight); everyone else is muted. Starring someone tells THEIR device with a LiveKit data
 * message — topic "cb_star", {from: identity, on}, sent to that one battler — so it can say
 * "@you starred you — tap ★ to talk back"; starring back makes it two-way. No server involved.
 *
 * A viewer following a host hears the host plus the host's starred members. The phones' contract
 * only names "cb_star", which goes to the starred battler alone, so the host's star list also goes
 * to the whole room on topic "cb_stars" ({from, stars: [ids]}, re-sent every 10 s for late
 * arrivals). A client that does not send it simply leaves its viewers hearing the host.
 *
 * `onData` is stable; hand it to useCountryBattleRoom's onData (through a ref, since the room hook
 * is created first and provides `sendData`).
 */
export function useStarSignals(opts: {
  myId: number; isBattler: boolean; pins: number[]; home: number | null; pool: number[]; connected: boolean;
  sendData: (topic: string, payload: unknown, toUserId?: number | null) => boolean;
}) {
  const { myId, isBattler, pins, home, pool, connected, sendData } = opts;
  const [starredMe, setStarredMe] = useState<number[]>([]);
  const [homeStars, setHomeStars] = useState<number[]>([]);
  const homeRef = useRef(home);
  homeRef.current = home;
  const onData = useCallback((topic: string, payload: unknown, from: number | null) => {
    const p = (payload ?? {}) as { from?: unknown; on?: unknown; stars?: unknown };
    const who = from ?? battlerIdOf(typeof p.from === "string" ? p.from : null);
    if (!who) return;
    if (topic === "cb_star") {
      const on = p.on === true || p.on === 1 || p.on === "true";
      setStarredMe((cur) => (on ? (cur.includes(who) ? cur : [...cur, who]) : cur.includes(who) ? cur.filter((x) => x !== who) : cur));
    } else if (topic === "cb_stars" && who === homeRef.current) {
      const ids = Array.isArray(p.stars) ? p.stars.map(Number).filter((x) => x > 0) : [];
      setHomeStars((cur) => (sameList(cur, ids) ? cur : ids));
    }
  }, []);
  useEffect(() => { setHomeStars([]); }, [home]);

  // Tell each newly starred (or unstarred) member, and the room, whenever my stars change.
  const sent = useRef<Set<number>>(new Set());
  const pinKey = pins.join(",");
  const sendRef = useRef(sendData);
  sendRef.current = sendData;
  useEffect(() => {
    if (!connected || !isBattler || !myId) { sent.current = new Set(); return; }
    const from = `user_${myId}`;
    const want = new Set(pins);
    for (const id of want) if (!sent.current.has(id)) sendRef.current("cb_star", { from, on: true }, id);
    for (const id of sent.current) if (!want.has(id)) sendRef.current("cb_star", { from, on: false }, id);
    sent.current = want;
    sendRef.current("cb_stars", { from, stars: pins });
    if (!pins.length) return;
    const timer = setInterval(() => sendRef.current("cb_stars", { from, stars: pins }), 10000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinKey, connected, isBattler, myId]);

  // Someone who starred me and then left the battle: their banner goes.
  const poolKey = pool.join(",");
  useEffect(() => {
    const inPool = new Set(pool);
    setStarredMe((cur) => { const n = cur.filter((id) => inPool.has(id)); return n.length === cur.length ? cur : n; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolKey]);
  return { starredMe, homeStars, onData };
}

/** Who this screen hears. A battler: their starred members (+ the spotlight). A viewer: the host
 *  they followed in and that host's starred members, plus whatever tile they tapped. */
export function heardIds(input: { isBattler: boolean; pins: number[]; home: number | null; homeStars: number[]; spot?: number | null; listen?: number | null }): number[] {
  const s = new Set<number>(input.isBattler ? input.pins : [...(input.home ? [input.home, ...input.homeStars] : []), ...(input.listen != null ? [input.listen] : [])]);
  if (input.spot != null) s.add(input.spot);
  return [...s].sort((a, b) => a - b);
}

/** "@maria starred you — tap ★ to talk back", over the grid, one line per member who starred me
 *  and is not starred back. The ★ stars them back (which also keeps them on screen). */
export function StarredYouBar({ ids, nameOf, onStarBack }: { ids: number[]; nameOf: (id: number) => string; onStarBack: (id: number) => void }) {
  const { t } = useT();
  if (!ids.length) return null;
  return (
    <div className="cb-starbar">
      {ids.map((id) => (
        <div key={id} className="cb-starbar-row">
          <span>{cbText(t("chb_starred_you"), { name: nameOf(id) || "?" })}</span>
          <button type="button" className="cb-bullseye" aria-label="★" onClick={() => onStarBack(id)}>★</button>
        </div>
      ))}
    </div>
  );
}

// ---- the header -----------------------------------------------------------------------------

/** The battle header. Country Battle's by default; Chat Battle passes its own title, score line,
 *  back label and a row of actions (Join / Leaderboard). */
export function CbHeader({ stage, sub, line, liveCount, myScore, onBack, isTest, title, scoreText, backLabel, actions, bonus = true, bonusBump }: {
  stage: string; sub: string; line: string; liveCount?: number | null; myScore?: number | null; onBack: () => void; isTest?: boolean;
  title?: string; scoreText?: string | null; backLabel?: string; actions?: React.ReactNode;
  /** The Sunday Battle Bonus pill (only shows on a bonus Sunday); off for the loading/ended shells. */
  bonus?: boolean; bonusBump?: unknown;
}) {
  const { t } = useT();
  const score = scoreText ?? (myScore != null ? cbText(t("cb_my_today"), { n: myScore.toLocaleString() }) : null);
  return (
    <>
      {isTest && <TestBanner />}
      <div className="cb-head">
        <div className="cb-head-row">
          <button className="back-circle" onClick={onBack} aria-label={backLabel ?? t("cb_leave")} title={backLabel ?? t("cb_leave")}>‹</button>
          {/* Steve, 2026-11-22: title, country and members battling centred side to side. */}
          <div className="cb-head-mid">
            <span className="cb-head-title">{title ?? t("cb_title")}</span>
            <span className="cb-head-stage">{stage}</span>
          </div>
          <div className="cb-head-clock">
            {sub && <span>{sub}</span>}
            <b>{line}</b>
          </div>
        </div>
        {/* Steve, 2026-11-21: "On top of the page should be how many members are battling". */}
        {liveCount != null && (
          <div className="cb-head-battling" aria-live="polite">⚔️ {cbText(t("cb_members_battling"), { n: liveCount.toLocaleString() })}</div>
        )}
        {(liveCount != null || score != null || actions) && (
          <div className="cb-head-sub">
            {liveCount != null && <span className="pill live">● {cbText(t("cb_live_count"), { n: liveCount })}</span>}
            {score != null && <span className="cb-score">{score}</span>}
            {actions && <span className="cb-head-actions">{actions}</span>}
          </div>
        )}
        {bonus && <SundayBonusPill bump={bonusBump} />}
      </div>
    </>
  );
}

/** Per-tile timing for the moving scenery: 9–14 s zoom/drift, 6–8 s light sweep, a start offset and a direction. */
function sceneryMotion(userId: number): React.CSSProperties {
  const h = (n: number) => Math.abs(Math.imul(userId ^ n, 2654435761) >>> 0);
  const dur = 9 + (h(1) % 51) / 10;
  const shine = 6 + (h(2) % 21) / 10;
  const dirs = [[-6, -4], [6, -4], [-6, 4], [6, 4], [0, -6], [-6, 0]];
  const [dx, dy] = dirs[h(3) % dirs.length];
  return {
    ["--kb-dur" as string]: `${dur}s`,
    ["--kb-delay" as string]: `-${(h(4) % 100) / 10}s`,
    ["--kb-x" as string]: `${dx}%`,
    ["--kb-y" as string]: `${dy}%`,
    ["--kb-shine" as string]: `${shine}s`,
    ["--kb-shine-delay" as string]: `-${(h(5) % 80) / 10}s`,
  };
}
