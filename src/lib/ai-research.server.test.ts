import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runResearchedAnswer, type ResearchSearchFn } from "./ai-research.server.ts";
import { runAiAnswer } from "./ai.server.ts";
import type { AiAnswer, AiContextItem } from "./ai.shared.ts";
import type { ResearchItem } from "./research.shared.ts";

const weak: AiContextItem[] = [
  { source: "web", title: "Iran news today | content farm", url: "https://farm.example/iran", snippet: "click here" },
  { source: "wiki", title: "Iran", url: "https://en.wikipedia.org/wiki/Iran", snippet: "A country." },
];
const better: AiContextItem[] = [
  { source: "web", title: "Iran rejects proposal", url: "https://www.reuters.com/world/iran-1", snippet: "Reuters report.", site: "Reuters", date: "Oct 2, 2026" },
  { source: "web", title: "Talks continue", url: "https://apnews.com/article/iran-2", snippet: "AP report.", site: "AP News" },
];

type Options = NonNullable<Parameters<typeof runAiAnswer>[3]>;
const ok = (text: string, extra: Partial<Extract<AiAnswer, { status: "ok" }>> = {}): AiAnswer => ({
  status: "ok", text, parts: [{ text }], citations: [], model: "grok-test", provider: "grok", failed: [], ...extra,
});

/** A stand-in model: replies come from `script`, one per call; every call's options are kept. */
function scripted(script: Array<(context: AiContextItem[], options: Options) => AiAnswer>) {
  const calls: Array<{ context: AiContextItem[]; options: Options }> = [];
  const run = (async (_q: string, context: AiContextItem[], _model?: string, options: Options = {}) => {
    calls.push({ context, options });
    const reply = script[Math.min(calls.length - 1, script.length - 1)]!;
    return reply(context, options);
  }) as typeof runAiAnswer;
  return { run, calls };
}

function searcher(results: AiContextItem[] | Error = better) {
  const queries: string[] = [];
  const search: ResearchSearchFn = async (query) => {
    queries.push(query);
    if (results instanceof Error) throw results;
    return results;
  };
  return { search, queries };
}

const askToSearch = (query: string) => (_c: AiContextItem[], options: Options) =>
  options.search ? ok("Weak results. Let me try a better search.", { search: { note: "Weak results. Let me try a better search.", query } }) : ok("Answer anyway.");

