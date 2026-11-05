// Build Your Houses (Steve, 2026-11-05) — /houses (your own) and /houses/:userId (anyone's).
//
// "You are the builder ... every coin you earn will build 1 part ... You need 60,000 coins to
// build one house. A block/street has 40 houses." Everyone is in automatically, every member has
// a public house page, and there are country + world boards for this month and this year.
//
// The approved design is the mockup in "1 Ads/Build your houses/house_builder_mockup.html". The
// house, its progress bars, the speed bar and the street are drawn by the SHARED renderer
// (public/houses/house-view.js), the same file the phones show in a WebView. This page is the
// frame around it: tabs, stats, pace, the boards. Server contract:
// binggbongg-backend/docs/build_your_houses_contract.md.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PageTitle } from "../components/PageTitle";
import { Avatar } from "../components/Common";
import { useSession } from "../lib/session";
import { useT, type StringKey } from "../lib/i18n";
import {
  fetchHouseBoards, fetchMyHouses, fetchUserHouses, houseViewLang, loadHouseView, readLastSeen, writeLastSeen,
  PARTS_PER_HOUSE, type Board, type BoardRow, type HouseViewApi, type HousesData, type HousesResult,
} from "../lib/houses";

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const POLL_MS = 10_000;

export function HousesPage() {
  const { userId: param } = useParams();
  const { user, isLoggedIn } = useSession();
  const { t } = useT();
  const paramId = param && /^\d+$/.test(param) ? Number(param) : null;
  const ownerId = paramId ?? (isLoggedIn && user ? user.id : null);
  const own = !!(isLoggedIn && user && ownerId === user.id);
  const [tab, setTab] = useState<"build" | "lb">("build");
  const [res, setRes] = useState<HousesResult<HousesData> | null>(null);

  // A board row opens that member's page on the house tab.
  useEffect(() => { setTab("build"); setRes(null); }, [param]);

  const load = useCallback(async () => {
    if (!ownerId) return;
    const r = own && user ? await fetchMyHouses(user.id) : await fetchUserHouses(ownerId, user?.id);
    // Keep showing the last good numbers through a passing network error while polling.
    setRes((prev) => (r.kind === "error" && prev?.kind === "ok" ? prev : r));
  }, [ownerId, own, user]);

  // Poll every ~10 s while the page is visible: new gifts become new bricks.
  useEffect(() => {
    if (!ownerId) return;
    let stop = false;
    let timer = 0;
    const tick = async () => {
      if (stop) return;
      if (!document.hidden) await load();
      if (!stop) timer = window.setTimeout(tick, POLL_MS);
    };
    void tick();
    const onVis = () => { if (!document.hidden) { window.clearTimeout(timer); void tick(); } };
    document.addEventListener("visibilitychange", onVis);
    return () => { stop = true; window.clearTimeout(timer); document.removeEventListener("visibilitychange", onVis); };
  }, [ownerId, load]);

  const data = res?.kind === "ok" ? res.data : null;
  const ownerName = data ? (data.user.fullname || data.user.username || "") : "";

  return (
    <div className="bh">
      <PageTitle>{t("bh_title")}</PageTitle>
      <div className="bh-sub">{t("bh_subtitle")}</div>
      <div className="bh-tabs" role="tablist">
        <button role="tab" className={tab === "build" ? "on" : ""} onClick={() => setTab("build")}>
          {paramId && !own ? (ownerName ? t("bh_houses_of", ownerName) : t("bh_tab_houses")) : t("bh_tab_my")}
        </button>
        <button role="tab" className={tab === "lb" ? "on" : ""} onClick={() => setTab("lb")}>{t("bh_tab_boards")}</button>
      </div>

      <div style={{ display: tab === "build" ? "block" : "none" }}>
        {!ownerId ? (
          <div className="bh-card bh-soon">
            <div className="ic">🏠</div>
            <p>{t("bh_sign_in")}</p>
            <Link to="/login" className="btn" style={{ marginTop: 14 }}>{t("sign_in")}</Link>
          </div>
        ) : res === null ? (
          <div className="bh-note">…</div>
        ) : res.kind === "not_ready" ? (
          <ComingSoon />
        ) : res.kind === "not_found" ? (
          <div className="bh-card bh-note">{t("bh_not_found")}</div>
        ) : res.kind === "error" ? (
          <div className="bh-card bh-note">
            {t("bh_error")}
            <div><button className="btn small" style={{ marginTop: 10 }} onClick={() => void load()}>{t("bh_retry")}</button></div>
          </div>
        ) : data ? (
          <>
            {!data.is_me && <OwnerCard data={data} />}
            <HouseRenderer key={`${data.user.user_id}`} ownerId={data.user.user_id} isMe={data.is_me} lifetime={data.lifetime_coins} />
            <Stats data={data} />
            {data.is_me && data.recent && data.recent.length > 0 && <Recent rows={data.recent} />}
          </>
        ) : null}
        <Rules />
      </div>

      {tab === "lb" && <Boards />}
    </div>
  );
}

