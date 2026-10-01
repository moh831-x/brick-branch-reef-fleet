import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decodeHtml, extractReadable, isPrivateHost, MIN_CONTENTS, pageCharset, stripFootnotes } from "./reader.ts";

const PAGE = `<!doctype html>
<html lang="en-GB"><head>
<meta charset="utf-8"><title>Dubai travel guide | Example Travel</title>
<meta property="og:title" content="Dubai: a travel guide">
<meta property="og:image" content="/img/dubai.jpg">
<meta property="og:site_name" content="Example Travel">
<script>var nav = "<h2>Not a heading</h2>";</script>
<style>h2 { color: red }</style>
</head><body>
<header class="site-header"><nav><a href="/">Home</a><h2>Menu heading</h2></nav></header>
<div class="cookie-banner">We use cookies to improve your experience on this website, please accept.</div>
<main>
  <article>
    <h1>Dubai: a travel guide</h1>
    <p>Dubai is the most populous city in the United Arab Emirates &amp; a global hub for business, tourism and trade.</p>
    <p>It sits on the southeast coast of the Persian Gulf and is known for its skyline.</p>
    <h2 id="etymology">Etymology <a class="anchor" href="#etymology">¶</a></h2>
    <p>The name&nbsp;Dubai has several suggested origins, debated by historians for a long time.</p>
    <h3>Early records</h3>
    <p>Early Arab geographers mention a settlement near the creek in the eleventh century.</p>
    <h2>History</h2>
    <p>The area has been settled for thousands of years, with traces of Bronze Age trade routes.</p>
    <figure><img src="x.jpg"><figcaption>A caption that is not article text.</figcaption></figure>
    <h2>Geography</h2>
    <p>Dubai lies in the Arabian Desert, with a hot desert climate and very little rain all year.</p>
    <aside class="related"><h2>Related articles</h2><p>Abu Dhabi guide, a related story that should not appear.</p></aside>
    <h2>Related articles</h2>
    <p>More links that are not part of the article body at all, just a list of stories.</p>
  </article>
</main>
<footer><h2>Footer heading</h2><p>Copyright 2026 Example Travel, all rights reserved here.</p></footer>
</body></html>`;

describe("extractReadable", () => {
  const page = extractReadable(PAGE, "https://travel.example.com/guides/dubai");

  it("reads the title, image, site name, and language", () => {
    assert.equal(page.title, "Dubai: a travel guide");
    assert.equal(page.image, "https://travel.example.com/img/dubai.jpg");
    assert.equal(page.siteName, "Example Travel");
    assert.equal(page.lang, "en-GB");
  });

  it("lists h2 and nested h3 headings from the article only", () => {
    assert.deepEqual(
      page.sections.map((section) => [section.level, section.title]),
      [
        [1, "Etymology"],
        [2, "Early records"],
        [1, "History"],
        [1, "Geography"],
      ],
    );
    assert.deepEqual(page.sections.map((section) => section.id), ["s-0", "s-1", "s-2", "s-3"]);
  });

  it("keeps the lead and section text, without navigation, scripts, captions, or boilerplate", () => {
    assert.match(page.lead, /^Dubai is the most populous city in the United Arab Emirates & a global hub/);
    assert.equal(page.sections[0]?.text, "The name Dubai has several suggested origins, debated by historians for a long time.");
    const all = [page.lead, ...page.sections.map((section) => `${section.title} ${section.text}`)].join(" ");
    for (const unwanted of ["Not a heading", "Menu heading", "cookies", "caption", "Abu Dhabi", "Footer", "Copyright", "More links"]) {
      assert.ok(!all.includes(unwanted), `should not include "${unwanted}"`);
    }
  });

  it("uses h3/h4 when a page has no h2", () => {
    const html = `<body><article><h1>T</h1><p>${"Lead text here. ".repeat(30)}</p>
      <h3>One</h3><p>${"First. ".repeat(40)}</p><h4>One A</h4><p>Sub.</p><h3>Two</h3><p>${"Second. ".repeat(40)}</p></article></body>`;
    const out = extractReadable(html);
    assert.deepEqual(out.sections.map((section) => [section.level, section.title]), [
      [1, "One"],
      [2, "One A"],
      [1, "Two"],
    ]);
  });

  it("returns fewer than the Contents minimum for a page without headings", () => {
    const out = extractReadable(`<body><p>${"Just one long paragraph of text. ".repeat(20)}</p><h2>Only</h2><p>One heading.</p></body>`);
    assert.ok(out.sections.length < MIN_CONTENTS);
    assert.match(out.lead, /^Just one long paragraph/);
  });

  it("falls back to the description when the body has no text", () => {
    const out = extractReadable(`<head><meta name="description" content="A short description."></head><body><div id="root"></div></body>`);
    assert.equal(out.lead, "A short description.");
    assert.deepEqual(out.sections, []);
  });

  it("reads non-Latin headings and right-to-left pages", () => {
    const html = `<html lang="ar" dir="rtl"><body><article><p>${"دبي مدينة في الإمارات العربية المتحدة. ".repeat(15)}</p>
      <h2>أصل التسمية</h2><p>نص القسم الأول.</p><h2>التاريخ</h2><p>نص القسم الثاني.</p></article></body></html>`;
    const out = extractReadable(html);
    assert.equal(out.lang, "ar");
    assert.deepEqual(out.sections.map((section) => section.title), ["أصل التسمية", "التاريخ"]);
  });
});

