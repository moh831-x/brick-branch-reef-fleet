import { GROK_PAGE, IMAGES_MAX_PAGE, IMAGES_PAGE, PAGE, WEB_PAGE } from "./search.shared";

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

export type AiAnswer = {
  text: string;
  vendor: "grok" | "chatgpt" | "claude";
  model: string;
  sources: { title: string; url: string; snippet?: string }[];
};

export type SearchPayload = {
  query: string;
  tookMs: number;
  web: SourceBlock;
  wiki: SourceBlock;
  grok: SourceBlock;
  images: SourceBlock;
  card: LeadCard | null;
  places: PlaceRef[];
  placesError?: string;
  near: string;
  definitions: WordDefinition[];
  deepDive: string[];
  ai: AiAnswer | null;
  aiError?: string;
  chatgpt: AiAnswer | null;
  chatgptError?: string;
  claude: AiAnswer | null;
  claudeError?: string;
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
  /** Optional answer written from the result text. Off unless asked. */
  ai: boolean;
  /** Optional ChatGPT note from the result text. Off unless asked. */
  chatgpt: boolean;
  /** Optional Claude note from the result text. Off unless asked. */
  claude: boolean;
  card: boolean;
  near: string;
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

export type HitPreview = {
  source: SourceId;
  title: string;
  kicker: string;
  extract: string;
  url: string;
  image?: string;
};

export type Suggestion = {
  title: string;
  source: "wiki" | "grok";
};

export type NetworkAd = {
  network: "Kevel";
  text: string;
  clickUrl: string;
  imageUrl?: string;
};

export type Trend = {
  title: string;
  snippet: string;
  slug: string;
  image?: string;
  entity: boolean;
};

const UA = "Mozilla/5.0 (compatible; Folio/1.0; personal research reader)";

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
    ai: null,
    chatgpt: null,
    claude: null,
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

async function searchWeb(query: string, offset: number, near: string): Promise<SourceBlock> {
  const first = Math.max(1, offset + 1);
  const q = near ? `${query} ${near}` : query;
  const rssUrl = `https://www.bing.com/search?q=${encodeURIComponent(q)}&format=rss&first=${first}&count=${WEB_PAGE}`;
  const htmlUrl = `https://www.bing.com/search?q=${encodeURIComponent(q)}&count=${WEB_PAGE}`;
  const [xml, html] = await Promise.all([
    getText(rssUrl, "application/rss+xml, application/xml, text/xml"),
    getText(htmlUrl, "text/html").catch(() => ""),
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
    const when = formatDay(decodeEntities(tag(block, "pubDate")));
    results.push({
      id: `web:${link}`,
      source: "web",
      title,
      url: link,
      snippet,
      meta: [host, when].filter(Boolean).join(" · "),
    });
    if (results.length >= WEB_PAGE) break;
  }
  return { results, total: readBingTotal(html), done: results.length < WEB_PAGE };
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

async function searchWiki(query: string, offset: number): Promise<{ block: SourceBlock; places: PlaceRef[] }> {
  const url =
    "https://en.wikipedia.org/w/api.php?action=query&format=json&list=search" +
    `&srsearch=${encodeURIComponent(query)}&srlimit=${PAGE}&sroffset=${offset}&srnamespace=0` +
    "&srprop=snippet|timestamp&srinfo=totalhits";
  const data = await getWikiJson<WikiSearchResponse>(url);
  const results: SearchHit[] = [];
  for (const row of data.query?.search ?? []) {
    const title = decodeEntities(row.title ?? "");
    if (!title) continue;
    const article = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
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
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
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

async function mapPlaces(query: string, near: string): Promise<PlaceRef[]> {
  const q = [query, near].filter(Boolean).join(" ").trim();
  if (!q) return [];
  const data = await getJson<{ results?: MeteoPlace[] }>(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=10&language=en&format=json`,
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

async function searchPlaces(query: string, near: string): Promise<PlaceRef[]> {
  const q = query.trim();
  if (!q && !near.trim()) return [];
  const [wikiResult, mapResult] = await Promise.allSettled([wikiSummaryPlace(q), mapPlaces(q, near)]);
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

async function readDeepDive(query: string): Promise<string[]> {
  const url = `https://api.bing.com/osjson.aspx?query=${encodeURIComponent(query)}`;
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

const aiCache = new Map<string, { at: number; value: AiAnswer }>();

function answerNotes(blocks: SourceBlock[]): { title: string; url: string; snippet: string }[] {
  const notes: { title: string; url: string; snippet: string }[] = [];
  for (const block of blocks) {
    for (const hit of block.results) {
      const snippet = hit.snippet.trim();
      if (!hit.title || !hit.url || snippet.length < 40) continue;
      notes.push({ title: hit.title, url: hit.url, snippet: snippet.slice(0, 240) });
      if (notes.length >= 6) return notes;
    }
  }
  return notes;
}

const ANSWER_SYSTEM =
  "Answer the query in 2 to 4 sentences using only the numbered sources. After each claim, cite the source numbers in brackets, such as [1] or [1][2]. Use only those brackets for citations. If the sources do not answer the query, say so in one sentence and do not add a citation. Do not invent dates or numbers that are not in the sources.";

async function chatCompletion(url: string, apiKey: string, model: string, user: string): Promise<string> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(12000),
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 360,
      messages: [
        { role: "system", content: ANSWER_SYSTEM },
        { role: "user", content: user },
      ],
    }),
  });
  if (!response.ok) throw new Error("did not respond");
  const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return (body.choices?.[0]?.message?.content ?? "").replace(/\s+/g, " ").trim().slice(0, 800);
}

async function claudeCompletion(apiKey: string, user: string): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    signal: AbortSignal.timeout(12000),
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 360,
      temperature: 0.2,
      system: ANSWER_SYSTEM,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!response.ok) throw new Error("did not respond");
  const body = (await response.json()) as { content?: Array<{ text?: string }> };
  return (body.content?.map((part) => part.text ?? "").join(" ") ?? "").replace(/\s+/g, " ").trim().slice(0, 800);
}

