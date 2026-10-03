/**
 * Agentic search for the AI answer: the model judges the results it was given (relevance,
 * freshness, credibility). Good results are answered at once, in the same call (no extra time).
 * Weak ones get a short visible note and a better query instead of an answer; the server runs that
 * search, adds the new results to the numbered list, and asks again. At most RESEARCH_MAX_EXTRA
 * extra searches, always within the answer's time budget. Pure data and helpers, safe on the server
 * and in the browser.
 */
import type { AiContextItem } from "./ai.shared.ts";

/** Extra searches the model may ask for, after the page's own search. */
export const RESEARCH_MAX_EXTRA = 2;
/** New results one extra search adds to the numbered list the model cites from. */
export const RESEARCH_NEW_CONTEXT = 8;
/** Rows a search step lists. */
export const RESEARCH_ROWS = 10;
/** Time left that is needed to offer the model a search at all (a search, then a full answer). */
export const RESEARCH_OFFER_MIN_MS = 30_000;
/** Time left that is needed to run a search the model asked for; less than that, it answers now. */
export const RESEARCH_SEARCH_MIN_MS = 18_000;
/** Longest one extra search may take. */
export const RESEARCH_SEARCH_TIMEOUT_MS = 8_000;
const QUERY_MAX = 120;
const NOTE_MAX = 300;
const TITLE_MAX = 180;

export type ResearchHit = { title: string; url: string; site?: string };

/** One step of the work shown above the answer: a web search (live, then with its results) or a note. */
export type ResearchItem =
  | { kind: "search"; id: number; query: string; status: "searching" | "done"; results: ResearchHit[]; failed?: boolean }
  | { kind: "note"; id: number; text: string };

/** The model's request for a better search, instead of an answer. */
export type SearchRequest = { note: string; query: string };

/** A search the server already ran for the model, and where its results sit in the numbered list. */
export type SearchedRound = { query: string; from: number; to: number };

export function aiSearchPrompt(today?: string): string {
  return [
    `Search quality check${today ? ` (today is ${today})` : ""}: before answering, judge the numbered results for this search.`,
    "They are weak when most of them are off-topic, outdated for a question about recent or current events, or from low-quality sites (content farms, SEO filler, undated aggregator pages) instead of credible publishers or official sources.",
    "Only when they are clearly too weak to answer well, do not answer. Reply with only this block and nothing else:",
    '<search>{"note":"…","query":"…"}</search>',
    "note: one or two short sentences to the reader, in the answer language, saying what is wrong with the results and that you will search again, for example: Those results are low-quality, undated content farms, so I won't rely on them. Let me try a better search.",
    "query: a better web search of 3 to 10 words (more specific terms, credible source names, or the month and year).",
    "When the results are good enough, answer normally and never mention this check. Never ask to search for a greeting, arithmetic, or a request you can answer without the web.",
  ].join(" ");
}

/**
 * The instruction for the round after a search: answer from the strongest results. `mayAskAgain`:
 * one more search is still allowed when the new results are clearly weak too.
 */
export function searchedPrompt(rounds: SearchedRound[], mayAskAgain = false): string {
  const list = rounds
    .map((round) => (round.to >= round.from ? `"${round.query}" (results [${round.from}] to [${round.to}])` : `"${round.query}" (nothing new found)`))
    .join("; ");
  const empty = rounds.every((round) => round.to < round.from);
  return [
    `You judged the earlier results too weak and searched the web again for: ${list}.`,
    mayAskAgain
      ? "If all of these are still clearly too weak, you may ask for one more search with the same block (a different query); otherwise answer now from the most relevant, recent, and credible numbered results, citing them as usual."
      : "Do not ask to search again. Answer now from the most relevant, recent, and credible numbered results, citing them as usual.",
    empty
      ? "The new search found nothing more, so say in one short sentence that reliable sources were limited, then answer as well as the results allow."
      : "You may open with one short sentence saying what the new search turned up.",
  ].join(" ");
}

function stripFences(value: string): string {
  return value.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
}