describe("helpers", () => {
  it("decodes entities", () => {
    assert.equal(decodeHtml("Fish &amp; chips &#8212; &#x263A; &eacute; &unknown;"), "Fish & chips — ☺ é &unknown;");
  });

  it("finds the declared charset", () => {
    assert.equal(pageCharset("text/html; charset=Shift_JIS", ""), "shift_jis");
    assert.equal(pageCharset("text/html", '<meta charset="windows-1256">'), "windows-1256");
    assert.equal(pageCharset(null, ""), "utf-8");
  });

  it("refuses private and local hosts", () => {
    for (const host of ["localhost", "127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "0.0.0.0", "[::1]", "fd00::1", "::ffff:127.0.0.1", "intranet", "printer.local", "metadata.google.internal"]) {
      assert.equal(isPrivateHost(host), true, host);
    }
    for (const host of ["example.com", "8.8.8.8", "www.presidentscup.com", "2606:4700::1111"]) {
      assert.equal(isPrivateHost(host), false, host);
    }
  });
});

describe("stripFootnotes", () => {
  it("removes wiki-style reference and maintenance markers but keeps other brackets", () => {
    assert.equal(stripFootnotes("The industry[when?] plunged.[26] In 1937[32]: 36–37 oil[a] was found."), "The industry plunged. In 1937 oil was found.");
    assert.equal(stripFootnotes("Use arr[index] and [see below]."), "Use arr[index] and [see below].");
  });

  it("is applied to extracted section text", () => {
    const page = extractReadable(
      `<html><body><article><h2>One</h2><p>${"Alpha text sentence. ".repeat(30)}Pearls<sup class="reference"><a href="#c">[12]</a></sup> mattered.</p><h2>Two</h2><p>Beta text.</p></article></body></html>`,
    );
    assert.ok(page.sections[0].text.endsWith("Pearls mattered."));
  });
});

describe("wiki page clutter", () => {
  it("drops infoboxes, hatnotes, coordinates and hidden blocks from the lead", () => {
    const body = "Dubai is the most populous city in the United Arab Emirates. ".repeat(10);
    const page = extractReadable(
      `<html><body><main><div class="hatnote navigation-not-searchable">Not to be confused with Duba.</div>` +
        `<span id="coordinates"><span class="geo-dms">25°N 55°E</span></span>` +
        `<table class="infobox ib-settlement vcard"><tr><td>Nicknames: The Pearl of the Gulf</td></tr></table>` +
        `<div style="display: none">Hidden text</div><p>${body}</p>` +
        `<h2>History<span class="mw-editsection">[edit]</span></h2><p>Old.</p><h2>Geography</h2><p>Hot.</p><h2>News •</h2><p>Latest.</p></main></body></html>`,
    );
    assert.equal(page.lead, body.trim());
    assert.deepEqual(page.sections.map((section) => section.title), ["History", "Geography", "News"]);
  });
});

