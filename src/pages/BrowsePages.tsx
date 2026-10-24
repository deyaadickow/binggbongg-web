// The eight browse screens the phones have had all along (Steve, 2026-10-20: "Make all 8 tiles
// open the same as the phones. each tile will link to the same page as on the phones").
//
// Each one is the web half of a chip on the phones' home feed, so the Bingg Bongg Features tile
// that names it now opens the same thing here as it does there. The endpoints are untouched —
// see lib/browse.ts for what each one takes and why none of them paginate.
//
// The four FILTER screens (category, language, age, location) share one shape: pick a value,
// then a grid of videos, with "Show more" asking the server for another random batch and merging
// it. That is how the main feed already works on the web, because fetchPosts is random too.
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { mediaUrl, type Post } from "../lib/api";
import { useSession } from "../lib/session";
import { useT, type StringKey } from "../lib/i18n";
import { Loading, Notice } from "../components/Common";
import { PageTitle } from "../components/PageTitle";
import { PostCard } from "../components/PostCard";
import { loadCountries, type CountryRow } from "../lib/business";
import {
  AGE_GROUPS, POST_LANGUAGES, fetchCategories, fetchPrivateRooms, fetchRunningAds, fetchVipBadges,
  mergePosts, postsByAge, postsByCategory, postsByCountry, postsByLanguage,
  type ContestCat, type PrivateRoomSummary, type RunningAd, type VipBadge,
} from "../lib/browse";

/* ------------------------------------------------------------------ shared bits */

/** The gold-bordered pill a chooser is made of — categories, languages, ages, countries. */
function PickPill({ label, active, onClick }: { label: string; active?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      style={{
        padding: "9px 15px", borderRadius: 999, cursor: "pointer", fontSize: 14, fontWeight: 700,
        border: "1.5px solid var(--gold-border)", whiteSpace: "nowrap",
        background: active ? "var(--gold-border)" : "#0d0d0d",
        color: active ? "#0d0d0d" : "var(--gold)",
      }}>{label}</button>
  );
}

function PillRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>{children}</div>;
}

/**
 * The videos half of a filter screen.
 *
 * `load` is called with nothing but its own closure, so each screen decides what it is filtering
 * by. It is re-run from scratch whenever `resetKey` changes — picking a different category has to
 * throw the previous category's videos away, not merge into them.
 */
function FilteredPosts({ load, resetKey, emptyKey }: {
  load: () => Promise<Post[]>;
  resetKey: string | number | null;
  emptyKey: StringKey;
}) {
  const { t } = useT();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (resetKey === null) { setPosts(null); return; }
    let live = true;
    setPosts(null);
    load().then((batch) => { if (live) setPosts(batch); }).catch(() => { if (live) setPosts([]); });
    return () => { live = false; };
    // `load` is a fresh closure every render; resetKey is what actually decides a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  async function more() {
    if (busy || posts === null) return;
    setBusy(true);
    try {
      const batch = await load();
      // A random endpoint can hand back only repeats once the pool is exhausted. Merging drops
      // them, so an unchanged count is how this screen knows there is nothing left to show.
      setPosts((cur) => mergePosts(cur ?? [], batch));
    } finally { setBusy(false); }
  }

  if (resetKey === null) return null;
  if (posts === null) return <Loading />;
  if (posts.length === 0) return <div className="card pad"><p className="soft" style={{ margin: 0 }}>{t(emptyKey)}</p></div>;
  return (
    <>
      <div className="grid">{posts.map((p) => <PostCard key={p.id} post={p} />)}</div>
      <button className="btn" style={{ marginTop: 12 }} disabled={busy} onClick={more}>{t("show_more")}</button>
    </>
  );
}

/* ------------------------------------------------------------------ 1. Categories */

