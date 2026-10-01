import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { UI, fill, sourceLabel, type UiCopy, type UiLang } from "./ui-copy.ts";
import { LANGS as LANG_LIST } from "./i18n.ts";

const LANGS: UiLang[] = LANG_LIST.map((item) => item.code);
/** Brand names that stay in Latin script in every language. */
const SAME_AS_ENGLISH = new Set<keyof UiCopy>(["grok"]);
/** Words that are spelled the same as in English in that language. */
const SAME_IN: Partial<Record<UiLang, (keyof UiCopy)[]>> = {
  "es-ES": ["web", "wiki"],
  "fr-FR": ["web", "images", "image"],
  "de-DE": ["web", "wiki", "optional"],
  "pt-BR": ["web"],
};

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? "").sort();
}

describe("search page copy", () => {
  it("gives every language the same fields", () => {
    const keys = Object.keys(UI["en-US"]).sort();
    assert.ok(keys.length > 40);
    for (const lang of LANGS) {
      assert.deepEqual(Object.keys(UI[lang]).sort(), keys);
    }
  });

  it("has no empty strings", () => {
    for (const lang of LANGS) {
      for (const [key, value] of Object.entries(UI[lang])) {
        assert.equal(value.trim().length > 0, true, `${lang} ${key} is empty`);
      }
    }
  });

  it("keeps the same placeholders in every language", () => {
    for (const key of Object.keys(UI["en-US"]) as (keyof UiCopy)[]) {
      const expected = placeholders(UI["en-US"][key]);
      for (const lang of LANGS) {
        assert.deepEqual(placeholders(UI[lang][key]), expected, `${lang} ${key}`);
      }
    }
  });

  it("translates the visible sentences", () => {
    for (const lang of LANGS.filter((item) => item !== "en-US")) {
      for (const key of Object.keys(UI["en-US"]) as (keyof UiCopy)[]) {
        if (SAME_AS_ENGLISH.has(key) || SAME_IN[lang]?.includes(key)) continue;
        assert.notEqual(UI[lang][key], UI["en-US"][key], `${lang} left ${key} in English`);
      }
    }
  });

  it("fills a template without leaving a blank", () => {
    assert.equal(fill(UI["zh-CN"].noMatches, { source: "维基百科" }), "维基百科 中没有匹配。");
    assert.equal(fill(UI["hi-IN"].asking, { model: "Grok" }).includes("Grok"), true);
    assert.equal(fill(UI["bn-BD"].writtenBy, { provider: "Grok", model: "grok" }).includes("{"), false);
    assert.equal(fill(UI["en-US"].aboutResults, { n: "1,200" }), "About 1,200 results");
  });

  it("covers all ten languages", () => {
    assert.equal(LANGS.length, 10);
    for (const lang of LANGS) assert.ok(UI[lang], `${lang} has no copy`);
  });

  it("names each source in the page language", () => {
    assert.equal(sourceLabel(UI["en-US"], "web"), "Web");
    assert.equal(sourceLabel(UI["zh-CN"], "wiki"), "维基百科");
    assert.equal(sourceLabel(UI["hi-IN"], "images"), "चित्र");
    assert.equal(sourceLabel(UI["bn-BD"], "web"), "ওয়েব");
    assert.equal(sourceLabel(UI["zh-CN"], "grok"), "Grokipedia");
    assert.equal(sourceLabel(UI["ar-SA"], "wiki"), "ويكيبيديا");
    assert.equal(sourceLabel(UI["ja-JP"], "images"), "画像");
    assert.equal(sourceLabel(UI["de-DE"], "images"), "Bilder");
  });
});
