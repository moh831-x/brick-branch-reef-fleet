import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  aiSearchPrompt,
  applyResearch,
  canResearch,
  cleanResearchItem,
  hitsFromContext,
  latestSearchId,
  mergeResearchContext,
  readSearchRequest,
  researchDecision,
  RESEARCH_MAX_EXTRA,
  RESEARCH_NEW_CONTEXT,
  RESEARCH_OFFER_MIN_MS,
  RESEARCH_SEARCH_MIN_MS,
  searchedPrompt,
  type ResearchItem,
} from "./research.shared.ts";
import { parseStreamLine } from "./ai-progress.ts";
import type { AiContextItem } from "./ai.shared.ts";

const item = (n: number, source: AiContextItem["source"] = "web"): AiContextItem => ({ source, title: `T${n}`, url: `https://s${n}.example/a`, snippet: "s" });

describe("reading the model's search request", () => {
  it("reads a tagged block, fenced JSON, and a bare reply", () => {
    const tagged = readSearchRequest('<search>{"note":"Those are content farms. Let me try again.","query":"Iran Reuters AP October 2026"}</search>');
    assert.deepEqual(tagged.request, { note: "Those are content farms. Let me try again.", query: "Iran Reuters AP October 2026" });
    assert.equal(tagged.rest, "");
    assert.equal(readSearchRequest('<search>```json\n{"note":"n","query":"q"}\n```</search>').request?.query, "q");
    assert.equal(readSearchRequest('{"note":"n","query":"better words"}').request?.query, "better words");
  });

  it("keeps a normal answer as it is, and drops a broken block from it", () => {
    assert.deepEqual(readSearchRequest("Paris is the capital [1]."), { request: null, rest: "Paris is the capital [1]." });
    const broken = readSearchRequest("Answer [1]. <search>{oops</search>");
    assert.equal(broken.request, null);
    assert.equal(broken.rest, "Answer [1].");
    assert.equal(readSearchRequest('<search>{"note":"","query":"q"}</search>').request, null, "a note is required");
    assert.equal(readSearchRequest('<search>{"note":"n","query":"   "}</search>').request, null, "a query is required");
  });

  it("bounds the note and the query", () => {
    const long = readSearchRequest(`<search>${JSON.stringify({ note: "n".repeat(900), query: "q ".repeat(200) })}</search>`).request!;
    assert.ok(long.note.length <= 300);
    assert.ok(long.query.length <= 120);
  });
});

describe("the loop decision", () => {
  const request = { note: "Weak results.", query: "better query" };
  it("answers at once when the model answered", () => {
    assert.equal(researchDecision({ request: null, round: 0, remainingMs: 50_000, previous: ["iran news"] }), "done");
  });
  it("searches when asked, with rounds and time left", () => {
    assert.equal(researchDecision({ request, round: 0, remainingMs: 50_000, previous: ["iran news"] }), "search");
    assert.equal(researchDecision({ request, round: 1, remainingMs: RESEARCH_SEARCH_MIN_MS, previous: ["iran news"] }), "search");
  });
  it("answers now after the last extra search, when time is short, or for a search already run", () => {
    assert.equal(researchDecision({ request, round: RESEARCH_MAX_EXTRA, remainingMs: 50_000, previous: [] }), "answer-now");
    assert.equal(researchDecision({ request, round: 0, remainingMs: RESEARCH_SEARCH_MIN_MS - 1, previous: [] }), "answer-now");
    assert.equal(researchDecision({ request: { note: "n", query: "Better  Query!" }, round: 1, remainingMs: 50_000, previous: ["iran news", "better query"] }), "answer-now");
  });
  it("offers a search only with rounds and time for a search plus an answer", () => {
    assert.equal(canResearch(0, RESEARCH_OFFER_MIN_MS), true);
    assert.equal(canResearch(0, RESEARCH_OFFER_MIN_MS - 1), false);
    assert.equal(canResearch(RESEARCH_MAX_EXTRA, 60_000), false);
  });
});

