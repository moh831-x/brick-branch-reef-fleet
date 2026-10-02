import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AI_MODELS,
  AI_MAX_CONTEXT,
  aiModelLabelFor,
  fallbackFailures,
  aiChoiceOf,
  aiProviderOf,
  aiProviderOrder,
  buildAiPrompt,
  cleanContextItem,
  modelNote,
  modelReady,
  parseAiAnswer,
  pickAiContext,
  selectedAiModel,
  selectedAiProvider,
  type AiContextItem,
  type AiKeyFlags,
  type AiAnswer,
} from "./ai.shared.ts";

const hit = (n: number, host = "example.com") => ({ title: `Title ${n}`, url: `https://${host}/${n}`, snippet: `Snippet ${n}` });

const context: AiContextItem[] = [
  { source: "web", title: "One", url: "https://a.example/1", snippet: "a" },
  { source: "wiki", title: "Two", url: "https://en.wikipedia.org/wiki/Two", snippet: "b" },
  { source: "grok", title: "Three", url: "https://grokipedia.com/page/Three", snippet: "c" },
];

describe("pickAiContext", () => {
  it("interleaves Web, Wikipedia, and Grokipedia and dedupes by address", () => {
    const picked = pickAiContext({
      web: { results: [hit(1), hit(2), hit(1)] },
      wiki: { results: [hit(10, "en.wikipedia.org")] },
      grok: { results: [hit(20, "grokipedia.com")] },
    });
    assert.deepEqual(
      picked.map((item) => item.source),
      ["web", "wiki", "grok", "web"],
    );
    assert.equal(new Set(picked.map((item) => item.url)).size, picked.length);
  });

  it("caps the context and skips sources that are off", () => {
    const many = Array.from({ length: 20 }, (_, n) => hit(n));
    assert.ok(pickAiContext({ web: { results: many }, wiki: { results: many.map((h) => ({ ...h, url: `${h.url}w` })) }, grok: { results: many.map((h) => ({ ...h, url: `${h.url}g` })) } }).length <= AI_MAX_CONTEXT);
    assert.deepEqual(pickAiContext({}), []);
  });
});

describe("pickAiContext with Images", () => {
  it("includes image results with their title and source page when Images is on", () => {
    const picked = pickAiContext({
      web: { results: [hit(1)] },
      images: { results: [{ title: "A golden retriever", url: "https://dogs.example/page", snippet: "" }] },
    });
    assert.deepEqual(
      picked.map((item) => item.source),
      ["web", "images"],
    );
    assert.equal(picked[1].url, "https://dogs.example/page");
    assert.equal(picked[1].snippet, "Image found on dogs.example");
    assert.match(buildAiPrompt("dogs", picked), /\[2\] A golden retriever \(Images, https:\/\/dogs\.example\/page\)/);
  });

  it("can answer from Images alone", () => {
    assert.equal(pickAiContext({ images: { results: [hit(1)] } }).length, 1);
  });
});

