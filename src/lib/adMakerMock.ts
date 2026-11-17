// DEV-ONLY stand-in for the Bingg Bongg Video Ad server (binggbongg-backend 0013c70, not deployed yet).
// Loaded only through lib/adMaker.ts under `import.meta.env.DEV` and `?mockVideoAd=1`, so it is never
// in the production build and never charges anyone on the real server.
//
// It follows AdMakerController's state machine (v2, backend 39d2662): draft -> make (500 BBs) ->
// making (~8 s) -> done, 1 included change (remaking keeps the old video), then "no_edits_left" while
// extra changes are not for sale. Modes: "1" normal, extra changes 100 BBs (change_costs_bbs ->
// confirm_pay=1) as on the live server; "nochange" = extra changes not for sale; "nobbs" = making / paying says "not_enough_coins"; "fail" =
// making fails + refunded; "noexample" = no example ad. The OPTIONS come from the live server
// (mockAdOptions only adjusts them for the mode). Ads are kept in sessionStorage.
// Ads are kept in sessionStorage so a reload keeps them.
import type { ApiResponse } from "./api";
import { DEFAULT_AD_OPTIONS, type AdMakerAd, type AdMedia, type AdScriptLine } from "./adMaker";

const CDN = "https://d32kgcvh9dqf5h.cloudfront.net/uploads/";
/** A real 9:16 Bingg Bongg video on the CDN, standing in for a made ad. */
export const TEST_AD_URL = CDN + "1794937407_6afc923fd8e28_videoad_1.mp4"; // the live example ad
export const TEST_AD_THUMB = CDN + "1794937407_6afc923fd8e28_videoad_1.jpg";
const EXTRA_BBS = 100;
/** Mode "nochange" = extra changes not for sale (null), as the server could still answer. */
const extraFor = (mode: string) => (mode === "nochange" ? null : EXTRA_BBS);
const TEST_DURATION = 58;

const STORE = "bb.videoAdMock.rows";
interface Row extends AdMakerAd { _readyAt?: number; share_code?: string; user_id: number }

