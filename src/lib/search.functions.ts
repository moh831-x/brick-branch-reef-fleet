import { createServerFn } from "@tanstack/react-start";
import { GROK_PAGE, IMAGES_PAGE, MAX_PAGE, PAGE, WEB_PAGE } from "./search.shared";
import { runNetworkAd, runPreview, runSearch, runSuggest, runTrending, type HitPreview, type NetworkAd, type SearchInput, type SearchPayload, type SourceId, type Suggestion, type Trend } from "./search.server";

export type { HitPreview, ImageRef, LeadCard, NetworkAd, PlaceRef, SearchHit, SearchInput, SearchPayload, SourceBlock, SourceId, Suggestion, Trend, WordDefinition, WordSense } from "./search.server";

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

export const searchAll = createServerFn({ method: "POST" })
  .validator(readSearch)
  .handler(async ({ data }): Promise<SearchPayload> => runSearch(data));

export const suggestQueries = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null) return { q: "" };
    const q = "q" in input && typeof input.q === "string" ? input.q.trim().slice(0, 80) : "";
    return { q };
  })
  .handler(async ({ data }): Promise<Suggestion[]> => runSuggest(data.q));

export const requestNetworkAd = createServerFn({ method: "POST" })
  .validator(() => ({}))
  .handler(async (): Promise<NetworkAd | null> => runNetworkAd());

export const trendingTopics = createServerFn({ method: "POST" })
  .validator(() => ({}))
  .handler(async (): Promise<Trend[]> => runTrending());

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