function ComingSoon() {
  const { t } = useT();
  return (
    <div className="bh-card bh-soon">
      <div className="ic">🏗️</div>
      <h3>{t("bh_coming_soon")}</h3>
      <p>{t("bh_coming_soon_body")}</p>
    </div>
  );
}

function OwnerCard({ data }: { data: HousesData }) {
  const u = data.user;
  return (
    <div className="bh-card">
      <Link to={`/profile/${u.user_id}`} className="bh-owner" style={{ color: "inherit" }}>
        <Avatar user={{ id: u.user_id, fullname: u.fullname, username: u.username, profile_image: u.profile_image }} />
        <div style={{ minWidth: 0 }}>
          <div className="nm">{u.fullname || u.username} {u.flag ?? ""}</div>
          <small>@{u.username}{u.country ? ` · ${u.country}` : ""}</small>
        </div>
      </Link>
    </div>
  );
}

/** Mounts the shared renderer once per member page and feeds it the lifetime count. */
function HouseRenderer({ ownerId, isMe, lifetime }: { ownerId: number; isMe: boolean; lifetime: number }) {
  const { lang } = useT();
  const box = useRef<HTMLDivElement>(null);
  const api = useRef<HouseViewApi | null>(null);
  // Bumped on every (re)init so the progress effect below always feeds a fresh renderer.
  const [gen, setGen] = useState(0);
  const fed = useRef(0);
  const rlang = houseViewLang(lang);

  useEffect(() => {
    let cancelled = false;
    loadHouseView().then((hv) => {
      if (cancelled || !box.current) return;
      api.current = hv.init({
        container: box.current,
        lang: rlang,
        onEvent: (e) => {
          // Remember what this member has watched being laid, so the next visit carries on from
          // there instead of replaying (or skipping) bricks.
          if (isMe && (e.type === "progress" || e.type === "caughtUp") && typeof e.partsShown === "number") writeLastSeen(ownerId, e.partsShown);
        },
      });
      setGen((g) => g + 1);
    }).catch(() => { /* the stats below still show the numbers */ });
    return () => {
      cancelled = true;
      if (api.current) { api.current.destroy(); api.current = null; }
    };
  }, [ownerId, isMe, rlang]);

  useEffect(() => {
    if (!gen || !api.current) return;
    if (fed.current !== gen) {
      fed.current = gen;
      // First visit: no stored position -> the renderer starts at the beginning of THIS house.
      const seen = isMe ? readLastSeen(ownerId) : undefined;
      api.current.setProgress({ lifetimeParts: lifetime, lastSeenParts: seen !== undefined && seen <= lifetime ? seen : undefined, theme: ownerId % 6 });
    } else {
      api.current.setProgress({ lifetimeParts: lifetime });
    }
  }, [gen, lifetime, ownerId, isMe]);

  return <div ref={box} style={{ minHeight: gen ? undefined : 560 }} />;
}

function rankText(t: (k: StringKey, ...a: (string | number)[]) => string, country: number | null, world: number | null, flag?: string | null) {
  if (country === null && world === null) return t("bh_not_ranked");
  const parts: string[] = [];
  if (country !== null) parts.push(`#${fmt(country)} ${flag ?? ""}`.trim());
  if (world !== null) parts.push(t("bh_rank_world", fmt(world)));
  return parts.join(" · ");
}

