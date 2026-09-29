import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { IMAGES_PAGE, readBotSearch } from "./search.shared.ts";

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
