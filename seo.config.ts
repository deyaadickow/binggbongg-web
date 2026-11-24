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
import {
  COUNTRY_PAGES, countryPageDescription, countryPagePath, countryPageText, countryPageTitle, flagEmoji,
  relatedCountries, zoneNames, type CountryPage,
} from "./src/lib/countryPages.ts";

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
      writeCountryPages(out, fs.readFileSync(home, "utf8"));
    },
  };
}

// ---- Country pages (Steve, 2026-11-23, free marketing #3: search installs) -------------------
// One crawlable page per Country Battle country at /country-battle/<slug>, plus the list of all of
// them at /country-battles. Each is written to dist/_cb/<slug>.html (and dist/_cb/index.html for
// the list); public/.htaccess rewrites the pretty address onto it. NOT a dist/country-battle/
// folder: /country-battle is also a page of the app, and a real folder of the same name would
// make Apache answer it with a redirect and a 403 (the /houses problem). The React app takes over
// the page on load (CountryLandingPage), using the same words from src/lib/countryPages.ts.

const CB_STYLE = `<style>.seo-cb{background:#000;color:#f4e3a1;font-family:system-ui,-apple-system,sans-serif;max-width:760px;margin:0 auto;padding:24px 16px;line-height:1.5}.seo-cb h1,.seo-cb h2{color:#FFD84D}.seo-cb a{color:#FFD84D}.seo-cb .btns a{display:inline-block;margin:4px 8px 4px 0;padding:10px 16px;border:1px solid #d4a017;border-radius:10px;text-decoration:none}</style>`;

function pageShell(home: string, o: { title: string; desc: string; url: string; body: string; ld: unknown }): string {
  return home
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(o.title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(o.desc)}$2`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${o.url}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${o.url}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(o.title)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(o.desc)}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${esc(o.title)}$2`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${esc(o.desc)}$2`)
    .replace(/(<meta property="og:image:alt" content=")[^"]*(")/, `$1${esc(o.title)}$2`)
    // The site-wide structured data talks about the whole app (getting paid); these pages carry
    // only a breadcrumb trail.
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, `<script type="application/ld+json">${JSON.stringify(o.ld).replace(/</g, "\\u003c")}</script>`)
    .replace(/<div id="root">[\s\S]*?<\/div>\s*(<script|<\/body>)/, (_m, tag: string) => `<div id="root">${CB_STYLE}<main class="seo-cb">${o.body}</main></div>\n${tag}`)
}

function crumbs(items: [string, string][]): unknown {
  return {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: items.map(([name, url], i) => ({ "@type": "ListItem", position: i + 1, name, item: url })),
  };
}

function countryBody(c: CountryPage): string {
  const t = countryPageText(c, zoneNames(c.tz));
  const li = (xs: string[]) => `<ul>${xs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
  const related = relatedCountries(c).map((r) => `<a href="${countryPagePath(r)}">${flagEmoji(r.code)} ${esc(r.display)} Country Battle</a>`).join(" · ");
  return `<h1>${flagEmoji(c.code)} ${esc(t.h1)}</h1>
<p>${esc(t.intro)}</p>
<p class="btns"><a href="/country-battles">Watch or join the ${esc(c.display)} Country Battle</a><a href="${PLAY}">Get it on Google Play</a><a href="${APPSTORE}">Download on the App Store</a></p>
<h2>When the ${esc(c.display)} Country Battle runs</h2>${li(t.when)}
<h2>How to join</h2>${li(t.how)}
<h2>Who can battle</h2><p>${esc(t.who)} <a href="/country-vs-country">See Country VS Country</a>.</p>
${t.local ? `<h2 lang="${t.local.lang}">${esc(t.local.title)}</h2><p lang="${t.local.lang}">${esc(t.local.text)}</p>` : ""}
<h2>More Country Battles</h2><p>${related} · <a href="/country-battles">All ${COUNTRY_PAGES.length} Country Battles</a></p>
<p><a href="/">Bingg Bongg</a> · <a href="/features">Features</a> · <a href="/live">Live now</a> · <a href="/settings/about">About us</a> · <a href="/settings/contact">Contact us</a></p>
<p>© Bingg Bongg Inc.</p>`;
}

export const HUB_TITLE = `Country Battle in ${COUNTRY_PAGES.length} Countries – Every Hour | Bingg Bongg`;
export const HUB_DESC = `A 10-minute live Country Battle every hour in ${COUNTRY_PAGES.length} countries on Bingg Bongg. Find your country, go live with everyone from home, or watch any country and send gifts.`;

function hubBody(): string {
  const list = COUNTRY_PAGES.map((c) => `<li><a href="${countryPagePath(c)}">${flagEmoji(c.code)} ${esc(c.display)} Country Battle</a></li>`).join("");
  return `<h1>Country Battle — every hour in ${COUNTRY_PAGES.length} countries</h1>
<p>${esc(HUB_DESC)}</p>
<p class="btns"><a href="${PLAY}">Get it on Google Play</a><a href="${APPSTORE}">Download on the App Store</a><a href="/country-vs-country">Country VS Country</a></p>
<ul>${list}</ul>
<p>© Bingg Bongg Inc.</p>`;
}

function writeCountryPages(out: string, home: string) {
  const dir = path.join(out, "_cb");
  fs.mkdirSync(dir, { recursive: true });
  const hubUrl = `${SITE}/country-battles`;
  fs.writeFileSync(path.join(dir, "index.html"), pageShell(home, {
    title: HUB_TITLE, desc: HUB_DESC, url: hubUrl, body: hubBody(),
    ld: crumbs([["Bingg Bongg", `${SITE}/`], ["Country Battles", hubUrl]]),
  }));
  for (const c of COUNTRY_PAGES) {
    const url = SITE + countryPagePath(c);
    fs.writeFileSync(path.join(dir, `${c.slug}.html`), pageShell(home, {
      title: countryPageTitle(c), desc: countryPageDescription(c), url, body: countryBody(c),
      ld: crumbs([["Bingg Bongg", `${SITE}/`], ["Country Battles", hubUrl], [`${c.display} Country Battle`, url]]),
    }));
  }
  // The sitemap (copied from public/) gets the list page, Country VS Country and every country.
  const sm = path.join(out, "sitemap.xml");
  if (fs.existsSync(sm)) {
    const day = new Date().toISOString().slice(0, 10);
    const have = fs.readFileSync(sm, "utf8");
    // Only the country pages: /country-battles and /country-vs-country are behind the sign-up wall
    // (lib/publicRoutes.ts), so a search engine running the app would index the wall there.
    const urls = COUNTRY_PAGES.map((c) => SITE + countryPagePath(c))
      .filter((u) => !have.includes(`<loc>${u}</loc>`));
    const rows = urls.map((u) => `  <url><loc>${u}</loc><lastmod>${day}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>`).join("\n");
    fs.writeFileSync(sm, have.replace("</urlset>", `${rows}\n</urlset>`));
  }
}

export { SITE, PLAY, APPSTORE };
