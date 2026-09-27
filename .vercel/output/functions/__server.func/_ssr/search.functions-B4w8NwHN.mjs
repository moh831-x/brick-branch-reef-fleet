import { n as TSS_SERVER_FUNCTION, t as createServerFn } from "./ssr.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/search.functions-B4w8NwHN.js
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
		near: ""
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
function tag(block, name) {
	return block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"))?.[1]?.trim() ?? "";
}
async function searchWeb(query, offset, near) {
	const first = Math.max(1, offset + 1);
	const q = near ? `${query} ${near}` : query;
	const items = [...(await getText(`https://www.bing.com/search?q=${encodeURIComponent(q)}&format=rss&first=${first}`, "application/rss+xml, application/xml, text/xml")).matchAll(/<item>([\s\S]*?)<\/item>/gi)];
	const results = [];
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
			meta: [host, when].filter(Boolean).join(" · ")
		});
		if (results.length >= 8) break;
	}
	return {
		results,
		done: results.length < 8
	};
}
async function searchWiki(query, offset) {
	const generated = `https://en.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=8&gsroffset=${offset}&gsrnamespace=0&prop=extracts|info&exintro=1&explaintext=1&exchars=280&inprop=url`;
	const totalsUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&list=search&srsearch=${encodeURIComponent(query)}&srlimit=1&srnamespace=0&srprop=`;
	const [data, counted] = await Promise.all([getJson(generated), getJson(totalsUrl).catch(() => null)]);
	const pages = Object.values(data.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
	const results = [];
	for (const page of pages) {
		const title = page.title?.trim();
		const url = safeHttp(page.fullurl ?? "");
		if (!title || !url) continue;
		results.push({
			id: `wiki:${title}`,
			source: "wiki",
			title,
			url,
			snippet: clip(page.extract?.trim() ?? ""),
			meta: formatDay(page.touched) ?? "Wikipedia"
		});
	}
	const total = counted?.query?.searchinfo?.totalhits;
	return {
		results,
		total,
		done: results.length < 8 || typeof total === "number" && offset + results.length >= total
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
async function wikiPlaces(query) {
	const titles = ((await getJson(`https://en.wikipedia.org/w/api.php?action=query&format=json&list=search&srsearch=${encodeURIComponent(query)}&srlimit=8&srnamespace=0&srprop=`)).query?.search ?? []).map((row) => row.title?.trim()).filter((title) => Boolean(title)).slice(0, 8);
	if (!titles.length) return [];
	const located = await getJson(`https://en.wikipedia.org/w/api.php?action=query&format=json&prop=coordinates|description|info&inprop=url&coprimary=primary&colimit=max&titles=${encodeURIComponent(titles.join("|"))}`);
	const byTitle = /* @__PURE__ */ new Map();
	for (const page of Object.values(located.query?.pages ?? {})) if (page.title) byTitle.set(page.title, page);
	const places = [];
	for (const title of titles) {
		const page = byTitle.get(title);
		const coord = page?.coordinates?.find((item) => !item.globe || item.globe === "earth") ?? page?.coordinates?.[0];
		const point = pointOf(coord?.lat, coord?.lon);
		if (!point) continue;
		const article = safeHttp(page?.fullurl ?? "") ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
		places.push({
			id: `wiki:${title}`,
			name: title,
			detail: page?.description?.trim() || "Wikipedia",
			lat: point.lat,
			lon: point.lon,
			url: article,
			map: mapLink(point.lat, point.lon),
			source: "wiki"
		});
		if (places.length >= 6) break;
	}
	return places;
}
var PLACE_KEYS = /* @__PURE__ */ new Set([
	"place",
	"boundary",
	"natural",
	"waterway",
	"tourism",
	"historic",
	"leisure"
]);
var SKIP_AMENITY = /* @__PURE__ */ new Set([
	"parking",
	"parking_space",
	"fuel",
	"toilets",
	"bench",
	"waste_basket",
	"atm",
	"vending_machine",
	"recycling",
	"charging_station",
	"car_wash",
	"telephone",
	"post_box",
	"doctors",
	"dentist",
	"clinic"
]);
function keepPlace(key, value) {
	if (PLACE_KEYS.has(key)) return true;
	if (key === "shop") return true;
	if (key === "amenity") return !SKIP_AMENITY.has(value);
	return false;
}
async function mapPlaces(query, seen) {
	const data = await getJson(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=10`);
	const places = [];
	for (const feature of data.features ?? []) {
		const props = feature.properties ?? {};
		if (!keepPlace(props.osm_key ?? "", props.osm_value ?? "")) continue;
		const name = props.name?.trim();
		if (!name || seen.has(name.toLowerCase())) continue;
		const coords = feature.geometry?.coordinates;
		const point = pointOf(coords?.[1], coords?.[0]);
		if (!point) continue;
		const rawKind = (props.osm_value || "place").replace(/_/g, " ");
		const kind = rawKind.charAt(0).toUpperCase() + rawKind.slice(1);
		const region = [
			props.city,
			props.state,
			props.country
		].filter((part, index, all) => {
			if (!part) return false;
			if (part.toLowerCase() === name.toLowerCase()) return false;
			return all.findIndex((item) => item?.toLowerCase() === part.toLowerCase()) === index;
		});
		places.push({
			id: `map:${point.lat.toFixed(3)}:${point.lon.toFixed(3)}:${name.toLowerCase()}`,
			name,
			detail: [kind, ...region].join(" · "),
			lat: point.lat,
			lon: point.lon,
			url: mapLink(point.lat, point.lon),
			map: mapLink(point.lat, point.lon),
			source: "map"
		});
		seen.add(name.toLowerCase());
		if (places.length >= 6) break;
	}
	return places;
}
async function searchPlaces(query, near) {
	const q = [query, near].filter(Boolean).join(" ").trim();
	if (!q) return [];
	let wiki = [];
	let wikiFailed = false;
	try {
		wiki = await wikiPlaces(q);
	} catch {
		wikiFailed = true;
	}
	if (wiki.length >= 4) return wiki.slice(0, 6);
	const seen = new Set(wiki.map((place) => place.name.toLowerCase()));
	try {
		const maps = await mapPlaces(q, seen);
		return [...wiki, ...maps].slice(0, 6);
	} catch (error) {
		if (wiki.length || !wikiFailed) return wiki;
		throw error;
	}
}
async function runSearch(input) {
	const started = Date.now();
	const query = input.q.trim();
	if (!input.web && !input.wiki && !input.grok) return {
		...emptyPayload(query),
		tookMs: 0
	};
	const [web, wiki, grok] = await Promise.all([
		input.web ? searchWeb(query, input.webOffset, input.near).catch(failed) : Promise.resolve(emptyBlock()),
		input.wiki ? searchWiki(query, input.wikiOffset).catch(failed) : Promise.resolve(emptyBlock()),
		input.grok ? searchGrok(query, input.grokOffset).catch(failed) : Promise.resolve(emptyBlock())
	]);
	let card = null;
	if (input.card && input.wiki && !wiki.error) {
		const lead = input.wikiOffset === 0 ? wiki.results[0] : (await searchWiki(query, 0).catch(() => emptyBlock())).results[0];
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
		places = await searchPlaces(query, input.near);
	} catch (error) {
		placesError = error instanceof Error ? error.message : "Unavailable";
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
		near: input.near
	};
}
async function runSuggest(query) {
	const q = query.trim();
	if (q.length < 2) return [];
	const wikiUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&format=json&limit=5&namespace=0&search=${encodeURIComponent(q)}`;
	const grokUrl = `https://grokipedia.com/api/typeahead?query=${encodeURIComponent(q)}&limit=5`;
	const [wiki, grok] = await Promise.all([getJson(wikiUrl).catch(() => null), getJson(grokUrl).catch(() => null)]);
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
var trendCache = null;
async function runTrending() {
	if (trendCache && Date.now() - trendCache.at < 6e5) return trendCache.rows;
	const rows = readJsonArray(await getText("https://grokipedia.com/", "text/html"), "trendingPages").map((row) => {
		if (typeof row !== "object" || row === null) return null;
		const item = row;
		const title = item.title?.trim();
		const slug = item.slug?.trim();
		if (!title || !slug) return null;
		return {
			title,
			slug,
			snippet: tidyTrend(title, item.snippet ?? "")
		};
	}).filter((row) => row !== null).slice(0, 3);
	trendCache = {
		at: Date.now(),
		rows
	};
	return rows;
}
function bool(value, fallback) {
	if (typeof value === "boolean") return value;
	return fallback;
}
function offsetOf(value) {
	if (typeof value !== "number" || !Number.isFinite(value)) return 0;
	return Math.max(0, Math.min(399 * Math.max(8, 12), Math.floor(value)));
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
var trendingTopics_createServerFn_handler = createServerRpc({
	id: "eec479c118e4a2ca37eb108f6ea71a9e7a8060bdaad367d7f106300463c687fb",
	name: "trendingTopics",
	filename: "src/lib/search.functions.ts"
}, (opts) => trendingTopics.__executeServer(opts));
var trendingTopics = createServerFn({ method: "POST" }).validator(() => ({})).handler(trendingTopics_createServerFn_handler, async () => runTrending());
//#endregion
export { searchAll_createServerFn_handler, suggestQueries_createServerFn_handler, trendingTopics_createServerFn_handler };
