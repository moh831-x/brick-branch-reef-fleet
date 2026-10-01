import { createIsomorphicFn } from "@tanstack/react-start";
import {
  DEFAULT_LANG,
  LANG_COOKIE,
  LANG_PARAM,
  LANG_STORAGE_KEY,
  isUiLang,
  matchLang,
  parseAcceptLanguage,
  pickLang,
  type UiLang,
} from "./i18n";

/**
 * Site-wide language. Order of precedence, the same on the server and in the browser:
 * `?lang=` in the address, then the saved choice (localStorage in the browser, mirrored to the
 * `folio_lang` cookie so the server can render and search in it), then the browser's own
 * language list, then English.
 */

function cookieLang(): UiLang | null {
  if (typeof document === "undefined") return null;
  const raw = document.cookie.match(new RegExp(`(?:^|;\\s*)${LANG_COOKIE}=([^;]+)`))?.[1];
  if (!raw) return null;
  try {
    return matchLang(decodeURIComponent(raw));
  } catch {
    return null;
  }
}

/** The address parameter or this browser's saved choice. Null when the reader never chose. */
export function readSavedLang(): UiLang | null {
  if (typeof window === "undefined") return null;
  try {
    const fromParam = matchLang(new URLSearchParams(window.location.search).get(LANG_PARAM));
    if (fromParam) return fromParam;
    const stored = localStorage.getItem(LANG_STORAGE_KEY) ?? sessionStorage.getItem(LANG_STORAGE_KEY);
    if (isUiLang(stored)) return stored;
  } catch {
    /* storage blocked: fall through */
  }
  return cookieLang();
}

/** The first of the browser's languages that Folio has. */
export function browserLang(): UiLang | null {
  if (typeof navigator === "undefined") return null;
  const list = navigator.languages?.length ? navigator.languages : [navigator.language];
  return pickLang(list);
}

export function clientLang(): UiLang {
  return readSavedLang() ?? browserLang() ?? DEFAULT_LANG;
}

export function persistLang(lang: UiLang) {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    /* ignore quota or blocked storage */
  }
  if (typeof document !== "undefined") {
    document.cookie = `${LANG_COOKIE}=${encodeURIComponent(lang)}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }
}

/** Language for this render: request data on the server, the browser's state in the browser. */
export const detectLang = createIsomorphicFn()
  .server(async (): Promise<UiLang> => {
    try {
      const { getCookie, getRequestHeader, getRequestUrl } = await import("@tanstack/react-start/server");
      let fromParam: UiLang | null = null;
      try {
        fromParam = matchLang(getRequestUrl().searchParams.get(LANG_PARAM));
      } catch {
        fromParam = null;
      }
      return (
        fromParam ??
        matchLang(getCookie(LANG_COOKIE)) ??
        pickLang(parseAcceptLanguage(getRequestHeader("accept-language"))) ??
        DEFAULT_LANG
      );
    } catch {
      return DEFAULT_LANG;
    }
  })
  .client(async (): Promise<UiLang> => clientLang());

