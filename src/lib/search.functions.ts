import { createServerFn } from "@tanstack/react-start";
import { GROK_PAGE, IMAGES_PAGE, MAX_PAGE, PAGE, WEB_PAGE } from "./search.shared";
import { AI_MAX_CONTEXT, aiChoiceOf, cleanContextItem, type AiAnswer, type AiContextItem, type AiModelStatus } from "./ai.shared";
import { aiModelStatus, runAiAnswer, runTranslate } from "./ai.server";
import { asSearchLang, runPreview, runSearch, runSuggest, runTrending, type HitPreview, type SearchInput, type SearchPayload, type SourceId, type Suggestion, type Trend } from "./search.server";

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
  };
}

const ANSWER_LANGUAGE: Record<string, string> = {
  "zh-CN": "Simplified Chinese",
  "hi-IN": "Hindi",
  "bn-BD": "Bangla",
};

async function preferredLang(): Promise<string> {
  try {
    const { getCookie } = await import("@tanstack/react-start/server");
    return getCookie("folio_lang") ?? "";
  } catch {
    return "";
  }
}

export const searchAll = createServerFn({ method: "POST" })
  .validator(readSearch)
  .handler(async ({ data }): Promise<SearchPayload> => {
    const lang = asSearchLang(await preferredLang());
    return runSearch(lang ? { ...data, lang } : data);
  });

/**
 * The optional AI answer. The browser calls this only when the AI switch is on, after the
 * other sources have loaded, and passes the top results it already has as context (from every
 * source that is on), so the search is not fetched twice and the other sources never wait on
 * the model. `provider` is the reader's pick; the server falls back to the next set-up provider.
 */
export const answerWithAi = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null) throw new Error("Invalid answer request");
    const raw = input as Record<string, unknown>;
    const q = typeof raw.q === "string" ? raw.q.replace(/\s+/g, " ").trim().slice(0, 180) : "";
    if (!q) throw new Error("Enter a search");
    const context: AiContextItem[] = [];
    const seen = new Set<string>();
    for (const item of Array.isArray(raw.context) ? raw.context.slice(0, AI_MAX_CONTEXT) : []) {
      const clean = cleanContextItem(item);
      if (!clean || seen.has(clean.url)) continue;
      seen.add(clean.url);
      context.push(clean);
    }
    const requested = asSearchLang(typeof raw.lang === "string" ? raw.lang : "");
    return { q, context, model: aiChoiceOf(raw.model), ...(requested ? { lang: requested } : {}) };
  })
  .handler(async ({ data }): Promise<AiAnswer> => {
    const lang = data.lang ?? asSearchLang(await preferredLang());
    return runAiAnswer(data.q, data.context, data.model, lang ? { answerLanguage: ANSWER_LANGUAGE[lang] } : {});
  });

/** Which AI models can run with the keys on the server, for the model menu. No keys are returned. */
export const listAiProviders = createServerFn({ method: "POST" })
  .validator(() => ({}))
  .handler(async (): Promise<AiModelStatus[]> => aiModelStatus());

export const suggestQueries = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null) return { q: "" };
    const q = "q" in input && typeof input.q === "string" ? input.q.trim().slice(0, 80) : "";
    return { q };
  })
  .handler(async ({ data }): Promise<Suggestion[]> => runSuggest(data.q));

export const trendingTopics = createServerFn({ method: "POST" })
  .validator(() => ({}))
  .handler(async (): Promise<Trend[]> => runTrending());

const PREVIEW_LANGS = new Set(["zh-CN", "hi-IN", "bn-BD"]);

/** Translate the open preview into Chinese, Hindi, or Bangla. English is not sent. */
export const translatePreview = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null) throw new Error("Invalid translation");
    const raw = input as Record<string, unknown>;
    const lang = typeof raw.lang === "string" ? raw.lang : "";
    const title = typeof raw.title === "string" ? raw.title.replace(/\s+/g, " ").trim().slice(0, 180) : "";
    const text = typeof raw.text === "string" ? raw.text.trim().slice(0, 6000) : "";
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