describe("AI providers", () => {
  it("parses ai_model values", () => {
    assert.equal(aiProviderOf("OpenAI"), "openai");
    assert.equal(aiProviderOf("claude"), "claude");
    assert.equal(aiProviderOf("gemini"), undefined);
    assert.equal(aiChoiceOf("grok-4.7"), "grok-4.7");
    assert.equal(aiChoiceOf("Claude"), "claude");
    assert.equal(aiChoiceOf("nope"), undefined);
    assert.equal(aiProviderOf(undefined), undefined);
  });

  it("keeps a model the reader can run, and maps an old provider id to that provider's default", () => {
    const keys: AiKeyFlags = { meta: false, grok: true, openai: false, claude: false, gateway: true };
    assert.equal(modelReady({ id: "grok-4.7", label: "Grok 4.7", provider: "grok", direct: "grok-4.7" }, keys), true);
    const sonnet = { id: "claude-sonnet-5.5", label: "Claude", provider: "claude", direct: "claude-sonnet-5-5", gateway: "anthropic/claude-sonnet-5.5" } as const;
    // Through the gateway it can be picked until the gateway refuses it for the plan.
    assert.equal(modelReady(sonnet, keys), true);
    assert.equal(modelNote(sonnet, keys), undefined);
    assert.equal(modelReady(sonnet, keys, new Set(["claude-sonnet-5.5"])), false);
    assert.equal(modelNote(sonnet, keys, new Set(["claude-sonnet-5.5"])), "needs a paid plan");
    // With Anthropic's own key the plan does not matter.
    assert.equal(modelReady(sonnet, { ...keys, claude: true }, new Set(["claude-sonnet-5.5"])), true);
    assert.equal(modelNote(sonnet, { meta: false, grok: true, openai: false, claude: false, gateway: false }), "not set up");
    assert.equal(selectedAiModel("grok-4.7", ["grok-4.3", "grok-4.7", "gpt-4.1-mini"]), "grok-4.7");
    assert.equal(selectedAiModel("openai", ["grok-4.3", "gpt-4.1-mini", "gpt-4o-mini"]), "gpt-4.1-mini");
    assert.equal(selectedAiModel(undefined, ["gpt-4o-mini", "grok-4.3"]), "grok-4.3");
  });

  it("defaults to the first set-up provider in the order Grok, ChatGPT, Claude", () => {
    assert.equal(selectedAiProvider(undefined, ["claude", "openai"]), "openai");
    assert.equal(selectedAiProvider(undefined, ["claude"]), "claude");
    assert.equal(selectedAiProvider(undefined, []), undefined);
  });

  it("tries the reader's pick first, then falls back in order", () => {
    assert.deepEqual(aiProviderOrder("claude", ["grok", "openai", "claude"]), ["claude", "grok", "openai"]);
    assert.deepEqual(aiProviderOrder("openai", ["claude", "grok"]), ["grok", "claude"]);
  });
});

describe("cleanContextItem", () => {
  it("drops items without an http(s) address or a title", () => {
    assert.equal(cleanContextItem({ source: "web", title: "x", url: "javascript:alert(1)", snippet: "" }), null);
    assert.equal(cleanContextItem({ source: "web", title: "", url: "https://a.example", snippet: "" }), null);
    assert.equal(cleanContextItem({ source: "videos", title: "x", url: "https://a.example", snippet: "" }), null);
    assert.ok(cleanContextItem({ source: "images", title: "x", url: "https://a.example", snippet: "" }));
    assert.ok(cleanContextItem({ source: "wiki", title: "x", url: "https://a.example", snippet: "y".repeat(2000) })!.snippet.length <= 400);
  });
});

describe("buildAiPrompt", () => {
  it("numbers each result with its source and address", () => {
    const prompt = buildAiPrompt("folio", context);
    assert.match(prompt, /^Search: folio/);
    assert.match(prompt, /\[2\] Two \(Wikipedia, https:\/\/en\.wikipedia\.org\/wiki\/Two\)\nb/);
    assert.doesNotMatch(prompt, /Graph already shown/);
  });

  it("puts a plotted function in the same prompt without numbering it as a result", () => {
    const prompt = buildAiPrompt("y = sin(x)", [], undefined, "Folio plotted y = sin(x). x is from -5 to 5 and y is from -5 to 5.");
    assert.match(prompt, /Graph already shown with this answer:\nFolio plotted y = sin\(x\)/);
    assert.match(prompt, /Results:\n\(none\)/);
    assert.doesNotMatch(prompt, /\[1\]/);
  });
});

describe("parseAiAnswer", () => {
  it("renumbers citations in order of first use and drops unknown ones", () => {
    const parsed = parseAiAnswer("Grok is a model [3]. It is made by xAI [1][3][9]. Done.", context);
    assert.deepEqual(
      parsed.citations.map((cite) => [cite.n, cite.title]),
      [
        [1, "Three"],
        [2, "One"],
      ],
    );
    assert.equal(parsed.text, "Grok is a model.[1] It is made by xAI.[2][1] Done.");
  });

  it("handles comma lists and strips markdown", () => {
    const parsed = parseAiAnswer("**Bold** claim [1, 2].", context);
    assert.equal(parsed.text, "Bold claim.[1][2]");
    assert.equal(parsed.citations.length, 2);
  });

  it("keeps text with no citations", () => {
    const parsed = parseAiAnswer("The results don't say.", context);
    assert.deepEqual(parsed.citations, []);
    assert.deepEqual(parsed.parts, [{ text: "The results don't say." }]);
  });
});

