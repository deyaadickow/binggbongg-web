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

export async function fetchExcitingNews(
  myUserId: number,
  type: ExcitingNewsType,
  search: string,
  start: number,
  count: number,
): Promise<ExcitingNewsFlyer[]> {
  const res = await post<ExcitingNewsFlyer[]>("fetchExcitingNews", {
    user_id: myUserId,
    type,
    search,
    start,
    count,
  });
  if (!res.status) throw new Error(res.message ?? "Couldn't load Exciting News.");
  return (res.data ?? []).map((f) => ({ ...f, file: mediaUrl(f.file) }));
}