function Stats({ data }: { data: HousesData }) {
  const { t } = useT();
  const pr = data.projection;
  const perDay = pr?.coins_per_day ?? 0;
  const h = pr?.houses_per_year ?? 0;
  const st = pr?.streets_per_year ?? 0;
  const left = Math.max(0, PARTS_PER_HOUSE - data.current_house.parts_done);
  return (
    <div className="bh-card">
      <h2>{data.is_me ? t("bh_record") : t("bh_record_of")}</h2>
      <div className="bh-stats">
        <div className="bh-stat"><div className="k">{t("bh_houses_built")}</div><div className="v">{fmt(data.houses_built)}</div></div>
        <div className="bh-stat"><div className="k">{t("bh_streets_built")}</div><div className="v">{fmt(data.streets_built)}</div></div>
        <div className="bh-stat"><div className="k">{t("bh_month_coins")}</div><div className="v">{fmt(data.this_month.coins)}</div></div>
        <div className="bh-stat"><div className="k">{t("bh_year_coins")}</div><div className="v">{fmt(data.this_year.coins)}</div></div>
        <div className="bh-stat"><div className="k">{t("bh_coins_left")}</div><div className="v">{fmt(left)}</div></div>
        <div className="bh-stat"><div className="k">{t("bh_lifetime")}</div><div className="v">{fmt(data.lifetime_coins)}</div></div>
        <div className="bh-stat"><div className="k">{t("bh_rank_month")}</div><div className="v sm">{rankText(t, data.this_month.country_rank, data.this_month.world_rank, data.user.flag)}</div></div>
        <div className="bh-stat"><div className="k">{t("bh_rank_year")}</div><div className="v sm">{rankText(t, data.this_year.country_rank, data.this_year.world_rank, data.user.flag)}</div></div>
      </div>
      <div className="bh-pace">
        {perDay > 0
          ? t(data.is_me ? "bh_pace" : "bh_pace_other", fmt(perDay), h < 10 ? h.toFixed(1) : fmt(h), st < 1 ? st.toFixed(2) : st.toFixed(1))
          : t("bh_pace_none")}
        <small>{t("bh_pace_note")}</small>
      </div>
    </div>
  );
}

const KIND_KEYS: Record<string, StringKey> = {
  "1v1": "hk_1v1", series: "hk_series", "2v2": "hk_2v2", marathon: "hk_marathon", "555": "hk_555", virtual: "hk_virtual",
  bingo: "hk_bingo", pyramid: "hk_pyramid", board_game: "hk_board_game", trivia_battle: "hk_trivia_battle",
  country_battle: "hk_country_battle", chat_battle: "hk_chat_battle", solo_battle: "hk_solo_battle", room_battle: "hk_room_battle",
  guess_game: "hk_guess_game", trivia_night: "hk_trivia_night", word_search: "hk_word_search", behind_game: "hk_behind_game", tap_game: "hk_tap_game",
};

