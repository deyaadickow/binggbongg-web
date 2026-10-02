import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "../lib/session";
import { Loading, Notice } from "../components/Common";
import { PickerSheet } from "../components/PickerSheet";
import { TRANSLATION_LANGUAGES, languageName } from "../lib/translate";
import { DEFAULT_TEXT_AREAS, cssAspectRatio, fetchExcitingNews, type ExcitingNewsFlyer, type ExcitingNewsType, type TextAreas } from "../lib/excitingnews";
import { FlyerOverlay } from "../components/FlyerOverlay";

const PAGE_SIZE = 20;

/**
 * Steve, 2026-09-29: "Next to for you page link Add another page link called 'Exciting News'
 * In that page will be all Bingg Bongg's exciting advertisements about what we are offering.
 * when they click on this link There will be two buttons 'Photos' and 'Video' right under
 * these links will be all the flyers that admin will be adding as photos. One flyer 9:16 that
 * will cover the entire space of the phone and continue the flyers as they scroll up or down.
 * There will be a description on top of every flyer and the videos as an introduction. In
 * admin panel I will need to add a country name on each flyer so when a member from India
 * opens the link, they will see all flyers from india first and then continue to other flyer
 * from other countries. And the same with all the videos. A search link will be on top in-case
 * they want to search for any country or word."
 *
 * Web adaptation of the Android screen (same shared backend, same country-first sort): the
 * phone version is a full-bleed one-flyer-at-a-time vertical swipe, which isn't a native web
 * pattern — here it's a responsive grid of large 9:16 cards instead, "Show more" pagination
 * like HomePage's own feed rather than an infinite scroll-triggered fetch.
 *
 * Image fit: object-fit: contain, not cover — Android's first cut used a cropping fit and a
 * real admin-uploaded flyer (a wide banner graphic, not actually 9:16) got its own text cropped
 * off both edges; contain avoids repeating that mistake here, at the honest cost of letterboxing
 * when a flyer's own aspect ratio doesn't match the card's.
 */
