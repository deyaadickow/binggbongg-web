// SEO for binggbongg.com (Steve, 2026-10-30: "Can you create seo for Bingg Bongg?").
//
// The site is a single-page app: its HTML is an empty <div id="root"> until JavaScript runs, so
// search engines that don't run JavaScript, and link previews (Facebook, WhatsApp, TikTok, X),
// saw nothing but the word "Bingg Bongg". At BUILD time this plugin writes a readable page into
// that div — what Bingg Bongg is, how to download it, and every feature on the Features page with
// its one-line description — read straight from FeaturesPage.tsx and the English strings, so it
// can never drift from the real directory. React replaces it the moment the app starts.
import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

const SITE = "https://www.binggbongg.com";
const PLAY = "https://play.google.com/store/apps/details?id=com.apps.binggbongg";
const APPSTORE = "https://apps.apple.com/app/bingg-bongg/id1616509409";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** key: "value" pairs from src/lib/strings/en.ts (values are plain double-quoted strings). */
function englishStrings(root: string): Record<string, string> {
  const src = fs.readFileSync(path.join(root, "src/lib/strings/en.ts"), "utf8");
  const out: Record<string, string> = {};
  for (const m of src.matchAll(/^\s*([a-z0-9_]+):\s*"((?:[^"\\]|\\.)*)",?\s*$/gm)) {
    out[m[1]] = m[2].replace(/\\"/g, '"').replace(/\\n/g, " ").replace(/\\\\/g, "\\");
  }
  return out;
}

interface Tile { name: string; blurb: string; to?: string }
interface Section { key: string; title: string; tiles: Tile[] }

/** Sections and tiles from FeaturesPage.tsx, in the directory's own order; commented-out tiles skipped. */
function featureSections(root: string, en: Record<string, string>): Section[] {
  const src = fs.readFileSync(path.join(root, "src/pages/FeaturesPage.tsx"), "utf8")
    .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  const start = src.indexOf("const FEATURES");
  const body = src.slice(start, src.indexOf("\n];", start));
  const sections: Section[] = [];
  for (const chunk of body.split(/titleKey:\s*"/).slice(1)) {
    const titleKey = chunk.slice(0, chunk.indexOf('"'));
    const tiles: Tile[] = [];
    for (const m of chunk.matchAll(/\{[^{}]*nameKey:\s*"([a-z0-9_]+)"[^{}]*\}/g)) {
      const obj = m[0];
      const label = /labelKey:\s*"([a-z0-9_]+)"/.exec(obj)?.[1];
      const blurb = /blurbKey:\s*"([a-z0-9_]+)"/.exec(obj)?.[1];
      const to = /to:\s*"([^"]+)"/.exec(obj)?.[1];
      const name = en[label ?? m[1]] ?? en[m[1]];
      // A contest tile only shows while a contest is switched on (Steve, 2026-11-01: "remove all
      // singing contest from the app for now"), so the crawled copy never lists it.
      if (/contestOnly:\s*true/.test(obj)) continue;
      if (name) tiles.push({ name, blurb: blurb ? en[blurb] ?? "" : "", to });
    }
    if (tiles.length) sections.push({ key: titleKey, title: en[titleKey] ?? titleKey, tiles });
  }
  return sections;
}

// Meta's ad review reads this page (it is where the ads land) and rejected three ads on
// 2026-10-31 as a "social casino": coins, cash prizes, payouts, paying to play and bingo side by
// side read to it like a casino app. Those features stay in the app and on /features; the crawled
// copy leaves out the Money section and any tile whose words are about coins or money.
// 2026-11-10 (Steve: "Coins are not called coins anymore. They are called BBs"): the in-app currency
// is now "BBs" / "PBBs" (practice BBs), so those words are left out of the crawled copy exactly as
// "coins" was — the same tiles stay out, and the Pre-Launch tile (free PBBs) never reaches it.
// Same evening (Steve: "Free BBs/ FBBs sounds much better"): PBBs became FBBs (Free BBs) and the
// giveaway page "Bonus BBs" — the filter catches FBB/FBBs too (and still PBB/PBBs, harmless).
const LEFT_OUT_SECTIONS = new Set(["fsec_money"]);
const CASINO_WORDS = /\b(coins?|[pf]?bbs?|cash|paid|pays?|paying|payouts?|earn\w*|money|prizes?|bingo|lucky|buy|bought|commission|\$)|\$\d/i;

