import { aiProviderOf, type AiProviderId } from "./ai.shared.ts";

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
  /** Preferred AI provider (`ai_model=grok|openai|claude`). Unset means the first one that is set up. */
  aiModel?: AiProviderId;
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
    aiModel: aiProviderOf(params.get("ai_model")),
    webOffset: pageOffset(params.get("webPage"), WEB_PAGE),
    wikiOffset: pageOffset(params.get("wikiPage"), PAGE),
    grokOffset: pageOffset(params.get("grokPage"), GROK_PAGE),
    imagesOffset: pageOffset(params.get("imagesPage"), IMAGES_PAGE),
  };
}
