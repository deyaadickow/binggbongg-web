import { post, type Gift } from "./api";

// The gift catalogue (tbl_gifts via fetchSettings) is the same for everyone and never changes
// mid-session, so it is fetched once per tab and shared — the For You grid shows a gift button
// on every card, and each must not refetch settings.
let cached: Promise<Gift[]> | null = null;

export function loadGifts(): Promise<Gift[]> {
  if (!cached) {
    cached = post<{ gifts?: Gift[]; livestreamGifts?: Gift[] }>("fetchSettings", { x: 1 })
      .then((res) => (res.data?.gifts?.length ? res.data.gifts : res.data?.livestreamGifts) ?? [])
      .catch((e) => { cached = null; throw e; });
  }
  return cached;
}
