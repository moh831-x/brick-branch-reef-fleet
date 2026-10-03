import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cleanTimeZone, isNewsQuery, newsPrompt, parseBingNews, pickNewsCards, publisherName, relativeDay, todayLabel } from "./news.shared.ts";

const feed = `<?xml version="1.0" encoding="utf-8" ?><rss version="2.0" xmlns:News="https://www.bing.com/news/search?q=iran%20news&amp;format=rss"><channel><title>iran news - BingNews</title>
<item><title>Iran readies harder retaliation if attacked</title><link>http://www.bing.com/news/apiclick.aspx?ref=FexRss&amp;aid=&amp;tid=1&amp;url=https%3a%2f%2fwww.reuters.com%2fworld%2fmiddle-east%2firan-retaliation-2026-10-02%2f&amp;c=1&amp;mkt=en-us</link><description>Iran is preparing &quot;broader&quot; plans.</description><pubDate>Fri, 02 Oct 2026 03:00:09 GMT</pubDate><News:Source>Reuters</News:Source><News:Image>http://www.bing.com/th?id=ONUT.abc&amp;pid=News</News:Image></item>
<item><title>No picture here</title><link>http://www.bing.com/news/apiclick.aspx?url=https%3a%2f%2fapnews.com%2farticle%2fx</link><description>d</description><pubDate>not a date</pubDate><News:Source>AP News</News:Source></item>
<item><title>Tracking link without a real address</title><link>http://www.bing.com/news/apiclick.aspx?ref=FexRss</link></item>
<item><title>Bad image host</title><link>https://example.com/a</link><News:Image>https://evil.example/x.jpg</News:Image></item>
<item><title>Iran readies harder retaliation if attacked</title><link>http://www.bing.com/news/apiclick.aspx?url=https%3a%2f%2fwww.reuters.com%2fworld%2fmiddle-east%2firan-retaliation-2026-10-02%2f</link></item>
</channel></rss>`;

describe("isNewsQuery", () => {
  it("spots news searches in English and the page languages", () => {
    for (const q of ["iran news", "News about SpaceX", "breaking: earthquake", "latest on the strike", "noticias de hoy", "Nachrichten Berlin", "伊朗新闻", "イランのニュース", "ইরানের খবর", "أخبار إيران"]) {
      assert.equal(isNewsQuery(q), true, q);
    }
  });

  it("leaves ordinary searches alone", () => {
    for (const q of ["python", "latest node version", "how to update windows", "newsletter templates", "where do penguins live", ""]) {
      assert.equal(isNewsQuery(q), false, q);
    }
  });
});

describe("parseBingNews", () => {
  it("keeps the real article address, publisher, date, and an https Bing thumbnail", () => {
    const hits = parseBingNews(feed);
    assert.equal(hits.length, 3);
    const [first, second, third] = hits;
    assert.equal(first?.url, "https://www.reuters.com/world/middle-east/iran-retaliation-2026-10-02/");
    assert.equal(first?.site, "Reuters");
    assert.equal(first?.published, "2026-10-02T03:00:09.000Z");
    assert.equal(first?.snippet, 'Iran is preparing "broader" plans.');
    assert.match(first?.image?.thumb ?? "", /^https:\/\/www\.bing\.com\/th\?id=ONUT\.abc&pid=News&w=640&h=360&c=14$/);
    assert.equal(first?.meta, "Reuters · Oct 2, 2026");
    assert.equal(second?.url, "https://apnews.com/article/x");
    assert.equal(second?.published, undefined);
    assert.equal(second?.image, undefined, "no picture: the card shows without one");
    assert.equal(third?.url, "https://example.com/a");
    assert.equal(third?.image, undefined, "only Bing-hosted thumbnails are used");
  });
});

describe("source names and dates", () => {
  it("names the publisher on a chip", () => {
    assert.equal(publisherName("https://www.reuters.com/x", "Reuters"), "Reuters");
    assert.equal(publisherName("https://apnews.com/article/x"), "AP News");
    assert.equal(publisherName("https://en.wikipedia.org/wiki/Iran"), "Wikipedia");
    assert.equal(publisherName("https://home.treasury.gov/news"), "U.S. Department of the Treasury");
    assert.equal(publisherName("https://www.example.org/a"), "example.org");
    assert.equal(publisherName("not a url"), "");
  });

  it("says Today, Yesterday, N days ago, then a short date", () => {
    const now = new Date(2026, 9, 2, 21, 0);
    assert.equal(relativeDay(new Date(2026, 9, 2, 1, 0).toISOString(), "en-US", now), "Today");
    assert.equal(relativeDay(new Date(2026, 9, 1, 23, 0).toISOString(), "en-US", now), "Yesterday");
    assert.equal(relativeDay(new Date(2026, 8, 29, 12, 0).toISOString(), "en-US", now), "3 days ago");
    assert.equal(relativeDay(new Date(2026, 8, 1, 12, 0).toISOString(), "en-US", now), "Sep 1");
    assert.equal(relativeDay(new Date(2026, 9, 1, 12, 0).toISOString(), "de-DE", now), "Gestern");
    assert.equal(relativeDay(undefined, "en-US", now), "");
    assert.equal(relativeDay("nope", "en-US", now), "");
  });

  it("dates the answer on the reader's calendar", () => {
    const late = new Date("2026-10-03T01:40:00Z");
    assert.equal(todayLabel(late, "America/New_York"), "October 2, 2026");
    assert.equal(todayLabel(late), "October 3, 2026");
    assert.equal(cleanTimeZone("America/New_York"), "America/New_York");
    assert.equal(cleanTimeZone("Mars/Base"), undefined);
    assert.equal(cleanTimeZone("x; drop"), undefined);
    assert.match(newsPrompt("October 2, 2026"), /\*\*October 2, 2026\*\*/);
  });
});

describe("pickNewsCards", () => {
  it("puts the articles the answer cited first, then the rest, up to three", () => {
    const news = ["a", "b", "c", "d"].map((id) => ({ id, url: `https://n.example/${id}` }));
    assert.deepEqual(pickNewsCards(news, [{ url: "https://n.example/c" }, { url: "https://web.example/x" }]).map((hit) => hit.id), ["c", "a", "b"]);
    assert.deepEqual(pickNewsCards([], [{ url: "https://n.example/c" }]), []);
  });
});
