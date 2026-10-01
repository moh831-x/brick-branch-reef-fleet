/**
 * The languages Folio's interface can use, and how each one maps to the services Folio calls:
 * the Wikipedia edition, Bing's language and market, the name the AI models are given, the
 * text direction, and the speech-synthesis language tag. Pure data and helpers, safe on the
 * server and in the browser.
 */

export const LANGS = [
  { code: "en-US", label: "English", english: "English", dir: "ltr", wiki: "en", setlang: "en", mkt: "en-US" },
  { code: "bn-BD", label: "বাংলা", english: "Bangla", dir: "ltr", wiki: "bn", setlang: "bn", mkt: "bn-BD" },
  { code: "hi-IN", label: "हिन्दी", english: "Hindi", dir: "ltr", wiki: "hi", setlang: "hi", mkt: "hi-IN" },
  { code: "ar-SA", label: "العربية", english: "Arabic", dir: "rtl", wiki: "ar", setlang: "ar", mkt: "ar-SA" },
  { code: "es-ES", label: "Español", english: "Spanish", dir: "ltr", wiki: "es", setlang: "es", mkt: "es-ES" },
  { code: "fr-FR", label: "Français", english: "French", dir: "ltr", wiki: "fr", setlang: "fr", mkt: "fr-FR" },
  { code: "zh-CN", label: "简体中文", english: "Simplified Chinese", dir: "ltr", wiki: "zh", setlang: "zh-Hans", mkt: "zh-CN" },
  { code: "ja-JP", label: "日本語", english: "Japanese", dir: "ltr", wiki: "ja", setlang: "ja", mkt: "ja-JP" },
  { code: "pt-BR", label: "Português", english: "Portuguese", dir: "ltr", wiki: "pt", setlang: "pt-BR", mkt: "pt-BR" },
  { code: "de-DE", label: "Deutsch", english: "German", dir: "ltr", wiki: "de", setlang: "de", mkt: "de-DE" },
] as const;

export type UiLang = (typeof LANGS)[number]["code"];
export type LangInfo = (typeof LANGS)[number];

export const DEFAULT_LANG: UiLang = "en-US";
/** localStorage key. The name predates the site-wide picker; keeping it keeps earlier choices. */
export const LANG_STORAGE_KEY = "folio-read-lang";
/** Cookie the server reads so a search and its AI answer use the same language as the page. */
export const LANG_COOKIE = "folio_lang";
/** Address parameter, for example `?lang=ar` or `?lang=pt-BR`. */
export const LANG_PARAM = "lang";

export function isUiLang(value: unknown): value is UiLang {
  return typeof value === "string" && LANGS.some((item) => item.code === value);
}

export function langInfo(code: UiLang): LangInfo {
  return LANGS.find((item) => item.code === code) ?? LANGS[0];
}

export function langDir(code: UiLang): "ltr" | "rtl" {
  return langInfo(code).dir;
}

/**
 * Map any BCP 47 tag ("ar", "ar-EG", "zh-Hans-CN", "pt_PT", "BN-in") to one of Folio's languages
 * by its primary subtag, or null when Folio has no interface in that language.
 */
export function matchLang(tag: string | null | undefined): UiLang | null {
  if (!tag) return null;
  const clean = tag.trim().replace(/_/g, "-").toLowerCase();
  if (!clean) return null;
  const exact = LANGS.find((item) => item.code.toLowerCase() === clean);
  if (exact) return exact.code;
  const primary = clean.split("-")[0];
  return LANGS.find((item) => item.wiki === primary)?.code ?? null;
}

/** The first of the reader's preferred languages that Folio has, or null. */
export function pickLang(tags: readonly (string | null | undefined)[]): UiLang | null {
  for (const tag of tags) {
    const lang = matchLang(tag);
    if (lang) return lang;
  }
  return null;
}

/** Language tags from an Accept-Language header, most preferred first. */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.map((param) => param.trim()).find((param) => param.startsWith("q="));
      const weight = q ? Number(q.slice(2)) : 1;
      return { tag: tag.trim(), weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter((row) => row.tag && row.tag !== "*" && row.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index)
    .map((row) => row.tag);
}

/** Wikipedia origin for a language, for example https://ar.wikipedia.org. */
export function wikiOrigin(code: UiLang): string {
  return `https://${langInfo(code).wiki}.wikipedia.org`;
}

/** English name of the language, used in instructions to AI models. */
export function languageName(code: UiLang): string {
  return langInfo(code).english;
}