function staticPage(root: string): string {
  const en = englishStrings(root);
  const all = featureSections(root, en);
  const count = all.reduce((n, s) => n + s.tiles.length, 0);
  const sections = all
    .filter((s) => !LEFT_OUT_SECTIONS.has(s.key))
    .map((s) => ({ ...s, tiles: s.tiles.filter((t) => !CASINO_WORDS.test(`${t.name} ${t.blurb}`)) }))
    .filter((s) => s.tiles.length);
  const list = sections.map((s) =>
    `<h2>${esc(s.title)}</h2><ul>` +
    s.tiles.map((t) => `<li>${t.to ? `<a href="${esc(t.to)}">` : ""}<strong>${esc(t.name)}</strong>${t.to ? "</a>" : ""}${t.blurb ? ` — ${esc(t.blurb)}` : ""}</li>`).join("") +
    "</ul>").join("");
  return `<div class="seo-static">
<h1>Bingg Bongg — the new social media app: live video, chat and friends</h1>
<p>Bingg Bongg is a free social media app. Make friends all over the world and chat in 53 languages with every message translated, go live from your phone or your computer, share videos and photos with Green Screen and face filters, and join friendly live battles.</p>
<p><a href="${PLAY}">Get Bingg Bongg on Google Play</a> · <a href="${APPSTORE}">Download Bingg Bongg on the App Store</a> · <a href="/features">See all ${count} features</a> · <a href="/feature-videos">Watch the feature videos</a></p>
${list}
<p><a href="/live">Live now</a> · <a href="/exciting-news">Exciting News</a> · <a href="/help">Help</a> · <a href="/settings/about">About us</a> · <a href="/safety">Safety Center</a> · <a href="/settings/faq">FAQ</a> · <a href="/settings/contact">Contact us</a> · <a href="/settings/terms">Terms of Use</a> · <a href="/settings/privacy">Privacy Policy</a></p>
<p>© Bingg Bongg Inc.</p>
</div>`;
}

export function seoStaticContent(): Plugin {
  let root = process.cwd();
  return {
    name: "bingg-bongg-seo-static-content",
    configResolved(c) { root = c.root; },
    transformIndexHtml(html) {
      return html.replace('<div id="root"></div>', `<div id="root">${staticPage(root)}</div>`);
    },
    // The ads' landing page gets its OWN dist/ph/index.html (Steve, 2026-10-31). Meta's ad review
    // and Facebook's link preview read the raw HTML, never the running app, and the home page's
    // description used to talk about cash prizes — the wording that got ads rejected as a
    // "social casino". Apache serves a real folder before the SPA fallback, so /ph gets this.
    writeBundle(options) {
      const out = options.dir ?? path.join(root, "dist");
      const home = path.join(out, "index.html");
      if (!fs.existsSync(home)) return;
      const title = "Bingg Bongg – The New Social Media App";
      const desc = "Go live, chat and share videos with friends all over the world. Free on Google Play and the App Store.";
      const url = `${SITE}/ph`;
      let html = fs.readFileSync(home, "utf8");
      html = html
        .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
        .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(desc)}$2`)
        .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`)
        .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${url}$2`)
        .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(title)}$2`)
        .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(desc)}$2`)
        .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${esc(title)}$2`)
        .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${esc(desc)}$2`)
        .replace(/(<meta property="og:image:alt" content=")[^"]*(")/, `$1${esc(title)}$2`)
        // The site-wide structured data describes the whole app (cash prizes, getting paid); the
        // landing page doesn't need it, and Meta reads it.
        .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\s*/, "")
        // Only the landing page's own words in the body, not the whole site's feature list.
        .replace(/<div id="root">[\s\S]*?<\/div>\s*(<script|<\/body>)/, `<div id="root"><main><h1>${esc(title)}</h1><p>${esc(desc)}</p><p><a href="${PLAY}">Get it on Google Play</a> · <a href="${APPSTORE}">Download on the App Store</a></p></main></div>\n$1`);
      fs.mkdirSync(path.join(out, "ph"), { recursive: true });
      fs.writeFileSync(path.join(out, "ph", "index.html"), html);
    },
  };
}

export { SITE, PLAY, APPSTORE };
