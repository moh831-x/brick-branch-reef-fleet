function pageOf(value) {
	const raw = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
	if (!Number.isFinite(raw)) return void 0;
	const page = Math.floor(raw);
	if (page <= 1) return void 0;
	return Math.min(400, page);
}
function sourceFlag(value, fallback = true) {
	if (value === null || value.trim() === "") return fallback;
	const flag = value.trim().toLowerCase();
	return flag !== "0" && flag !== "false" && flag !== "off";
}
function pageOffset(value, size) {
	return ((pageOf(value) ?? 1) - 1) * size;
}
/** Parameters for GET /api/search. Web, Wikipedia, and Grokipedia default on; Images defaults off. Pages start at 1. */
function readBotSearch(params) {
	const q = (params.get("q") ?? "").replace(/\s+/g, " ").trim().slice(0, 180);
	if (!q) return { error: "Enter a search" };
	const web = sourceFlag(params.get("web"));
	const wiki = sourceFlag(params.get("wiki"));
	const grok = sourceFlag(params.get("grok"));
	const images = sourceFlag(params.get("images"), false);
	const ai = sourceFlag(params.get("ai"), true);
	const chatgpt = sourceFlag(params.get("chatgpt"), false);
	const claude = sourceFlag(params.get("claude"), false);
	if (!web && !wiki && !grok && !images) return { error: "Turn on Web, Wikipedia, Grokipedia, or Images" };
	return {
		q,
		web,
		wiki,
		grok,
		images,
		ai,
		chatgpt,
		claude,
		webOffset: pageOffset(params.get("webPage"), 10),
		wikiOffset: pageOffset(params.get("wikiPage"), 8),
		grokOffset: pageOffset(params.get("grokPage"), 12),
		imagesOffset: pageOffset(params.get("imagesPage"), 24)
	};
}
//#endregion
//#region src/lib/search.server.ts
var UA = "Mozilla/5.0 (compatible; Folio/1.0; personal research reader)";
function emptyBlock() {
	return {
		results: [],
		done: true
	};
}
function emptyPayload(query) {
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
		claude: null
	};
}
function decodeEntities(value) {
	const named = {
		amp: "&",
		lt: "<",
		gt: ">",
		quot: "\"",
		apos: "'",
		nbsp: " ",
		"#39": "'"
	};
	return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (all, entity) => {
		if (entity.startsWith("#x") || entity.startsWith("#X")) {
			const code = Number.parseInt(entity.slice(2), 16);
			return code > 0 && code < 1114112 ? String.fromCodePoint(code) : all;
		}
		if (entity.startsWith("#")) {
			const code = Number.parseInt(entity.slice(1), 10);
			return code > 0 && code < 1114112 ? String.fromCodePoint(code) : all;
		}
		return named[entity] ?? all;
	}).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function cleanSnippet(value) {
	return value.replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\[([^\]]*)\]\([^)]*$/g, "$1").replace(/\s+/g, " ").trim();
}
function clip(value, max = 320) {
	if (value.length <= max) return value;
	return `${value.slice(0, max - 1).trimEnd()}…`;
}
function safeHttp(value) {
	try {
		const url = new URL(value.trim());
		if (url.protocol !== "http:" && url.protocol !== "https:") return null;
		return url.toString();
	} catch {
		return null;
	}
}
function hostOf(value) {
	try {
		return new URL(value).hostname.replace(/^www\./, "");
	} catch {
		return "";
	}
}
function formatDay(value) {
	if (!value) return void 0;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return void 0;
	return date.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC"
	});
}
async function getText(url, accept) {
	const response = await fetch(url, {
		headers: {
			Accept: accept,
			"User-Agent": UA
		},
		signal: AbortSignal.timeout(9e3),
		redirect: "follow"
	});
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	return response.text();
}
async function getJson(url) {
	const text = await getText(url, "application/json");
	return JSON.parse(text);
}
var WIKI_UA = "Folio/1.0 (personal research reader)";
var wikiJsonCache = /* @__PURE__ */ new Map();
var wikiTail = Promise.resolve();
function wikiTurn(task) {
	const run = wikiTail.then(task, task);
	wikiTail = run.then(() => new Promise((resolve) => setTimeout(resolve, 300)), () => new Promise((resolve) => setTimeout(resolve, 300)));
	return run;
}
async function readWiki(url, timeoutMs) {
	const response = await fetch(url, {
		headers: {
			Accept: "application/json",
			"User-Agent": WIKI_UA,
			"Api-User-Agent": WIKI_UA
		},
		signal: AbortSignal.timeout(timeoutMs),
		redirect: "follow"
	});
	const retryHeader = Number(response.headers.get("retry-after"));
	return {
		status: response.status,
		retryAfter: Number.isFinite(retryHeader) ? retryHeader : 0,
		text: response.ok ? await response.text() : ""
	};
}
async function getWikiJson(url) {
	const cached = wikiJsonCache.get(url);
	if (cached && Date.now() - cached.at < 6e5) return cached.data;
	return wikiTurn(async () => {
		const fresh = wikiJsonCache.get(url);
		if (fresh && Date.now() - fresh.at < 6e5) return fresh.data;
		let attempt = await readWiki(url, 8e3);
		if (attempt.status === 429) {
			const waitMs = Math.min(2e4, Math.max(1e3, (attempt.retryAfter || 2) * 1e3));
			await new Promise((resolve) => setTimeout(resolve, waitMs));
			attempt = await readWiki(url, 8e3);
		}
		if (attempt.status < 200 || attempt.status >= 300 || !attempt.text) throw new Error(`HTTP ${attempt.status}`);
		const data = JSON.parse(attempt.text);
		wikiJsonCache.set(url, {
			at: Date.now(),
			data
		});
		if (wikiJsonCache.size > 40) {
			const oldest = wikiJsonCache.keys().next().value;
			if (oldest) wikiJsonCache.delete(oldest);
		}
		return data;
	});
}
function tag(block, name) {
	return block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"))?.[1]?.trim() ?? "";
}
function readBingTotal(html) {
	const nums = [...(html.match(/class="sb_count"[^>]*>([^<]+)/i)?.[1] ?? "").replace(/,/g, "").matchAll(/\d+/g)].map((match) => Number(match[0]));
	if (!nums.length) return void 0;
	const total = Math.max(...nums);
	if (!Number.isFinite(total) || total <= 0 || total > 2e9) return void 0;
	return total;
}
async function searchWeb(query, offset, near) {
	const first = Math.max(1, offset + 1);
	const q = near ? `${query} ${near}` : query;
	const rssUrl = `https://www.bing.com/search?q=${encodeURIComponent(q)}&format=rss&first=${first}&count=10`;
	const htmlUrl = `https://www.bing.com/search?q=${encodeURIComponent(q)}&count=10`;
	const [xml, html] = await Promise.all([getText(rssUrl, "application/rss+xml, application/xml, text/xml"), getText(htmlUrl, "text/html").catch(() => "")]);
	const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)];
	const results = [];
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
			meta: [host, when].filter(Boolean).join(" · ")
		});
		if (results.length >= 10) break;
	}
	return {
		results,
		total: readBingTotal(html),
		done: results.length < 10
	};
}
async function searchWiki(query, offset) {
	const data = await getWikiJson(`https://en.wikipedia.org/w/api.php?action=query&format=json&list=search&srsearch=${encodeURIComponent(query)}&srlimit=8&sroffset=${offset}&srnamespace=0&srprop=snippet|timestamp&srinfo=totalhits`);
	const results = [];
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
			meta: formatDay(row.timestamp) ?? "Wikipedia"
		});
	}
	const total = data.query?.searchinfo?.totalhits;
	return {
		block: {
			results,
			total,
			done: results.length < 8 || typeof total === "number" && offset + results.length >= total
		},
		places: []
	};
}
function wikiImage(value) {
	if (!value) return void 0;
	try {
		const url = new URL(value);
		if (url.protocol !== "https:") return void 0;
		if (!url.hostname.endsWith("wikipedia.org") && !url.hostname.endsWith("wikimedia.org")) return;
		return url.toString();
	} catch {
		return;
	}
}
async function wikiCard(title, fallbackUrl) {
	const data = await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
	const extract = clip(data.extract?.trim() ?? "", 420);
	if (!extract) return null;
	const page = safeHttp(data.content_urls?.desktop?.page ?? "") ?? fallbackUrl;
	return {
		source: "wiki",
		title: data.title?.trim() || title,
		kicker: data.description?.trim() || "Wikipedia",
		extract,
		url: page,
		image: wikiImage(data.thumbnail?.source)
	};
}
async function searchGrok(query, offset) {
	const data = await getJson(`https://grokipedia.com/api/full-text-search?query=${encodeURIComponent(query)}&limit=12&offset=${offset}`);
	const results = [];
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
			meta: "grokipedia.com"
		});
	}
	const total = typeof data.totalCount === "number" ? data.totalCount : void 0;
	return {
		results,
		total,
		done: results.length < 12 || typeof total === "number" && offset + results.length >= total
	};
}
/** Bing hands back up to this many images per request. */
var BING_IMAGE_BATCH = 35;
/** Safe search for images. Bing's default for the web feed is Moderate; images ask for it explicitly. */
var IMAGE_SAFE_SEARCH = "moderate";
var imagePoolCache = /* @__PURE__ */ new Map();
function unescapeAttr(value) {
	return value.replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
function bingThumb(value) {
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
function dimension(value) {
	const n = Number(value);
	return Number.isFinite(n) && n > 0 && n < 1e5 ? Math.round(n) : void 0;
}
/** Parse the image tiles from Bing's public image results markup. */
function parseBingImages(html) {
	const hits = [];
	const tiles = html.split(/\sm="(?=\{)/).slice(1);
	for (const tile of tiles) {
		const end = tile.indexOf("\"");
		if (end < 0) continue;
		let meta;
		try {
			meta = JSON.parse(unescapeAttr(tile.slice(0, end)));
		} catch {
			continue;
		}
		const page = typeof meta.purl === "string" ? safeHttp(meta.purl) : null;
		const thumb = bingThumb(meta.turl);
		if (!page || !thumb) continue;
		const host = hostOf(page);
		if (!host || host.endsWith("bing.com")) continue;
		const media = typeof meta.murl === "string" ? safeHttp(meta.murl) : null;
		const title = clip(decodeEntities((typeof meta.t === "string" ? meta.t : typeof meta.desc === "string" ? meta.desc : "").replace(/[\ue000-\ue001]/g, "")), 140) || host;
		const rest = tile.slice(end, end + 4e3);
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
				full: media && media.startsWith("https:") ? media : thumb,
				width,
				height
			}
		});
	}
	return hits;
}
async function imageBatch(query, first) {
	return parseBingImages(await getText(`https://www.bing.com/images/async?q=${encodeURIComponent(query)}&first=${first}&count=${BING_IMAGE_BATCH}&adlt=${IMAGE_SAFE_SEARCH}`, "text/html"));
}
async function searchImages(query, offset) {
	const cap = 240;
	if (offset >= cap) return {
		results: [],
		done: true
	};
	const want = Math.min(cap, offset + 24 + 1);
	const key = query.toLowerCase();
	const cached = imagePoolCache.get(key);
	const fresh = cached && Date.now() - cached.at < 6e5 ? cached : null;
	const hits = fresh ? [...fresh.hits] : [];
	let exhausted = fresh?.exhausted ?? false;
	const seen = new Set(hits.map((hit) => hit.id));
	let batch = Math.ceil(hits.length / BING_IMAGE_BATCH);
	while (!exhausted && hits.length < want && batch <= Math.ceil(cap / BING_IMAGE_BATCH)) {
		let rows;
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
	imagePoolCache.set(key, {
		at: fresh?.at ?? Date.now(),
		hits,
		exhausted
	});
	if (imagePoolCache.size > 40) {
		const oldest = imagePoolCache.keys().next().value;
		if (oldest) imagePoolCache.delete(oldest);
	}
	const results = hits.slice(offset, offset + 24);
	return {
		results,
		done: results.length < 24 || offset + 24 >= cap || exhausted && hits.length <= offset + 24
	};
}
function failed(error) {
	return {
		results: [],
		error: error instanceof Error ? error.message : "Unavailable",
		done: true
	};
}
function pointOf(lat, lon) {
	if (typeof lat !== "number" || typeof lon !== "number") return null;
	if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
	if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
	return {
		lat,
		lon
	};
}
function mapLink(lat, lon) {
	return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=13/${lat}/${lon}`;
}
async function wikiSummaryPlace(query) {
	const title = query.trim();
	if (!title) return null;
	try {
		const data = await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`);
		const name = data.title?.trim();
		const point = pointOf(data.coordinates?.lat, data.coordinates?.lon);
		if (!name || !point || data.type === "disambiguation") return null;
		const article = safeHttp(data.content_urls?.desktop?.page ?? "") ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(name.replace(/ /g, "_"))}`;
		return {
			id: `wiki:${name}`,
			name,
			detail: data.description?.trim() || "Wikipedia",
			lat: point.lat,
			lon: point.lon,
			url: article,
			map: mapLink(point.lat, point.lon),
			source: "wiki"
		};
	} catch {
		return null;
	}
}
function featureLabel(code) {
	switch (code) {
		case "PPLC":
		case "PPLA":
		case "PPLA2":
		case "PPLA3":
		case "PPLA4":
		case "PPL":
		case "PPLS": return "City";
		case "PPLX": return "Neighborhood";
		case "ADM1": return "Region";
		case "ADM2": return "County";
		case "ISL": return "Island";
		case "MT":
		case "MTS": return "Mountain";
		case "LK":
		case "LKS": return "Lake";
		case "STM": return "River";
		case "BCH": return "Beach";
		case "AIRP": return "Airport";
		case "PRK": return "Park";
		default: return "Place";
	}
}
function mentionsQuery(query, name, region) {
	const tokens = query.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2);
	if (!tokens.length) return false;
	const words = `${name} ${region}`.toLowerCase().split(/[^a-z0-9]+/);
	return tokens.every((token) => words.includes(token));
}
async function mapPlaces(query, near) {
	const q = [query, near].filter(Boolean).join(" ").trim();
	if (!q) return [];
	const rows = [...(await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=10&language=en&format=json`)).results ?? []].sort((a, b) => (b.population ?? 0) - (a.population ?? 0));
	const places = [];
	const seen = /* @__PURE__ */ new Set();
	for (const row of rows) {
		const name = row.name?.trim();
		const point = pointOf(row.latitude, row.longitude);
		if (!name || !point) continue;
		if (!mentionsQuery(query, name, [row.admin1, row.country].filter(Boolean).join(" "))) continue;
		const key = name.toLowerCase();
		if (seen.has(key)) continue;
		const detail = [
			featureLabel(row.feature_code),
			row.admin1,
			row.country
		].filter((part, index, all) => {
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
			source: "map"
		});
		seen.add(key);
		if (places.length >= 6) break;
	}
	return places;
}
function mergePlaces(groups) {
	const places = [];
	const seen = /* @__PURE__ */ new Set();
	for (const group of groups) for (const place of group) {
		const key = place.name.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		places.push(place);
		if (places.length >= 6) return places;
	}
	return places;
}
async function searchPlaces(query, near) {
	const q = query.trim();
	if (!q && !near.trim()) return [];
	const [wikiResult, mapResult] = await Promise.allSettled([wikiSummaryPlace(q), mapPlaces(q, near)]);
	const places = mergePlaces([wikiResult.status === "fulfilled" && wikiResult.value ? [wikiResult.value] : [], mapResult.status === "fulfilled" ? mapResult.value : []]);
	if (!places.length && mapResult.status === "rejected") {
		const reason = mapResult.reason;
		throw reason instanceof Error ? reason : /* @__PURE__ */ new Error("Unavailable");
	}
	return places;
}
var SPEECH = {
	n: "noun",
	v: "verb",
	adj: "adjective",
	adv: "adverb",
	u: "interjection"
};
function sameWord(query, word) {
	const fold = (value) => value.toLowerCase().replace(/[^a-z]/g, "");
	return fold(query) === fold(word);
}
async function defineWord(word) {
	const clean = word.trim().toLowerCase();
	if (!/^[a-z][a-z' -]{0,48}$/i.test(clean)) return null;
	const entry = (await getJson(`https://api.datamuse.com/words?sp=${encodeURIComponent(clean)}&md=d&max=1`)).find((item) => item.word && sameWord(clean, item.word) && item.defs?.length) ?? null;
	if (!entry?.word || !entry.defs?.length) return null;
	const senses = [];
	for (const line of entry.defs) {
		const [code, text] = line.split("	");
		const definition = text?.trim();
		if (!definition) continue;
		senses.push({
			part: SPEECH[code?.trim() ?? ""] || "word",
			definition: clip(definition, 220)
		});
	}
	senses.sort((left, right) => Number(nicheSense(left.definition)) - Number(nicheSense(right.definition)));
	const picked = senses.slice(0, 3);
	if (!picked.length) return null;
	return {
		word: entry.word,
		senses: picked,
		source: "https://wordnet.princeton.edu/"
	};
}
function nicheSense(definition) {
	return /^\((?:now |chiefly |law\b|obsolete|rare|archaic|dialect|dated)/i.test(definition);
}
async function defineQuery(query) {
	const phrase = query.trim();
	const words = phrase.split(/\s+/).filter(Boolean);
	if (!words.length || words.length > 4) return [];
	if (/[^\p{L}\s'-]/u.test(phrase)) return [];
	try {
		const whole = await defineWord(phrase);
		if (whole) return [whole];
	} catch {}
	if (words.length < 2) return [];
	return (await Promise.all([...new Set(words.map((word) => word.toLowerCase()))].filter((word) => word.length > 2).slice(0, 3).map((word) => defineWord(word).catch(() => null)))).filter((item) => item !== null).slice(0, 2);
}
async function readDeepDive(query) {
	const data = await getJson(`https://api.bing.com/osjson.aspx?query=${encodeURIComponent(query)}`);
	const rows = Array.isArray(data?.[1]) ? data[1] : [];
	const base = query.trim().toLowerCase();
	const seen = /* @__PURE__ */ new Set();
	const items = [];
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
function labelDive(value) {
	const upper = /* @__PURE__ */ new Set([
		"tv",
		"nfl",
		"nba",
		"mlb",
		"ufc",
		"pga",
		"lpga",
		"us",
		"usa",
		"uk"
	]);
	const small = /* @__PURE__ */ new Set([
		"a",
		"an",
		"and",
		"of",
		"the",
		"for",
		"to",
		"in",
		"on",
		"vs"
	]);
	return value.split(" ").map((word, index) => {
		const lower = word.toLowerCase();
		if (upper.has(lower)) return lower.toUpperCase();
		if (index > 0 && small.has(lower)) return lower;
		return lower.replace(/^([a-z])/, (letter) => letter.toUpperCase());
	}).join(" ");
}
var aiCache = /* @__PURE__ */ new Map();
function answerNotes(blocks) {
	const notes = [];
	for (const block of blocks) for (const hit of block.results) {
		const snippet = hit.snippet.trim();
		if (!hit.title || !hit.url || snippet.length < 40) continue;
		notes.push({
			title: hit.title,
			url: hit.url,
			snippet: snippet.slice(0, 240)
		});
		if (notes.length >= 6) return notes;
	}
	return notes;
}
var ANSWER_SYSTEM = "Answer the query in 2 to 4 sentences using only the numbered sources. After each claim, cite the source numbers in brackets, such as [1] or [1][2]. Use only those brackets for citations. If the sources do not answer the query, say so in one sentence and do not add a citation. Do not invent dates or numbers that are not in the sources.";
async function chatCompletion(url, apiKey, model, user) {
	const response = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`
		},
		signal: AbortSignal.timeout(12e3),
		body: JSON.stringify({
			model,
			temperature: .2,
			max_tokens: 360,
			messages: [{
				role: "system",
				content: ANSWER_SYSTEM
			}, {
				role: "user",
				content: user
			}]
		})
	});
	if (!response.ok) throw new Error("did not respond");
	return ((await response.json()).choices?.[0]?.message?.content ?? "").replace(/\s+/g, " ").trim().slice(0, 800);
}
async function claudeCompletion(apiKey, user) {
	const response = await fetch("https://api.anthropic.com/v1/messages", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-api-key": apiKey,
			"anthropic-version": "2023-06-01"
		},
		signal: AbortSignal.timeout(12e3),
		body: JSON.stringify({
			model: "claude-haiku-4-5",
			max_tokens: 360,
			temperature: .2,
			system: ANSWER_SYSTEM,
			messages: [{
				role: "user",
				content: user
			}]
		})
	});
	if (!response.ok) throw new Error("did not respond");
	return ((await response.json()).content?.map((part) => part.text ?? "").join(" ") ?? "").replace(/\s+/g, " ").trim().slice(0, 800);
}
async function answerQuery(query, blocks, vendor = "grok") {
	const sources = answerNotes(blocks);
	if (!sources.length) return null;
	const key = `${vendor}\n${query}\n${sources.map((item) => item.url).join("\n")}`;
	const cached = aiCache.get(key);
	if (cached && Date.now() - cached.at < 6e5) return cached.value;
	const user = `Query: ${query}\n\nSources:\n${sources.map((item, index) => `[${index + 1}] ${item.title}\n${item.url}\n${item.snippet}`).join("\n\n")}`;
	const unavailable = vendor === "chatgpt" ? "ChatGPT search is not available right now." : vendor === "claude" ? "Claude search is not available right now." : "AI search is not available right now.";
	const silent = vendor === "chatgpt" ? "ChatGPT search did not respond." : vendor === "claude" ? "Claude search did not respond." : "AI search did not respond.";
	const apiKey = vendor === "chatgpt" ? process.env.OPENAI_API_KEY : vendor === "claude" ? process.env.ANTHROPIC_API_KEY : process.env.XAI_API_KEY;
	if (!apiKey) throw new Error(unavailable);
	let text = "";
	try {
		text = vendor === "claude" ? await claudeCompletion(apiKey, user) : await chatCompletion(vendor === "chatgpt" ? "https://api.openai.com/v1/chat/completions" : "https://api.x.ai/v1/chat/completions", apiKey, vendor === "chatgpt" ? "gpt-4.1-mini" : "grok-4.5", user);
	} catch {
		throw new Error(silent);
	}
	if (!text) throw new Error(silent);
	const value = {
		text,
		vendor,
		model: vendor === "chatgpt" ? "gpt-4.1-mini" : vendor === "claude" ? "claude-haiku-4-5" : "grok-4.5",
		sources: sources.map(({ title, url }) => ({
			title,
			url
		}))
	};
	aiCache.set(key, {
		at: Date.now(),
		value
	});
	if (aiCache.size > 40) {
		const oldest = aiCache.keys().next().value;
		if (oldest) aiCache.delete(oldest);
	}
	return value;
}
async function runSearch(input) {
	const started = Date.now();
	const query = input.q.replace(/\s+/g, " ").trim();
	if (!input.web && !input.wiki && !input.grok && !input.images) return {
		...emptyPayload(query),
		tookMs: 0
	};
	const [web, wikiOutcome, grok, images, definitions, deepDive] = await Promise.all([
		input.web ? searchWeb(query, input.webOffset, input.near).catch(failed) : Promise.resolve(emptyBlock()),
		input.wiki ? searchWiki(query, input.wikiOffset).catch((error) => ({
			block: failed(error),
			places: []
		})) : Promise.resolve({
			block: emptyBlock(),
			places: []
		}),
		input.grok ? searchGrok(query, input.grokOffset).catch(failed) : Promise.resolve(emptyBlock()),
		input.images ? searchImages(query, input.imagesOffset).catch(failed) : Promise.resolve(emptyBlock()),
		defineQuery(input.card ? query : ""),
		input.web && input.webOffset === 0 ? readDeepDive(query).catch(() => []) : Promise.resolve([])
	]);
	const wiki = wikiOutcome.block;
	const firstPage = input.webOffset === 0 && input.wikiOffset === 0 && input.grokOffset === 0 && input.imagesOffset === 0;
	let ai = null;
	let aiError;
	let chatgpt = null;
	let chatgptError;
	let claude = null;
	let claudeError;
	if (firstPage && (input.ai || input.chatgpt || input.claude)) {
		const take = async (on, vendor) => {
			if (!on) return {
				answer: null,
				error: void 0
			};
			try {
				const answer = await answerQuery(query, [
					web,
					wiki,
					grok
				], vendor);
				return {
					answer,
					error: answer ? void 0 : "The results did not include enough text to answer."
				};
			} catch (error) {
				return {
					answer: null,
					error: error instanceof Error ? error.message : "Search did not respond."
				};
			}
		};
		const [aiPack, chatgptPack, claudePack] = await Promise.all([
			take(input.ai, "grok"),
			take(input.chatgpt, "chatgpt"),
			take(input.claude, "claude")
		]);
		ai = aiPack.answer;
		aiError = aiPack.error;
		chatgpt = chatgptPack.answer;
		chatgptError = chatgptPack.error;
		claude = claudePack.answer;
		claudeError = claudePack.error;
	}
	let card = null;
	if (input.card && input.wiki && !wiki.error) {
		const lead = input.wikiOffset === 0 ? wiki.results[0] : (await searchWiki(query, 0).catch(() => ({
			block: emptyBlock(),
			places: []
		}))).block.results[0];
		if (lead) card = await wikiCard(lead.title, lead.url).catch(() => null);
	}
	if (!card && input.card && input.grok && !grok.error) {
		const lead = input.grokOffset === 0 ? grok.results[0] : (await searchGrok(query, 0).catch(() => emptyBlock())).results[0];
		if (lead) card = {
			source: "grok",
			title: lead.title,
			kicker: "Grokipedia",
			extract: lead.snippet || "Open the article for the full entry.",
			url: lead.url
		};
	}
	let places = [];
	let placesError;
	if (input.card) try {
		places = mergePlaces([wikiOutcome.places, await searchPlaces(query, input.near)]);
	} catch (error) {
		places = wikiOutcome.places;
		if (!places.length) placesError = error instanceof Error ? error.message : "Unavailable";
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
		claudeError
	};
}
//#endregion
//#region server/routes/api/search.get.ts
function block(source) {
	return {
		...typeof source.total === "number" ? { total: source.total } : {},
		...source.error ? { error: source.error } : {},
		done: source.done,
		results: source.results.map((hit) => ({
			title: hit.title,
			url: hit.url,
			snippet: hit.snippet,
			meta: hit.meta,
			...hit.image ? {
				image: hit.image.full,
				thumbnail: hit.image.thumb,
				...hit.image.width && hit.image.height ? {
					width: hit.image.width,
					height: hit.image.height
				} : {}
			} : {}
		}))
	};
}
async function searchRoute(event) {
	const parsed = readBotSearch(event.url.searchParams);
	if ("error" in parsed) return Response.json({ error: parsed.error }, {
		status: 400,
		headers: { "cache-control": "no-store" }
	});
	try {
		const data = await runSearch({
			...parsed,
			card: false,
			near: ""
		});
		return Response.json({
			query: data.query,
			tookMs: data.tookMs,
			web: block(data.web),
			wiki: block(data.wiki),
			grok: block(data.grok),
			...parsed.images ? { images: block(data.images) } : {},
			...parsed.ai ? {
				ai: data.ai,
				...data.aiError ? { aiError: data.aiError } : {}
			} : {},
			...parsed.chatgpt ? {
				chatgpt: data.chatgpt,
				...data.chatgptError ? { chatgptError: data.chatgptError } : {}
			} : {},
			...parsed.claude ? {
				claude: data.claude,
				...data.claudeError ? { claudeError: data.claudeError } : {}
			} : {},
			deepDive: data.deepDive
		}, { headers: { "cache-control": "no-store" } });
	} catch {
		return Response.json({ error: "Search failed" }, {
			status: 502,
			headers: { "cache-control": "no-store" }
		});
	}
}
//#endregion
export { searchRoute as default };
