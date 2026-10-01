import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  readStringArray,
  runTranslate,
  splitForTranslation,
  translateConfigs,
  translateList,
  translateQuery,
} from "./ai.server.ts";

type Call = { url: string; model: string; system: string; user: string; maxTokens: number };

/** A fake chat endpoint: `reply` decides each answer from the request. */
function fakeFetch(reply: (call: Call) => { status?: number; content?: string; finishReason?: string }) {
  const calls: Call[] = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as {
      model: string;
      messages: Array<{ content: string }>;
      max_tokens?: number;
      max_completion_tokens?: number;
    };
    const call: Call = {
      url: String(url),
      model: body.model,
      system: body.messages[0]?.content ?? "",
      user: body.messages[1]?.content ?? "",
      maxTokens: body.max_tokens ?? body.max_completion_tokens ?? 0,
    };
    calls.push(call);
    const out = reply(call);
    const status = out.status ?? 200;
    return new Response(JSON.stringify({ choices: [{ finish_reason: out.finishReason, message: { content: out.content ?? "" } }], model: body.model }), {
      status,
    });
  }) as typeof fetch;
  return { fetcher, calls };
}

const GROK_ONLY = { XAI_API_KEY: "x-key" };
const GROK_AND_GATEWAY = { XAI_API_KEY: "x-key", AI_GATEWAY_API_KEY: "g-key" };

describe("splitForTranslation", () => {
  it("keeps short text in one piece", () => {
    assert.deepEqual(splitForTranslation("Hello world."), ["Hello world."]);
  });

  it("splits long text at paragraph breaks under the limit", () => {
    const paragraph = "Sentence one is here. ".repeat(20).trim();
    const text = Array.from({ length: 6 }, (_, index) => `# Part ${index}\n${paragraph}`).join("\n\n");
    const pieces = splitForTranslation(text, 1000);
    assert.ok(pieces.length > 1);
    for (const piece of pieces) assert.ok(piece.length <= 1000, `piece too long: ${piece.length}`);
    assert.equal(pieces.join("\n\n").replace(/\s+/g, " "), text.replace(/\s+/g, " "));
  });

  it("breaks one huge paragraph at sentence ends", () => {
    const text = "A short sentence. ".repeat(200);
    const pieces = splitForTranslation(text, 500);
    for (const piece of pieces) assert.ok(piece.length <= 500);
    assert.ok(pieces.every((piece) => piece.endsWith(".")));
  });
});

describe("readStringArray", () => {
  it("reads a fenced JSON array", () => {
    assert.deepEqual(readStringArray('```json\n["a", "b"]\n```'), ["a", "b"]);
  });
  it("rejects replies that are not arrays", () => {
    assert.equal(readStringArray('{"a":1}'), null);
    assert.equal(readStringArray("no json"), null);
    assert.equal(readStringArray('["valid", {"bad": true}]'), null);
  });
});

describe("translateConfigs", () => {
  it("prefers the gateway's fast model, then Grok, then Gemini", () => {
    const ids = translateConfigs(GROK_AND_GATEWAY).map((config) => config.model);
    assert.deepEqual(ids.slice(0, 3), ["openai/gpt-4.1-mini", "grok-4.3", "google/gemini-2.5-flash-lite"]);
  });
  it("is empty without keys", () => {
    assert.deepEqual(translateConfigs({}), []);
  });
});

