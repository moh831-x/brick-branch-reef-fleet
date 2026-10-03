import { readAnswerRequest } from "./ai-request";
import { createServerFn } from "@tanstack/react-start";
import { GROK_PAGE, IMAGES_PAGE, MAX_PAGE, PAGE, WEB_PAGE } from "./search.shared";
import { type AiAnswer, type AiModelStatus } from "./ai.shared";
import { aiModelStatus, runAiAnswer, runTranslate } from "./ai.server";
import { LANG_COOKIE, languageName, matchLang, pickLang, parseAcceptLanguage, PREVIEW_TRANSLATE_CHARS, type UiLang } from "./i18n";
import { SEARCH_LANGS, asSearchLang, runPreview, runSearch, runSuggest, runTrending, type HitPreview, type SearchInput, type SearchPayload, type SourceId, type Suggestion, type Trend } from "./search.server";

export type { HitPreview, ImageRef, LeadCard, PlaceRef, PreviewSection, SearchHit, SearchInput, SearchPayload, SourceBlock, SourceId, Suggestion, Trend, WordDefinition, WordSense } from "./search.server";

function bool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

function offsetOf(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min((MAX_PAGE - 1) * Math.max(PAGE, GROK_PAGE, WEB_PAGE, IMAGES_PAGE), Math.floor(value)));
}

function readSearch(input: unknown): SearchInput {
  if (typeof input !== "object" || input === null) throw new Error("Invalid search");
  const raw = input as Record<string, unknown>;
  const q = typeof raw.q === "string" ? raw.q.trim().slice(0, 180) : "";
  if (!q) throw new Error("Enter a search");
  return {
    q,
    web: bool(raw.web, true),
    wiki: bool(raw.wiki, true),
    grok: bool(raw.grok, true),
    images: bool(raw.images, false),
    webOffset: offsetOf(raw.webOffset),
    wikiOffset: offsetOf(raw.wikiOffset),
    grokOffset: offsetOf(raw.grokOffset),
    imagesOffset: offsetOf(raw.imagesOffset),
    card: raw.card !== false,
    near: typeof raw.near === "string" ? raw.near.trim().slice(0, 80) : "",
    ...(typeof raw.lang === "string" && matchLang(raw.lang) ? { lang: matchLang(raw.lang) ?? undefined } : {}),
  };
}

/**
 * The page language when the browser did not send one: the saved cookie, then the browser's
 * Accept-Language, then English.
 */
async function preferredLang(): Promise<UiLang> {
  try {
    const { getCookie, getRequestHeader } = await import("@tanstack/react-start/server");
    return matchLang(getCookie(LANG_COOKIE)) ?? pickLang(parseAcceptLanguage(getRequestHeader("accept-language"))) ?? "en-US";
  } catch {
    return "en-US";
  }
}

export const searchAll = createServerFn({ method: "POST" })
  .validator(readSearch)
  .handler(async ({ data }): Promise<SearchPayload> => {
    const lang = asSearchLang(data.lang ?? (await preferredLang()));
    return runSearch({ ...data, lang: lang ?? undefined });
  });

/**
 * The optional AI answer. The browser calls this only when the AI switch is on, after the
 * other sources have loaded, and passes the top results it already has as context (from every
 * source that is on), so the search is not fetched twice and the other sources never wait on
 * the model. `provider` is the reader's pick; the server falls back to the next set-up provider.
 * The page normally asks through the streamed route (/api/ai-answer) to show live progress; this
 * plain call is its fallback when that route cannot be reached.
 */
export const answerWithAi = createServerFn({ method: "POST" })
  .validator(readAnswerRequest)
  .handler(async ({ data }): Promise<AiAnswer> => {
    // The answer is always written in the page language, English included.
    const lang = data.lang ?? (await preferredLang());
    return runAiAnswer(data.q, data.context, data.model, { answerLanguage: languageName(lang), history: data.history });
  });

/** Which AI models can run with the keys on the server, for the model menu. No keys are returned. */
export const listAiProviders = createServerFn({ method: "POST" })
  .validator(() => ({}))
  .handler(async (): Promise<AiModelStatus[]> => aiModelStatus());

export const suggestQueries = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null) return { q: "", lang: "" };
    const q = "q" in input && typeof input.q === "string" ? input.q.trim().slice(0, 80) : "";
    const lang = "lang" in input && typeof input.lang === "string" ? input.lang.slice(0, 16) : "";
    return { q, lang };
  })
  .handler(async ({ data }): Promise<Suggestion[]> => runSuggest(data.q, asSearchLang(data.lang)));

export const trendingTopics = createServerFn({ method: "POST" })
  .validator(() => ({}))
  .handler(async (): Promise<Trend[]> => runTrending());

const PREVIEW_LANGS = new Set<string>(SEARCH_LANGS);

/** Translate the open preview into the page language. English is not sent. */
export const translatePreview = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null) throw new Error("Invalid translation");
    const raw = input as Record<string, unknown>;
    const lang = typeof raw.lang === "string" ? raw.lang : "";
    const title = typeof raw.title === "string" ? raw.title.replace(/\s+/g, " ").trim().slice(0, 180) : "";
    const text = typeof raw.text === "string" ? raw.text.trim().slice(0, PREVIEW_TRANSLATE_CHARS) : "";
    if (!PREVIEW_LANGS.has(lang) || !title || !text) throw new Error("Invalid translation");
    return { lang, title, text };
  })
  .handler(async ({ data }) => runTranslate(data));

export const previewHit = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null) throw new Error("Invalid preview");
    const raw = input as Record<string, unknown>;
    const source: SourceId | null =
      raw.source === "web" || raw.source === "wiki" || raw.source === "grok" ? raw.source : null;
    const title = typeof raw.title === "string" ? raw.title.trim().slice(0, 180) : "";
    const url = typeof raw.url === "string" ? raw.url.trim().slice(0, 500) : "";
    const snippet = typeof raw.snippet === "string" ? raw.snippet.slice(0, 600) : "";
    if (!source || !title || !safePreviewUrl(url)) throw new Error("Invalid preview");
    return { source, title, url, snippet };
  })
  .handler(async ({ data }): Promise<HitPreview> => runPreview(data));

function safePreviewUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
