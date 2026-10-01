import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { UI } from "./ui-copy.ts";

const ENTITY = /&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/i;
const root = join(import.meta.dirname, "..");

/**
 * Head text is written as plain text and escaped exactly once when the HTML is rendered.
 * A literal "&amp;" in the source would reach Google as "&amp;amp;" and show as "&amp;" in results.
 */
describe("head metadata", () => {
  it("titles and descriptions in every language are plain text, not HTML", () => {
    for (const [lang, copy] of Object.entries(UI)) {
      for (const key of ["homeTitle", "blurb"] as const) {
        assert.ok(copy[key].trim(), `${lang} ${key} is empty`);
        assert.doesNotMatch(copy[key], ENTITY, `${lang} ${key} holds an HTML entity`);
      }
    }
  });

  it("route head strings and the share-card config are plain text", () => {
    const site = JSON.parse(readFileSync(join(root, "lib/og/site.json"), "utf8")) as Record<string, unknown>;
    for (const value of Object.values(site)) if (typeof value === "string") assert.doesNotMatch(value, ENTITY);
    for (const file of ["routes/index.tsx", "routes/about.tsx", "routes/how-to-search.tsx", "routes/privacy.tsx"]) {
      assert.doesNotMatch(readFileSync(join(root, file), "utf8"), ENTITY, `${file} holds an HTML entity`);
    }
    assert.equal(UI["en-US"].homeTitle, site.title, "the English title and the share-card title match");
  });
});