function load(): Row[] {
  try { return JSON.parse(sessionStorage.getItem(STORE) || "[]") as Row[]; } catch { return []; }
}
function save(rows: Row[]) {
  try { sessionStorage.setItem(STORE, JSON.stringify(rows)); } catch { /* fine */ }
}
/** The live server's options (or the built-in defaults when it can't be reached), adjusted for the mode. */
export function mockAdOptions<T>(real: ApiResponse<T> | null, mode: string): ApiResponse<T> {
  const d = (real?.status && real.data ? real.data : { ...DEFAULT_AD_OPTIONS }) as Record<string, unknown>;
  return {
    status: true,
    data: {
      ...d,
      extra_change_bbs: extraFor(mode),
      example: mode === "noexample" ? null : d.example ?? { video_url: TEST_AD_URL, thumbnail: TEST_AD_THUMB, choices: ["What to say: \"I go live every night at 8 PM\""] },
    } as T,
  };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const list = (v: unknown): unknown[] => { try { const j = typeof v === "string" ? JSON.parse(v) : v; return Array.isArray(j) ? j : []; } catch { return []; } };

function scriptFor(r: Row): { title: string; script: AdScriptLine[] } {
  const code = r.referral_code || "juan";
  const said = (r.mention || "").split(/[.\n!]/).map((s) => s.trim()).filter(Boolean);
  const parts = r.parts.map((k) => DEFAULT_AD_OPTIONS.parts.find((p) => p.key === k)?.label ?? k);
  const lines: AdScriptLine[] = [
    { say: ({ business: "Looking for something good near you? Listen to this!", job: "We're hiring! Here's your next job.", event: "Mark your calendar — you're invited!", other: "Here's something you'll want to hear." } as Record<string, string>)[r.purpose] ?? "Looking for the most fun app in the Philippines? This is Bingg Bongg!", show: "intro" },
    ...said.slice(0, 2).map((s) => ({ say: s + ".", show: r.media[0] ? "media" : "app" })),
    ...parts.slice(0, 3).map((p) => ({ say: `${p} — it's all on Bingg Bongg, and it's free to join.`, show: "app" })),
    { say: r.change_request ? `(Changed: ${r.change_request})` : r.purpose === "business" ? "Come visit us today — you'll love it." : "Come say hi, send a gift, and make new friends tonight.", show: "app" },
    r.purpose === "business"
      ? { say: `${r.business_name || "Visit us"} — ${(r.contact || "").split("\n").filter(Boolean).join(", ") || "see you soon"}!`, show: "contact" }
      : { say: `Download Bingg Bongg and use my code ${code} when you sign up!`, show: "code" },
  ];
  const head = said[0]?.split(",")[0].trim();
  return { title: r.purpose === "business" ? (r.business_name || head || "My business") : head ? `${head} — on Bingg Bongg` : "Join me on Bingg Bongg", script: lines };
}

function tick(r: Row, mode: string) {
  if (!r._readyAt || Date.now() < r._readyAt) return;
  r._readyAt = undefined;
  if (r.status === "making" && mode === "fail") {
    r.status = "failed";
    r.refunded = true;
    r.failure_reason = "The ad could not be made. Your BBs were put back.";
    return;
  }
  if (r.status === "making" || r.status === "remaking") {
    const s = scriptFor(r);
    r.status = "done";
    r.title = s.title;
    r.script = s.script;
    r.video_url = TEST_AD_URL;
    r.thumbnail = TEST_AD_THUMB;
    r.duration = TEST_DURATION;
    r.share_code = r.share_code || (r.referral_code || "juan");
    r.share_url = `https://binggbongg.com/ad/${r.share_code}`;
  }
}

function pub(r: Row): Record<string, unknown> {
  const { _readyAt: _a, share_code: _c, user_id: _u, ...rest } = r;
  void _a; void _c; void _u;
  return { ...rest, ends_with_code: r.purpose !== "business", presenter: r.voice === "male" ? "man" : "woman", edits_left: Math.max(0, r.included_changes - r.edits_used) };
}

const ok = <T>(data: unknown, message = "", extra: Record<string, unknown> = {}): ApiResponse<T> => ({ status: true, message, data: data as T, ...extra });
const fail = <T>(message: string, data?: unknown): ApiResponse<T> => ({ status: false, message, ...(data ? { data: data as T } : {}) });

function answers(p: Record<string, unknown>) {
  return {
    purpose: p.purpose === "business" ? "business" : "me",
    business_name: p.purpose === "business" ? String(p.business_name ?? "").trim().slice(0, 80) : "",
    contact: p.purpose === "business" ? String(p.contact ?? "").trim().slice(0, 300) : "",
    mention: String(p.mention ?? "").trim(),
    notes: String(p.notes ?? "").trim(),
    parts: list(p.parts).map(String),
    media: list(p.media).map((m) => {
      const x = m as { type?: string; key?: string };
      return { type: x.type === "video" ? "video" : "image", key: String(x.key ?? ""), url: mediaUrls.get(String(x.key ?? "")) ?? "" } as AdMedia;
    }).filter((m) => m.key),
    tone: String(p.tone ?? "excited"),
    voice: p.voice === "male" ? "male" : "female",
    language: String(p.language ?? "en"),
  };
}

// The picked files' blob: urls, by the fake key (for the thumbnails this session).
const mediaUrls = new Map<string, string>();

export async function mockUpload(file: File): Promise<AdMedia> {
  await wait(1200);
  const isVideo = file.type.startsWith("video/");
  if (!isVideo && !file.type.startsWith("image/")) throw new Error("Only photos and videos can be added.");
  const key = `uploads/admaker/1/${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${isVideo ? "mp4" : "jpg"}`;
  const url = URL.createObjectURL(file);
  mediaUrls.set(key, url);
  return { type: isVideo ? "video" : "image", key, url };
}

export async function mockAdCall<T>(endpoint: string, p: Record<string, unknown>, mode: string): Promise<ApiResponse<T>> {
  await wait(endpoint === "adMakerMake" || endpoint === "adMakerEdit" ? 900 : 250);
  const rows = load();
  rows.forEach((r) => { tick(r, mode); r.extra_change_bbs = extraFor(mode); r.included_changes = r.included_changes || 1; });
  const me = Number(p.my_user_id ?? 0);
  const find = () => rows.find((r) => r.id === Number(p.ad_id) && r.user_id === me);
  try {
    switch (endpoint) {
      case "adMakerOptions":
        return mockAdOptions<T>(null, mode);
      case "adMakerSave": {
        let r = p.ad_id ? find() : undefined;
        if (p.ad_id && !r) return fail("Ad not found.");
        if (r && r.status !== "draft" && r.status !== "failed") return fail("This ad is already made. Use Make changes to edit it.");
        if (!r) {
          r = {
            id: rows.reduce((m, x) => Math.max(m, x.id), 700000) + 1, user_id: me, status: "draft", purpose: "me", business_name: "", contact: "", ends_with_code: true, mention: "",
            included_changes: 1, extra_change_bbs: extraFor(mode), notes: "", parts: [], media: [],
            tone: "excited", voice: "female", language: "en", title: "", script: [], price_bbs: 500, coins_charged: 0, edits_used: 0, edits_left: 1,
            refunded: false, made_with_ai: true, created_at: new Date().toISOString(),
          };
          rows.push(r);
        }
        Object.assign(r, answers(p));
        r.status = "draft";
        return ok(pub(r), "Saved");
      }
      case "adMakerMake": {
        const r = find();
        if (!r) return fail("Ad not found.");
        if (["making", "remaking", "done"].includes(r.status)) return ok(pub(r), "Already yours");
        if (!r.mention && !r.parts.length) return fail("Tell us what to say in your ad, or pick a part of Bingg Bongg to show.");
        if (mode === "nobbs") return fail("not_enough_coins", { coins_needed: 500, text: "A Bingg Bongg Video Ad costs 500 BBs. Top up your BBs and try again." });
        r.status = "making";
        r.coins_charged = 500;
        r.refunded = false;
        r.failure_reason = null;
        r.referral_code = "juan";
        r._readyAt = Date.now() + 8000;
        return ok(pub(r), "Your ad is being made. It takes about 2 minutes.", { coins_charged: 500, wallet: 1240 });
      }
      case "adMakerEdit": {
        const r = find();
        if (!r) return fail("Ad not found.");
        if (r.status === "making" || r.status === "remaking") return ok(pub(r), "Your ad is being made");
        if (r.status !== "done") return fail("Make the ad first.");
        r.extra_change_bbs = extraFor(mode);
        if (r.edits_used >= r.included_changes) {
          if (r.extra_change_bbs == null) return fail("no_edits_left", { ...pub(r), text: "You have used the change included with this ad." });
          if (String(p.confirm_pay ?? "") !== "1") {
            return fail("change_costs_bbs", { coins_needed: r.extra_change_bbs, text: `Another change costs ${r.extra_change_bbs} BBs. They will come off your BBs now. Go ahead?` });
          }
          if (mode === "nobbs") return fail("not_enough_coins", { coins_needed: r.extra_change_bbs, text: `Another change costs ${r.extra_change_bbs} BBs. Top up your BBs and try again.` });
        }
        const change = String(p.change_request ?? "").trim();
        if (p.mention !== undefined || p.parts !== undefined) Object.assign(r, answers(p));
        if (!change && p.mention === undefined) return fail("Tell us what to change.");
        r.change_request = change || null;
        r.edits_used += 1;
        r.status = "remaking";
        r._readyAt = Date.now() + 8000;
        return ok(pub(r), "Your changes are being made. It takes about 2 minutes.");
      }
      case "fetchAdMakerAd": {
        const r = find();
        return r ? ok(pub(r)) : fail("Ad not found.");
      }
      case "fetchMyAdMakerAds":
        return ok(rows.filter((r) => r.user_id === me).sort((a, b) => b.id - a.id).map(pub));
      case "deleteAdMakerAd": {
        const r = find();
        if (!r) return fail("Ad not found.");
        if (r.status === "making" || r.status === "remaking") return fail("Please wait until the ad is finished.");
        rows.splice(rows.indexOf(r), 1);
        return ok(null, "Deleted");
      }
      case "adMakerAttachPost": {
        const r = find();
        if (!r) return fail("Ad not found.");
        r.post_id = Number(p.post_id);
        return ok(pub(r));
      }
      case "fetchSharedAdMakerAd": {
        const code = String(p.code ?? "");
        const r = rows.find((x) => x.share_code === code && x.video_url);
        // Any code works on the dev server, so the public page can be looked at on its own.
        return ok({
          title: r?.title || "Come watch my lives every night at 8 — on Bingg Bongg", video_url: TEST_AD_URL, thumbnail: TEST_AD_THUMB,
          duration: TEST_DURATION, referral_code: r?.referral_code || code || "juan",
          from: { id: 1, fullname: "Juan Dela Cruz", username: r?.referral_code || code || "juan", profile_image: null }, made_with_ai: true,
        });
      }
      default:
        return fail(`mock: unknown endpoint ${endpoint}`);
    }
  } finally {
    save(rows);
  }
}
