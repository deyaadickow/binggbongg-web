// DEV-ONLY stand-in for the Bingg Bongg Song server (binggbongg-backend e5af018, not deployed yet).
// Loaded only through lib/song.ts under `import.meta.env.DEV` and `?songmock=1`, so it is never
// in the production build and never lets a test call songPreview / songBuy on the real server
// (each costs real money at Google).
//
// It follows SongController's state machine: draft -> previewing (~6 s) -> preview_ready, 3 free
// previews then "no_free_previews", buy -> making (~10 s) -> done with a share code. Mode "nobbs"
// answers buy with "not_enough_coins"; mode "fail" ends making in "failed" + refunded.
// Songs are kept in sessionStorage so a reload keeps them.
import type { ApiResponse } from "./api";
import type { Song, SongLine } from "./song";

/** The free test audio from the spec: the 2-minute ad song. */
export const TEST_SONG_URL = "https://d32kgcvh9dqf5h.cloudfront.net/uploads/1794872479_6afb949f0c205_song_900001_full.mp3";
const TEST_DURATION = 121.1;
const FIRST_LINES: SongLine[] = [
  { s: 9.9, e: 13.5, t: "Got someone special you can't stop thinking of?" },
  { s: 13.78, e: 17.38, t: "Your mom, your best friend, or the one you love?" },
];

const STORE = "bb.songMock.rows";
interface Row extends Song { _readyAt?: number; share_code?: string; user_id: number }

