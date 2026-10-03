import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { requestLang, streamAiAnswer } from "./ai-answer-stream.server.ts";
import { readAnswerStream, StreamUnavailable } from "./ai-stream.ts";
import type { AiProgressEvent } from "./ai-progress.ts";
import type { runAiAnswer } from "./ai.server.ts";
import type { ResearchSearchFn } from "./ai-research.server.ts";
import type { ResearchItem } from "./research.shared.ts";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A stand-in for runAiAnswer that reports two stages, a little apart, then answers. */
const fakeRun = (async (_q, _context, _model, options) => {
  options?.onProgress?.({ type: "ask", model: "grok-4.7", provider: "grok", fallback: false, at: 1 });
  await sleep(30);
  options?.onProgress?.({ type: "write", model: "grok-4.7", provider: "grok", at: 31 });
  return { status: "ok", text: `in ${options?.answerLanguage}`, parts: [{ text: "hi" }], citations: [], model: "grok-4.7", provider: "grok", failed: [] };
}) as typeof runAiAnswer;

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://local/api/ai-answer", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
}

describe("streamed AI answer", () => {
  it("streams each stage as it happens, then the answer", async () => {
    const response = await streamAiAnswer(post({ q: "dogs", context: [], lang: "fr-FR" }), fakeRun);
    assert.match(response.headers.get("content-type") ?? "", /application\/x-ndjson/);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    const reader = response.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    assert.match(first, /"type":"ask"/, "the first stage is sent before the model finishes");
    assert.doesNotMatch(first, /"answer"/);
    let rest = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      rest += new TextDecoder().decode(value);
    }
    const lines = rest.trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(lines.at(-1).type, "answer");
    assert.equal(lines.at(-1).answer.text, "in French");
  });

  it("rejects a request without a question", async () => {
    const response = await streamAiAnswer(post({ q: "  " }), fakeRun);
    assert.equal(response.status, 400);
  });

  it("answers with an error line when the run throws", async () => {
    const broken = (async () => { throw new Error("boom"); }) as unknown as typeof runAiAnswer;
    const response = await streamAiAnswer(post({ q: "dogs" }), broken);
    const text = await response.text();
    assert.equal(JSON.parse(text.trim()).answer.status, "error");
  });

  it("uses the saved language cookie, then Accept-Language", () => {
    assert.equal(requestLang(post({}, { cookie: "a=1; folio_lang=ar-SA" })), "ar-SA");
    assert.equal(requestLang(post({}, { "accept-language": "de-DE,de;q=0.9" })), "de-DE");
    assert.equal(requestLang(post({})), "en-US");
  });

  it("the browser reader hands over each stage, then returns the answer", async () => {
    const fetcher = (async (_url: string | URL | Request, init?: RequestInit) =>
      streamAiAnswer(new Request("http://local/api/ai-answer", { method: "POST", headers: { "content-type": "application/json" }, body: init?.body as string }), fakeRun)) as typeof fetch;
    const seen: AiProgressEvent[] = [];
    const answer = await readAnswerStream({ q: "dogs", context: [] }, (event) => seen.push(event), fetcher);
    assert.deepEqual(seen.map((event) => event.type), ["ask", "write"]);
    assert.equal(answer.status, "ok");
  });

  it("says the stream is unavailable (so the page can ask the plain way) only when nothing was read", async () => {
    const missing = (async () => new Response("not found", { status: 404, headers: { "content-type": "text/html" } })) as typeof fetch;
    await assert.rejects(readAnswerStream({ q: "dogs", context: [] }, () => {}, missing), StreamUnavailable);
    const offline = (async () => { throw new TypeError("fetch failed"); }) as typeof fetch;
    await assert.rejects(readAnswerStream({ q: "dogs", context: [] }, () => {}, offline), StreamUnavailable);
    const cut = (async () => new Response('{"type":"progress","event":{"type":"ask","model":"m","provider":"grok","fallback":false,"at":1}}\n', { headers: { "content-type": "application/x-ndjson" } })) as typeof fetch;
    await assert.rejects(readAnswerStream({ q: "dogs", context: [] }, () => {}, cut), (error: unknown) => error instanceof Error && !(error instanceof StreamUnavailable));
  });

  it("sends a clarifying question as its own line before the answer, and the reader puts it back", async () => {
    const question = { message: "What should it do?", question: "What kind of code?", options: [{ label: "Script", description: "A main()" }, { label: "Web", description: "An API call" }, { label: "Data", description: "CSV files" }], suggestions: ["Learn Python basics"] };
    let asked: boolean | undefined;
    const clarifyRun = (async (_q, _context, _model, options) => {
      asked = options?.clarify;
      return { status: "ok", text: question.message, parts: [{ text: question.message }], citations: [], model: "grok-4.3", provider: "grok", failed: [], question };
    }) as typeof runAiAnswer;
    const text = await (await streamAiAnswer(post({ q: "write a python code", context: [] }), clarifyRun)).text();
    const lines = text.trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(asked, true, "the chat stream allows clarifying questions");
    assert.deepEqual(lines.map((line) => line.type), ["question", "answer"]);
    assert.equal(lines[0].question.question, "What kind of code?");
    assert.equal(lines[1].answer.question, undefined);
    assert.equal(lines[1].answer.text, "What should it do?");
    const fetcher = (async (_url: string | URL | Request, init?: RequestInit) =>
      streamAiAnswer(new Request("http://local/api/ai-answer", { method: "POST", headers: { "content-type": "application/json" }, body: init?.body as string }), clarifyRun)) as typeof fetch;
    const answer = await readAnswerStream({ q: "write a python code", context: [] }, () => {}, fetcher);
    assert.equal(answer.status === "ok" ? answer.question?.options.length : 0, 3);
  });
});