function oneLine(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

/**
 * The model's search request, from a `<search>{…}</search>` block (or a bare `{"note","query"}`
 * reply). `rest` is the reply without the block, so a stray block never shows in an answer.
 */
export function readSearchRequest(raw: string): { request: SearchRequest | null; rest: string } {
  const tagged = raw.match(/<search>([\s\S]*?)(?:<\/search>|$)/i);
  const body = tagged ? stripFences(tagged[1] ?? "") : stripFences(raw);
  const rest = tagged ? raw.replace(tagged[0], "").trim() : raw;
  if (!tagged && !/^\{[\s\S]*"query"[\s\S]*\}$/.test(body)) return { request: null, rest };
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return { request: null, rest };
  try {
    const value = JSON.parse(body.slice(start, end + 1)) as Record<string, unknown>;
    const query = oneLine(value.query, QUERY_MAX).replace(/^["']|["']$/g, "");
    const note = oneLine(value.note, NOTE_MAX);
    if (!query || !note) return { request: null, rest };
    return { request: { note, query }, rest };
  } catch {
    return { request: null, rest };
  }
}

/** Whether this round may offer the model a search: rounds left and time for a search plus an answer. */
export function canResearch(round: number, remainingMs: number): boolean {
  return round < RESEARCH_MAX_EXTRA && remainingMs >= RESEARCH_OFFER_MIN_MS;
}

function sameQuery(a: string, b: string): boolean {
  const norm = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return norm(a) === norm(b);
}

/**
 * What to do with a reply: `done` (it answered), `search` (run the better search it asked for), or
 * `answer-now` (it asked, but there are no searches or time left, or it asked for a search already
 * run: ask again without the option to search).
 */
export function researchDecision(input: {
  request?: SearchRequest | null;
  round: number;
  remainingMs: number;
  previous: string[];
}): "done" | "search" | "answer-now" {
  if (!input.request) return "done";
  if (input.round >= RESEARCH_MAX_EXTRA) return "answer-now";
  if (input.remainingMs < RESEARCH_SEARCH_MIN_MS) return "answer-now";
  if (input.previous.some((query) => sameQuery(query, input.request!.query))) return "answer-now";
  return "search";
}

function httpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function cleanHit(raw: unknown): ResearchHit | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const title = oneLine(value.title, TITLE_MAX);
  const url = httpUrl(value.url);
  if (!title || !url) return null;
  const site = oneLine(value.site, 80);
  return { title, url, ...(site ? { site } : {}) };
}

/** What a search step lists for these results: the web results, in order. */
export function hitsFromContext(context: AiContextItem[]): ResearchHit[] {
  return context
    .filter((item) => item.source === "web")
    .slice(0, RESEARCH_ROWS)
    .map((item) => ({ title: item.title, url: item.url, ...(item.site ? { site: item.site } : {}) }));
}

/**
 * Add a search's results to the numbered list, skipping addresses already in it. `round` says where
 * the new ones sit (1-based, inclusive; `to < from` when nothing was new).
 */
export function mergeResearchContext(context: AiContextItem[], fresh: AiContextItem[], query: string): { context: AiContextItem[]; round: SearchedRound } {
  const seen = new Set(context.map((item) => item.url));
  const added: AiContextItem[] = [];
  for (const item of fresh) {
    if (added.length >= RESEARCH_NEW_CONTEXT) break;
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    added.push(item);
  }
  const from = context.length + 1;
  return { context: [...context, ...added], round: { query, from, to: context.length + added.length } };
}

/** Put a streamed step in place: the same step (kind and id) is replaced, a new one is added. */
export function applyResearch(items: ResearchItem[], item: ResearchItem): ResearchItem[] {
  const index = items.findIndex((current) => current.kind === item.kind && current.id === item.id);
  if (index < 0) return [...items, item];
  return items.map((current, i) => (i === index ? item : current));
}

/** Validate one streamed step; anything malformed is dropped. */
export function cleanResearchItem(raw: unknown): ResearchItem | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const id = typeof value.id === "number" && Number.isInteger(value.id) && value.id > 0 && value.id < 100 ? value.id : null;
  if (id === null) return null;
  if (value.kind === "note") {
    const text = oneLine(value.text, NOTE_MAX);
    return text ? { kind: "note", id, text } : null;
  }
  if (value.kind === "search") {
    const query = oneLine(value.query, QUERY_MAX);
    const status = value.status === "searching" || value.status === "done" ? value.status : null;
    if (!query || !status) return null;
    const results = (Array.isArray(value.results) ? value.results : [])
      .map(cleanHit)
      .filter((hit): hit is ResearchHit => hit !== null)
      .slice(0, RESEARCH_ROWS);
    return { kind: "search", id, query, status, results, ...(value.failed === true ? { failed: true } : {}) };
  }
  return null;
}

/** The id of the newest search step, which is shown open; earlier ones start closed. */
export function latestSearchId(items: ResearchItem[]): number | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item?.kind === "search") return item.id;
  }
  return null;
}