async function answerQuery(
  query: string,
  blocks: SourceBlock[],
  vendor: "grok" | "chatgpt" | "claude" = "grok",
): Promise<AiAnswer | null> {
  const sources = answerNotes(blocks);
  if (!sources.length) return null;
  const key = `${vendor}\n${query}\n${sources.map((item) => item.url).join("\n")}`;
  const cached = aiCache.get(key);
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.value;
  const user = `Query: ${query}\n\nSources:\n${sources
    .map((item, index) => `[${index + 1}] ${item.title}\n${item.url}\n${item.snippet}`)
    .join("\n\n")}`;
  const unavailable =
    vendor === "chatgpt"
      ? "ChatGPT search is not available right now."
      : vendor === "claude"
        ? "Claude search is not available right now."
        : "AI search is not available right now.";
  const silent =
    vendor === "chatgpt"
      ? "ChatGPT search did not respond."
      : vendor === "claude"
        ? "Claude search did not respond."
        : "AI search did not respond.";
  const apiKey =
    vendor === "chatgpt" ? process.env.OPENAI_API_KEY : vendor === "claude" ? process.env.ANTHROPIC_API_KEY : process.env.XAI_API_KEY;
  if (!apiKey) throw new Error(unavailable);
  let text = "";
  try {
    text =
      vendor === "claude"
        ? await claudeCompletion(apiKey, user)
        : await chatCompletion(
            vendor === "chatgpt" ? "https://api.openai.com/v1/chat/completions" : "https://api.x.ai/v1/chat/completions",
            apiKey,
            vendor === "chatgpt" ? "gpt-4.1-mini" : "grok-4.5",
            user,
          );
  } catch {
    throw new Error(silent);
  }
  if (!text) throw new Error(silent);
  const value: AiAnswer = {
    text,
    vendor,
    model: vendor === "chatgpt" ? "gpt-4.1-mini" : vendor === "claude" ? "claude-haiku-4-5" : "grok-4.5",
    sources: sources.map(({ title, url }) => ({ title, url })),
  };
  aiCache.set(key, { at: Date.now(), value });
  if (aiCache.size > 40) {
    const oldest = aiCache.keys().next().value;
    if (oldest) aiCache.delete(oldest);
  }
  return value;
}

export async function runSearch(input: SearchInput): Promise<SearchPayload> {
  const started = Date.now();
  const query = input.q.replace(/\s+/g, " ").trim();
  if (!input.web && !input.wiki && !input.grok && !input.images) {
    return { ...emptyPayload(query), tookMs: 0 };
  }

  const [web, wikiOutcome, grok, images, definitions, deepDive] = await Promise.all([
    input.web ? searchWeb(query, input.webOffset, input.near).catch(failed) : Promise.resolve(emptyBlock()),
    input.wiki
      ? searchWiki(query, input.wikiOffset).catch((error) => ({ block: failed(error), places: [] as PlaceRef[] }))
      : Promise.resolve({ block: emptyBlock(), places: [] as PlaceRef[] }),
    input.grok ? searchGrok(query, input.grokOffset).catch(failed) : Promise.resolve(emptyBlock()),
    input.images ? searchImages(query, input.imagesOffset).catch(failed) : Promise.resolve(emptyBlock()),
    defineQuery(input.card ? query : ""),
    input.web && input.webOffset === 0 ? readDeepDive(query).catch(() => []) : Promise.resolve([]),
  ]);
  const wiki = wikiOutcome.block;
  const firstPage =
    input.webOffset === 0 && input.wikiOffset === 0 && input.grokOffset === 0 && input.imagesOffset === 0;
  let ai: AiAnswer | null = null;
  let aiError: string | undefined;
  let chatgpt: AiAnswer | null = null;
  let chatgptError: string | undefined;
  let claude: AiAnswer | null = null;
  let claudeError: string | undefined;
  if (firstPage && (input.ai || input.chatgpt || input.claude)) {
    const take = async (on: boolean, vendor: "grok" | "chatgpt" | "claude") => {
      if (!on) return { answer: null as AiAnswer | null, error: undefined as string | undefined };
      try {
        const answer = await answerQuery(query, [web, wiki, grok], vendor);
        return {
          answer,
          error: answer ? undefined : "The results did not include enough text to answer.",
        };
      } catch (error) {
        return { answer: null, error: error instanceof Error ? error.message : "Search did not respond." };
      }
    };
    const [aiPack, chatgptPack, claudePack] = await Promise.all([
      take(input.ai, "grok"),
      take(input.chatgpt, "chatgpt"),
      take(input.claude, "claude"),
    ]);
    ai = aiPack.answer;
    aiError = aiPack.error;
    chatgpt = chatgptPack.answer;
    chatgptError = chatgptPack.error;
    claude = claudePack.answer;
    claudeError = claudePack.error;
  }

  let card: LeadCard | null = null;
  if (input.card && input.wiki && !wiki.error) {
    const lead =
      input.wikiOffset === 0
        ? wiki.results[0]
        : (await searchWiki(query, 0).catch(() => ({ block: emptyBlock(), places: [] as PlaceRef[] }))).block.results[0];
    if (lead) card = await wikiCard(lead.title, lead.url).catch(() => null);
  }
  if (!card && input.card && input.grok && !grok.error) {
    const lead =
      input.grokOffset === 0
        ? grok.results[0]
        : (await searchGrok(query, 0).catch(() => emptyBlock())).results[0];
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
      places = mergePlaces([wikiOutcome.places, await searchPlaces(query, input.near)]);
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
    card,
    places,
    placesError,
    near: input.near,
    definitions,
    deepDive,
    ai,
    aiError,
    chatgpt,
    chatgptError,
    claude,
    claudeError,
  };
}