function CategoryGrid({ favouritesOnly }: { favouritesOnly?: boolean }) {
  const { t } = useT();
  const { user, isLoggedIn } = useSession();
  const [cats, setCats] = useState<ContestCat[] | null>(null);

  useEffect(() => { fetchCategories().then(setCats).catch(() => setCats([])); }, []);

  // Favourites are a comma-separated list of ids on the member's own row, exactly as Android
  // reads them (CategoryFragment.initFav).
  const shown = useMemo(() => {
    if (!cats) return null;
    if (!favouritesOnly) return cats;
    const ids = new Set(String(user?.fav_cats ?? "").split(",").map((s) => s.trim()).filter(Boolean));
    return cats.filter((c) => ids.has(String(c.id)));
  }, [cats, favouritesOnly, user]);

  if (favouritesOnly && !isLoggedIn) {
    return <div className="page"><PageTitle>{t("fname_fav_categories_browse")}</PageTitle><Notice>{t("sign_in_to_see_your_favourite_categories")}</Notice></div>;
  }

  return (
    <div className="page" style={{ maxWidth: 980 }}>
      <PageTitle>{t(favouritesOnly ? "fname_fav_categories_browse" : "fname_categories_browse")}</PageTitle>
      <p className="soft" style={{ marginTop: 0 }}>{t("pick_a_category_to_see_its_videos")}</p>
      {shown === null ? <Loading /> : shown.length === 0 ? (
        <div className="card pad"><p className="soft" style={{ margin: 0 }}>
          {t(favouritesOnly ? "you_haven_t_picked_any_favourite_categor" : "no_categories_yet")}</p></div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
          {shown.map((c) => (
            <Link key={c.id} to={`/browse/category/${c.id}`}
              className="card pad"
              style={{ textDecoration: "none", textAlign: "center", color: "var(--gold)", fontWeight: 700, borderColor: "var(--gold-border)" }}>
              {c.image && <img src={mediaUrl(c.image)} alt="" loading="lazy"
                style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 8, marginBottom: 8, display: "block" }} />}
              {c.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function CategoriesPage() { return <CategoryGrid />; }
export function FavouriteCategoriesPage() { return <CategoryGrid favouritesOnly />; }

export function CategoryVideosPage() {
  const { t } = useT();
  const { id } = useParams();
  const { user } = useSession();
  const catId = Number(id);
  const [cats, setCats] = useState<ContestCat[]>([]);
  useEffect(() => { fetchCategories().then(setCats).catch(() => setCats([])); }, []);
  const name = cats.find((c) => c.id === catId)?.name;

  return (
    <div className="page" style={{ maxWidth: 980 }}>
      <PageTitle>{name || t("fname_categories_browse")}</PageTitle>
      <FilteredPosts resetKey={catId} emptyKey="no_videos_yet"
        load={() => postsByCategory(catId, user?.id ?? null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ 2. By language */

export function ByLanguagePage() {
  const { t } = useT();
  const { user } = useSession();
  const [lang, setLang] = useState<string | null>(null);

  return (
    <div className="page" style={{ maxWidth: 980 }}>
      <PageTitle>{t("fname_by_language")}</PageTitle>
      <p className="soft" style={{ marginTop: 0 }}>{t("pick_a_language_to_see_its_videos")}</p>
      <PillRow>
        {POST_LANGUAGES.map((l) => (
          <PickPill key={l.code} label={l.native} active={lang === l.code} onClick={() => setLang(l.code)} />
        ))}
      </PillRow>
      <FilteredPosts resetKey={lang} emptyKey="no_videos_in_that_language_yet"
        load={() => postsByLanguage(lang ?? "", user?.id ?? null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ 3. By age group */

export function ByAgeGroupPage() {
  const { t } = useT();
  const { user } = useSession();
  const [groupId, setGroupId] = useState<number | null>(null);
  const group = AGE_GROUPS.find((g) => g.id === groupId);

  // The bands come from the phones as numbers, not as text, so the label is built here and reads
  // in whatever language the site is in — rather than shipping twelve more dictionary entries.
  const label = (g: { id: number; minAge: number; maxAge: number }) =>
    g.id === 0 ? t("all_ages")
      : g.maxAge === 0 ? t("n_years_old_and_over", g.minAge)
        : t("n_to_n_years_old", g.minAge, g.maxAge);

  return (
    <div className="page" style={{ maxWidth: 980 }}>
      <PageTitle>{t("fname_by_age_group")}</PageTitle>
      <p className="soft" style={{ marginTop: 0 }}>{t("pick_an_age_group_to_see_its_videos")}</p>
      <PillRow>
        {AGE_GROUPS.map((g) => (
          <PickPill key={g.id} label={label(g)} active={groupId === g.id} onClick={() => setGroupId(g.id)} />
        ))}
      </PillRow>
      <FilteredPosts resetKey={groupId} emptyKey="no_videos_yet"
        load={() => postsByAge(group?.minAge ?? 18, group?.maxAge ?? 0, user?.id ?? null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ 4. By location */

export function ByLocationPage() {
  const { t } = useT();
  const { user } = useSession();
  const [countries, setCountries] = useState<CountryRow[] | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [state, setState] = useState<string | null>(null);

  useEffect(() => { loadCountries().then(setCountries).catch(() => setCountries([])); }, []);
  const states = countries?.find((c) => c.name === country)?.states ?? [];

  return (
    <div className="page" style={{ maxWidth: 980 }}>
      <PageTitle>{t("fname_by_location")}</PageTitle>
      <p className="soft" style={{ marginTop: 0 }}>{t("pick_a_country_to_see_its_videos")}</p>
      {countries === null ? <Loading /> : (
        <PillRow>
          {countries.map((c) => (
            <PickPill key={c.iso2} label={c.name ?? ""} active={country === c.name}
              onClick={() => { setCountry(c.name ?? null); setState(null); }} />
          ))}
        </PillRow>
      )}
      {/* The state step is optional — the endpoint takes country alone, and most countries'
          lists are long enough that forcing a second choice would be in the way. */}
      {country && states.length > 0 && (
        <PillRow>
          <PickPill label={t("all")} active={state === null} onClick={() => setState(null)} />
          {states.map((s) => (
            <PickPill key={s.state_code ?? s.name} label={s.name ?? ""} active={state === s.name}
              onClick={() => setState(s.name ?? null)} />
          ))}
        </PillRow>
      )}
      <FilteredPosts resetKey={country === null ? null : `${country}|${state ?? ""}`} emptyKey="no_videos_from_there_yet"
        load={() => postsByCountry(country ?? "", state, user?.id ?? null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ 5. Advertisers */

export function AdvertisersPage() {
  const { t } = useT();
  const [ads, setAds] = useState<RunningAd[] | null>(null);
  useEffect(() => { fetchRunningAds().then(setAds).catch(() => setAds([])); }, []);

  return (
    <div className="page" style={{ maxWidth: 980 }}>
      <PageTitle>{t("fname_advertisers")}</PageTitle>
      <p className="soft" style={{ marginTop: 0 }}>{t("fblurb_advertisers")}</p>
      {ads === null ? <Loading /> : ads.length === 0 ? (
        <div className="card pad"><p className="soft" style={{ margin: 0 }}>{t("no_ads_are_running_right_now")}</p></div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
          {ads.map((a, i) => {
            const href = a.android_link || a.ios_link;
            const card = (
              <div className="card pad" style={{ borderColor: "var(--gold-border)", height: "100%" }}>
                {a.horizontal_image && <img src={mediaUrl(a.horizontal_image)} alt="" loading="lazy"
                  style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", borderRadius: 8, marginBottom: 10, display: "block" }} />}
                <div className="row" style={{ alignItems: "center", gap: 8 }}>
                  {a.brand_logo && <img src={mediaUrl(a.brand_logo)} alt=""
                    style={{ width: 28, height: 28, borderRadius: 14, objectFit: "cover" }} />}
                  <b style={{ color: "var(--gold)", fontSize: 15 }}>{a.brand_name || a.ads_title}</b>
                </div>
                {a.description && <p style={{ fontSize: 13, marginBottom: 0, color: "rgba(255,255,255,0.85)" }}>{a.description}</p>}
              </div>
            );
            // An advert's link is the advertiser's own site, so it leaves Bingg Bongg — and
            // noreferrer, because an advertiser does not need to be told who sent them.
            return href
              ? <a key={a.id ?? i} href={href} target="_blank" rel="noreferrer noopener"
                   style={{ textDecoration: "none", display: "block", height: "100%" }}>{card}</a>
              : <div key={a.id ?? i}>{card}</div>;
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ 6. VIP voter badges */

export function VipVoterBadgesPage() {
  const { t } = useT();
  const [badges, setBadges] = useState<VipBadge[] | null>(null);
  useEffect(() => { fetchVipBadges().then(setBadges).catch(() => setBadges([])); }, []);

  return (
    <div className="page" style={{ maxWidth: 980 }}>
      <PageTitle>{t("fname_vip_voter_badges")}</PageTitle>
      <p className="soft" style={{ marginTop: 0 }}>{t("fblurb_vip_voter_badges")}</p>
      {badges === null ? <Loading /> : badges.length === 0 ? (
        <div className="card pad"><p className="soft" style={{ margin: 0 }}>{t("nothing_here_yet")}</p></div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}>
          {badges.map((b, i) => (
            <div key={b.id ?? i} className="card pad" style={{ textAlign: "center", borderColor: "var(--gold-border)" }}>
              {b.image && <img src={mediaUrl(b.image)} alt="" loading="lazy"
                style={{ width: 64, height: 64, objectFit: "contain", display: "block", margin: "0 auto 8px" }} />}
              <b style={{ color: "var(--gold)", fontSize: 13, display: "block" }}>{b.name}</b>
              {/* votes is the coin threshold that earns the badge. */}
              <span className="muted" style={{ fontSize: 12 }}>{(b.votes ?? 0).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ 7. Private rooms */

export function PrivateRoomsPage() {
  const { t } = useT();
  const { user, isLoggedIn } = useSession();
  const [rooms, setRooms] = useState<PrivateRoomSummary[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    fetchPrivateRooms(user.id)
      .then(setRooms)
      .catch((e) => { setError(e instanceof Error ? e.message : ""); setRooms([]); });
  }, [user]);

  if (!isLoggedIn || !user) {
    return <div className="page"><PageTitle>{t("fname_private_rooms")}</PageTitle><Notice>{t("sign_in_to_see_the_rooms_that_are_open")}</Notice></div>;
  }

  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <PageTitle>{t("fname_private_rooms")}</PageTitle>
      <p className="soft" style={{ marginTop: 0 }}>{t("fblurb_private_rooms")}</p>
      {error && <Notice error>{error}</Notice>}
      {rooms === null ? <Loading /> : rooms.length === 0 ? (
        <div className="card pad"><p className="soft" style={{ margin: 0 }}>{t("no_rooms_are_open_right_now")}</p></div>
      ) : rooms.map((r) => (
        <div key={r.id} className="card pad" style={{ borderColor: "var(--gold-border)", marginBottom: 10 }}>
          <div className="row" style={{ alignItems: "center", gap: 10 }}>
            {r.host_profile_image
              ? <img src={r.host_profile_image} alt="" style={{ width: 40, height: 40, borderRadius: 20, objectFit: "cover" }} />
              : <div style={{ width: 40, height: 40, borderRadius: 20, background: "var(--bg)" }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ color: "var(--gold)", display: "block" }}>{r.room_name || t("fname_private_rooms")}</b>
              {r.host_user_id && (
                <Link to={`/profile/${r.host_user_id}`} className="muted" style={{ fontSize: 13 }}>
                  {r.host_fullname || r.host_username}
                </Link>
              )}
            </div>
            <div style={{ textAlign: "right", fontSize: 13, color: "var(--gold)" }}>
              <div><b>{(r.price_coins ?? 0).toLocaleString()}</b> {t("coins")}</div>
              <div className="muted">{r.active_bookings ?? 0}/{r.max_guests ?? 0}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