describe("agentic search loop", () => {
  it("strong first results: one call, one step, no extra search", async () => {
    const { run, calls } = scripted([() => ok("Good answer [1].")]);
    const { search, queries } = searcher();
    const steps: ResearchItem[] = [];
    const answer = await runResearchedAnswer("iran news", weak, "grok", { run, searchWeb: search, onResearch: (item) => steps.push(item) });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.options.search, true, "the first call may ask for a search");
    assert.deepEqual(queries, []);
    assert.equal(answer.status === "ok" && answer.text, "Good answer [1].");
    assert.deepEqual(answer.status === "ok" && answer.research, [{ kind: "search", id: 1, query: "iran news", status: "done", results: [{ title: weak[0]!.title, url: weak[0]!.url }] }]);
    assert.equal(steps.length, 1);
    assert.equal(answer.status === "ok" && "search" in answer, false);
  });

  it("weak results: a note, a better search, then the answer from the combined results", async () => {
    const { run, calls } = scripted([askToSearch("Iran Reuters AP October 2026"), () => ok("Better answer.")]);
    const { search, queries } = searcher();
    const steps: ResearchItem[] = [];
    const answer = await runResearchedAnswer("iran news", weak, "grok", { run, searchWeb: search, onResearch: (item) => steps.push(item), clarify: true });
    assert.deepEqual(queries, ["Iran Reuters AP October 2026"]);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[1]!.context.map((entry) => entry.url), [...weak, ...better].map((entry) => entry.url));
    assert.deepEqual(calls[1]!.options.searched, [{ query: "Iran Reuters AP October 2026", from: 3, to: 4 }]);
    assert.equal(calls[1]!.options.clarify, false, "no clarifying question after a search");
    assert.equal(calls[0]!.options.clarify, true);
    assert.deepEqual(steps.map((step) => (step.kind === "search" ? `search${step.id}:${step.status}` : `note${step.id}`)), ["search1:done", "note2", "search3:searching", "search3:done"]);
    assert.ok(answer.status === "ok");
    assert.equal(answer.text, "Better answer.");
    assert.deepEqual(answer.research?.map((step) => step.kind), ["search", "note", "search"]);
    const last = answer.research?.[2];
    assert.equal(last?.kind === "search" && last.results.length, 2);
    assert.equal(answer.research?.[1]?.kind === "note" && answer.research[1].text, "Weak results. Let me try a better search.");
  });

  it("stops after two extra searches", async () => {
    let n = 0;
    const { run, calls } = scripted([(_c, options) => (options.search ? ok("note", { search: { note: "still weak", query: `try ${(n += 1)}` } }) : ok("Final."))]);
    const { search, queries } = searcher();
    const answer = await runResearchedAnswer("iran news", weak, "grok", { run, searchWeb: search });
    assert.deepEqual(queries, ["try 1", "try 2"]);
    assert.equal(calls.length, 3);
    assert.equal(calls[2]!.options.search, false, "the last round must answer");
    assert.equal(answer.status === "ok" && answer.text, "Final.");
  });

  it("a failed search still gets an answer, and the step says it failed", async () => {
    const { run } = scripted([askToSearch("better"), () => ok("From what we have.")]);
    const { search } = searcher(new Error("feed down"));
    const answer = await runResearchedAnswer("iran news", weak, "grok", { run, searchWeb: search });
    assert.ok(answer.status === "ok");
    assert.equal(answer.text, "From what we have.");
    const step = answer.research?.at(-1);
    assert.equal(step?.kind === "search" && step.failed, true);
  });

  it("asks again without the option when the model repeats the original search", async () => {
    const { run, calls } = scripted([askToSearch("Iran News"), () => ok("Answered.")]);
    const { search, queries } = searcher();
    const answer = await runResearchedAnswer("iran news", weak, "grok", { run, searchWeb: search });
    assert.deepEqual(queries, []);
    assert.equal(calls[1]!.options.search, false);
    assert.equal(answer.status === "ok" && answer.text, "Answered.");
  });

  it("does not offer a search when there is not enough time", async () => {
    const { run, calls } = scripted([() => ok("Quick.")]);
    await runResearchedAnswer("iran news", weak, "grok", { run, searchWeb: searcher().search, totalMs: 10_000 });
    assert.equal(calls[0]!.options.search, false);
  });

  it("a clarifying question comes back at once", async () => {
    const question = { message: "What should it do?", question: "What kind?", options: [{ label: "A", description: "a" }, { label: "B", description: "b" }], suggestions: [] };
    const { run, calls } = scripted([() => ok("What should it do?", { question })]);
    const answer = await runResearchedAnswer("write a python code", weak, "grok", { run, searchWeb: searcher().search, clarify: true });
    assert.equal(calls.length, 1);
    assert.equal(answer.status === "ok" && answer.question?.question, "What kind?");
    assert.equal(answer.status === "ok" && answer.research, undefined, "no search steps above the question card");
  });

  it("a follow-up shows only its own searches, and graphs and plain answers never search", async () => {
    const follow = scripted([askToSearch("better"), () => ok("Done.")]);
    const answer = await runResearchedAnswer("what about oil prices?", weak, "grok", { run: follow.run, searchWeb: searcher().search, followUp: true });
    assert.deepEqual(answer.status === "ok" && answer.research?.map((step) => step.kind), ["note", "search"]);
    const graph = scripted([() => ok("A parabola.")]);
    const plotted = await runResearchedAnswer("y = x^2", weak, "grok", { run: graph.run, searchWeb: searcher().search });
    assert.equal(graph.calls[0]!.options.search, undefined);
    assert.equal(plotted.status === "ok" && plotted.research, undefined);
    const plain = scripted([() => ok("Hi.", { search: { note: "x", query: "y" } })]);
    const answered = await runResearchedAnswer("iran news", weak, "grok", { run: plain.run });
    assert.equal(answered.status === "ok" && "search" in answered, false, "the internal request is never sent on");
  });

  it("with a real provider call: cites only results that were returned, numbered across both searches", async () => {
    const replies = [
      '<search>{"note":"Those results are undated content farms. Let me try a better search.","query":"Iran Reuters AP October 2026"}</search>',
      "Iran rejected the proposal [3], and talks continue [4]. Made-up source [9].",
    ];
    const systems: string[] = [];
    const fetcher = (async (_url: string | URL, init?: RequestInit) => {
      const sent = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      systems.push(sent.messages[0]!.content);
      return Response.json({ model: "grok-test", choices: [{ message: { content: replies[systems.length - 1] } }] });
    }) as typeof fetch;
    const answer = await runResearchedAnswer("iran news", weak, "grok", { env: { XAI_API_KEY: "k" }, fetcher, searchWeb: searcher().search, now: new Date("2026-10-02T15:00:00Z") });
    assert.ok(answer.status === "ok");
    assert.match(systems[0]!, /<search>/);
    assert.match(systems[1]!, /you may ask for one more search/, "one extra search is still left");
    assert.match(systems[1]!, /searched the web again for: "Iran Reuters AP October 2026" \(results \[3\] to \[4\]\)/);
    assert.deepEqual(answer.citations.map((cite) => cite.url), [better[0]!.url, better[1]!.url]);
    assert.equal(answer.citations[0]!.site, "Reuters");
    assert.doesNotMatch(answer.text, /\[9\]/);
  });
});