describe("runTranslate", () => {
  it("translates a long article in pieces, so no reply is cut off", async () => {
    const section = "Berlin is the capital of Germany. ".repeat(40).trim();
    const text = Array.from({ length: 8 }, (_, index) => `## Section ${index}\n${section}`).join("\n\n");
    const { fetcher, calls } = fakeFetch((call) => ({ content: `[bn] ${call.user}` }));
    const out = await runTranslate({ lang: "bn-BD", title: "Berlin", text }, { env: GROK_ONLY, fetcher });
    assert.equal(out.title, "[bn] Berlin");
    assert.equal(out.partial, undefined);
    assert.ok(calls.length >= 4, `expected several pieces, got ${calls.length}`);
    assert.ok(calls.every((call) => call.system.includes("Bangla")));
    assert.ok(calls.every((call) => call.user.length <= 1800));
    assert.ok(calls.every((call) => call.maxTokens >= 800));
    assert.ok(out.text.includes("[bn] ## Section 0"));
  });

  it("falls back to the next provider when one fails", async () => {
    const { fetcher, calls } = fakeFetch((call) =>
      call.model === "openai/gpt-4.1-mini" ? { status: 403 } : { content: `T:${call.user}` },
    );
    const out = await runTranslate({ lang: "hi-IN", title: "Paris", text: "Paris is a city." }, { env: GROK_AND_GATEWAY, fetcher });
    assert.equal(out.title, "T:Paris");
    assert.equal(out.text, "T:Paris is a city.");
    assert.ok(calls.some((call) => call.model === "grok-4.3"));
  });

  it("does not treat a token-truncated passage as a finished translation", async () => {
    const { fetcher } = fakeFetch(() => ({ content: "অসম্পূর্ণ", finishReason: "length" }));
    await assert.rejects(
      runTranslate({ lang: "bn-BD", title: "Title", text: "Full passage." }, { env: GROK_ONLY, fetcher }),
      /truncated reply/,
    );
  });

  it("says why when every provider fails", async () => {
    const { fetcher } = fakeFetch(() => ({ status: 401 }));
    await assert.rejects(
      runTranslate({ lang: "ja-JP", title: "Tokyo", text: "Tokyo is big." }, { env: { XAI_API_KEY: "bad" }, fetcher }),
      (error: Error) => error.name === "TranslateError" && /grok \(grok-4\.3\): HTTP 401/.test(error.message),
    );
  });

  it("says when no key is set", async () => {
    await assert.rejects(runTranslate({ lang: "de-DE", title: "A", text: "B" }, { env: {} }), /unconfigured/);
  });

  it("keeps failed pieces in the original language and marks the result partial", async () => {
    const text = ["First part.", "Second part.", "Third part."].map((part) => part.repeat(150)).join("\n\n");
    const { fetcher } = fakeFetch((call) => (call.user.startsWith("Second") ? { content: "" } : { content: `es:${call.user}` }));
    const out = await runTranslate({ lang: "es-ES", title: "Title", text }, { env: GROK_ONLY, fetcher });
    assert.equal(out.partial, true);
    assert.ok(out.text.includes("es:First part."));
    assert.ok(out.text.includes("Second part."));
  });

  it("leaves English untouched", async () => {
    const out = await runTranslate({ lang: "xx", title: "A", text: "B" }, { env: GROK_ONLY });
    assert.deepEqual(out, { title: "A", text: "B" });
  });
});

describe("translateQuery and translateList", () => {
  it("returns one clean line for a query", async () => {
    const { fetcher } = fakeFetch(() => ({ content: '"Berlin"\nnote' }));
    assert.equal(await translateQuery("বার্লিন", "en-US", { env: GROK_ONLY, fetcher }), "Berlin");
  });

  it("translates titles and snippets in one call and checks the length", async () => {
    const { fetcher, calls } = fakeFetch((call) => ({
      content: JSON.stringify((JSON.parse(call.user) as string[]).map((value) => (value ? `ar:${value}` : ""))),
    }));
    const out = await translateList(["Paris", "Capital of France", "Lyon", ""], "ar-SA", { env: GROK_ONLY, fetcher });
    assert.deepEqual(out, ["ar:Paris", "ar:Capital of France", "ar:Lyon", ""]);
    assert.equal(calls.length, 1);

    const bad = fakeFetch(() => ({ content: '["only one"]' }));
    await assert.rejects(translateList(["a", "b"], "ar-SA", { env: GROK_ONLY, fetcher: bad.fetcher }), /did not match/);
  });
});
