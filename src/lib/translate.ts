// Live-chat message translation on the web, matching the phones.
//
// Steve, 2026-10-02: "On the web, Please add the automatic translation messages just like on the
// phones." The phones have had this since 2026-09-10 (the "MT" button). Same backend call, same
// behaviour, so a message reads the same way wherever you are watching.
//
// The rules the phones follow, kept deliberately:
//  - PER-VIEWER. Nothing is stored server-side and nobody else in the room is told; the endpoint
//    translates one line on request and that is all it knows.
//  - Eddie, 2026-09-19: "When a member's default language is English and someone messages him in
//    Spanish please make it translate in English automatically." So it does NOT start at None —
//    it seeds from the viewer's own language. Translating is the default, not a chore.
//  - A message already in the target language renders as ONE line. The second line appears only
//    when the translation actually differs, so an all-English room never doubles up.
//  - Each line is prefixed with its language name, source above target.
import { post } from "./api";

export interface TranslationLanguage {
  /** Sent to the backend as `target_language`, and matched against Google's detected source. */
  code: string;
  /** English name, used for the line labels — "Spanish: hola". */
  name: string;
  /** The language's own name, so you can find yours in the picker without reading English. */
  native: string;
}

/** The same 54 languages the phones offer, in the same order (Language.kt on Android). */
export const TRANSLATION_LANGUAGES: TranslationLanguage[] = [
  { code: "en", name: "English", native: "English" },
  { code: "ar", name: "Arabic", native: "العربية" },
  { code: "zh", name: "Chinese", native: "中文" },
  { code: "da", name: "Danish", native: "Dansk" },
  { code: "nl", name: "Dutch", native: "Nederlands" },
  // Steve, 2026-10-02: "Fix the Tagalog duplicate." The list carried BOTH "fil" and "tl" and
  // called both of them Tagalog in English, so the picker showed two rows that looked identical
  // and did the same thing. Google treats the two codes as one language, so this is a single row
  // now, named Filipino with Tagalog alongside it — searching either word still finds it.
  //
  // The app's own language chooser keeps both codes, because an interface locale is a different
  // question from a translation target; it just names them correctly now.
  { code: "tl", name: "Filipino", native: "Tagalog" },
  { code: "fr", name: "French", native: "Français" },
  { code: "de", name: "German", native: "Deutsch" },
  { code: "hi", name: "Hindi", native: "हिन्दी" },
  { code: "id", name: "Indonesian", native: "Bahasa Indonesia" },
  { code: "it", name: "Italian", native: "Italiano" },
  { code: "ja", name: "Japanese", native: "日本語" },
  { code: "ko", name: "Korean", native: "한국어" },
  { code: "ms-rMY", name: "Malay", native: "Bahasa Melayu" },
  { code: "nb", name: "Norwegian Bokmål", native: "Norsk bokmål" },
  { code: "no", name: "Norwegian", native: "Norsk" },
  { code: "pl", name: "Polish", native: "Polski" },
  { code: "pt", name: "Portuguese", native: "Português" },
  { code: "ru", name: "Russian", native: "Русский" },
  { code: "es", name: "Spanish", native: "Español" },
  { code: "sv", name: "Swedish", native: "Svenska" },
  { code: "th", name: "Thai", native: "ภาษาไทย" },
  { code: "tr", name: "Turkish", native: "Türkçe" },
  { code: "vi", name: "Vietnamese", native: "Tiếng Việt" },
  { code: "af", name: "Afrikaans", native: "Afrikaans" },
  { code: "am", name: "Amharic", native: "አማርኛ" },
  { code: "bg", name: "Bulgarian", native: "Български" },
  { code: "bn", name: "Bengali", native: "বাংলা" },
  { code: "ca", name: "Catalan", native: "Català" },
  { code: "zh-rTW", name: "Chinese (Traditional)", native: "繁體中文" },
  { code: "cs", name: "Czech", native: "Čeština" },
  { code: "el", name: "Greek", native: "Ελληνικά" },
  { code: "et", name: "Estonian", native: "Eesti" },
  { code: "eu", name: "Basque", native: "Euskara" },
  { code: "fi", name: "Finnish", native: "Suomi" },
  { code: "gl", name: "Galician", native: "Galego" },
  { code: "gu", name: "Gujarati", native: "ગુજરાતી" },
  { code: "he", name: "Hebrew", native: "עברית" },
  { code: "hu", name: "Hungarian", native: "Magyar" },
  { code: "is", name: "Icelandic", native: "Íslenska" },
  { code: "kn", name: "Kannada", native: "ಕನ್ನಡ" },
  { code: "lt", name: "Lithuanian", native: "Lietuvių" },
  { code: "lv", name: "Latvian", native: "Latviešu" },
  { code: "ml", name: "Malayalam", native: "മലയാളം" },
  { code: "mr", name: "Marathi", native: "मराठी" },
  { code: "pa", name: "Punjabi", native: "ਪੰਜਾਬੀ" },
  { code: "ro", name: "Romanian", native: "Română" },
  { code: "sk", name: "Slovak", native: "Slovenčina" },
  { code: "sr", name: "Serbian", native: "Српски" },
  { code: "ta", name: "Tamil", native: "தமிழ்" },
  { code: "te", name: "Telugu", native: "తెలుగు" },
  { code: "uk", name: "Ukrainian", native: "Українська" },
  { code: "ur", name: "Urdu", native: "اردو" },
];

/** Android's Language.displayNameForCode: exact match first, then the bare language subtag, so
 *  Google answering "pt-BR" still reads as "Portuguese" instead of falling back to a raw code. */
export function languageName(code?: string | null): string {
  if (!code || !code.trim()) return "";
  const c = code.trim();
  const exact = TRANSLATION_LANGUAGES.find((l) => l.code.toLowerCase() === c.toLowerCase());
  if (exact) return exact.name;
  const base = c.split("-")[0].toLowerCase();
  const loose = TRANSLATION_LANGUAGES.find((l) => l.code.toLowerCase().split("-")[0] === base);
  return loose ? loose.name : c.toUpperCase();
}

/** The viewer's own language. The phones read theirs from the app's language setting; the web has
 *  no such setting, so the browser's is the honest equivalent. Narrowed to a language we actually
 *  offer, so a browser set to "en-GB" seeds English rather than nothing. */
export function defaultTargetLanguage(): string | null {
  const nav = typeof navigator !== "undefined" ? navigator.language : "";
  if (!nav) return null;
  const base = nav.split("-")[0].toLowerCase();
  const match = TRANSLATION_LANGUAGES.find((l) => l.code.toLowerCase() === base);
  return match ? match.code : null;
}

export interface TranslationResult {
  translated: string;
  detectedSource: string | null;
}

/** One chat line, translated. Returns null rather than throwing: a failed translation must never
 *  cost the viewer the message itself, so the caller simply keeps showing the original. */
export async function translateChatMessage(text: string, targetLanguage: string): Promise<TranslationResult | null> {
  try {
    const res = await post<{ translated_text?: string; detected_source_language?: string | null }>(
      "translateChatMessage",
      { text, target_language: targetLanguage },
    );
    if (!res.status || !res.data?.translated_text) return null;
    return { translated: res.data.translated_text, detectedSource: res.data.detected_source_language ?? null };
  } catch {
    return null;
  }
}
