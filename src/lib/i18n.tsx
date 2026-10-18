// The web app's translations (Steve, 2026-10-18: "Can you make the entire app translatable into
// any of our available languages?").
//
// The phones had 53 locale folders long before this; the web had no mechanism at all, so there
// was nowhere to put a translation even if one existed. This is that mechanism, built to match
// the phones rather than invent a third convention:
//
//  - KEYS ARE SHARED with Android and iOS wherever the English matches exactly, so one
//    translation serves all three platforms and a fix lands everywhere at once.
//  - PLACEHOLDERS ARE ANDROID'S, %1$s / %2$s, for the same reason: an Android translation can be
//    reused here verbatim. iOS spells the same thing %1$@ because every argument there is a
//    String; here they are substituted positionally, so a number is as welcome as a string.
//  - A MISSING KEY FALLS BACK TO ENGLISH, never to a blank or to the key name. Only four
//    languages are written so far (the launch markets); the rest arrive four at a time, and
//    until a language exists at all its members read English, which is what they read today.
//
// `en` is the source of truth for what keys exist: StringKey is derived from it, so a typo in a
// key is a compile error rather than a blank space on the page. That is the one thing this has
// over the phones' version, where a mistyped key silently shows nothing.
import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { en } from "./strings/en";
import { es } from "./strings/es";
import { fil } from "./strings/fil";
import { id } from "./strings/id";

export type StringKey = keyof typeof en;
export type Lang = "en" | "es" | "fil" | "id";

/** Only languages with a real dictionary are offered; the picker is built from this list. */
export const LANGUAGES: { code: Lang; native: string; english: string }[] = [
  { code: "en", native: "English", english: "English" },
  { code: "es", native: "Español", english: "Spanish" },
  { code: "fil", native: "Filipino", english: "Filipino" },
  { code: "id", native: "Bahasa Indonesia", english: "Indonesian" },
];

const DICTS: Record<Lang, Partial<Record<StringKey, string>>> = { en, es, fil, id };
const STORAGE_KEY = "bb.lang";

/**
 * Substitute %1$s, %2$s ... positionally, and %% for a literal percent.
 *
 * Walked rather than regex-replaced for one reason: a replacement value can itself contain a %
 * (a price, a share percentage), and a second pass over the output would then try to substitute
 * inside the value it had just inserted.
 */
export function format(template: string, args: (string | number)[]): string {
  let out = "";
  for (let i = 0; i < template.length; i++) {
    if (template[i] !== "%") { out += template[i]; continue; }
    if (template[i + 1] === "%") { out += "%"; i++; continue; }
    const m = /^%(\d)\$s/.exec(template.slice(i));
    if (m) {
      const v = args[Number(m[1]) - 1];
      out += v === undefined ? "" : String(v);
      i += m[0].length - 1;
      continue;
    }
    out += "%"; // a stray percent is text, not a broken placeholder
  }
  return out;
}

/**
 * The active language, readable without React.
 *
 * Needed for the handful of places that render OUTSIDE the React tree -- showGoldToast() mounts
 * its own root imperatively, so there is no provider above it and no hook it may legally call.
 * The provider keeps this in step; `tt` is the plain-function translator those places use.
 *
 * Components must still use useT(): reading this would not re-render them when the language
 * changes, because nothing they consume would have changed.
 */
let activeLang: Lang = "en";
export const currentLang = (): Lang => activeLang;
export function tt(key: StringKey, ...args: (string | number)[]): string {
  return translate(activeLang, key, ...args);
}

/** Translate outside a component (lib code, event handlers that have no hook in scope). */
export function translate(lang: Lang, key: StringKey, ...args: (string | number)[]): string {
  const raw = DICTS[lang]?.[key] ?? en[key] ?? "";
  // Always formatted, even with no arguments: otherwise a string containing %% would render as
  // two literal percent signs whenever nothing was passed, and the same text would read
  // differently depending on the call site.
  return format(raw, args);
}

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as Lang | null;
    if (saved && LANGUAGES.some((l) => l.code === saved)) return saved;
  } catch { /* private mode */ }
  // Nothing chosen yet: follow the browser, which is the closest thing to an intention we have.
  // navigator.language is a tag like "es-MX" or "fil-PH"; match on the language subtag only.
  const tag = (navigator.language || "en").toLowerCase();
  const base = tag.split("-")[0];
  if (base === "tl") return "fil";       // Tagalog's older tag, still what some browsers send
  if (base === "in") return "id";        // Indonesian's deprecated code, likewise
  const found = LANGUAGES.find((l) => l.code === base);
  return found ? found.code : "en";
}

/**
 * Substitute REACT NODES into a translation, for a sentence with something inside it.
 *
 * This is what the explainer paragraphs need. "Simulcast for free. 3 referrals in a month make
 * your next month free. See your Simulcast status." is one sentence with a bold lead-in and a
 * link in it, which JSX stores as several text nodes with elements between them. Translating
 * those shards separately is the one thing that cannot work: Spanish and Filipino both move the
 * pieces, so the link has to be free to land somewhere else in the sentence. Keeping the whole
 * sentence as one translation with %1$s where the link goes is the only arrangement that lets a
 * translator put it in the right place.
 *
 * Returns an array of strings and nodes for JSX to render; each node is given a key so React
 * does not warn about the list.
 */
export function formatNodes(template: string, nodes: ReactNode[]): ReactNode[] {
  const out: ReactNode[] = [];
  let text = "";
  for (let i = 0; i < template.length; i++) {
    if (template[i] !== "%") { text += template[i]; continue; }
    if (template[i + 1] === "%") { text += "%"; i++; continue; }
    const m = /^%(\d)\$s/.exec(template.slice(i));
    if (!m) { text += "%"; continue; }
    if (text) { out.push(text); text = ""; }
    const node = nodes[Number(m[1]) - 1];
    out.push(<Fragment key={`n${m[1]}-${i}`}>{node}</Fragment>);
    i += m[0].length - 1;
  }
  if (text) out.push(text);
  return out;
}

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: StringKey, ...args: (string | number)[]) => string;
  /** Same as `t`, but the arguments are React nodes rather than text. */
  tn: (key: StringKey, ...nodes: ReactNode[]) => ReactNode[];
}

const I18nContext = createContext<I18n | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  // Set during render, not in the effect: a tt() call from an imperative toast fired in
  // the same tick as the change would otherwise still read the previous language.
  activeLang = lang;

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* private mode */ }
    // So the browser hyphenates and spell-checks in the right language, and screen readers
    // pronounce it correctly. "fil" is a valid BCP 47 tag; no mapping needed.
    document.documentElement.lang = lang;
  }, [lang]);

  const t = useCallback(
    (key: StringKey, ...args: (string | number)[]) => translate(lang, key, ...args),
    [lang],
  );
  const tn = useCallback(
    (key: StringKey, ...nodes: ReactNode[]) =>
      formatNodes(DICTS[lang]?.[key] ?? en[key] ?? "", nodes),
    [lang],
  );
  const value = useMemo(() => ({ lang, setLang: setLangState, t, tn }), [lang, t, tn]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * The hook every screen uses: `const { t } = useT()`.
 *
 * Deliberately works without the provider, returning English, so a component rendered outside
 * the tree (a test, an error boundary's fallback) shows real words instead of throwing.
 */
export function useT(): I18n {
  const ctx = useContext(I18nContext);
  if (ctx) return ctx;
  return {
    lang: "en",
    setLang: () => {},
    t: (k, ...a) => translate("en", k, ...a),
    tn: (k, ...n) => formatNodes(en[k] ?? "", n),
  };
}