type OpenSearch = [string, string[], string[], string[]];

export async function runSuggest(query: string): Promise<Suggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const wikiUrl =
    "https://en.wikipedia.org/w/api.php?action=opensearch&format=json&limit=5&namespace=0" +
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

function allowedAdUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    const allowed = host === "adzerk.net" || host === "kevel.com" || host === "zkcdn.net" || host.endsWith(".adzerk.net") || host.endsWith(".kevel.com") || host.endsWith(".zkcdn.net");
    return allowed ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function runNetworkAd(): Promise<NetworkAd | null> {
  const response = await fetch("https://e-23.adzerk.net/api/v2", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      placements: [{ divName: "folio", networkId: 23, siteId: 667480, adTypes: [5] }],
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;
  const data = (await response.json()) as {
    decisions?: {
      folio?: {
        clickUrl?: string;
        impressionUrl?: string;
        contents?: Array<{ body?: string; data?: { title?: string; imageUrl?: string } }>;
      };
    };
  };
  const decision = data.decisions?.folio;
  const content = decision?.contents?.[0];
  const clickUrl = allowedAdUrl(decision?.clickUrl);
  const imageUrl = allowedAdUrl(content?.data?.imageUrl) ?? undefined;
  const rawText = content?.data?.title || (content?.body ?? "").replace(/<[^>]+>/g, " ");
  const text = clip(decodeEntities(rawText), 180);
  if (!decision || !clickUrl || (!text && !imageUrl)) return null;
  const impression = allowedAdUrl(decision.impressionUrl);
  if (impression) {
    await fetch(impression, { signal: AbortSignal.timeout(4000) }).catch(() => undefined);
  }
  return { network: "Kevel", text, clickUrl, imageUrl };
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

function proseFromMarkdown(raw: string): string {
  const withoutBox = raw.replace(/<!--Infobox Start[\s\S]*?<!--Infobox End-->/g, "\n");
  const cleaned = withoutBox
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/[*_]{1,3}([^*_\n]+)[*_]{1,3}/g, "$1");
  const paragraphs = cleaned
    .split(/\n{2,}/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part.length > 80 && !part.startsWith("|"));
  return clip(paragraphs.slice(0, 3).join("\n\n"), 1100);
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
      const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(input.title)}`;
      const data = await getJson<WikiSummary>(url);
      const extract = data.extract?.trim() || fallback.extract;
      if (!extract) return fallback;
      return {
        source: "wiki",
        title: data.title?.trim() || input.title,
        kicker: data.description?.trim() || "Wikipedia",
        extract: clip(extract, 1100),
        url: safeHttp(data.content_urls?.desktop?.page ?? "") ?? fallback.url,
        image: wikiImage(data.thumbnail?.source),
      };
    }
    if (input.source === "grok") {
      const slug = grokSlug(input.url) || input.title;
      const data = await getJson<{ page?: { title?: string; content?: string } }>(
        `https://grokipedia.com/api/page-preview?slug=${encodeURIComponent(slug)}`,
      );
      const extract = proseFromMarkdown(data.page?.content ?? "") || fallback.extract;
      return {
        source: "grok",
        title: data.page?.title?.trim() || input.title,
        kicker: "Grokipedia",
        extract,
        url: fallback.url,
      };
    }
  } catch {
    return fallback;
  }
  return fallback;
}
