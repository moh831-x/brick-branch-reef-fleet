import { GROK_PAGE, IMAGES_MAX_PAGE, IMAGES_PAGE, isLatinQuery, PAGE, relevantCount, WEB_PAGE } from "./search.shared";
import { LANGS, langInfo, matchLang, wikiOrigin as wikiOriginFor, type UiLang } from "./i18n";
import { extractReadable, isPrivateHost, pageCharset, type ReaderPage } from "./reader";
import { isNewsQuery, parseBingNews, shortDate } from "./news.shared";
import { cleanContextItem, type AiContextItem } from "./ai.shared";

export type SourceId = "web" | "wiki" | "grok" | "images";

export type ImageRef = {
  /** Bing-hosted thumbnail (always https). */
  thumb: string;
  /** Full-size image on the original site (https), or the thumbnail when that is not safe to load. */
  full: string;
  width?: number;
  height?: number;
};

export type SearchHit = {
  id: string;
  source: SourceId;
  title: string;
  url: string;
  snippet: string;
  meta: string;
  image?: ImageRef;
  /** News articles: the publisher as the feed names it. */
  site?: string;
  /** When the page or article was published (ISO), when the feed says. */
  published?: string;
};

export type LeadCard = {
  source: "wiki" | "grok";
  title: string;
  kicker: string;
  extract: string;
  url: string;
  image?: string;
};

export type WordSense = {
  part: string;
  definition: string;
  example?: string;
};

export type WordDefinition = {
  word: string;
  phonetic?: string;
  senses: WordSense[];
  source?: string;
};

export type SourceBlock = {
  results: SearchHit[];
  total?: number;
  error?: string;
  done: boolean;
};

export type SearchPayload = {
  query: string;
  tookMs: number;
  web: SourceBlock;
  wiki: SourceBlock;
  grok: SourceBlock;
  images: SourceBlock;
  /** News articles (Bing News) for a news search on the first web page: the AI cites them, and the answer shows them as cards. */
  news?: SourceBlock;
  card: LeadCard | null;
  places: PlaceRef[];
  placesError?: string;
  near: string;
  /** Set when the Wikipedia search used a translation of `query` into the page language. */
  searched?: string;
  lang?: SearchLang;
  /** Set when the web search used other words than `query` (Bing's feed only answers Latin-script queries well). */
  webSearched?: string;
  /** Set when Grokipedia (English only) was searched with an English translation of `query`. */
  grokSearched?: string;
  /** Why the query could not be translated, when that failed (the typed words were used instead). */
  translateError?: string;
  /** Why Grokipedia titles and snippets could not be translated into the page language, when that failed. */
  grokTranslateError?: string;
  /** The page language this search ran for. */
  pageLang?: UiLang;
  definitions: WordDefinition[];
  deepDive: string[];
};

export type SearchInput = {
  q: string;
  web: boolean;
  wiki: boolean;
  grok: boolean;
  images: boolean;
  webOffset: number;
  wikiOffset: number;
  grokOffset: number;
  imagesOffset: number;
  card: boolean;
  near: string;
  /** The page language. English and unknown values search the query as typed. */
  lang?: string;
};

export type PlaceRef = {
  id: string;
  name: string;
  detail: string;
  lat: number;
  lon: number;
  url: string;
  map: string;
  source: "wiki" | "map";
};

export type PreviewSection = {
  id: string;
  title: string;
  level: number;
  text: string;
};

export type HitPreview = {
  source: SourceId;
  title: string;
  kicker: string;
  extract: string;
  url: string;
  image?: string;
  sections?: PreviewSection[];
  /** Web results only: "ok" when the page itself was read, "unavailable" when it could not be (blocked, timeout, not HTML). */
  reader?: "ok" | "unavailable";
};

export type Suggestion = {
  title: string;
  source: "wiki" | "grok";
};

export type Trend = {
  title: string;
  snippet: string;
  slug: string;
  image?: string;
  entity: boolean;
};

const UA = "Mozilla/5.0 (compatible; Folio/1.0; personal research reader)";

/**
 * A page language other than English. English searches run exactly as typed, with Bing's and
 * Wikipedia's defaults; every other language searches its own Wikipedia edition and asks Bing
 * for that language and market.
 */
export type SearchLang = Exclude<UiLang, "en-US">;

export const SEARCH_LANGS: readonly SearchLang[] = LANGS.map((item) => item.code).filter(
  (code): code is SearchLang => code !== "en-US",
);

export function asSearchLang(value: string | undefined): SearchLang | null {
  const lang = matchLang(value);
  return lang && lang !== "en-US" ? lang : null;
}

/**
 * Bing's public web feed only takes the interface language. Adding mkt or cc (for example
 * mkt=bn-BD or mkt=hi-IN, which Bing does not support, or even mkt=de-DE) makes the feed return
 * nothing or unrelated pages, so the market is never sent there.
 */
function bingLang(lang: SearchLang | null): string {
  if (!lang) return "";
  return `&setlang=${encodeURIComponent(langInfo(lang).setlang)}`;
}

function wikiOriginOf(lang: SearchLang | null): string {
  return wikiOriginFor(lang ?? "en-US");
}

function wikiHost(url: string): string {
  try {
    const host = new URL(url).hostname;
    if (host === "wikipedia.org" || host.endsWith(".wikipedia.org")) return `https://${host}`;
  } catch {
    /* use the English edition */
  }
  return "https://en.wikipedia.org";
}

function emptyBlock(): SourceBlock {
  return { results: [], done: true };
}

