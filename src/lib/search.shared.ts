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
  /** AI answer. Always on unless the request sets ai to 0. It is not a result source. */
  ai: boolean;
  /** ChatGPT note. Off unless asked. It is not a result source. */
  chatgpt: boolean;
  /** Claude note. Off unless asked. It is not a result source. */
  claude: boolean;
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

/** Parameters for GET /api/search. Web, Wikipedia, and Grokipedia default on; Images defaults off. Pages start at 1. */
export function readBotSearch(params: URLSearchParams): BotSearchQuery | { error: string } {
  const q = (params.get("q") ?? "").replace(/\s+/g, " ").trim().slice(0, 180);
  if (!q) return { error: "Enter a search" };
  const web = sourceFlag(params.get("web"));
  const wiki = sourceFlag(params.get("wiki"));
  const grok = sourceFlag(params.get("grok"));
  const images = sourceFlag(params.get("images"), false);
  const ai = sourceFlag(params.get("ai"), true);
  const chatgpt = sourceFlag(params.get("chatgpt"), false);
  const claude = sourceFlag(params.get("claude"), false);
  if (!web && !wiki && !grok && !images) return { error: "Turn on Web, Wikipedia, Grokipedia, or Images" };
  return {
    q,
    web,
    wiki,
    grok,
    images,
    ai,
    chatgpt,
    claude,
    webOffset: pageOffset(params.get("webPage"), WEB_PAGE),
    wikiOffset: pageOffset(params.get("wikiPage"), PAGE),
    grokOffset: pageOffset(params.get("grokPage"), GROK_PAGE),
    imagesOffset: pageOffset(params.get("imagesPage"), IMAGES_PAGE),
  };
}
