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
interface Section { title: string; tiles: Tile[] }

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
      if (name) tiles.push({ name, blurb: blurb ? en[blurb] ?? "" : "", to });
    }
    if (tiles.length) sections.push({ title: en[titleKey] ?? titleKey, tiles });
  }
  return sections;
}

function staticPage(root: string): string {
  const en = englishStrings(root);
  const sections = featureSections(root, en);
  const count = sections.reduce((n, s) => n + s.tiles.length, 0);
  const list = sections.map((s) =>
    `<h2>${esc(s.title)}</h2><ul>` +
    s.tiles.map((t) => `<li>${t.to ? `<a href="${esc(t.to)}">` : ""}<strong>${esc(t.name)}</strong>${t.to ? "</a>" : ""}${t.blurb ? ` — ${esc(t.blurb)}` : ""}</li>`).join("") +
    "</ul>").join("");
  return `<div class="seo-static">
<h1>Bingg Bongg — live streaming, battles, games and singing contests</h1>
<p>Bingg Bongg is a free live streaming app. Go live from your phone or your computer, battle other streamers in 20 battle modes, play quiz games, word search, bingo and over a hundred tap games, enter singing contests with real cash prizes, send gifts, make friends and get paid for what you post. Payouts from $20 to $100 are sent automatically. Bingg Bongg is available in 53 languages.</p>
<p><a href="${PLAY}">Get Bingg Bongg on Google Play</a> · <a href="${APPSTORE}">Download Bingg Bongg on the App Store</a> · <a href="/features">See all ${count} features</a> · <a href="/feature-videos">Watch the feature videos</a></p>
${list}
<p><a href="/contests">Contests</a> · <a href="/live">Live now</a> · <a href="/exciting-news">Exciting News</a> · <a href="/referral-program">Referral Program</a> · <a href="/help">Help</a> · <a href="/settings/about">About us</a> · <a href="/settings/faq">FAQ</a> · <a href="/settings/contact">Contact us</a> · <a href="/settings/terms">Terms of Use</a> · <a href="/settings/privacy">Privacy Policy</a></p>
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
  };
}

export { SITE, PLAY, APPSTORE };
