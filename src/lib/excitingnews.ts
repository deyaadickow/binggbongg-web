// Exciting News — Steve, 2026-09-29: "Next to for you page link Add another page link called
// 'Exciting News' ... all Bingg Bongg's exciting advertisements about what we are offering ...
// two buttons 'Photos' and 'Video' ... a description on top of every flyer ... a country name
// on each flyer so when a member from India opens the link, they will see all flyers from
// india first ... A search link will be on top." Same shared backend endpoint
// (ExcitingNewsController::fetchExcitingNews) the Android app uses — the country-first sort and
// search-by-description-or-country both happen server-side, this file just calls it.
import { mediaUrl, post } from "./api";

export type ExcitingNewsType = "photo" | "video";

export interface ExcitingNewsFlyer {
  id: number;
  type: ExcitingNewsType;
  file: string;
  description?: string | null;
  countries?: string[];
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
