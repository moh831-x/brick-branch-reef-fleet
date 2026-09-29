import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AI_MAX_CONTEXT, buildAiPrompt, cleanContextItem, parseAiAnswer, pickAiContext, type AiContextItem } from "./ai.shared.ts";

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

describe("cleanContextItem", () => {
  it("drops items without an http(s) address or a title", () => {
    assert.equal(cleanContextItem({ source: "web", title: "x", url: "javascript:alert(1)", snippet: "" }), null);
    assert.equal(cleanContextItem({ source: "web", title: "", url: "https://a.example", snippet: "" }), null);
    assert.equal(cleanContextItem({ source: "images", title: "x", url: "https://a.example", snippet: "" }), null);
    assert.ok(cleanContextItem({ source: "wiki", title: "x", url: "https://a.example", snippet: "y".repeat(2000) })!.snippet.length <= 400);
  });
});

describe("buildAiPrompt", () => {
  it("numbers each result with its source and address", () => {
    const prompt = buildAiPrompt("folio", context);
    assert.match(prompt, /^Search: folio/);
    assert.match(prompt, /\[2\] Two \(Wikipedia, https:\/\/en\.wikipedia\.org\/wiki\/Two\)\nb/);
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
