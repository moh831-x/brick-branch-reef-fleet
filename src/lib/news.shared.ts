/**
 * News-style AI answers: spotting a news search, the answer format the model is asked for, Bing's
 * news feed, publisher names for the source chips, and the dates on the news cards. Pure data and
 * helpers (no network, no secrets), safe on the server and in the browser.
 */

/** What a news card shows. */
export type NewsCardItem = { id: string; title: string; url: string; site?: string; published?: string; image?: { thumb: string } };

/** A news article from Bing's news feed: the real article address, the publisher, and when. */
export type NewsHit = {
  id: string;
  source: "web";
  title: string;
  url: string;
  snippet: string;
  meta: string;
  /** The publisher as Bing names it ("Reuters", "CBS News"). */
  site?: string;
  /** ISO time the article was published. */
  published?: string;
  image?: { thumb: string; full: string };
};

// Words that clearly ask for news. "latest" or "update" alone are left out: "latest node version" and
// "how to update windows" are not news searches.
const NEWS_WORDS = [
  "news", "headline", "headlines", "breaking", "current events", "what happened", "latest on",
  // Page languages: news.
  "noticias", "actualités", "nouvelles", "nachrichten", "neuigkeiten", "notícias",
  "খবর", "সংবাদ", "समाचार", "ख़बर", "खबर", "أخبار", "新闻", "新聞", "ニュース", "速報",
];
const NEWS_PATTERN = new RegExp(
  `(?:^|[\\s\\p{P}])(?:${NEWS_WORDS.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?=$|[\\s\\p{P}])`,
  "iu",
);
const CJK_NEWS = /新闻|新聞|ニュース|速報/;

/** True for searches that ask for news ("iran news", "latest on the strike", "noticias de hoy"). */
export function isNewsQuery(query: string): boolean {
  const q = query.normalize("NFC").trim();
  if (!q) return false;
  return NEWS_PATTERN.test(q) || CJK_NEWS.test(q);
}

/** Today's date in words for the model ("October 2, 2026"), in the reader's time zone when it is known. */
export function todayLabel(now: Date = new Date(), timeZone?: string): string {
  const options: Intl.DateTimeFormatOptions = { month: "long", day: "numeric", year: "numeric" };
  try {
    return now.toLocaleDateString("en-US", timeZone ? { ...options, timeZone } : { ...options, timeZone: "UTC" });
  } catch {
    return now.toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
  }
}

/** A time zone name the browser sent, kept only when this runtime knows it. */
export function cleanTimeZone(value: unknown): string | undefined {
  if (typeof value !== "string" || !value || value.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(value)) return undefined;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    return undefined;
  }
}

/**
 * Added to the system prompt for a news search that has sources. The bullets and bold headlines are
 * rendered as a list; each bullet's [n] markers become a source chip at its end.
 */
export function newsPrompt(today: string): string {
  return [
    `This is a news search. Today is ${today}. Answer in this format, which replaces the plain-text and length rules above:`,
    `First line: a short intro naming the topic and today's date in bold, like "Here are the main developments as of **${today}**:".`,
    "Then 3 to 6 lines, each starting with \"- \". Each opens with a bold one-sentence headline in **double asterisks**, then one or two sentences of detail, and ends with the numbers of the results that support it, like [1] or [2][3]. Every bullet needs at least one number.",
    "Prefer the newest results and say when something is reported rather than confirmed. Use only the numbered results; never add sources, links, or facts that are not in them.",
    "Last line: one short sentence offering a specific follow-up the user may want. Keep the whole answer under 260 words.",
  ].join(" ");
}

