// Exciting News — Steve, 2026-09-29: "Next to for you page link Add another page link called
// 'Exciting News' ... all Bingg Bongg's exciting advertisements about what we are offering ...
// two buttons 'Photos' and 'Video' ... a description on top of every flyer ... a country name
// on each flyer so when a member from India opens the link, they will see all flyers from
// india first ... A search link will be on top." Same shared backend endpoint
// (ExcitingNewsController::fetchExcitingNews) the Android app uses — the country-first sort and
// search-by-description-or-country both happen server-side, this file just calls it.
import { mediaUrl, post } from "./api";

export type ExcitingNewsType = "photo" | "video";

// Steve, 2026-09-29: "if i want to create a flyer that's 9:32 will it fit the exciting news
// slot? ... Before i upload the flyer give me an option, 9:16 or 9:32." The admin's own
// declared shape — not detected from the file's real pixel dimensions, so the card can be
// sized to it immediately, no layout jump once the image/video itself loads.
export type ExcitingNewsAspectRatio = "9:16" | "9:32";

export interface ExcitingNewsFlyer {
  id: number;
  type: ExcitingNewsType;
  file: string;
  description?: string | null;
  /** The admin's own words, untranslated — so the page can offer "show original". */
  description_original?: string | null;
  /** Steve, 2026-10-02: the flyer's own words, kept OUT of the picture so they can be
   *  translated. Any piece may be empty — a flyer using fewer boxes just leaves them blank. */
  overlay?: { title?: string | null; subtitle?: string | null; body1?: string | null; body2?: string | null } | null;
  /** Where this flyer's own words go. Steve, 2026-10-02: "I'm making 10 more flyers with
   *  different designs, some with bigger boxes so they can fit more words" — so the boxes belong
   *  to the flyer, not to the feed. Absent means the usual template. */
  text_areas?: TextAreas | null;
  countries?: string[];
  aspect_ratio?: ExcitingNewsAspectRatio;
}

/** CSS `aspect-ratio` value for a flyer's declared shape — "9 / 32" is genuinely taller/
 *  narrower than "9 / 16", not just the same box with more letterboxing: unlike the phone app
 *  (locked to one-flyer-fills-exactly-one-screen swiping), the web grid isn't viewport-height
 *  constrained, so sizing the CARD itself to match lets a well-matched upload fill its own card
 *  edge to edge with zero letterboxing, instead of sitting inside a fixed 9:16 box. */
export function cssAspectRatio(f: Pick<ExcitingNewsFlyer, "aspect_ratio">): string {
  return f.aspect_ratio === "9:32" ? "9 / 32" : "9 / 16";
}

/** One text box on the flyer, as a share of the image so the numbers fit any size. */
export interface TextArea { x: number; y: number; w: number; h: number }
export interface TextAreas { header: TextArea; body1: TextArea; body2: TextArea }

/** What the server sends today. Kept as a fallback only so a stale response still renders
 *  something sane; the server's own numbers always win, which is what lets a box be nudged
 *  without an app release. */
export const DEFAULT_TEXT_AREAS: TextAreas = {
  header: { x: 17, y: 9.5, w: 66, h: 11.5 },
  body1: { x: 19, y: 33.0, w: 62, h: 17.4 },
  body2: { x: 19, y: 56.0, w: 62, h: 15.8 },
};

export interface ExcitingNewsPage {
  flyers: ExcitingNewsFlyer[];
  areas: TextAreas;
}

export async function fetchExcitingNews(
  myUserId: number,
  type: ExcitingNewsType,
  search: string,
  start: number,
  count: number,
  /** Steve, 2026-10-02: the reader's chosen language. Empty means "leave it as written" — the
   *  server then falls back to the browser's own Accept-Language, so a first visit is already
   *  readable before anyone touches the picker. The flyer IMAGE is never translated; this is the
   *  description above it. */
  language = "",
): Promise<ExcitingNewsPage> {
  const res = await post<ExcitingNewsFlyer[]>("fetchExcitingNews", {
    user_id: myUserId,
    type,
    search,
    start,
    count,
    language,
  });
  if (!res.status) throw new Error(res.message ?? "Couldn't load Exciting News.");
  return {
    flyers: (res.data ?? []).map((f) => ({ ...f, file: mediaUrl(f.file) })),
    areas: (res.text_areas as TextAreas | undefined) ?? DEFAULT_TEXT_AREAS,
  };
}