function load(): Row[] {
  try { return JSON.parse(sessionStorage.getItem(STORE) || "[]") as Row[]; } catch { return []; }
}
function save(rows: Row[]) {
  try { sessionStorage.setItem(STORE, JSON.stringify(rows)); } catch { /* fine */ }
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function lyricsFor(name: string, rel: string, memories: string): { title: string; lyrics: string } {
  const who = rel ? `my ${rel.toLowerCase()}` : "my favourite person";
  const mem = memories.split(/[.\n]/).map((s) => s.trim()).filter(Boolean);
  const m1 = mem[0] || "the day we met";
  const m2 = mem[1] || "every laugh we shared";
  return {
    title: `${name}, This One's For You`,
    lyrics: [
      "[Verse 1]",
      `${name}, I remember ${m1.toLowerCase()}`,
      `You were ${who}, and the whole world felt new`,
      `And I still smile about ${m2.toLowerCase()}`,
      "Every little moment, I keep them close to you",
      "",
      "[Chorus]",
      `Oh ${name}, ${name}, this song is yours tonight`,
      "Every word I'm singing, every star so bright",
      `${name}, ${name}, you make my whole life shine`,
      "Forever and always, so glad that you are mine",
      "",
      "[Verse 2]",
      "Through the good days and the hard days too",
      "There was never any doubt that I'd stand by you",
      "",
      "[Chorus]",
      `Oh ${name}, ${name}, this song is yours tonight`,
      `${name}, ${name}, you make my whole life shine`,
    ].join("\n"),
  };
}

/** Lines in time with the test audio: the spec's two real first lines, then the song's own
 *  lyric lines, one every ~3.6 s (section headers like [Chorus] are not sung). */
function timedLines(lyrics: string, until: number): SongLine[] {
  const sung = lyrics.split("\n").map((l) => l.trim()).filter((l) => l && !/^\[.*\]$/.test(l));
  const out = [...FIRST_LINES];
  let s = 18.0;
  for (const t of sung) {
    if (s + 3.4 > until) break;
    out.push({ s: +s.toFixed(2), e: +(s + 3.4).toFixed(2), t });
    s += 3.8;
  }
  return out;
}

function tick(r: Row, mode: string) {
  if (!r._readyAt || Date.now() < r._readyAt) return;
  r._readyAt = undefined;
  if (r.status === "previewing") {
    r.status = "preview_ready";
    r.preview_url = TEST_SONG_URL;
    r.preview_lines = timedLines(r.lyrics, 32);
  } else if (r.status === "making") {
    if (mode === "fail") {
      r.status = "failed";
      r.refunded = true;
      r.failure_reason = "The song could not be made. Your BBs were put back.";
      return;
    }
    r.status = "done";
    r.song_url = TEST_SONG_URL;
    r.song_lines = timedLines(r.lyrics, TEST_DURATION - 2);
    r.duration = TEST_DURATION;
    r.share_code = r.share_code || Math.random().toString(36).slice(2, 12);
    r.share_url = `https://binggbongg.com/song/${r.share_code}`;
  }
}

function pub(r: Row): Record<string, unknown> {
  const { _readyAt: _a, share_code: _c, user_id: _u, ...rest } = r;
  void _a; void _c; void _u;
  return { ...rest, free_previews_left: Math.max(0, 3 - r.previews_used) };
}

const ok = <T>(data: unknown, message = ""): ApiResponse<T> => ({ status: true, message, data: data as T });
const fail = <T>(message: string, data?: unknown): ApiResponse<T> => ({ status: false, message, ...(data ? { data: data as T } : {}) });

export async function mockSongCall<T>(endpoint: string, p: Record<string, unknown>, mode: string): Promise<ApiResponse<T>> {
  await wait(endpoint === "songWrite" ? 1500 : 250);
  const rows = load();
  rows.forEach((r) => tick(r, mode));
  const me = Number(p.my_user_id ?? 0);
  const find = () => rows.find((r) => r.id === Number(p.song_id) && r.user_id === me);
  try {
    switch (endpoint) {
      case "songOptions":
        return fail("mock: use the built-in defaults");
      case "songWrite": {
        const name = String(p.recipient_name ?? "").trim();
        if (!name) return fail("Who is the song for? Please type their name.");
        let r = p.song_id ? find() : undefined;
        if (p.song_id && !r) return fail("Song not found.");
        const w = lyricsFor(name, String(p.relationship ?? ""), String(p.memories ?? ""));
        if (!r) {
          r = {
            id: (rows.reduce((m, x) => Math.max(m, x.id), 900000)) + 1, user_id: me, status: "draft", title: "", lyrics: "",
            recipient_name: name, previews_used: 0, free_previews_left: 3, preview_lines: [], song_lines: [], price_bbs: 299,
            coins_charged: 0, refunded: false, made_with_ai: true, created_at: new Date().toISOString(),
          };
          rows.push(r);
        }
        Object.assign(r, {
          recipient_name: name, relationship: p.relationship, occasion: p.occasion, memories: p.memories,
          style: p.style, voice: p.voice, language: p.language, title: w.title, lyrics: w.lyrics,
        });
        if (r.status !== "previewing") r.status = "draft";
        return ok(pub(r), "Your song is written");
      }
      case "songSaveLyrics": {
        const r = find();
        if (!r) return fail("Song not found.");
        if (!String(p.lyrics ?? "").trim()) return fail("The song needs some words.");
        r.lyrics = String(p.lyrics);
        r.title = String(p.title ?? r.title) || r.title;
        return ok(pub(r), "Saved");
      }
      case "songPreview": {
        const r = find();
        if (!r) return fail("Song not found.");
        if (r.status === "making" || r.status === "done") return fail("The full song is already yours.");
        if (r.status === "previewing") return ok(pub(r));
        if (r.previews_used >= 3) return fail("no_free_previews", { ...pub(r), text: "You have used your 3 free previews. Get the full song for 299 BBs." });
        r.previews_used += 1;
        r.status = "previewing";
        r._readyAt = Date.now() + 6000;
        return ok(pub(r), "Your preview is being sung. It takes about 15 seconds.");
      }
      case "songBuy": {
        const r = find();
        if (!r) return fail("Song not found.");
        if (r.status === "making" || r.status === "done") return ok(pub(r), "Already yours");
        if (mode === "nobbs") return fail("not_enough_coins", { coins_needed: 299, text: "A Bingg Bongg Song costs 299 BBs. Top up your BBs and try again." });
        r.status = "making";
        r.coins_charged = 299;
        r.refunded = false;
        r.failure_reason = null;
        r._readyAt = Date.now() + 10000;
        return ok(pub(r), "Your song is being made. It takes about a minute.");
      }
      case "fetchSong": {
        const r = find();
        return r ? ok(pub(r)) : fail("Song not found.");
      }
      case "fetchMySongs":
        return ok(rows.filter((r) => r.user_id === me).sort((a, b) => b.id - a.id).map(pub));
      case "deleteSong": {
        const r = find();
        if (!r) return fail("Song not found.");
        if (r.status === "making") return fail("Please wait until the song is finished.");
        rows.splice(rows.indexOf(r), 1);
        return ok(null, "Deleted");
      }
      case "songAttachPost": {
        const r = find();
        if (!r) return fail("Song not found.");
        r.post_id = Number(p.post_id);
        return ok(pub(r));
      }
      case "fetchSharedSong": {
        const code = String(p.code ?? "");
        const r = rows.find((x) => x.share_code === code && x.status === "done");
        // Any code works on the dev server, so the public page can be looked at on its own.
        const lyr = lyricsFor("Maria", "Wife", "We met at the jeepney stop. She loves mango ice cream");
        const src = r ?? { title: lyr.title, recipient_name: "Maria", occasion: "birthday", lyrics: lyr.lyrics, song_lines: timedLines(lyr.lyrics, TEST_DURATION - 2) };
        return ok({
          title: src.title, recipient_name: src.recipient_name, occasion: src.occasion, song_url: TEST_SONG_URL,
          song_lines: src.song_lines, duration: TEST_DURATION, lyrics: src.lyrics,
          from: { id: 1, fullname: "Juan Dela Cruz", username: "juan", user_profile: "" }, made_with_ai: true,
        });
      }
      default:
        return fail(`mock: unknown endpoint ${endpoint}`);
    }
  } finally {
    save(rows);
  }
}
