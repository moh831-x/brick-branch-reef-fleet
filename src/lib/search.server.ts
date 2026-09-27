import { GROK_PAGE, PAGE } from "./search.shared";

export type SourceId = "web" | "wiki" | "grok";

export type SearchHit = {
  id: string;
  source: SourceId;
  title: string;
  url: string;
  snippet: string;
  meta: string;
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
  card: LeadCard | null;
  places: PlaceRef[];
  placesError?: string;
  near: string;
  definitions: WordDefinition[];
};

export type SearchInput = {
  q: string;
  web: boolean;
  wiki: boolean;
  grok: boolean;
  webOffset: number;
  wikiOffset: number;
  grokOffset: number;
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
    card: null,
    places: [],
    near: "",
    definitions: [],
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
  const rssUrl = `https://www.bing.com/search?q=${encodeURIComponent(q)}&format=rss&first=${first}`;
  const htmlUrl = `https://www.bing.com/search?q=${encodeURIComponent(q)}&count=${PAGE}`;
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
    const snippet = clip(decodeEntities(tag(block, "description")));
    const when = formatDay(decodeEntities(tag(block, "pubDate")));
    results.push({
      id: `web:${link}`,
      source: "web",
      title,
      url: link,
      snippet,
      meta: [host, when].filter(Boolean).join(" · "),
    });
    if (results.length >= PAGE) break;
  }
  return { results, total: readBingTotal(html), done: results.length < PAGE };
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

export async function runSearch(input: SearchInput): Promise<SearchPayload> {
  const started = Date.now();
  const query = input.q.trim();
  if (!input.web && !input.wiki && !input.grok) {
    return { ...emptyPayload(query), tookMs: 0 };
  }

  const [web, wikiOutcome, grok, definitions] = await Promise.all([
    input.web ? searchWeb(query, input.webOffset, input.near).catch(failed) : Promise.resolve(emptyBlock()),
    input.wiki
      ? searchWiki(query, input.wikiOffset).catch((error) => ({ block: failed(error), places: [] as PlaceRef[] }))
      : Promise.resolve({ block: emptyBlock(), places: [] as PlaceRef[] }),
    input.grok ? searchGrok(query, input.grokOffset).catch(failed) : Promise.resolve(emptyBlock()),
    defineQuery(query),
  ]);
  const wiki = wikiOutcome.block;

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
    card,
    places,
    placesError,
    near: input.near,
    definitions,
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
    kicker: input.source === "wiki" ? "Wikipedia" : input.source === "grok" ? "Grokipedia" : hostOf(url) || "Web",
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
