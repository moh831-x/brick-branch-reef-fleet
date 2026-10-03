import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { requestLang, streamAiAnswer } from "./ai-answer-stream.server.ts";
import { readAnswerStream, StreamUnavailable } from "./ai-stream.ts";
import type { AiProgressEvent } from "./ai-progress.ts";
import type { runAiAnswer } from "./ai.server.ts";

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
});