describe("prompts", () => {
  it("asks for the block only for clearly weak results, with today's date", () => {
    const prompt = aiSearchPrompt("October 2, 2026");
    assert.match(prompt, /today is October 2, 2026/);
    assert.match(prompt, /<search>\{"note":"…","query":"…"\}<\/search>/);
    assert.match(prompt, /answer normally/);
  });
  it("tells the next round where the new results are, or that there were none", () => {
    assert.match(searchedPrompt([{ query: "iran reuters", from: 6, to: 11 }]), /"iran reuters" \(results \[6\] to \[11\]\).*Do not ask to search again/);
    assert.match(searchedPrompt([{ query: "x", from: 6, to: 5 }]), /nothing new found.*reliable sources were limited/);
    assert.match(searchedPrompt([{ query: "x", from: 6, to: 9 }], true), /you may ask for one more search/);
    assert.doesNotMatch(searchedPrompt([{ query: "x", from: 6, to: 9 }], true), /Do not ask to search again/);
  });
});

describe("combining results", () => {
  it("adds new results after the old ones, skipping repeats, up to the cap", () => {
    const fresh = [item(2), ...Array.from({ length: 12 }, (_, i) => item(10 + i))];
    const { context, round } = mergeResearchContext([item(1), item(2)], fresh, "q");
    assert.equal(context.length, 2 + RESEARCH_NEW_CONTEXT);
    assert.deepEqual(round, { query: "q", from: 3, to: 2 + RESEARCH_NEW_CONTEXT });
    assert.equal(new Set(context.map((entry) => entry.url)).size, context.length);
    assert.deepEqual(mergeResearchContext([item(1)], [], "q").round, { query: "q", from: 2, to: 1 });
  });
  it("lists only web results for a search step", () => {
    assert.deepEqual(hitsFromContext([item(1), item(2, "wiki"), { ...item(3), site: "Reuters" }]), [
      { title: "T1", url: "https://s1.example/a" },
      { title: "T3", url: "https://s3.example/a", site: "Reuters" },
    ]);
  });
});

describe("streamed steps", () => {
  it("replaces a step by kind and id, and adds new ones in order", () => {
    let items: ResearchItem[] = [];
    items = applyResearch(items, { kind: "search", id: 1, query: "a", status: "done", results: [] });
    items = applyResearch(items, { kind: "note", id: 2, text: "weak" });
    items = applyResearch(items, { kind: "search", id: 3, query: "b", status: "searching", results: [] });
    items = applyResearch(items, { kind: "search", id: 3, query: "b", status: "done", results: [{ title: "R", url: "https://r.example/" }] });
    assert.deepEqual(items.map((entry) => `${entry.kind}${entry.id}`), ["search1", "note2", "search3"]);
    assert.equal(items[2]?.kind === "search" && items[2].status, "done");
    assert.equal(latestSearchId(items), 3);
    assert.equal(latestSearchId([]), null);
  });

  it("parses research lines and drops malformed ones", () => {
    const line = (value: unknown) => parseStreamLine(JSON.stringify(value));
    assert.deepEqual(line({ type: "research", item: { kind: "note", id: 2, text: " Weak  results. " } }), { type: "research", item: { kind: "note", id: 2, text: "Weak results." } });
    const step = line({ type: "research", item: { kind: "search", id: 3, query: "q", status: "done", results: [{ title: "A", url: "https://a.example/" }, { title: "Bad", url: "javascript:alert(1)" }, { title: "", url: "https://b.example/" }] } });
    assert.deepEqual(step, { type: "research", item: { kind: "search", id: 3, query: "q", status: "done", results: [{ title: "A", url: "https://a.example/" }] } });
    assert.equal(line({ type: "research", item: { kind: "search", id: 0, query: "q", status: "done" } }), null, "ids start at 1");
    assert.equal(line({ type: "research", item: { kind: "search", id: 1, query: "q", status: "maybe" } }), null);
    assert.equal(line({ type: "research", item: { kind: "note", id: 1, text: "" } }), null);
    assert.equal(line({ type: "research", item: { kind: "other", id: 1 } }), null);
    assert.equal(cleanResearchItem(null), null);
  });
});