export function emptyPayload(query: string): SearchPayload {
  return {
    query,
    tookMs: 0,
    web: emptyBlock(),
    wiki: emptyBlock(),
    grok: emptyBlock(),
    images: emptyBlock(),
    card: null,
    places: [],
    near: "",
    definitions: [],
    deepDive: [],
  };
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    "#39": "'",
  };
  const decoded = value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (all, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      const code = Number.parseInt(entity.slice(2), 16);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : all;
    }
    if (entity.startsWith("#")) {
      const code = Number.parseInt(entity.slice(1), 10);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : all;
    }
    return named[entity] ?? all;
  });
  return decoded
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanSnippet(value: string): string {
  return value
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*$/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function clip(value: string, max = 320): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

function safeHttp(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function hostOf(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function formatDay(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

async function getText(url: string, accept: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Accept: accept,
      "User-Agent": UA,
    },
    signal: AbortSignal.timeout(9000),
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function getJson<T>(url: string): Promise<T> {
  const text = await getText(url, "application/json");
  return JSON.parse(text) as T;
}

const WIKI_UA = "Folio/1.0 (personal research reader)";
const wikiJsonCache = new Map<string, { at: number; data: unknown }>();
let wikiTail: Promise<void> = Promise.resolve();

function wikiTurn<T>(task: () => Promise<T>): Promise<T> {
  const run = wikiTail.then(task, task);
  wikiTail = run.then(
    () => new Promise((resolve) => setTimeout(resolve, 300)),
    () => new Promise((resolve) => setTimeout(resolve, 300)),
  );
  return run;
}

async function readWiki(url: string, timeoutMs: number): Promise<{ status: number; retryAfter: number; text: string }> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": WIKI_UA,
      "Api-User-Agent": WIKI_UA,
    },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
  });
  const retryHeader = Number(response.headers.get("retry-after"));
  return {
    status: response.status,
    retryAfter: Number.isFinite(retryHeader) ? retryHeader : 0,
    text: response.ok ? await response.text() : "",
  };
}

async function getWikiJson<T>(url: string): Promise<T> {
  const cached = wikiJsonCache.get(url);
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.data as T;
  return wikiTurn(async () => {
    const fresh = wikiJsonCache.get(url);
    if (fresh && Date.now() - fresh.at < 10 * 60 * 1000) return fresh.data as T;
    let attempt = await readWiki(url, 8000);
    if (attempt.status === 429) {
      const waitMs = Math.min(20_000, Math.max(1000, (attempt.retryAfter || 2) * 1000));
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      attempt = await readWiki(url, 8000);
    }
    if (attempt.status < 200 || attempt.status >= 300 || !attempt.text) {
      throw new Error(`HTTP ${attempt.status}`);
    }
    const data = JSON.parse(attempt.text) as T;
    wikiJsonCache.set(url, { at: Date.now(), data });
    if (wikiJsonCache.size > 40) {
      const oldest = wikiJsonCache.keys().next().value;
      if (oldest) wikiJsonCache.delete(oldest);
    }
    return data;
  });
}

function tag(block: string, name: string): string {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return match?.[1]?.trim() ?? "";
}

function readBingTotal(html: string): number | undefined {
  const label = html.match(/class="sb_count"[^>]*>([^<]+)/i)?.[1] ?? "";
  const nums = [...label.replace(/,/g, "").matchAll(/\d+/g)].map((match) => Number(match[0]));
  if (!nums.length) return undefined;
  const total = Math.max(...nums);
  if (!Number.isFinite(total) || total <= 0 || total > 2_000_000_000) return undefined;
  return total;
}

async function searchWeb(query: string, offset: number, near: string, lang: SearchLang | null, withTotal = true): Promise<SourceBlock> {
  const first = Math.max(1, offset + 1);
  const q = near ? `${query} ${near}` : query;
  const market = bingLang(lang);
  const rssUrl = `https://www.bing.com/search?q=${encodeURIComponent(q)}&format=rss&first=${first}&count=${WEB_PAGE}${market}`;
  const htmlUrl = `https://www.bing.com/search?q=${encodeURIComponent(q)}&count=${WEB_PAGE}${market}`;
  const [xml, html] = await Promise.all([
    getText(rssUrl, "application/rss+xml, application/xml, text/xml"),
    withTotal ? getText(htmlUrl, "text/html").catch(() => "") : Promise.resolve(""),
  ]);
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)];
  const results: SearchHit[] = [];
  for (const item of items) {
    const block = item[1] ?? "";
    const title = decodeEntities(tag(block, "title"));
    const link = safeHttp(decodeEntities(tag(block, "link")));
    if (!title || !link) continue;
    const host = hostOf(link);
    if (!host || host.endsWith("bing.com")) continue;
    const snippet = clip(decodeEntities(tag(block, "description")), 160);
    const pubDate = decodeEntities(tag(block, "pubDate"));
    const when = formatDay(pubDate);
    const published = pubDate && !Number.isNaN(new Date(pubDate).getTime()) ? new Date(pubDate).toISOString() : undefined;
    results.push({
      id: `web:${link}`,
      source: "web",
      title,
      url: link,
      snippet,
      meta: [host, when].filter(Boolean).join(" · "),
      ...(published ? { published } : {}),
    });
    if (results.length >= WEB_PAGE) break;
  }
  return { results, total: readBingTotal(html), done: results.length < WEB_PAGE };
}

/** Bing's public news feed: headline, the article's own address, publisher, date, and a Bing thumbnail. */
async function searchNews(query: string, lang: SearchLang | null): Promise<SourceBlock> {
  const url = `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss${bingLang(lang)}`;
  const results = parseBingNews(await getText(url, "application/rss+xml, application/xml, text/xml"));
  return { results, done: true };
}

/** Results one extra AI search hands the model (agentic search): news articles first, then web pages. */
const AI_SEARCH_NEWS = 5;
const AI_SEARCH_MAX = 10;

/**
 * One extra web search the AI answer asked for because the first results were weak (see
 * src/lib/research.shared.ts): the same Bing web feed, plus the news feed for a news search, as
 * AI context items. Throws only when every feed failed, so the step can say so.
 */
export async function searchForAi(query: string, options: { news: boolean; signal?: AbortSignal; lang?: string }): Promise<AiContextItem[]> {
  const lang = asSearchLang(options.lang);
  const work = Promise.allSettled([
    searchWeb(query, 0, "", lang, false),
    options.news ? searchNews(query, lang) : Promise.resolve(emptyBlock()),
  ]);
  const stopped = new Promise<never>((_, reject) => {
    if (options.signal?.aborted) reject(new Error("Search timed out"));
    options.signal?.addEventListener("abort", () => reject(new Error("Search timed out")), { once: true });
  });
  stopped.catch(() => undefined); // A timeout after the search finished is not an error anyone waits on.
  const [web, news] = await Promise.race([work, stopped]);
  if (web.status === "rejected" && news.status === "rejected") throw web.reason instanceof Error ? web.reason : new Error("Search failed");
  const hits = [
    ...(news.status === "fulfilled" ? news.value.results.slice(0, AI_SEARCH_NEWS) : []),
    ...(web.status === "fulfilled" ? web.value.results : []),
  ];
  const items: AiContextItem[] = [];
  const seen = new Set<string>();
  for (const hit of hits) {
    const item = cleanContextItem({ source: "web", title: hit.title, url: hit.url, snippet: hit.snippet, site: hit.site, date: shortDate(hit.published) });
    if (!item || seen.has(item.url)) continue;
    seen.add(item.url);
    items.push(item);
    if (items.length >= AI_SEARCH_MAX) break;
  }
  return items;
}

