import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { IMAGES_PAGE, isLatinQuery, readBotSearch, relevantCount } from "./search.shared.ts";

function read(query: string) {
  return readBotSearch(new URLSearchParams(query));
}

describe("readBotSearch", () => {
  it("keeps Images off unless it is asked for", () => {
    const parsed = read("q=golden+retriever");
    assert.ok(!("error" in parsed));
    assert.equal(parsed.images, false);
    assert.equal(parsed.web && parsed.wiki && parsed.grok, true);
  });

  it("turns Images on and pages it by its own page size", () => {
    const parsed = read("q=golden+retriever&images=1&imagesPage=3");
    assert.ok(!("error" in parsed));
    assert.equal(parsed.images, true);
    assert.equal(parsed.imagesOffset, 2 * IMAGES_PAGE);
  });

  it("runs an Images-only search", () => {
    const parsed = read("q=golden+retriever&web=0&wiki=0&grok=0&images=1");
    assert.ok(!("error" in parsed));
    assert.equal(parsed.images, true);
  });

  it("does not search when every source is off", () => {
    assert.deepEqual(read("q=golden+retriever&web=0&wiki=0&grok=0"), {
      error: "Turn on Web, Wikipedia, Grokipedia, or Images",
    });
    assert.ok("error" in read("q=golden+retriever&web=0&wiki=0&grok=0&images=0"));
  });
});

describe("readBotSearch ai", () => {
  it("keeps AI off unless it is asked for", () => {
    const parsed = read("q=golden+retriever");
    assert.ok(!("error" in parsed));
    assert.equal(parsed.ai, false);
  });

  it("turns AI on with ai=1", () => {
    const parsed = read("q=golden+retriever&ai=1");
    assert.ok(!("error" in parsed));
    assert.equal(parsed.ai, true);
  });

  it("does not count AI as a source on its own", () => {
    assert.ok("error" in read("q=golden+retriever&web=0&wiki=0&grok=0&ai=1"));
  });
});

describe("readBotSearch ai_model", () => {
  it("reads the provider pick and ignores unknown values", () => {
    const picked = read("q=dogs&ai=1&ai_model=claude");
    assert.ok(!("error" in picked));
    assert.equal(picked.aiModel, "claude");
    const model = read("q=dogs&ai=1&ai_model=grok-4.7");
    assert.ok(!("error" in model));
    assert.equal(model.aiModel, "grok-4.7");
    const unknown = read("q=dogs&ai=1&ai_model=nope");
    assert.ok(!("error" in unknown));
    assert.equal(unknown.aiModel, undefined);
  });
});

describe("web query relevance", () => {
  it("tells Latin-script queries from others", () => {
    assert.equal(isLatinQuery("Berlin"), true);
    assert.equal(isLatinQuery("Berlín café — Ürün"), true);
    assert.equal(isLatinQuery("বার্লিন"), false);
    assert.equal(isLatinQuery("बर्लिन"), false);
    assert.equal(isLatinQuery("برلين"), false);
    assert.equal(isLatinQuery("ベルリン"), false);
    assert.equal(isLatinQuery("柏林"), false);
  });

  it("counts results that mention the query, ignoring accents and case", () => {
    const hits = [
      { title: "Berlin - Wikipedia", snippet: "Capital of Germany", url: "https://en.wikipedia.org/wiki/Berlin" },
      { title: "YouTube TV Help", snippet: "Manage your home area", url: "https://support.google.com/youtubetv" },
      { title: "Visit", snippet: "Things to do", url: "https://www.visitberlin.de/en" },
    ];
    assert.equal(relevantCount(hits, "Berlín"), 2);
    assert.equal(relevantCount(hits, "বার্লিন"), 0);
    assert.equal(relevantCount([{ title: "বার্লিন - উইকিপিডিয়া", snippet: "", url: "https://bn.wikipedia.org" }], "বার্লিন"), 1);
  });
});