describe("streamed agentic search", () => {
  const context = [{ source: "web", title: "Iran news today", url: "https://farm.example/iran", snippet: "filler" }];
  const fresh = [{ source: "web" as const, title: "Iran rejects proposal", url: "https://www.reuters.com/world/iran-1", snippet: "Reuters.", site: "Reuters" }];
  /** Asks for a better search when it may, then answers. */
  const researchRun = (async (_q, _context, _model, options) => {
    if (options?.search) {
      return { status: "ok", text: "Weak.", parts: [{ text: "Weak." }], citations: [], model: "grok-4.3", provider: "grok", failed: [], search: { note: "Those are content farms. Let me try a better search.", query: "Iran Reuters October 2026" } };
    }
    return { status: "ok", text: "Better answer.", parts: [{ text: "Better answer." }], citations: [], model: "grok-4.3", provider: "grok", failed: [] };
  }) as typeof runAiAnswer;
  const langs: Array<string | undefined> = [];
  const search: ResearchSearchFn = async (_query, options) => {
    langs.push(options.lang);
    return fresh;
  };

  it("streams each step and note before the answer, only when web search is on", async () => {
    const text = await (await streamAiAnswer(post({ q: "iran news", context, web: true, lang: "de-DE" }), researchRun, search)).text();
    const lines = text.trim().split("\n").map((line) => JSON.parse(line));
    assert.deepEqual(lines.map((line) => (line.type === "research" ? `${line.item.kind}${line.item.status ? `:${line.item.status}` : ""}` : line.type)), ["search:done", "note", "search:searching", "search:done", "answer"]);
    assert.equal(lines[1].item.text, "Those are content farms. Let me try a better search.");
    assert.equal(lines[3].item.results[0].url, fresh[0]!.url);
    const answer = lines.at(-1).answer;
    assert.equal(answer.text, "Better answer.");
    assert.equal(answer.search, undefined, "the internal search request never reaches the browser");
    assert.equal(answer.research.length, 3);
    assert.deepEqual(langs, ["de-DE"], "the search runs in the page language");

    const off = await (await streamAiAnswer(post({ q: "iran news", context }), researchRun, search)).text();
    const offLines = off.trim().split("\n").map((line) => JSON.parse(line));
    assert.deepEqual(offLines.map((line) => line.type), ["answer"], "web off: no extra searches");
  });

  it("the browser reader hands each step to onResearch and returns the answer with its research", async () => {
    const fetcher = (async (_url: string | URL | Request, init?: RequestInit) =>
      streamAiAnswer(new Request("http://local/api/ai-answer", { method: "POST", headers: { "content-type": "application/json" }, body: init?.body as string }), researchRun, search)) as typeof fetch;
    const steps: ResearchItem[] = [];
    const answer = await readAnswerStream({ q: "iran news", context: context as never, web: true }, () => {}, fetcher, (item) => steps.push(item));
    assert.equal(steps.length, 4);
    assert.ok(answer.status === "ok");
    assert.deepEqual(answer.research?.map((step) => step.kind), ["search", "note", "search"]);
  });
});