/**
 * Try each query in turn and keep the first whose results actually mention it. Bing's public feed
 * returns nothing, or unrelated pages, for many non-Latin queries, so a page-language query falls
 * back to the English translation and then to the words typed.
 */
async function searchWebBest(
  candidates: string[],
  offset: number,
  near: string,
  lang: SearchLang | null,
): Promise<{ block: SourceBlock; used: string }> {
  let best: { block: SourceBlock; used: string; score: number } | null = null;
  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      const block = await searchWeb(candidate, offset, near, lang);
      const score = relevantCount(block.results, candidate);
      if (block.results.length > 0 && score >= Math.min(3, block.results.length)) return { block, used: candidate };
      if (!best || score > best.score || (score === best.score && block.results.length > best.block.results.length)) {
        best = { block, used: candidate, score };
      }
    } catch (error) {
      lastError = error;
    }
  }
  if (best) return best;
  throw lastError instanceof Error ? lastError : new Error("Unavailable");
}

type WikiSearchResponse = {
  query?: {
    searchinfo?: { totalhits?: number };
    search?: Array<{
      title?: string;
      snippet?: string;
      wordcount?: number;
      timestamp?: string;
    }>;
  };
};

async function searchWiki(query: string, offset: number, origin = "https://en.wikipedia.org"): Promise<{ block: SourceBlock; places: PlaceRef[] }> {
  const url =
    `${origin}/w/api.php?action=query&format=json&list=search` +
    `&srsearch=${encodeURIComponent(query)}&srlimit=${PAGE}&sroffset=${offset}&srnamespace=0` +
    "&srprop=snippet|timestamp&srinfo=totalhits";
  const data = await getWikiJson<WikiSearchResponse>(url);
  const results: SearchHit[] = [];
  for (const row of data.query?.search ?? []) {
    const title = decodeEntities(row.title ?? "");
    if (!title) continue;
    const article = `${origin}/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
    results.push({
      id: `wiki:${title}`,
      source: "wiki",
      title,
      url: article,
      snippet: clip(decodeEntities(row.snippet ?? "")),
      meta: formatDay(row.timestamp) ?? "Wikipedia",
    });
  }
  const total = data.query?.searchinfo?.totalhits;
  return {
    block: {
      results,
      total,
      done: results.length < PAGE || (typeof total === "number" && offset + results.length >= total),
    },
    places: [],
  };
}

type WikiSummary = {
  type?: string;
  title?: string;
  description?: string;
  extract?: string;
  thumbnail?: { source?: string };
  content_urls?: { desktop?: { page?: string } };
};

function wikiImage(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return undefined;
    if (!url.hostname.endsWith("wikipedia.org") && !url.hostname.endsWith("wikimedia.org")) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

async function wikiCard(title: string, fallbackUrl: string): Promise<LeadCard | null> {
  const origin = wikiHost(fallbackUrl);
  const url = `${origin}/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const data = await getJson<WikiSummary>(url);
  const extract = clip(data.extract?.trim() ?? "", 420);
  if (!extract) return null;
  const page = safeHttp(data.content_urls?.desktop?.page ?? "") ?? fallbackUrl;
  return {
    source: "wiki",
    title: data.title?.trim() || title,
    kicker: data.description?.trim() || "Wikipedia",
    extract,
    url: page,
    image: wikiImage(data.thumbnail?.source),
  };
}

type GrokSearchResponse = {
  results?: Array<{
    slug?: string;
    title?: string;
    snippet?: string;
  }>;
  totalCount?: number;
};

async function searchGrok(query: string, offset: number): Promise<SourceBlock> {
  const url =
    `https://grokipedia.com/api/full-text-search?query=${encodeURIComponent(query)}` +
    `&limit=${GROK_PAGE}&offset=${offset}`;
  const data = await getJson<GrokSearchResponse>(url);
  const results: SearchHit[] = [];
  for (const row of data.results ?? []) {
    const slug = row.slug?.trim();
    const title = row.title?.trim() || slug?.replace(/_/g, " ");
    if (!slug || !title) continue;
    const page = `https://grokipedia.com/page/${encodeURIComponent(slug)}`;
    results.push({
      id: `grok:${slug}`,
      source: "grok",
      title,
      url: page,
      snippet: clip(cleanSnippet(decodeEntities(row.snippet ?? ""))),
      meta: "grokipedia.com",
    });
  }
  const total = typeof data.totalCount === "number" ? data.totalCount : undefined;
  return {
    results,
    total,
    done: results.length < GROK_PAGE || (typeof total === "number" && offset + results.length >= total),
  };
}

/* ---------- Images: Bing's public image results (same provider as Web) ---------- */

/** Bing hands back up to this many images per request. */
const BING_IMAGE_BATCH = 35;
/** Safe search for images. Bing's default for the web feed is Moderate; images ask for it explicitly. */
const IMAGE_SAFE_SEARCH = "moderate";
const imagePoolCache = new Map<string, { at: number; hits: SearchHit[]; exhausted: boolean }>();

function unescapeAttr(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function bingThumb(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    if (!url.hostname.endsWith(".bing.net") && !url.hostname.endsWith(".bing.com")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function dimension(value: string | undefined): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n < 100_000 ? Math.round(n) : undefined;
}

/** Parse the image tiles from Bing's public image results markup. */
export function parseBingImages(html: string): SearchHit[] {
  const hits: SearchHit[] = [];
  const tiles = html.split(/\sm="(?=\{)/).slice(1);
  for (const tile of tiles) {
    const end = tile.indexOf('"');
    if (end < 0) continue;
    let meta: { purl?: unknown; murl?: unknown; turl?: unknown; t?: unknown; desc?: unknown };
    try {
      meta = JSON.parse(unescapeAttr(tile.slice(0, end))) as typeof meta;
    } catch {
      continue;
    }
    const page = typeof meta.purl === "string" ? safeHttp(meta.purl) : null;
    const thumb = bingThumb(meta.turl);
    if (!page || !thumb) continue;
    const host = hostOf(page);
    if (!host || host.endsWith("bing.com")) continue;
    const media = typeof meta.murl === "string" ? safeHttp(meta.murl) : null;
    const rawTitle = typeof meta.t === "string" ? meta.t : typeof meta.desc === "string" ? meta.desc : "";
    const title = clip(decodeEntities(rawTitle.replace(/[\ue000-\ue001]/g, "")), 140) || host;
    const rest = tile.slice(end, end + 4000);
    const size = rest.match(/class="nowrap">\s*(\d+)\s*(?:&#215;|×|x)\s*(\d+)/i);
    const width = dimension(rest.match(/expw=(\d+)/)?.[1] ?? size?.[1]);
    const height = dimension(rest.match(/exph=(\d+)/)?.[1] ?? size?.[2]);
    hits.push({
      id: `images:${media ?? thumb}`,
      source: "images",
      title,
      url: page,
      snippet: "",
      meta: [host, width && height ? `${width}×${height}` : ""].filter(Boolean).join(" · "),
      image: {
        thumb,
        // Only load the original over https; otherwise stay on Bing's thumbnail (no mixed content).
        full: media && media.startsWith("https:") ? media : thumb,
        width,
        height,
      },
    });
  }
  return hits;
}

async function imageBatch(query: string, first: number): Promise<SearchHit[]> {
  const url =
    `https://www.bing.com/images/async?q=${encodeURIComponent(query)}` +
    `&first=${first}&count=${BING_IMAGE_BATCH}&adlt=${IMAGE_SAFE_SEARCH}`;
  return parseBingImages(await getText(url, "text/html"));
}

/** Bing's image results come back empty when setlang or mkt is sent, so neither is. */
async function searchImages(query: string, offset: number): Promise<SourceBlock> {
  const cap = IMAGES_MAX_PAGE * IMAGES_PAGE;
  if (offset >= cap) return { results: [], done: true };
  const want = Math.min(cap, offset + IMAGES_PAGE + 1);
  const key = query.toLowerCase();
  const cached = imagePoolCache.get(key);
  const fresh = cached && Date.now() - cached.at < 10 * 60 * 1000 ? cached : null;
  const hits = fresh ? [...fresh.hits] : [];
  let exhausted = fresh?.exhausted ?? false;
  const seen = new Set(hits.map((hit) => hit.id));
  let batch = Math.ceil(hits.length / BING_IMAGE_BATCH);
  // Bing does not always honour `first`; stop as soon as a batch adds nothing new.
  while (!exhausted && hits.length < want && batch <= Math.ceil(cap / BING_IMAGE_BATCH)) {
    let rows: SearchHit[];
    try {
      rows = await imageBatch(query, batch * BING_IMAGE_BATCH + 1);
    } catch (error) {
      if (!hits.length) throw error;
      break;
    }
    batch += 1;
    let added = 0;
    for (const row of rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      hits.push(row);
      added += 1;
    }
    if (added === 0) exhausted = true;
  }
  imagePoolCache.set(key, { at: fresh?.at ?? Date.now(), hits, exhausted });
  if (imagePoolCache.size > 40) {
    const oldest = imagePoolCache.keys().next().value;
    if (oldest) imagePoolCache.delete(oldest);
  }
  const results = hits.slice(offset, offset + IMAGES_PAGE);
  const done =
    results.length < IMAGES_PAGE || offset + IMAGES_PAGE >= cap || (exhausted && hits.length <= offset + IMAGES_PAGE);
  return { results, done };
}

function failed(error: unknown): SourceBlock {
  const message = error instanceof Error ? error.message : "Unavailable";
  return { results: [], error: message, done: true };
}

function pointOf(lat: unknown, lon: unknown): { lat: number; lon: number } | null {
  if (typeof lat !== "number" || typeof lon !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

function mapLink(lat: number, lon: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=13/${lat}/${lon}`;
}

type WikiSummaryPlace = WikiSummary & {
  coordinates?: { lat?: number; lon?: number };
};

async function wikiSummaryPlace(query: string): Promise<PlaceRef | null> {
  const title = query.trim();
  if (!title) return null;
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`;
    const data = await getJson<WikiSummaryPlace>(url);
    const name = data.title?.trim();
    const point = pointOf(data.coordinates?.lat, data.coordinates?.lon);
    if (!name || !point || data.type === "disambiguation") return null;
    const article =
      safeHttp(data.content_urls?.desktop?.page ?? "") ??
      `https://en.wikipedia.org/wiki/${encodeURIComponent(name.replace(/ /g, "_"))}`;
    return {
      id: `wiki:${name}`,
      name,
      detail: data.description?.trim() || "Wikipedia",
      lat: point.lat,
      lon: point.lon,
      url: article,
      map: mapLink(point.lat, point.lon),
      source: "wiki",
    };
  } catch {
    return null;
  }
}

type MeteoPlace = {
  id?: number;
  name?: string;
  latitude?: number;
  longitude?: number;
  feature_code?: string;
  country?: string;
  admin1?: string;
  admin2?: string;
  population?: number;
};

function featureLabel(code: string | undefined): string {
  switch (code) {
    case "PPLC":
    case "PPLA":
    case "PPLA2":
    case "PPLA3":
    case "PPLA4":
    case "PPL":
    case "PPLS":
      return "City";
    case "PPLX":
      return "Neighborhood";
    case "ADM1":
      return "Region";
    case "ADM2":
      return "County";
    case "ISL":
      return "Island";
    case "MT":
    case "MTS":
      return "Mountain";
    case "LK":
    case "LKS":
      return "Lake";
    case "STM":
      return "River";
    case "BCH":
      return "Beach";
    case "AIRP":
      return "Airport";
    case "PRK":
      return "Park";
    default:
      return "Place";
  }
}

function mentionsQuery(query: string, name: string, region: string): boolean {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2);
  if (!tokens.length) return false;
  const words = `${name} ${region}`.toLowerCase().split(/[^a-z0-9]+/);
  return tokens.every((token) => words.includes(token));
}

async function mapPlaces(query: string, near: string, lang: SearchLang | null = null): Promise<PlaceRef[]> {
  const q = [query, near].filter(Boolean).join(" ").trim();
  if (!q) return [];
  const data = await getJson<{ results?: MeteoPlace[] }>(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=10&language=${lang ? langInfo(lang).wiki : "en"}&format=json`,
  );
  const rows = [...(data.results ?? [])].sort((a, b) => (b.population ?? 0) - (a.population ?? 0));
  const places: PlaceRef[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const name = row.name?.trim();
    const point = pointOf(row.latitude, row.longitude);
    if (!name || !point) continue;
    const region = [row.admin1, row.country].filter(Boolean).join(" ");
    if (!mentionsQuery(query, name, region)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    const kind = featureLabel(row.feature_code);
    const detail = [kind, row.admin1, row.country].filter((part, index, all) => {
      if (!part) return false;
      if (part.toLowerCase() === name.toLowerCase()) return false;
      return all.findIndex((item) => item?.toLowerCase() === part.toLowerCase()) === index;
    });
    places.push({
      id: `map:${row.id ?? `${point.lat.toFixed(3)}:${point.lon.toFixed(3)}`}`,
      name,
      detail: detail.join(" · "),
      lat: point.lat,
      lon: point.lon,
      url: mapLink(point.lat, point.lon),
      map: mapLink(point.lat, point.lon),
      source: "map",
    });
    seen.add(key);
    if (places.length >= 6) break;
  }
  return places;
}

function mergePlaces(groups: PlaceRef[][]): PlaceRef[] {
  const places: PlaceRef[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    for (const place of group) {
      const key = place.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      places.push(place);
      if (places.length >= 6) return places;
    }
  }
  return places;
}

async function searchPlaces(query: string, near: string, lang: SearchLang | null = null): Promise<PlaceRef[]> {
  const q = query.trim();
  if (!q && !near.trim()) return [];
  const [wikiResult, mapResult] = await Promise.allSettled([wikiSummaryPlace(q), mapPlaces(q, near, lang)]);
  const wiki = wikiResult.status === "fulfilled" && wikiResult.value ? [wikiResult.value] : [];
  const maps = mapResult.status === "fulfilled" ? mapResult.value : [];
  const places = mergePlaces([wiki, maps]);
  if (!places.length && mapResult.status === "rejected") {
    const reason = mapResult.reason;
    throw reason instanceof Error ? reason : new Error("Unavailable");
  }
  return places;
}

const SPEECH: Record<string, string> = {
  n: "noun",
  v: "verb",
  adj: "adjective",
  adv: "adverb",
  u: "interjection",
};

type DatamuseWord = { word?: string; defs?: string[] };

function sameWord(query: string, word: string): boolean {
  const fold = (value: string) => value.toLowerCase().replace(/[^a-z]/g, "");
  return fold(query) === fold(word);
}

async function defineWord(word: string): Promise<WordDefinition | null> {
  const clean = word.trim().toLowerCase();
  if (!/^[a-z][a-z' -]{0,48}$/i.test(clean)) return null;
  const data = await getJson<DatamuseWord[]>(
    `https://api.datamuse.com/words?sp=${encodeURIComponent(clean)}&md=d&max=1`,
  );
  const entry = data.find((item) => item.word && sameWord(clean, item.word) && item.defs?.length) ?? null;
  if (!entry?.word || !entry.defs?.length) return null;
  const senses: WordSense[] = [];
  for (const line of entry.defs) {
    const [code, text] = line.split("\t");
    const definition = text?.trim();
    if (!definition) continue;
    senses.push({
      part: SPEECH[code?.trim() ?? ""] || "word",
      definition: clip(definition, 220),
    });
  }
  senses.sort((left, right) => Number(nicheSense(left.definition)) - Number(nicheSense(right.definition)));
  const picked = senses.slice(0, 3);
  if (!picked.length) return null;
  return {
    word: entry.word,
    senses: picked,
    source: "https://wordnet.princeton.edu/",
  };
}

function nicheSense(definition: string): boolean {
  return /^\((?:now |chiefly |law\b|obsolete|rare|archaic|dialect|dated)/i.test(definition);
}

async function defineQuery(query: string): Promise<WordDefinition[]> {
  const phrase = query.trim();
  const words = phrase.split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 4) return [];
  if (/[^\p{L}\s'-]/u.test(phrase)) return [];
  try {
    const whole = await defineWord(phrase);
    if (whole) return [whole];
  } catch {
    /* try each word */
  }
  if (words.length < 2) return [];
  const found = await Promise.all(
    [...new Set(words.map((word) => word.toLowerCase()))]
      .filter((word) => word.length > 2)
      .slice(0, 3)
      .map((word) => defineWord(word).catch(() => null)),
  );
  return found.filter((item): item is WordDefinition => item !== null).slice(0, 2);
}

async function readDeepDive(query: string, lang: SearchLang | null = null): Promise<string[]> {
  const url = `https://api.bing.com/osjson.aspx?query=${encodeURIComponent(query)}${lang ? `&mkt=${encodeURIComponent(langInfo(lang).mkt)}` : ""}`;
  const data = await getJson<[string, string[]]>(url);
  const rows = Array.isArray(data?.[1]) ? data[1] : [];
  const base = query.trim().toLowerCase();
  const seen = new Set<string>();
  const items: string[] = [];
  for (const row of rows) {
    if (typeof row !== "string") continue;
    const text = labelDive(row.trim().replace(/\s+/g, " ").slice(0, 80));
    const key = text.toLowerCase();
    if (!text || key === base || seen.has(key)) continue;
    seen.add(key);
    items.push(text);
    if (items.length >= 8) break;
  }
  return items;
}

function labelDive(value: string): string {
  const upper = new Set(["tv", "nfl", "nba", "mlb", "ufc", "pga", "lpga", "us", "usa", "uk"]);
  const small = new Set(["a", "an", "and", "of", "the", "for", "to", "in", "on", "vs"]);
  return value
    .split(" ")
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (upper.has(lower)) return lower.toUpperCase();
      if (index > 0 && small.has(lower)) return lower;
      return lower.replace(/^([a-z])/, (letter) => letter.toUpperCase());
    })
    .join(" ");
}

/** Grokipedia is English only: show its titles and snippets in the page language when a translator is set up. */
async function localizeGrok(block: SourceBlock, lang: SearchLang): Promise<{ block: SourceBlock; error?: string }> {
  if (!block.results.length) return { block };
  const { translateList } = await import("./ai.server");
  const strings = block.results.flatMap((hit) => [hit.title, hit.snippet]);
  try {
    const out = await translateList(strings, lang);
    return {
      block: {
        ...block,
        results: block.results.map((hit, index) => ({
          ...hit,
          title: out[index * 2] || hit.title,
          snippet: out[index * 2 + 1] ?? hit.snippet,
        })),
      },
    };
  } catch (error) {
    return { block, error: error instanceof Error ? error.message : "translation failed" };
  }
}

export async function runSearch(input: SearchInput): Promise<SearchPayload> {
  const started = Date.now();
  const query = input.q.replace(/\s+/g, " ").trim();
  if (!input.web && !input.wiki && !input.grok && !input.images) {
    return { ...emptyPayload(query), tookMs: 0 };
  }
  const lang = asSearchLang(input.lang);
  let searched = query;
  let english = query;
  let translateError: string | undefined;
  if (lang) {
    // Wikipedia searches in the page language. Grokipedia only has English pages, and Bing's public
    // feed answers English (Latin-script) queries reliably, so both also get an English rendering.
    // Either translation falls back to the words typed, and the reason is kept for the page.
    const { translateQuery } = await import("./ai.server");
    const translate = (target: UiLang) =>
      translateQuery(query, target).catch((error: unknown) => {
        translateError ??= error instanceof Error ? error.message : "translation failed";
        return query;
      });
    const needEnglish = input.grok || input.web || input.images;
    [searched, english] = await Promise.all([
      input.wiki ? translate(lang) : Promise.resolve(query),
      needEnglish ? translate("en-US") : Promise.resolve(query),
    ]);
  }
  const grokQuery = english;
  const wikiOrigin = wikiOriginOf(lang);
  const unique = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  // Page-language words first when Bing can read them, then English, then the words typed.
  const webCandidates = lang ? unique([isLatinQuery(searched) ? searched : "", english, query]) : [query];
  const imageQuery = lang ? (isLatinQuery(query) ? query : english) : query;

  // A news search also reads the news feed (first page only), for the answer's citations and cards.
  const wantNews = input.web && input.webOffset === 0 && isNewsQuery(query);
  const [webOutcome, wikiOutcome, grokOutcome, images, definitions, deepDive, news] = await Promise.all([
    input.web
      ? searchWebBest(webCandidates, input.webOffset, input.near, lang).catch((error) => ({ block: failed(error), used: query }))
      : Promise.resolve({ block: emptyBlock(), used: query }),
    input.wiki
      ? searchWiki(searched, input.wikiOffset, wikiOrigin).catch((error) => ({ block: failed(error), places: [] as PlaceRef[] }))
      : Promise.resolve({ block: emptyBlock(), places: [] as PlaceRef[] }),
    input.grok
      ? searchGrok(grokQuery, input.grokOffset)
          .catch(failed)
          .then((block): Promise<{ block: SourceBlock; error?: string }> =>
            lang ? localizeGrok(block, lang) : Promise.resolve({ block }),
          )
      : Promise.resolve({ block: emptyBlock() } as { block: SourceBlock; error?: string }),
    input.images ? searchImages(imageQuery, input.imagesOffset).catch(failed) : Promise.resolve(emptyBlock()),
    defineQuery(input.card ? query : ""),
    input.web && input.webOffset === 0 ? readDeepDive(isLatinQuery(searched) ? searched : english, lang).catch(() => []) : Promise.resolve([]),
    wantNews ? searchNews(isLatinQuery(query) ? query : english, lang).catch(() => null) : Promise.resolve(null),
  ]);
  const web = webOutcome.block;
  const { block: grok, error: grokTranslateError } = grokOutcome;
  const wiki = wikiOutcome.block;

  let card: LeadCard | null = null;
  if (input.card && input.wiki && !wiki.error) {
    const lead =
      input.wikiOffset === 0
        ? wiki.results[0]
        : (await searchWiki(searched, 0, wikiOrigin).catch(() => ({ block: emptyBlock(), places: [] as PlaceRef[] }))).block.results[0];
    if (lead) card = await wikiCard(lead.title, lead.url).catch(() => null);
  }
  if (!card && input.card && input.grok && !grok.error) {
    const lead =
      input.grokOffset === 0
        ? grok.results[0]
        : (await searchGrok(grokQuery, 0).catch(() => emptyBlock())).results[0];
    if (lead) {
      card = {
        source: "grok",
        title: lead.title,
        kicker: "Grokipedia",
        extract: lead.snippet || "Open the article for the full entry.",
        url: lead.url,
      };
    }
  }

  let places: PlaceRef[] = [];
  let placesError: string | undefined;
  if (input.card) {
    try {
      places = mergePlaces([wikiOutcome.places, await searchPlaces(query, input.near, lang)]);
    } catch (error) {
      places = wikiOutcome.places;
      if (!places.length) placesError = error instanceof Error ? error.message : "Unavailable";
    }
  }

  return {
    query,
    tookMs: Date.now() - started,
    web,
    wiki,
    grok,
    images,
    ...(news && news.results.length ? { news } : {}),
    card,
    places,
    placesError,
    near: input.near,
    ...(lang && searched !== query ? { searched, lang } : {}),
    ...(lang && input.web && webOutcome.used !== query ? { webSearched: webOutcome.used } : {}),
    ...(lang && grokQuery !== query ? { grokSearched: grokQuery } : {}),
    ...(translateError ? { translateError } : {}),
    ...(grokTranslateError ? { grokTranslateError } : {}),
    pageLang: lang ?? "en-US",
    definitions,
    deepDive,
  };
}

type OpenSearch = [string, string[], string[], string[]];

export async function runSuggest(query: string, lang: SearchLang | null = null): Promise<Suggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const wikiUrl =
    `${wikiOriginOf(lang)}/w/api.php?action=opensearch&format=json&limit=5&namespace=0` +
    `&search=${encodeURIComponent(q)}`;
  const grokUrl = `https://grokipedia.com/api/typeahead?query=${encodeURIComponent(q)}&limit=5`;

  const [wiki, grok] = await Promise.all([
    getWikiJson<OpenSearch>(wikiUrl).catch(() => null),
    getJson<GrokSearchResponse>(grokUrl).catch(() => null),
  ]);

  const suggestions: Suggestion[] = [];
  const seen = new Set<string>();
  const push = (title: string | undefined, source: Suggestion["source"]) => {
    const clean = title?.trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    suggestions.push({ title: clean, source });
  };

  for (const title of wiki?.[1] ?? []) push(title, "wiki");
  for (const row of grok?.results ?? []) push(row.title, "grok");
  return suggestions.slice(0, 7);
}

function readJsonArray(source: string, marker: string): unknown[] {
  const at = source.indexOf(marker);
  if (at < 0) return [];
  const start = source.indexOf("[", at);
  if (start < 0) return [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "[") depth += 1;
    else if (char === "]") {
      depth -= 1;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(source.slice(start, index + 1)) as unknown;
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      }
    }
  }
  return [];
}

function tidyTrend(title: string, snippet: string): string {
  const parts = snippet
    .split(/\n+/)
    .map((part) => cleanSnippet(part).replace(/\\([()])/g, "$1"))
    .map((part) => part.replace(/^[)\s]+/, "").trim())
    .filter(Boolean)
    .filter((part) => !/\.(?:jpe?g|png|gif|webp)\)?$/i.test(part))
    .filter((part) => !/\)\s*$/.test(part) || /\b(?:is|was|are|were)\b/i.test(part));
  const prose = parts.filter((part) => /\b(?:is|was|are|were)\b/i.test(part));
  let text = (prose.at(-1) || parts.at(-1) || cleanSnippet(snippet)).trim();
  const lead = title.trim();
  if (lead && text.toLowerCase().startsWith(lead.toLowerCase())) {
    const rest = text.slice(lead.length).trim();
    if (rest) text = /^[,.;:]/.test(rest) ? `${lead}${rest}` : `${lead} ${rest}`;
  }
  return clip(text, 160);
}

