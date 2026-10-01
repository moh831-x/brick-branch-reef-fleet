import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LANGS, langDir, matchLang, parseAcceptLanguage, pickLang, wikiOrigin } from "./i18n.ts";

describe("interface languages", () => {
  it("offers the ten languages in menu order", () => {
    assert.deepEqual(
      LANGS.map((item) => item.code),
      ["en-US", "bn-BD", "hi-IN", "ar-SA", "es-ES", "fr-FR", "zh-CN", "ja-JP", "pt-BR", "de-DE"],
    );
  });

  it("matches browser and address tags by their primary language", () => {
    assert.equal(matchLang("ar"), "ar-SA");
    assert.equal(matchLang("ar-EG"), "ar-SA");
    assert.equal(matchLang("zh-Hans-CN"), "zh-CN");
    assert.equal(matchLang("pt_PT"), "pt-BR");
    assert.equal(matchLang("BN-in"), "bn-BD");
    assert.equal(matchLang("en-GB"), "en-US");
    assert.equal(matchLang("de-DE"), "de-DE");
    assert.equal(matchLang("ko-KR"), null);
    assert.equal(matchLang(""), null);
    assert.equal(matchLang(undefined), null);
  });

  it("picks the first supported language and falls back to null", () => {
    assert.equal(pickLang(["ko-KR", "ja-JP", "en-US"]), "ja-JP");
    assert.equal(pickLang(["ko", "it"]), null);
  });

  it("orders Accept-Language by weight", () => {
    assert.deepEqual(parseAcceptLanguage("fr-CH, fr;q=0.9, en;q=0.8, de;q=0.7, *;q=0.5"), ["fr-CH", "fr", "en", "de"]);
    assert.deepEqual(parseAcceptLanguage("en;q=0.2, es"), ["es", "en"]);
    assert.deepEqual(parseAcceptLanguage(""), []);
    assert.equal(pickLang(parseAcceptLanguage("ko;q=1, ar;q=0.8")), "ar-SA");
  });

  it("uses right-to-left only for Arabic", () => {
    for (const item of LANGS) assert.equal(langDir(item.code), item.code === "ar-SA" ? "rtl" : "ltr");
  });

  it("points each language at its own Wikipedia", () => {
    assert.equal(wikiOrigin("ar-SA"), "https://ar.wikipedia.org");
    assert.equal(wikiOrigin("zh-CN"), "https://zh.wikipedia.org");
    assert.equal(wikiOrigin("en-US"), "https://en.wikipedia.org");
  });
});
