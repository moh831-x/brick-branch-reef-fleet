import { aiChoiceOf } from "./ai.shared.ts";

export const PAGE = 8;
export const WEB_PAGE = 10;
export const GROK_PAGE = 12;
/** Images per page, and the deepest image page Folio will ask for. */
export const IMAGES_PAGE = 24;
export const IMAGES_MAX_PAGE = 10;
export const MAX_PAGE = 400;

export function pageOf(value: unknown): number | undefined {
  const raw = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(raw)) return undefined;
  const page = Math.floor(raw);
  if (page <= 1) return undefined;
  return Math.min(MAX_PAGE, page);
}

export function pageItems(current: number, last: number): Array<number | "…"> {
  const page = Math.min(Math.max(1, current), last);
  if (last <= 7) return Array.from({ length: last }, (_, index) => index + 1);
  if (page <= 4) return [1, 2, 3, 4, 5, "…", last];
  if (page >= last - 3) return [1, "…", last - 4, last - 3, last - 2, last - 1, last];
  return [1, "…", page - 1, page, page + 1, "…", last];
}

export type BotSearchQuery = {
  q: string;
  web: boolean;
  wiki: boolean;
  grok: boolean;
  images: boolean;
  /** Optional AI answer built from the top Web, Wikipedia, and Grokipedia results. Off unless asked for. */
  ai: boolean;
  /** Preferred model id, or a legacy provider id (`ai_model=grok-4.3` or `ai_model=claude`). */
  aiModel?: string;
  webOffset: number;
  wikiOffset: number;
  grokOffset: number;
  imagesOffset: number;
};

function sourceFlag(value: string | null, fallback = true): boolean {
  if (value === null || value.trim() === "") return fallback;
  const flag = value.trim().toLowerCase();
  return flag !== "0" && flag !== "false" && flag !== "off";
}

function pageOffset(value: string | null, size: number): number {
  const page = pageOf(value) ?? 1;
  return (page - 1) * size;
}

/**
 * Parameters for GET /api/search. Web, Wikipedia, and Grokipedia default on; Images and AI default off.
 * AI is not a results list, so it does not count as a source on its own. Pages start at 1.
 */
export function readBotSearch(params: URLSearchParams): BotSearchQuery | { error: string } {
  const q = (params.get("q") ?? "").replace(/\s+/g, " ").trim().slice(0, 180);
  if (!q) return { error: "Enter a search" };
  const web = sourceFlag(params.get("web"));
  const wiki = sourceFlag(params.get("wiki"));
  const grok = sourceFlag(params.get("grok"));
  const images = sourceFlag(params.get("images"), false);
  const ai = sourceFlag(params.get("ai"), false);
  if (!web && !wiki && !grok && !images) return { error: "Turn on Web, Wikipedia, Grokipedia, or Images" };
  return {
    q,
    web,
    wiki,
    grok,
    images,
    ai,
    aiModel: aiChoiceOf(params.get("ai_model")),
    webOffset: pageOffset(params.get("webPage"), WEB_PAGE),
    wikiOffset: pageOffset(params.get("wikiPage"), PAGE),
    grokOffset: pageOffset(params.get("grokPage"), GROK_PAGE),
    imagesOffset: pageOffset(params.get("imagesPage"), IMAGES_PAGE),
  };
}

/** Words of a query worth matching against a result: Latin words of 3+ letters, or any non-Latin run. */
function queryTokens(query: string): string[] {
  return fold(query)
    .split(/[\s,.;:!?()"'«»“”„\-–—/]+/)
    .filter((word) => word.length >= 3 || /[^\u0020-\u024f]/.test(word));
}

function fold(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** True when the text is written in Latin script (Bing's feed handles these queries). */
export function isLatinQuery(value: string): boolean {
  return !/[^\s\u0020-\u024f\u1e00-\u1eff\u2000-\u206f]/.test(value.normalize("NFKD").replace(/[\u0300-\u036f]/g, ""));
}

/** How many results mention at least one word of the query (in title, snippet, or address). */
export function relevantCount(hits: Array<{ title: string; snippet: string; url: string }>, query: string): number {
  const tokens = queryTokens(query);
  if (!tokens.length) return hits.length;
  return hits.filter((hit) => {
    const haystack = fold(`${hit.title} ${hit.snippet} ${hit.url}`);
    return tokens.some((token) => haystack.includes(token));
  }).length;
}