export function ExcitingNewsPage() {
  const { user } = useSession();
  const [type, setType] = useState<ExcitingNewsType>("photo");
  const [search, setSearch] = useState("");
  const [flyers, setFlyers] = useState<ExcitingNewsFlyer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reachedEnd, setReachedEnd] = useState(false);
  // Where the flyer's three text boxes sit, as shares of the image. The SERVER decides, so a
  // box can be nudged without an app release; this default only covers a stale response.
  const [areas, setAreas] = useState<TextAreas>(DEFAULT_TEXT_AREAS);
  // Steve, 2026-10-02: "Please add a tab that says 'Translate all flyers in 50 different
  // languages' when they click on this tab, they can choose one of 50 languages to translate."
  // Empty means "as written": the server then falls back to the browser's own language, so a
  // first visit already reads correctly before anyone opens this.
  const [langOpen, setLangOpen] = useState(false);
  const [language, setLanguage] = useState<string>(() => {
    try { return localStorage.getItem("bb.newsLang") ?? ""; } catch { return ""; }
  });

  const load = useCallback(async (reset: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const start = reset ? 0 : flyers.length;
      const page = await fetchExcitingNews(user?.id ?? 0, type, search.trim(), start, PAGE_SIZE, language);
      setAreas(page.areas);
      setReachedEnd(page.flyers.length < PAGE_SIZE);
      setFlyers((prev) => (reset ? page.flyers : [...prev, ...page.flyers]));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, type, search, language]);

  // Reset and reload whenever the Photos/Video toggle OR the chosen language changes — search is
  // submitted explicitly (Enter or the Search button), same as the Virtual Battle picker's own
  // "Search members" box, not on every keystroke.
  //
  // `language` has to be in THIS list, not only in load()'s own. Leaving it out meant picking a
  // language rebuilt the loader but never ran it: the button said Spanish and every flyer stayed
  // in English, which is exactly how it behaved the first time it was tried in a browser.
  useEffect(() => {
    setFlyers([]);
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, language]);

  function runSearch() {
    setFlyers([]);
    load(true);
  }

  return (
    <div className="page">
      <div className="row" style={{ marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Exciting News</h1>
        <span className="spacer" />
        <button className={`btn small ${type === "photo" ? "" : "ghost"}`} onClick={() => setType("photo")}>Photos</button>
        <button className={`btn small ${type === "video" ? "" : "ghost"}`} onClick={() => setType("video")}>Video</button>
      </div>
      {/* This translates the description AND the words drawn on the flyer. The picture itself is
          never touched — anything Steve bakes into the artwork stays in whatever language he drew
          it, which is why the words live in the boxes instead. */}
      <div className="row" style={{ marginBottom: 14 }}>
        <button className="btn small block" onClick={() => setLangOpen(true)} style={{ justifyContent: "space-between" }}>
          <span>🌐 Translate all flyers in {TRANSLATION_LANGUAGES.length} different languages</span>
          <span style={{ color: "var(--gold-bright)" }}>{language ? languageName(language) : "As written"}</span>
        </button>
      </div>
      <div className="row" style={{ gap: 8, marginBottom: 18 }}>
        <input
          className="input"
          placeholder="Search a country or word…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
          style={{ flex: 1 }}
        />
        <button className="btn small" onClick={runSearch}>Search</button>
      </div>
      {error && <Notice error>{error}</Notice>}
      {!loading && flyers.length === 0 && !error && (
        <Notice>{search.trim() ? "No flyers found." : "Nothing here yet."}</Notice>
      )}
      <div className="grid wide">
        {flyers.map((f) => (
          <div key={f.id} className="card" style={{ overflow: "hidden" }}>
            {f.description && (
              <div style={{ padding: "10px 14px", background: "rgba(0,0,0,0.4)", fontSize: 14 }}>{f.description}</div>
            )}
            {/* This flyer's own boxes when it has them — the designs differ — else the feed's. */}
            <FlyerArt flyer={f} areas={f.text_areas ?? areas} />
          </div>
        ))}
      </div>
      {loading ? <Loading /> : !reachedEnd && flyers.length > 0 && (
        <div className="center" style={{ marginTop: 20 }}>
          <button className="btn" onClick={() => load(false)}>Show more</button>
        </div>
      )}
      {langOpen && (
        <PickerSheet
          title="Translate all flyers"
          noun="language"
          selected={language}
          items={[{ code: "", name: "As written — don't translate" },
                  ...TRANSLATION_LANGUAGES.map((l) => ({ code: l.code, name: `${l.name} · ${l.native}` }))]}
          onPick={(code) => {
            setLanguage(code);
            try { localStorage.setItem("bb.newsLang", code); } catch { /* ignore */ }
            setLangOpen(false);
          }}
          onClose={() => setLangOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * A flyer and the words drawn on it.
 *
 * The overlay's type sizes are a share of the rendered height, so the same flyer reads correctly
 * as a grid thumbnail and as a full-screen card. That means the height has to be measured rather
 * than assumed, which is what the observer below is for — the grid is responsive, so it changes
 * whenever the window does.
 */
function FlyerArt({ flyer, areas }: { flyer: ExcitingNewsFlyer; areas: TextAreas }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  /** The artwork's own proportions, which decide where inside the card it actually lands. */
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  // Where the picture is really drawn. The card's shape comes from the flyer's DECLARED ratio,
  // but `contain` letterboxes anything exported at a different one — and the text boxes are
  // shares of the PICTURE, not of the card. Lining the overlay up with the drawn rectangle means
  // a flyer saved at the wrong size still puts its words on its own boxes.
  const rect = (() => {
    if (!box.w || !box.h) return null;
    if (!natural || !natural.w || !natural.h) return { left: 0, top: 0, w: box.w, h: box.h };
    const ar = natural.w / natural.h;
    const w = Math.min(box.w, box.h * ar);
    return { left: (box.w - w) / 2, top: (box.h - w / ar) / 2, w, h: w / ar };
  })();

  return (
    <div ref={ref} style={{ position: "relative", aspectRatio: cssAspectRatio(flyer), background: "#000" }}>
      {flyer.type === "video" ? (
        <video
          src={flyer.file}
          controls
          loop
          muted
          playsInline
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
          onLoadedMetadata={(e) => setNatural({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })}
        />
      ) : (
        <img
          src={flyer.file}
          alt={flyer.description ?? "Flyer"}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
          onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
        />
      )}
      {/* Only drawn once the size is known, or the first paint would size the text off zero. */}
      {rect && (
        <div style={{ position: "absolute", left: rect.left, top: rect.top, width: rect.w, height: rect.h, pointerEvents: "none" }}>
          <FlyerOverlay flyer={flyer} areas={areas} height={rect.h} />
        </div>
      )}
    </div>
  );
}