describe("AI model menu", () => {
  it("lists GPT-6 Astra and the Claude models with AI Gateway ids", () => {
    const byId = new Map(AI_MODELS.map((model) => [model.id, model]));
    assert.deepEqual(
      { ...byId.get("gpt-6-astra") },
      { id: "gpt-6-astra", label: "GPT-6 Astra", provider: "openai", direct: "gpt-6-astra", gateway: "openai/gpt-6-astra", effort: "low", timeoutMs: 40_000 },
    );
    assert.equal(byId.get("claude-sonnet-5.5")?.gateway, "anthropic/claude-sonnet-5.5");
    assert.equal(byId.get("claude-haiku-4.5")?.gateway, "anthropic/claude-haiku-4.5");
    assert.equal(byId.get("claude-haiku-4.5")?.direct, "claude-haiku-4-5");
    assert.equal(aiChoiceOf("GPT-6-Astra"), "gpt-6-astra");
    // Order: each company's strongest model first.
    const ids = AI_MODELS.map((model) => model.id);
    assert.ok(ids.indexOf("gpt-6-astra") < ids.indexOf("gpt-4.1-mini"));
    assert.ok(ids.indexOf("claude-sonnet-5.5") < ids.indexOf("claude-haiku-4.5"));
    assert.equal(new Set(ids).size, ids.length);
  });
});


describe("fallback note", () => {
  const ok = (extra: Partial<Extract<AiAnswer, { status: "ok" }>>): Extract<AiAnswer, { status: "ok" }> => ({
    status: "ok",
    text: "x",
    parts: [],
    citations: [],
    model: "openai/gpt-4.1-mini",
    provider: "openai",
    failed: [],
    ...extra,
  });

  it("names the pick when another model of the same provider answered", () => {
    assert.deepEqual(fallbackFailures(ok({ picked: "gpt-6-astra", failed: ["openai"], attempts: [{ provider: "openai", model: "openai/gpt-6-astra", kind: "timeout" }] })), ["GPT-6 Astra"]);
    // Even with no attempt recorded (an older server), a different model means the pick didn't answer.
    assert.deepEqual(fallbackFailures(ok({ picked: "gpt-6-astra" })), ["GPT-6 Astra"]);
  });

  it("says nothing when the pick answered", () => {
    assert.deepEqual(fallbackFailures(ok({ picked: "gpt-4.1-mini", attempts: [] })), []);
    assert.deepEqual(fallbackFailures(ok({ picked: "claude-haiku-4.5", model: "claude-haiku-4-5-20251001", provider: "claude", attempts: [] })), []);
  });

  it("lists every model tried before the one that answered", () => {
    const answer = ok({
      model: "grok-4.3",
      provider: "grok",
      picked: "claude-sonnet-5.5",
      failed: ["claude"],
      attempts: [
        { provider: "claude", model: "anthropic/claude-sonnet-5.5", kind: "plan", status: 402 },
        { provider: "claude", model: "anthropic/claude-3-haiku", kind: "bad-request", status: 400 },
      ],
    });
    assert.deepEqual(fallbackFailures(answer), ["Claude Sonnet 5.5", "anthropic/claude-3-haiku"]);
    assert.equal(aiModelLabelFor("openai/gpt-6-astra"), "GPT-6 Astra");
  });
});

 describe("Muse Spark default", () => {
  it("defaults to Muse Spark while preserving an explicit choice", () => {
    assert.equal(selectedAiModel(undefined, ["grok-4.3", "muse-spark-1.3"]), "muse-spark-1.3");
    assert.equal(selectedAiModel("grok-4.3", ["grok-4.3", "muse-spark-1.3"]), "grok-4.3");
    assert.equal(selectedAiProvider(undefined, ["grok", "meta"]), "meta");
    const muse = AI_MODELS.find(model => model.id === "muse-spark-1.3")!;
    const keys = { meta: false, grok: true, openai: false, claude: false, gateway: true };
    assert.equal(modelReady(muse, keys), false);
    assert.equal(modelReady(muse, { ...keys, meta: true }), true);
  });
});
