import { n as TSS_SERVER_FUNCTION, t as createServerFn } from "./ssr.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/search.functions-C64iAh-K.js
var createServerRpc = (serverFnMeta, splitImportFn) => {
	const url = "/_serverFn/" + serverFnMeta.id;
	return Object.assign(splitImportFn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
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
		card: null,
		places: [],
		near: "",
		definitions: [],
		deepDive: []
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
async function runSearch(input) {
	const started = Date.now();
	const query = input.q.replace(/\s+/g, " ").trim();
	if (!input.web && !input.wiki && !input.grok) return {
		...emptyPayload(query),
		tookMs: 0
	};
	const [web, wikiOutcome, grok, definitions, deepDive] = await Promise.all([
		input.web ? searchWeb(query, input.webOffset, input.near).catch(failed) : Promise.resolve(emptyBlock()),
		input.wiki ? searchWiki(query, input.wikiOffset).catch((error) => ({
			block: failed(error),
			places: []
		})) : Promise.resolve({
			block: emptyBlock(),
			places: []
		}),
		input.grok ? searchGrok(query, input.grokOffset).catch(failed) : Promise.resolve(emptyBlock()),
		defineQuery(input.card ? query : ""),
		input.web && input.webOffset === 0 ? readDeepDive(query).catch(() => []) : Promise.resolve([])
	]);
	const wiki = wikiOutcome.block;
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
		card,
		places,
		placesError,
		near: input.near,
		definitions,
		deepDive
	};
}
async function runSuggest(query) {
	const q = query.trim();
	if (q.length < 2) return [];
	const wikiUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&format=json&limit=5&namespace=0&search=${encodeURIComponent(q)}`;
	const grokUrl = `https://grokipedia.com/api/typeahead?query=${encodeURIComponent(q)}&limit=5`;
	const [wiki, grok] = await Promise.all([getWikiJson(wikiUrl).catch(() => null), getJson(grokUrl).catch(() => null)]);
	const suggestions = [];
	const seen = /* @__PURE__ */ new Set();
	const push = (title, source) => {
		const clean = title?.trim();
		if (!clean) return;
		const key = clean.toLowerCase();
		if (seen.has(key)) return;
		seen.add(key);
		suggestions.push({
			title: clean,
			source
		});
	};
	for (const title of wiki?.[1] ?? []) push(title, "wiki");
	for (const row of grok?.results ?? []) push(row.title, "grok");
	return suggestions.slice(0, 7);
}
function readJsonArray(source, marker) {
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
			else if (char === "\"") inString = false;
			continue;
		}
		if (char === "\"") inString = true;
		else if (char === "[") depth += 1;
		else if (char === "]") {
			depth -= 1;
			if (depth === 0) try {
				const parsed = JSON.parse(source.slice(start, index + 1));
				return Array.isArray(parsed) ? parsed : [];
			} catch {
				return [];
			}
		}
	}
	return [];
}
function tidyTrend(title, snippet) {
	const parts = snippet.split(/\n+/).map((part) => cleanSnippet(part).replace(/\\([()])/g, "$1")).map((part) => part.replace(/^[)\s]+/, "").trim()).filter(Boolean).filter((part) => !/\.(?:jpe?g|png|gif|webp)\)?$/i.test(part)).filter((part) => !/\)\s*$/.test(part) || /\b(?:is|was|are|were)\b/i.test(part));
	let text = (parts.filter((part) => /\b(?:is|was|are|were)\b/i.test(part)).at(-1) || parts.at(-1) || cleanSnippet(snippet)).trim();
	const lead = title.trim();
	if (lead && text.toLowerCase().startsWith(lead.toLowerCase())) {
		const rest = text.slice(lead.length).trim();
		if (rest) text = /^[,.;:]/.test(rest) ? `${lead}${rest}` : `${lead} ${rest}`;
	}
	return clip(text, 160);
}
function allowedAdUrl(value) {
	if (typeof value !== "string") return null;
	try {
		const url = new URL(value);
		if (url.protocol !== "https:") return null;
		const host = url.hostname.toLowerCase();
		return host === "adzerk.net" || host === "kevel.com" || host === "zkcdn.net" || host.endsWith(".adzerk.net") || host.endsWith(".kevel.com") || host.endsWith(".zkcdn.net") ? url.toString() : null;
	} catch {
		return null;
	}
}
async function runNetworkAd() {
	const response = await fetch("https://e-23.adzerk.net/api/v2", {
		method: "POST",
		headers: {
			Accept: "application/json",
			"Content-Type": "application/json"
		},
		body: JSON.stringify({ placements: [{
			divName: "folio",
			networkId: 23,
			siteId: 667480,
			adTypes: [5]
		}] }),
		signal: AbortSignal.timeout(8e3)
	});
	if (!response.ok) return null;
	const decision = (await response.json()).decisions?.folio;
	const content = decision?.contents?.[0];
	const clickUrl = allowedAdUrl(decision?.clickUrl);
	const imageUrl = allowedAdUrl(content?.data?.imageUrl) ?? void 0;
	const text = clip(decodeEntities(content?.data?.title || (content?.body ?? "").replace(/<[^>]+>/g, " ")), 180);
	if (!decision || !clickUrl || !text && !imageUrl) return null;
	const impression = allowedAdUrl(decision.impressionUrl);
	if (impression) await fetch(impression, { signal: AbortSignal.timeout(4e3) }).catch(() => void 0);
	return {
		network: "Kevel",
		text,
		clickUrl,
		imageUrl
	};
}
var trendCache = null;
function rssTag(block, name) {
	return decodeEntities(block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "i"))?.[1]?.trim() ?? "");
}
function safeTrendImage(value) {
	try {
		const url = new URL(value);
		if (url.protocol !== "https:") return void 0;
		if (!url.hostname.endsWith("gstatic.com") && !url.hostname.endsWith("googleusercontent.com")) return void 0;
		return url.toString();
	} catch {
		return;
	}
}
function looksLikePerson(title) {
	if (/\d/.test(title)) return false;
	const stop = /* @__PURE__ */ new Set([
		"the",
		"a",
		"an",
		"of",
		"and",
		"vs",
		"at",
		"in",
		"on",
		"for",
		"cup",
		"house",
		"club",
		"city",
		"united",
		"fc",
		"score",
		"show",
		"news"
	]);
	const words = title.trim().split(/\s+/);
	if (words.length < 2 || words.length > 3) return false;
	return words.every((word) => /^[a-z][a-z'.-]{1,}$/i.test(word) && !stop.has(word.toLowerCase()));
}
function titleCase(value) {
	return value.replace(/\b([a-z])/g, (_, letter) => letter.toUpperCase());
}
function parseGoogleTrends(xml) {
	const rows = [];
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
			image: entity ? image : void 0,
			entity
		});
		if (rows.length >= 8) break;
	}
	return rows;
}
async function grokTrends() {
	return readJsonArray(await getText("https://grokipedia.com/", "text/html"), "trendingPages").map((row) => {
		if (typeof row !== "object" || row === null) return null;
		const item = row;
		const title = item.title?.trim();
		const slug = item.slug?.trim();
		if (!title || !slug) return null;
		return {
			title,
			slug,
			snippet: tidyTrend(title, item.snippet ?? ""),
			entity: false
		};
	}).filter((row) => row !== null).slice(0, 8);
}
async function runTrending() {
	if (trendCache && Date.now() - trendCache.at < 6e5) return trendCache.rows;
	let rows = [];
	try {
		rows = parseGoogleTrends(await getText("https://trends.google.com/trending/rss?geo=US", "application/rss+xml, application/xml, text/xml"));
	} catch {
		rows = [];
	}
	if (rows.length < 4) try {
		rows = await grokTrends();
	} catch {
		rows = [];
	}
	if (rows.length) trendCache = {
		at: Date.now(),
		rows
	};
	return rows;
}
function grokSlug(url) {
	try {
		const match = new URL(url).pathname.match(/\/page\/([^/]+)/);
		return match?.[1] ? decodeURIComponent(match[1]) : "";
	} catch {
		return "";
	}
}
function proseFromMarkdown(raw) {
	return clip(raw.replace(/<!--Infobox Start[\s\S]*?<!--Infobox End-->/g, "\n").replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/^\s{0,3}#{1,6}\s+/gm, "").replace(/[*_]{1,3}([^*_\n]+)[*_]{1,3}/g, "$1").split(/\n{2,}/).map((part) => part.replace(/\s+/g, " ").trim()).filter((part) => part.length > 80 && !part.startsWith("|")).slice(0, 3).join("\n\n"), 1100);
}
function previewFallback(input) {
	const url = safeHttp(input.url) ?? input.url;
	return {
		source: input.source,
		title: input.title,
		kicker: input.source === "wiki" ? "Wikipedia" : input.source === "grok" ? "Grokipedia" : hostOf(url) || "Web",
		extract: clip(cleanSnippet(input.snippet), 420),
		url
	};
}
async function runPreview(input) {
	const fallback = previewFallback(input);
	try {
		if (input.source === "wiki") {
			const data = await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(input.title)}`);
			const extract = data.extract?.trim() || fallback.extract;
			if (!extract) return fallback;
			return {
				source: "wiki",
				title: data.title?.trim() || input.title,
				kicker: data.description?.trim() || "Wikipedia",
				extract: clip(extract, 1100),
				url: safeHttp(data.content_urls?.desktop?.page ?? "") ?? fallback.url,
				image: wikiImage(data.thumbnail?.source)
			};
		}
		if (input.source === "grok") {
			const slug = grokSlug(input.url) || input.title;
			const data = await getJson(`https://grokipedia.com/api/page-preview?slug=${encodeURIComponent(slug)}`);
			const extract = proseFromMarkdown(data.page?.content ?? "") || fallback.extract;
			return {
				source: "grok",
				title: data.page?.title?.trim() || input.title,
				kicker: "Grokipedia",
				extract,
				url: fallback.url
			};
		}
	} catch {
		return fallback;
	}
	return fallback;
}
function bool(value, fallback) {
	if (typeof value === "boolean") return value;
	return fallback;
}
function offsetOf(value) {
	if (typeof value !== "number" || !Number.isFinite(value)) return 0;
	return Math.max(0, Math.min(399 * Math.max(8, 12, 10), Math.floor(value)));
}
function readSearch(input) {
	if (typeof input !== "object" || input === null) throw new Error("Invalid search");
	const raw = input;
	const q = typeof raw.q === "string" ? raw.q.trim().slice(0, 180) : "";
	if (!q) throw new Error("Enter a search");
	return {
		q,
		web: bool(raw.web, true),
		wiki: bool(raw.wiki, true),
		grok: bool(raw.grok, true),
		webOffset: offsetOf(raw.webOffset),
		wikiOffset: offsetOf(raw.wikiOffset),
		grokOffset: offsetOf(raw.grokOffset),
		card: raw.card !== false,
		near: typeof raw.near === "string" ? raw.near.trim().slice(0, 80) : ""
	};
}
var searchAll_createServerFn_handler = createServerRpc({
	id: "bfdf68232974a1aae5419a250f1840066b338cd0534fcaac892bb8fea784fd8d",
	name: "searchAll",
	filename: "src/lib/search.functions.ts"
}, (opts) => searchAll.__executeServer(opts));
var searchAll = createServerFn({ method: "POST" }).validator(readSearch).handler(searchAll_createServerFn_handler, async ({ data }) => runSearch(data));
var suggestQueries_createServerFn_handler = createServerRpc({
	id: "4db12e3702b07f5b92997e190550efb4fd42ea3e28bc0672c1653ecb4768ae0b",
	name: "suggestQueries",
	filename: "src/lib/search.functions.ts"
}, (opts) => suggestQueries.__executeServer(opts));
var suggestQueries = createServerFn({ method: "POST" }).validator((input) => {
	if (typeof input !== "object" || input === null) return { q: "" };
	return { q: "q" in input && typeof input.q === "string" ? input.q.trim().slice(0, 80) : "" };
}).handler(suggestQueries_createServerFn_handler, async ({ data }) => runSuggest(data.q));
var requestNetworkAd_createServerFn_handler = createServerRpc({
	id: "ae0c5e9e5de7a3f6b71561dc8e4ca3a7d6f03fdd771d14b900ba96571dd6e183",
	name: "requestNetworkAd",
	filename: "src/lib/search.functions.ts"
}, (opts) => requestNetworkAd.__executeServer(opts));
var requestNetworkAd = createServerFn({ method: "POST" }).validator(() => ({})).handler(requestNetworkAd_createServerFn_handler, async () => runNetworkAd());
var trendingTopics_createServerFn_handler = createServerRpc({
	id: "eec479c118e4a2ca37eb108f6ea71a9e7a8060bdaad367d7f106300463c687fb",
	name: "trendingTopics",
	filename: "src/lib/search.functions.ts"
}, (opts) => trendingTopics.__executeServer(opts));
var trendingTopics = createServerFn({ method: "POST" }).validator(() => ({})).handler(trendingTopics_createServerFn_handler, async () => runTrending());
var previewHit_createServerFn_handler = createServerRpc({
	id: "f3c92b2951fc2e8fff537b4f93a68c7439f55b87c0a86f94f7d0fd21733fa139",
	name: "previewHit",
	filename: "src/lib/search.functions.ts"
}, (opts) => previewHit.__executeServer(opts));
var previewHit = createServerFn({ method: "POST" }).validator((input) => {
	if (typeof input !== "object" || input === null) throw new Error("Invalid preview");
	const raw = input;
	const source = raw.source === "web" || raw.source === "wiki" || raw.source === "grok" ? raw.source : null;
	const title = typeof raw.title === "string" ? raw.title.trim().slice(0, 180) : "";
	const url = typeof raw.url === "string" ? raw.url.trim().slice(0, 500) : "";
	const snippet = typeof raw.snippet === "string" ? raw.snippet.slice(0, 600) : "";
	if (!source || !title || !safePreviewUrl(url)) throw new Error("Invalid preview");
	return {
		source,
		title,
		url,
		snippet
	};
}).handler(previewHit_createServerFn_handler, async ({ data }) => runPreview(data));
function safePreviewUrl(value) {
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:";
	} catch {
		return false;
	}
}
//#endregion
export { previewHit_createServerFn_handler, requestNetworkAd_createServerFn_handler, searchAll_createServerFn_handler, suggestQueries_createServerFn_handler, trendingTopics_createServerFn_handler };
