export const PAGE = 8;
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