function Recent({ rows }: { rows: NonNullable<HousesData["recent"]> }) {
  const { t } = useT();
  return (
    <div className="bh-card">
      <h2>{t("bh_recent")}</h2>
      {rows.slice(0, 20).map((r, i) => {
        const k = KIND_KEYS[r.battle_kind];
        const when = new Date(r.at);
        return (
          <div className="bh-recent" key={i}>
            <span><b>+{fmt(r.coins)}</b> · {k ? t(k) : r.battle_kind}</span>
            <span>{isNaN(when.getTime()) ? "" : when.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
          </div>
        );
      })}
    </div>
  );
}

function Rules() {
  const { t } = useT();
  return (
    <div className="bh-card bh-rules">
      <h2>{t("bh_how")}</h2>
      <div className="r"><span>{t("bh_rule_f")}</span><b>{t("bh_coins_n", "5,000")}</b></div>
      <div className="r"><span>{t("bh_rule_b")}</span><b>{t("bh_coins_n", "50,000")}</b></div>
      <div className="r"><span>{t("bh_rule_s")}</span><b>{t("bh_coins_n", "5,000")}</b></div>
      <div className="r"><span>{t("bh_rule_h")}</span><b>{t("bh_coins_n", "60,000")}</b></div>
      <div className="r" style={{ border: 0 }}><span>{t("bh_rule_st")}</span><b>{t("bh_coins_n", "2,400,000")}</b></div>
      <p>{t("bh_how_body")}</p>
    </div>
  );
}

function Boards() {
  const { t } = useT();
  const { user } = useSession();
  const navigate = useNavigate();
  const hasCountry = !!(user && (user as { country?: string | null }).country);
  const [scope, setScope] = useState<"country" | "world">(hasCountry ? "country" : "world");
  const [period, setPeriod] = useState<"month" | "year">("month");
  const [res, setRes] = useState<HousesResult<Board> | null>(null);
  const [countryLabel, setCountryLabel] = useState<string>("");

  useEffect(() => {
    let alive = true;
    setRes(null);
    void fetchHouseBoards({ scope, period, userId: user?.id }).then((r) => {
      if (!alive) return;
      setRes(r);
      if (r.kind === "ok" && r.data.scope === "country" && r.data.country) setCountryLabel(`${r.data.country_flag ?? ""} ${r.data.country}`.trim());
    });
    return () => { alive = false; };
  }, [scope, period, user?.id]);

  const open = (row: BoardRow) => navigate(`/houses/${row.user_id}`);

  return (
    <div className="bh-card">
      {hasCountry && (
        <div className="bh-seg">
          <button className={scope === "country" ? "on" : ""} onClick={() => setScope("country")}>{countryLabel || (user as { country?: string }).country}</button>
          <button className={scope === "world" ? "on" : ""} onClick={() => setScope("world")}>🌍 {t("bh_scope_world")}</button>
        </div>
      )}
      <div className="bh-seg">
        <button className={period === "month" ? "on" : ""} onClick={() => setPeriod("month")}>{t("bh_period_month")}</button>
        <button className={period === "year" ? "on" : ""} onClick={() => setPeriod("year")}>{t("bh_period_year")}</button>
      </div>
      {res === null ? (
        <div className="bh-note">…</div>
      ) : res.kind === "not_ready" ? (
        <div className="bh-soon"><div className="ic">🏗️</div><h3>{t("bh_coming_soon")}</h3><p>{t("bh_coming_soon_body")}</p></div>
      ) : res.kind !== "ok" ? (
        <div className="bh-note">{t("bh_error")}</div>
      ) : res.data.scope === "country" && !res.data.country ? (
        <div className="bh-note">{t("bh_no_country")}</div>
      ) : (
        <>
          <div className="bh-lbhead"><span>{t("bh_col_builder")}{res.data.total_builders > 0 ? ` · ${t("bh_builders_total", fmt(res.data.total_builders))}` : ""}</span><span>{t("bh_col_coins")}</span></div>
          {res.data.data.length === 0 && <div className="bh-note">{t("bh_board_empty")}</div>}
          {res.data.data.map((row) => <BoardLine key={`${row.rank}-${row.user_id}`} row={row} you={row.user_id === user?.id} onOpen={open} />)}
          {res.data.me && !res.data.me.in_list && (
            <div className="bh-you"><BoardLine row={res.data.me} you onOpen={open} /></div>
          )}
        </>
      )}
    </div>
  );
}

function BoardLine({ row, you, onOpen }: { row: BoardRow; you?: boolean; onOpen: (r: BoardRow) => void }) {
  const { t } = useT();
  const houses = row.houses === 1 ? t("bh_house_1") : t("bh_houses_n", fmt(row.houses));
  const streets = row.streets > 0 ? ` · ${row.streets === 1 ? t("bh_street_1") : t("bh_streets_n", fmt(row.streets))}` : "";
  const name = you ? `${t("bh_you")} · ${row.fullname || row.username || ""}` : (row.fullname || row.username || "");
  return (
    <button type="button" className={`bh-lbrow ${row.rank <= 3 ? `top${row.rank}` : ""}`} onClick={() => onOpen(row)}>
      <div className={`rk ${row.rank > 999 ? "long" : ""}`}>{row.rank <= 3 && <span className="bh-crown">♕</span>}{fmt(row.rank)}</div>
      <Avatar user={{ id: row.user_id, fullname: row.fullname, username: row.username, profile_image: row.profile_image }} />
      <div className="nm"><div>{name} {row.flag ?? ""}</div><small>🏠 {houses}{streets}</small></div>
      <div className="cn">{fmt(row.coins)}<small>{t("bh_coins")}</small></div>
    </button>
  );
}

/** "🏠 N houses" on a profile — opens that member's house page. Hidden until the server has the
 *  feature (so a profile never shows a link to a "Coming soon"). */
export function HousesPill({ userId }: { userId: number }) {
  const { t } = useT();
  const { user } = useSession();
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    setN(null);
    void fetchUserHouses(userId, user?.id).then((r) => { if (alive && r.kind === "ok") setN(r.data.houses_built); });
    return () => { alive = false; };
  }, [userId, user?.id]);
  if (n === null) return null;
  return (
    <Link to={`/houses/${userId}`} className="bh-pill" title={t("bh_title")}>
      🏠 {n === 1 ? t("bh_house_1") : t("bh_houses_n", fmt(n))}
    </Link>
  );
}
