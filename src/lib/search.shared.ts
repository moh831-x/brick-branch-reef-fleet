export const PAGE = 8;
export const WEB_PAGE = 10;
export const GROK_PAGE = 12;
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
  webOffset: number;
  wikiOffset: number;
  grokOffset: number;
};

function sourceFlag(value: string | null): boolean {
  if (value === null || value.trim() === "") return true;
  const flag = value.trim().toLowerCase();
  return flag !== "0" && flag !== "false" && flag !== "off";
}

function pageOffset(value: string | null, size: number): number {
  const page = pageOf(value) ?? 1;
  return (page - 1) * size;
}

/** Parameters for GET /api/search. Sources default on. Pages start at 1. */
export function readBotSearch(params: URLSearchParams): BotSearchQuery | { error: string } {
  const q = (params.get("q") ?? "").replace(/\s+/g, " ").trim().slice(0, 180);
  if (!q) return { error: "Enter a search" };
  const web = sourceFlag(params.get("web"));
  const wiki = sourceFlag(params.get("wiki"));
  const grok = sourceFlag(params.get("grok"));
  if (!web && !wiki && !grok) return { error: "Turn on Web, Wikipedia, or Grokipedia" };
  return {
    q,
    web,
    wiki,
    grok,
    webOffset: pageOffset(params.get("webPage"), WEB_PAGE),
    wikiOffset: pageOffset(params.get("wikiPage"), PAGE),
    grokOffset: pageOffset(params.get("grokPage"), GROK_PAGE),
  };
}
