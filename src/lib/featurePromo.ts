// Feature promo cards in the main feed (Steve, 2026-11-07): "From our featured video ads make them
// all as ads for our app ... Say something like try this feature out and tell us how much you love
// it ... Also make an ad regarding if they have any idea that they would like to see on Bingg Bongg
// ... Show these videos to every member's 20th videos watched."
//
// Which feature goes in which card. Only directory tiles that this member can see AND that have a
// feature video; every 3rd card is Share Your Idea. The rest rotate through a shuffled deck that is
// remembered on this device, so a member keeps seeing NEW features across visits and none repeats
// until all have been shown once.
import type { Feature } from "../pages/FeaturesPage";

/** A feature card after every this many member videos (20, 40, 60 …). */
export const FEATURE_PROMO_EVERY = 20;
/** Every this-many-th feature card is the Share Your Idea card. */
export const IDEA_CARD_EVERY = 3;
/** The tile key of Share Your Idea (its feature video is stored under it too). */
export const IDEA_KEY = "fname_share_your_idea";

const DECK_KEY = "bb.featurePromoDeck";

export const promoVideoKey = (f: Feature) => f.videoKey ?? f.nameKey;

function shuffled<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function loadDeck(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(DECK_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch { return []; }
}

function saveDeck(deck: string[]) {
  try { localStorage.setItem(DECK_KEY, JSON.stringify(deck)); } catch { /* private mode */ }
}

/** The order this visit's non-idea cards take: what is left of the saved deck first (still in its
 *  shuffled order), then fresh shuffles of everything. Long enough for any feed a visit loads. */
export function promoSequence(keys: string[], length: number): string[] {
  if (keys.length === 0) return [];
  const valid = new Set(keys);
  let deck = loadDeck().filter((k) => valid.has(k));
  if (deck.length === 0) { deck = shuffled(keys); saveDeck(deck); }
  const out = [...deck];
  while (out.length < length) {
    let next = shuffled(keys);
    // Never the same feature twice in a row across a reshuffle.
    if (next.length > 1 && next[0] === out[out.length - 1]) next = [...next.slice(1), next[0]];
    out.push(...next);
  }
  return out;
}

/** A card was seen: take its feature out of the saved deck; a used-up deck starts a new shuffle. */
export function markPromoShown(key: string, keys: string[]) {
  if (key === IDEA_KEY) return;
  const valid = new Set(keys);
  let deck = loadDeck().filter((k) => valid.has(k) && k !== key);
  if (deck.length === 0) deck = shuffled(keys.filter((k) => k !== key)).concat(keys.includes(key) ? [key] : []);
  saveDeck(deck);
}

/** Which feature (by video key) the n-th feature card shows (n = 1 at video 20, 2 at 40 …), or null
 *  for no card. Every 3rd is Share Your Idea when it has a video; the others step through `seq`. */
export function promoForCard(n: number, seq: string[], hasIdea: boolean): string | null {
  if (hasIdea && n % IDEA_CARD_EVERY === 0) return IDEA_KEY;
  if (seq.length === 0) return hasIdea ? IDEA_KEY : null;
  const j = hasIdea ? n - 1 - Math.floor(n / IDEA_CARD_EVERY) : n - 1;
  return seq[j % seq.length];
}