/** Well-known publishers by site, for chips on web results that don't carry a name. */
const PUBLISHERS: Record<string, string> = {
  "reuters.com": "Reuters",
  "apnews.com": "AP News",
  "bbc.com": "BBC",
  "bbc.co.uk": "BBC",
  "cnn.com": "CNN",
  "nytimes.com": "The New York Times",
  "washingtonpost.com": "The Washington Post",
  "wsj.com": "The Wall Street Journal",
  "theguardian.com": "The Guardian",
  "aljazeera.com": "Al Jazeera",
  "npr.org": "NPR",
  "cbsnews.com": "CBS News",
  "nbcnews.com": "NBC News",
  "abcnews.go.com": "ABC News",
  "foxnews.com": "Fox News",
  "bloomberg.com": "Bloomberg",
  "ft.com": "Financial Times",
  "politico.com": "Politico",
  "axios.com": "Axios",
  "cnbc.com": "CNBC",
  "msn.com": "MSN",
  "usatoday.com": "USA Today",
  "time.com": "TIME",
  "economist.com": "The Economist",
  "france24.com": "France 24",
  "dw.com": "DW",
  "timesofisrael.com": "The Times of Israel",
  "iranintl.com": "Iran International",
  "state.gov": "U.S. Department of State",
  "treasury.gov": "U.S. Department of the Treasury",
  "whitehouse.gov": "The White House",
  "wikipedia.org": "Wikipedia",
  "grokipedia.com": "Grokipedia",
  "youtube.com": "YouTube",
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/** The name on a source chip: the publisher Bing gave, a well-known name for the site, or the site itself. */
export function publisherName(url: string, site?: string): string {
  const named = site?.replace(/\s+/g, " ").trim();
  if (named) return named;
  const host = hostOf(url);
  if (!host) return "";
  const parts = host.split(".");
  for (let index = 0; index < parts.length - 1; index += 1) {
    const known = PUBLISHERS[parts.slice(index).join(".")];
    if (known) return known;
  }
  return host;
}

/** "Today", "Yesterday", "3 days ago", or a short date for older articles, in the page language. */
export function relativeDay(iso: string | undefined, lang: string, now: Date = new Date()): string {
  if (!iso) return "";
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "";
  const startOf = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(when)) / 86_400_000);
  if (days >= 0 && days < 7) {
    try {
      const text = new Intl.RelativeTimeFormat(lang, { numeric: "auto" }).format(-days, "day");
      return text.charAt(0).toLocaleUpperCase(lang) + text.slice(1);
    } catch {
      // Fall through to a plain date.
    }
  }
  try {
    return when.toLocaleDateString(lang, { month: "short", day: "numeric", ...(when.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
  } catch {
    return when.toISOString().slice(0, 10);
  }
}

/** A short publication date for the model ("Oct 2, 2026"). */
export function shortDate(iso: string | undefined): string {
  if (!iso) return "";
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "";
  return when.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/**
 * The news cards under an answer: the articles the answer cited first (in the order it cited them),
 * then the newest of the rest. Only real feed results, never anything the model wrote.
 */
export function pickNewsCards<T extends { url: string }>(news: readonly T[], cited: readonly { url: string }[], max = 3): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  const add = (hit: T | undefined) => {
    if (!hit || seen.has(hit.url) || out.length >= max) return;
    seen.add(hit.url);
    out.push(hit);
  };
  for (const cite of cited) add(news.find((hit) => hit.url === cite.url));
  for (const hit of news) add(hit);
  return out;
}

function decode(value: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (all, entity: string) => {
      if (/^#x/i.test(entity)) {
        const code = Number.parseInt(entity.slice(2), 16);
        return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : all;
      }
      if (entity.startsWith("#")) {
        const code = Number.parseInt(entity.slice(1), 10);
        return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : all;
      }
      return named[entity] ?? all;
    })
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block: string, name: string): string {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return match?.[1]?.trim() ?? "";
}

function httpUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** The article itself: Bing wraps each link in a click-tracking address with the real one in `url=`. */
function articleUrl(link: string): string | null {
  const url = httpUrl(link);
  if (!url) return null;
  const parsed = new URL(url);
  if (parsed.hostname.endsWith("bing.com")) {
    const real = parsed.searchParams.get("url");
    const inner = real ? httpUrl(real) : null;
    return inner && !new URL(inner).hostname.endsWith("bing.com") ? inner : null;
  }
  return url;
}

/** Bing's thumbnail for the article, over https and sized for a card; anything else is dropped. */
function newsThumb(value: string): string | null {
  const url = httpUrl(value.replace(/^http:\/\//i, "https://"));
  if (!url) return null;
  const parsed = new URL(url);
  if (!parsed.hostname.endsWith(".bing.com") && !parsed.hostname.endsWith(".bing.net")) return null;
  parsed.searchParams.set("w", "640");
  parsed.searchParams.set("h", "360");
  parsed.searchParams.set("c", "14");
  return parsed.toString();
}

/** Parse Bing's news RSS (https://www.bing.com/news/search?format=rss). Exported for tests. */
export function parseBingNews(xml: string, max = 8): NewsHit[] {
  const hits: NewsHit[] = [];
  const seen = new Set<string>();
  for (const item of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const block = item[1] ?? "";
    const title = decode(tag(block, "title")).slice(0, 240);
    const url = articleUrl(decode(tag(block, "link")));
    if (!title || !url || seen.has(url)) continue;
    seen.add(url);
    const site = decode(tag(block, "News:Source")).slice(0, 80);
    const date = new Date(decode(tag(block, "pubDate")));
    const published = Number.isNaN(date.getTime()) ? undefined : date.toISOString();
    const thumb = newsThumb(decode(tag(block, "News:Image")));
    const snippet = decode(tag(block, "description"));
    hits.push({
      id: `news:${url}`,
      source: "web",
      title,
      url,
      snippet: snippet.length > 320 ? `${snippet.slice(0, 319).trimEnd()}…` : snippet,
      meta: [site || hostOf(url), shortDate(published)].filter(Boolean).join(" · "),
      ...(site ? { site } : {}),
      ...(published ? { published } : {}),
      ...(thumb ? { image: { thumb, full: thumb } } : {}),
    });
    if (hits.length >= max) break;
  }
  return hits;
}
