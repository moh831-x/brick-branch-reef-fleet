/**
 * The agentic answer loop (see research.shared.ts). The first call offers the model a search: with
 * good results it simply answers (one call, no added time); with weak ones it replies with a short
 * note and a better query. Then this runs that search with the site's own web/news search, adds the
 * new results to the numbered list, and asks again: at most RESEARCH_MAX_EXTRA extra searches, all
 * within the one answer's time budget. Citations can only point at results that were really
 * returned: the answer is parsed against the combined list, and unknown numbers are dropped.
 */
import type { AiAnswer, AiContextItem } from "./ai.shared.ts";
import { AI_TOTAL_MS, runAiAnswer } from "./ai.server.ts";
import { graphAnswerBrief } from "./graph.ts";
import { isNewsQuery } from "./news.shared.ts";
import {
  applyResearch,
  canResearch,
  hitsFromContext,
  mergeResearchContext,
  RESEARCH_ROWS,
  RESEARCH_SEARCH_TIMEOUT_MS,
  researchDecision,
  type ResearchItem,
  type SearchedRound,
} from "./research.shared.ts";

/** Runs one web search (news too, for a news search) and returns its results as context items. */
/** `lang` is the page language, for the search feed. */
export type ResearchSearchFn = (query: string, options: { news: boolean; signal: AbortSignal; lang?: string }) => Promise<AiContextItem[]>;

type RunOptions = NonNullable<Parameters<typeof runAiAnswer>[3]>;

export type ResearchOptions = Omit<RunOptions, "search" | "searched" | "clockStart"> & {
  /** The search to run when the model asks; without one, this is a plain single answer. */
  searchWeb?: ResearchSearchFn;
  /** A follow-up in the conversation: the page's search was for an earlier question, so it is not shown as a step. */
  followUp?: boolean;
  /** Each step as it happens (a search starting, its results, a note), for the stream. */
  onResearch?: (item: ResearchItem) => void;
  /** The single-answer call, replaceable in tests. */
  run?: typeof runAiAnswer;
};

function withoutSearch(answer: AiAnswer, research: ResearchItem[]): AiAnswer {
  if (answer.status !== "ok") return answer;
  const { search: _search, research: _old, ...rest } = answer;
  return research.length ? { ...rest, research } : rest;
}

export async function runResearchedAnswer(query: string, context: AiContextItem[], preferred: string | undefined, options: ResearchOptions = {}): Promise<AiAnswer> {
  const { searchWeb: search, followUp, onResearch, run = runAiAnswer, ...runOptions } = options;
  // Without a search to run, or for a graph (it already has its function to describe): one plain answer.
  if (!search || graphAnswerBrief(query)) return withoutSearch(await run(query, context, preferred, runOptions), []);

  const started = Date.now();
  const totalMs = runOptions.totalMs ?? AI_TOTAL_MS;
  const remaining = () => totalMs - (Date.now() - started);
  const news = isNewsQuery(query);
  let research: ResearchItem[] = [];
  let nextId = 1;
  const step = (item: ResearchItem) => {
    research = applyResearch(research, item);
    try {
      onResearch?.(item);
    } catch {
      // A listener that throws never breaks the answer.
    }
  };
  // The page's own search is the first step (not for a follow-up: it was for an earlier question).
  if (!followUp) step({ kind: "search", id: nextId++, query, status: "done", results: hitsFromContext(context) });

  let current = context;
  const searched: SearchedRound[] = [];
  let mayAsk = true;
  for (let round = 0; ; round += 1) {
    const offer = mayAsk && canResearch(searched.length, remaining());
    const answer = await run(query, current, preferred, {
      ...runOptions,
      totalMs: Math.max(0, remaining()),
      clockStart: started,
      // A clarifying question only makes sense before any search was run for it.
      clarify: round === 0 ? runOptions.clarify : false,
      search: offer,
      ...(searched.length ? { searched } : {}),
    });
    if (answer.status !== "ok") return answer;
    // A clarifying question is the focus: the card asks it, without search steps above it.
    if (answer.question) return withoutSearch(answer, []);
    const decision = researchDecision({
      request: answer.search,
      round: searched.length,
      remainingMs: remaining(),
      previous: [query, ...searched.map((item) => item.query)],
    });
    if (decision === "done") return withoutSearch(answer, research);
    if (decision === "answer-now") {
      // Asked to search when it can't: ask once more, this time without the option.
      if (!mayAsk) return withoutSearch(answer, research);
      mayAsk = false;
      continue;
    }
    const request = answer.search!;
    step({ kind: "note", id: nextId++, text: request.note });
    const id = nextId++;
    step({ kind: "search", id, query: request.query, status: "searching", results: [] });
    let fresh: AiContextItem[] = [];
    let failed = false;
    try {
      fresh = await search(request.query, { news, signal: AbortSignal.timeout(RESEARCH_SEARCH_TIMEOUT_MS) });
    } catch {
      failed = true;
    }
    const merged = mergeResearchContext(current, fresh, request.query);
    current = merged.context;
    searched.push(merged.round);
    step({
      kind: "search",
      id,
      query: request.query,
      status: "done",
      results: fresh.slice(0, RESEARCH_ROWS).map((item) => ({ title: item.title, url: item.url, ...(item.site ? { site: item.site } : {}) })),
      ...(failed ? { failed: true } : {}),
    });
  }
}