let trendCache: { at: number; rows: Trend[] } | null = null;

function rssTag(block: string, name: string): string {
  const match = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "i"));
  return decodeEntities(match?.[1]?.trim() ?? "");
}

function safeTrendImage(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return undefined;
    if (!url.hostname.endsWith("gstatic.com") && !url.hostname.endsWith("googleusercontent.com")) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function looksLikePerson(title: string): boolean {
  if (/\d/.test(title)) return false;
  const stop = new Set(["the", "a", "an", "of", "and", "vs", "at", "in", "on", "for", "cup", "house", "club", "city", "united", "fc", "score", "show", "news"]);
  const words = title.trim().split(/\s+/);
  if (words.length < 2 || words.length > 3) return false;
  return words.every((word) => /^[a-z][a-z'.-]{1,}$/i.test(word) && !stop.has(word.toLowerCase()));
}

function titleCase(value: string): string {
  return value.replace(/\b([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function parseGoogleTrends(xml: string): Trend[] {
  const rows: Trend[] = [];
  let featured = false;
  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const block = match[1] ?? "";
    const rawTitle = rssTag(block, "title");
    if (!rawTitle || rawTitle === "Daily Search Trends") continue;
    const image = safeTrendImage(rssTag(block, "ht:picture"));
    const entity = !featured && looksLikePerson(rawTitle) && Boolean(image);
    if (entity) featured = true;
    rows.push({
      title: entity ? titleCase(rawTitle) : rawTitle,
      snippet: "",
      slug: rawTitle.toLowerCase(),
      image: entity ? image : undefined,
      entity,
    });
    if (rows.length >= 8) break;
  }
  return rows;
}

async function grokTrends(): Promise<Trend[]> {
  const html = await getText("https://grokipedia.com/", "text/html");
  return readJsonArray(html, "trendingPages")
    .map((row) => {
      if (typeof row !== "object" || row === null) return null;
      const item = row as { title?: string; snippet?: string; slug?: string };
      const title = item.title?.trim();
      const slug = item.slug?.trim();
      if (!title || !slug) return null;
      return { title, slug, snippet: tidyTrend(title, item.snippet ?? ""), entity: false };
    })
    .filter((row): row is Trend => row !== null)
    .slice(0, 8);
}

export async function runTrending(): Promise<Trend[]> {
  if (trendCache && Date.now() - trendCache.at < 10 * 60 * 1000) return trendCache.rows;
  let rows: Trend[] = [];
  try {
    const xml = await getText("https://trends.google.com/trending/rss?geo=US", "application/rss+xml, application/xml, text/xml");
    rows = parseGoogleTrends(xml);
  } catch {
    rows = [];
  }
  if (rows.length < 4) {
    try {
      rows = await grokTrends();
    } catch {
      rows = [];
    }
  }
  if (rows.length) trendCache = { at: Date.now(), rows };
  return rows;
}

function grokSlug(url: string): string {
  try {
    const match = new URL(url).pathname.match(/\/page\/([^/]+)/);
    return match?.[1] ? decodeURIComponent(match[1]) : "";
  } catch {
    return "";
  }
}

const SKIP_SECTION = /^(references|see also|external links|notes|further reading|bibliography|sources|citations|footnotes|works cited)$/i;

function plainClip(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1).replace(/\s+\S*$/, "").trim();
  return `${cut || clean.slice(0, max - 1)}…`;
}

/** Split a Wikipedia plaintext extract or Grokipedia markdown page into a lead and a short contents list. */
function articleParts(raw: string, kind: "wiki" | "md"): { lead: string; sections: PreviewSection[] } {
  const source =
    kind === "md"
      ? raw
          .replace(/<!--Infobox Start[\s\S]*?<!--Infobox End-->/g, "\n")
          .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
          .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
          .replace(/[*_]{1,3}([^*_\n]+)[*_]{1,3}/g, "$1")
          .replace(/'{2,}/g, "")
      : raw;
  const heading = kind === "md" ? /^(#{1,3})\s+(.+?)\s*$/ : /^(={2,4})\s*(.+?)\s*\1\s*$/;
  const leadLines: string[] = [];
  const sections: PreviewSection[] = [];
  let current: { title: string; level: number; lines: string[] } | null = null;
  const push = () => {
    if (!current || sections.length >= 12) {
      current = null;
      return;
    }
    const title = current.title.replace(/\[([^\]]*)\]/g, "$1").replace(/\s+/g, " ").trim();
    const level = current.level;
    const text = plainClip(current.lines.join(" "), 480);
    current = null;
    if (!title || SKIP_SECTION.test(title) || level < 1 || level > 2) return;
    sections.push({ id: `s-${sections.length}`, title, level, text });
  };
  for (const line of source.split(/\n/)) {
    const match = line.match(heading);
    if (match) {
      const marks = match[1] ?? "";
      if (kind === "md" && marks.length === 1) {
        push();
        continue;
      }
      push();
      current = { title: match[2] ?? "", level: marks.length - 1, lines: [] };
      continue;
    }
    if (current) current.lines.push(line);
    else leadLines.push(line);
  }
  push();
  return { lead: plainClip(leadLines.join(" "), 700), sections };
}

/* ---------- Reader view for web results ---------- */

const READER_TIMEOUT_MS = 7000;
const READER_MAX_BYTES = 2_000_000;
const READER_MAX_REDIRECTS = 4;
const READER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 Folio/1.0";
const readerCache = new Map<string, { at: number; page: ReaderPage | null }>();

/** Refuse anything but public http(s) addresses on the default ports (no localhost, private ranges, or metadata IPs). */
async function assertPublicUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("unsupported address");
  if (url.username || url.password) throw new Error("unsupported address");
  if (url.port && url.port !== "80" && url.port !== "443") throw new Error("unsupported port");
  if (isPrivateHost(url.hostname)) throw new Error("private address");
  const { lookup } = await import("node:dns/promises");
  const addresses = await lookup(url.hostname.replace(/^\[|\]$/g, ""), { all: true });
  if (!addresses.length || addresses.some((row) => isPrivateHost(row.address))) throw new Error("private address");
  return url;
}

async function readCapped(response: Response): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array(await response.arrayBuffer()).slice(0, READER_MAX_BYTES);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < READER_MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    size += value.byteLength;
  }
  void reader.cancel().catch(() => undefined);
  const out = new Uint8Array(Math.min(size, READER_MAX_BYTES));
  let at = 0;
  for (const chunk of chunks) {
    const part = chunk.subarray(0, Math.max(0, out.length - at));
    out.set(part, at);
    at += part.length;
    if (at >= out.length) break;
  }
  return out;
}

/** Fetch a web result's page and pull out its readable text and headings. Null when it cannot be read. */
async function readWebPage(raw: string): Promise<ReaderPage | null> {
  const cached = readerCache.get(raw);
  if (cached && Date.now() - cached.at < 15 * 60 * 1000) return cached.page;
  let page: ReaderPage | null = null;
  try {
    const deadline = AbortSignal.timeout(READER_TIMEOUT_MS);
    let url = await assertPublicUrl(raw);
    let response: Response | null = null;
    for (let hop = 0; hop <= READER_MAX_REDIRECTS; hop += 1) {
      response = await fetch(url, {
        headers: { Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", "Accept-Language": "en;q=0.8,*;q=0.5", "User-Agent": READER_UA },
        redirect: "manual",
        signal: deadline,
      });
      const next = response.status >= 300 && response.status < 400 ? response.headers.get("location") : null;
      if (!next) break;
      void response.body?.cancel().catch(() => undefined);
      url = await assertPublicUrl(new URL(next, url).toString());
      response = null;
    }
    if (response?.ok && /html|xml/i.test(response.headers.get("content-type") ?? "")) {
      const bytes = await readCapped(response);
      const sniff = new TextDecoder("latin1").decode(bytes.subarray(0, 4096));
      let html: string;
      try {
        html = new TextDecoder(pageCharset(response.headers.get("content-type"), sniff)).decode(bytes);
      } catch {
        html = new TextDecoder("utf-8").decode(bytes);
      }
      const parsed = extractReadable(html, url.toString());
      if (parsed.lead.length >= 60 || parsed.sections.length > 0) page = parsed;
    } else if (response) {
      void response.body?.cancel().catch(() => undefined);
    }
  } catch {
    page = null;
  }
  readerCache.set(raw, { at: Date.now(), page });
  if (readerCache.size > 200) {
    const oldest = readerCache.keys().next().value;
    if (oldest) readerCache.delete(oldest);
  }
  return page;
}

function previewFallback(input: { source: SourceId; title: string; url: string; snippet: string }): HitPreview {
  const url = safeHttp(input.url) ?? input.url;
  return {
    source: input.source,
    title: input.title,
    kicker:
      input.source === "wiki"
        ? "Wikipedia"
        : input.source === "grok"
          ? "Grokipedia"
          : hostOf(url) || (input.source === "images" ? "Images" : "Web"),
    extract: clip(cleanSnippet(input.snippet), 420),
    url,
  };
}

export async function runPreview(input: {
  source: SourceId;
  title: string;
  url: string;
  snippet: string;
}): Promise<HitPreview> {
  const fallback = previewFallback(input);
  try {
    if (input.source === "wiki") {
      const origin = wikiHost(input.url);
      const url = `${origin}/api/rest_v1/page/summary/${encodeURIComponent(input.title)}`;
      const data = await getJson<WikiSummary>(url);
      const extract = data.extract?.trim() || fallback.extract;
      if (!extract) return fallback;
      let lead = clip(extract, 700);
      let sections: PreviewSection[] = [];
      try {
        const parsed = await getWikiJson<{ query?: { pages?: Record<string, { extract?: string }> } }>(
          `${origin}/w/api.php?action=query&format=json&redirects=1&prop=extracts&explaintext=1&exsectionformat=wiki&titles=${encodeURIComponent(data.title?.trim() || input.title)}`,
        );
        const page = Object.values(parsed.query?.pages ?? {})[0];
        if (page?.extract) {
          const parts = articleParts(page.extract, "wiki");
          if (parts.lead) lead = parts.lead;
          sections = parts.sections;
        }
      } catch {
        sections = [];
      }
      return {
        source: "wiki",
        title: data.title?.trim() || input.title,
        kicker: data.description?.trim() || "Wikipedia",
        extract: lead,
        url: safeHttp(data.content_urls?.desktop?.page ?? "") ?? fallback.url,
        image: wikiImage(data.thumbnail?.source),
        ...(sections.length ? { sections } : {}),
      };
    }
    if (input.source === "web") {
      const page = await readWebPage(fallback.url);
      if (!page) return { ...fallback, reader: "unavailable" };
      const sections = page.sections.filter((section) => section.title);
      return {
        source: "web",
        title: page.title || input.title,
        kicker: page.siteName || fallback.kicker,
        extract: page.lead || fallback.extract,
        url: fallback.url,
        ...(page.image ? { image: page.image } : {}),
        ...(sections.length ? { sections } : {}),
        reader: "ok",
      };
    }
    if (input.source === "grok") {
      const slug = grokSlug(input.url) || input.title;
      const data = await getJson<{ page?: { title?: string; content?: string } }>(
        `https://grokipedia.com/api/page-preview?slug=${encodeURIComponent(slug)}`,
      );
      const parts = articleParts(data.page?.content ?? "", "md");
      const extract = parts.lead || fallback.extract;
      return {
        source: "grok",
        title: data.page?.title?.trim() || input.title,
        kicker: "Grokipedia",
        extract,
        url: fallback.url,
        ...(parts.sections.length ? { sections: parts.sections } : {}),
      };
    }
  } catch {
    return fallback;
  }
  return fallback;
}
