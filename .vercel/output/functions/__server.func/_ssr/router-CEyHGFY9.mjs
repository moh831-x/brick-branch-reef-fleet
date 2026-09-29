import { i as __toESM } from "../_runtime.mjs";
import { C as require_jsx_runtime, S as useRouter, Z as require_react, _ as lazyRouteComponent, d as Scripts, f as HeadContent, g as Outlet, h as createRouter, v as createFileRoute, y as createRootRoute } from "../_libs/@tanstack/react-router+[...].mjs";
import { c as stripSearchParams } from "../_libs/@tanstack/router-core+[...].mjs";
import { n as TSS_SERVER_FUNCTION, r as getServerFnById, t as createServerFn } from "./ssr.mjs";
import { n as TriangleAlert } from "../_libs/lucide-react.mjs";
import { a as union, i as string, n as number, r as object, t as literal } from "../_libs/zod.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/search.shared-Ba-lRThW.js
function pageOf(value) {
	const raw = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
	if (!Number.isFinite(raw)) return void 0;
	const page = Math.floor(raw);
	if (page <= 1) return void 0;
	return Math.min(400, page);
}
function pageItems(current, last) {
	const page = Math.min(Math.max(1, current), last);
	if (last <= 7) return Array.from({ length: last }, (_, index) => index + 1);
	if (page <= 4) return [
		1,
		2,
		3,
		4,
		5,
		"…",
		last
	];
	if (page >= last - 3) return [
		1,
		"…",
		last - 4,
		last - 3,
		last - 2,
		last - 1,
		last
	];
	return [
		1,
		"…",
		page - 1,
		page,
		page + 1,
		"…",
		last
	];
}
//#endregion
//#region node_modules/.nitro/vite/services/ssr/assets/router-CEyHGFY9.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var __defProp = Object.defineProperty;
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
var FALLBACK_MESSAGE = "An unexpected error occurred. Try reloading the page.";
function errorMessage(error) {
	if (error instanceof Error && error.message) return error.message;
	if (typeof error === "string" && error) return error;
	return FALLBACK_MESSAGE;
}
function AppErrorComponent({ error }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "text-red-500",
				"aria-hidden": "true",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TriangleAlert, {
					className: "size-10",
					strokeWidth: 2
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
				className: "text-lg font-semibold",
				children: "Something went wrong"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "max-w-md text-sm break-words text-zinc-500 dark:text-zinc-400",
				children: errorMessage(error)
			})
		]
	});
}
/**
* App-wide client provider mounted once near the root (in `src/routes/__root.tsx`):
*
*   <AuthProvider><Outlet /></AuthProvider>
*
* Better Auth's React client (`@/lib/auth/client`) needs NO context provider —
* its `useSession()` works standalone — so this is a passthrough today. It's
* kept as the single, stable mount point for any future client-side providers
* (e.g. a toast or theme provider) without churning the root shell.
*/
function AuthProvider({ children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children });
}
var CONNECTOR_TOKEN_READY_EVENT = "grok:connector-token-ready";
function isGrokEmbedderOrigin(origin) {
	try {
		const url = new URL(origin);
		if (url.protocol !== "https:" && url.protocol !== "http:") return false;
		const host = url.hostname.toLowerCase();
		if (host === "grok.com" || host.endsWith(".grok.com")) return true;
		if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") return true;
		return false;
	} catch {
		return false;
	}
}
function isSandboxPreviewGuestHost(hostname) {
	const host = hostname.toLowerCase();
	return host === "grok-sandbox.com" || host.endsWith(".grok-sandbox.com");
}
function isRemintPreviewPair(guestHost, parentHost) {
	const guest = guestHost.toLowerCase();
	const parent = parentHost.toLowerCase();
	const i = guest.indexOf(".preview.");
	if (i <= 0) return false;
	const label = guest.slice(0, i);
	const rest = guest.slice(i + 9);
	if (label.includes(".") || !rest.includes(".")) return false;
	return parent === rest || parent === `grok.${rest}`;
}
function resolveParentEmbedderOrigin(parentIsSelf, referrer, ancestorOrigin, guestHostname = "") {
	if (parentIsSelf) return null;
	for (const candidate of [referrer, ancestorOrigin ?? ""].filter(Boolean)) try {
		const url = new URL(candidate.includes("://") ? candidate : `https://${candidate}`);
		if (url.protocol !== "https:" && url.protocol !== "http:") continue;
		if (isGrokEmbedderOrigin(url.origin)) return url.origin;
		if (isSandboxPreviewGuestHost(guestHostname) || isRemintPreviewPair(guestHostname, url.hostname)) return url.origin;
	} catch {}
	return null;
}
/**
* Guest side of the grok-web ↔ sandbox preview postMessage bridge.
*
* Activates only when this page is framed by an allowlisted Grok embedder.
* Top-level runs (download/export, local `npm run dev`, deployed sites) noop.
*/
var PREVIEW_BRIDGE_CHANNEL = "grok-preview-bridge";
var EnvelopeSchema = object({
	channel: literal(PREVIEW_BRIDGE_CHANNEL),
	version: number().int().positive(),
	type: string().min(1)
});
var HelloSchema = EnvelopeSchema.extend({ type: literal("hello") });
var NavigateSchema = EnvelopeSchema.extend({
	type: literal("navigate"),
	path: string().min(1)
});
var HistorySchema = EnvelopeSchema.extend({
	type: literal("history"),
	delta: union([literal(-1), literal(1)])
});
var ConnectorTokenReadySchema = EnvelopeSchema.extend({ type: literal("connector-token-ready") });
function isSafeBridgePath(path) {
	if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return false;
	try {
		return new URL(path, "https://preview.invalid").origin === "https://preview.invalid";
	} catch {
		return false;
	}
}
/**
* Origin of the Grok embedder framing this page, or null when the page runs
* top-level (download/export, local `npm run dev`, deployed sites) or under a
* non-Grok parent. Client-only; null during SSR.
*/
function resolveCurrentEmbedderOrigin() {
	if (typeof window === "undefined") return null;
	const ancestorOrigin = typeof location.ancestorOrigins !== "undefined" && location.ancestorOrigins.length > 0 ? location.ancestorOrigins[0] : null;
	return resolveParentEmbedderOrigin(window.parent === window, document.referrer, ancestorOrigin, window.location.hostname);
}
/**
* Install host↔guest messaging. Returns a dispose function.
* Noops (returns a no-op dispose) when not embedded under a Grok parent.
*/
function installPreviewHostBridge(options = {}) {
	const parentOrigin = resolveCurrentEmbedderOrigin();
	if (parentOrigin === null) return () => {};
	const ROOT_STATE_KEY = "__grokPreviewBridgeRoot";
	const originalPushState = window.history.pushState.bind(window.history);
	const originalReplaceState = window.history.replaceState.bind(window.history);
	const isAtHistoryRoot = () => {
		const state = window.history.state;
		return Boolean(state && typeof state === "object" && state[ROOT_STATE_KEY] === true);
	};
	try {
		const current = window.history.state;
		if (!(current !== null && typeof current === "object" && Object.prototype.hasOwnProperty.call(current, ROOT_STATE_KEY))) {
			const isRoot = window.history.length <= 1;
			originalReplaceState(current && typeof current === "object" ? {
				...current,
				[ROOT_STATE_KEY]: isRoot
			} : { [ROOT_STATE_KEY]: isRoot }, "", window.location.href);
		}
	} catch {}
	const post = (message) => {
		window.parent.postMessage(message, parentOrigin);
	};
	const reportLocation = () => {
		post({
			channel: PREVIEW_BRIDGE_CHANNEL,
			version: 1,
			type: "location",
			path: window.location.pathname || "/",
			search: window.location.search,
			hash: window.location.hash
		});
	};
	const reportRoutes = () => {
		const paths = options.getRoutePaths?.() ?? [];
		post({
			channel: PREVIEW_BRIDGE_CHANNEL,
			version: 1,
			type: "routes",
			paths
		});
	};
	const defaultNavigate = (path) => {
		if (!isSafeBridgePath(path)) return;
		try {
			const url = new URL(path, window.location.origin);
			if (url.origin !== window.location.origin) return;
			const next = `${url.pathname}${url.search}${url.hash}`;
			window.history.pushState(window.history.state, "", next);
			window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
		} catch {}
	};
	const navigate = (path) => {
		if (!isSafeBridgePath(path)) return;
		if (options.navigate) {
			options.navigate(path);
			return;
		}
		defaultNavigate(path);
	};
	const announce = () => {
		reportLocation();
		reportRoutes();
		post({
			channel: PREVIEW_BRIDGE_CHANNEL,
			version: 1,
			type: "ready"
		});
	};
	const onHello = (data) => {
		if (!HelloSchema.safeParse(data).success) return;
		announce();
	};
	const onNavigate = (data) => {
		const parsed = NavigateSchema.safeParse(data);
		if (!parsed.success) return;
		navigate(parsed.data.path);
		queueMicrotask(reportLocation);
	};
	const onHistory = (data) => {
		const parsed = HistorySchema.safeParse(data);
		if (!parsed.success) return;
		if (parsed.data.delta === -1 && isAtHistoryRoot()) return;
		window.history.go(parsed.data.delta);
	};
	const onConnectorTokenReady = (data) => {
		if (!ConnectorTokenReadySchema.safeParse(data).success) return;
		window.dispatchEvent(new Event(CONNECTOR_TOKEN_READY_EVENT));
	};
	const hostMessageHandlers = /* @__PURE__ */ new Map([
		["hello", onHello],
		["navigate", onNavigate],
		["history", onHistory],
		["connector-token-ready", onConnectorTokenReady]
	]);
	const onMessage = (event) => {
		if (event.source !== window.parent) return;
		if (event.origin !== parentOrigin) return;
		const envelope = EnvelopeSchema.safeParse(event.data);
		if (!envelope.success || envelope.data.version !== 1) return;
		hostMessageHandlers.get(envelope.data.type)?.(event.data);
	};
	const onPopState = () => {
		reportLocation();
	};
	const onHashChange = () => {
		reportLocation();
	};
	window.history.pushState = (data, unused, url) => {
		const next = data && typeof data === "object" ? {
			...data,
			[ROOT_STATE_KEY]: false
		} : data;
		originalPushState(next, unused, url);
		reportLocation();
	};
	window.history.replaceState = (data, unused, url) => {
		const next = isAtHistoryRoot() ? {
			...data && typeof data === "object" ? data : {},
			[ROOT_STATE_KEY]: true
		} : data;
		originalReplaceState(next, unused, url);
		reportLocation();
	};
	window.addEventListener("message", onMessage);
	window.addEventListener("popstate", onPopState);
	window.addEventListener("hashchange", onHashChange);
	announce();
	return () => {
		window.removeEventListener("message", onMessage);
		window.removeEventListener("popstate", onPopState);
		window.removeEventListener("hashchange", onHashChange);
		window.history.pushState = originalPushState;
		window.history.replaceState = originalReplaceState;
	};
}
/** Collect static path patterns from a TanStack route tree (best-effort). */
function collectRoutePathsFromTree(routeTree) {
	const paths = /* @__PURE__ */ new Set();
	const walk = (node) => {
		if (!node || typeof node !== "object") return;
		const record = node;
		const full = typeof record.fullPath === "string" ? record.fullPath : typeof record.path === "string" ? record.path : null;
		if (full !== null && full !== "") paths.add(full.startsWith("/") ? full : `/${full}`);
		else if (full === "") paths.add("/");
		const children = record.children;
		if (Array.isArray(children)) for (const child of children) walk(child);
		else if (children && typeof children === "object") for (const child of Object.values(children)) walk(child);
	};
	walk(routeTree);
	return [...paths];
}
/**
* Mount once in `__root.tsx` so the Grok preview chrome can drive navigation
* (and later receive registered routes). Noops when the app is not embedded.
*/
function PreviewHostBridge() {
	const router = useRouter();
	(0, import_react.useEffect)(() => {
		return installPreviewHostBridge({
			navigate: (path) => {
				router.history.push(path);
			},
			getRoutePaths: () => collectRoutePathsFromTree(router.routeTree)
		});
	}, [router]);
	return null;
}
var styles_default = "/assets/styles-BM9o1CxF.css";
var Route$3 = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1"
			},
			{
				name: "theme-color",
				content: "#f3efe6"
			}
		],
		links: [
			{
				rel: "icon",
				type: "image/svg+xml",
				href: "/favicon.svg"
			},
			{
				rel: "preconnect",
				href: "https://fonts.googleapis.com"
			},
			{
				rel: "preconnect",
				href: "https://fonts.gstatic.com",
				crossOrigin: "anonymous"
			},
			{
				rel: "stylesheet",
				href: "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,560;0,9..144,640;1,9..144,520&family=Outfit:wght@400;500;600&display=swap"
			},
			{
				rel: "stylesheet",
				href: styles_default
			},
			{
				rel: "manifest",
				href: "/__grok/manifest.webmanifest"
			},
			{
				rel: "apple-touch-icon",
				href: "/__grok/icon-180.png"
			}
		]
	}),
	component: () => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("html", {
		lang: "en",
		suppressHydrationWarning: true,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("head", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HeadContent, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("body", { children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PreviewHostBridge, {}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AuthProvider, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Outlet, {}) }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Scripts, {})
		] })]
	})
});
var createSsrRpc = (functionId) => {
	const url = "/_serverFn/" + functionId;
	const serverFnMeta = { id: functionId };
	const fn = async (...args) => {
		return (await getServerFnById(functionId, { origin: "server" }))(...args);
	};
	return Object.assign(fn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
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
var searchAll = createServerFn({ method: "POST" }).validator(readSearch).handler(createSsrRpc("bfdf68232974a1aae5419a250f1840066b338cd0534fcaac892bb8fea784fd8d"));
var suggestQueries = createServerFn({ method: "POST" }).validator((input) => {
	if (typeof input !== "object" || input === null) return { q: "" };
	return { q: "q" in input && typeof input.q === "string" ? input.q.trim().slice(0, 80) : "" };
}).handler(createSsrRpc("4db12e3702b07f5b92997e190550efb4fd42ea3e28bc0672c1653ecb4768ae0b"));
var requestNetworkAd = createServerFn({ method: "POST" }).validator(() => ({})).handler(createSsrRpc("ae0c5e9e5de7a3f6b71561dc8e4ca3a7d6f03fdd771d14b900ba96571dd6e183"));
var trendingTopics = createServerFn({ method: "POST" }).validator(() => ({})).handler(createSsrRpc("eec479c118e4a2ca37eb108f6ea71a9e7a8060bdaad367d7f106300463c687fb"));
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
}).handler(createSsrRpc("f3c92b2951fc2e8fff537b4f93a68c7439f55b87c0a86f94f7d0fd21733fa139"));
function safePreviewUrl(value) {
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:";
	} catch {
		return false;
	}
}
var $$splitComponentImporter$2 = () => import("./routes-tzmSxjgN.mjs");
var HOME_TITLE = "Folio by Zip1 — Web, Wikipedia & Grokipedia Search";
var HOME_DESCRIPTION = "Search the web with Folio by Zip1. Explore web results and optional Wikipedia and Grokipedia sources from one simple search interface.";
var HOME_URL = "https://www.zip1.ai/";
var websiteJsonLd = {
	"@context": "https://schema.org",
	"@type": "WebSite",
	name: "Folio by Zip1",
	alternateName: "Folio",
	url: HOME_URL
};
function flag(value) {
	if (value === "0" || value === 0 || value === false || value === "false") return false;
	if (value === "1" || value === 1 || value === true || value === "true") return true;
}
var Route$2 = createFileRoute("/")({
	validateSearch: (raw) => ({
		q: typeof raw.q === "string" ? raw.q.slice(0, 180) : "",
		near: typeof raw.near === "string" ? raw.near.slice(0, 80) : "",
		web: flag(raw.web),
		wiki: flag(raw.wiki),
		grok: flag(raw.grok),
		webPage: pageOf(raw.webPage),
		wikiPage: pageOf(raw.wikiPage),
		grokPage: pageOf(raw.grokPage)
	}),
	search: { middlewares: [stripSearchParams({
		q: "",
		near: "",
		webPage: void 0,
		wikiPage: void 0,
		grokPage: void 0
	})] },
	loaderDeps: ({ search }) => ({
		q: search.q.trim(),
		near: search.near.trim(),
		web: search.web,
		wiki: search.wiki,
		grok: search.grok,
		webPage: search.webPage ?? 1,
		wikiPage: search.wikiPage ?? 1,
		grokPage: search.grokPage ?? 1
	}),
	loader: ({ deps }) => {
		const q = deps.q.trim();
		if (!q) return null;
		return searchAll({ data: {
			q,
			web: deps.web !== false,
			wiki: deps.wiki !== false,
			grok: deps.grok !== false,
			webOffset: (deps.webPage - 1) * 10,
			wikiOffset: (deps.wikiPage - 1) * 8,
			grokOffset: (deps.grokPage - 1) * 12,
			card: true,
			near: deps.near.trim()
		} });
	},
	head: ({ match }) => {
		const q = match.search.q.trim();
		if (q) return { meta: [{ title: `${q} — Folio` }, {
			name: "robots",
			content: "noindex, follow"
		}] };
		return {
			meta: [{ title: HOME_TITLE }, {
				name: "description",
				content: HOME_DESCRIPTION
			}],
			links: [{
				rel: "canonical",
				href: HOME_URL
			}],
			scripts: [{
				type: "application/ld+json",
				children: JSON.stringify(websiteJsonLd)
			}]
		};
	},
	component: lazyRouteComponent($$splitComponentImporter$2, "component")
});
var TITLE$1 = "About Folio by Zip1";
var $$splitComponentImporter$1 = () => import("./about-BMKMx0YD.mjs");
var DESCRIPTION$1 = "Folio by Zip1 is a web search page. It lists public web results and can include Wikipedia and Grokipedia when those sources are switched on.";
var CANONICAL$1 = "https://www.zip1.ai/about";
var Route$1 = createFileRoute("/about")({
	head: () => ({
		meta: [{ title: TITLE$1 }, {
			name: "description",
			content: DESCRIPTION$1
		}],
		links: [{
			rel: "canonical",
			href: CANONICAL$1
		}]
	}),
	component: lazyRouteComponent($$splitComponentImporter$1, "component")
});
var TITLE = "How to search with Folio by Zip1";
var $$splitComponentImporter = () => import("./how-to-search-CW1jRQSI.mjs");
var DESCRIPTION = "How to use Folio: enter a query, switch Web, Wikipedia, and Grokipedia on or off, open a result, and move between pages.";
var CANONICAL = "https://www.zip1.ai/how-to-search";
var Route = createFileRoute("/how-to-search")({
	head: () => ({
		meta: [{ title: TITLE }, {
			name: "description",
			content: DESCRIPTION
		}],
		links: [{
			rel: "canonical",
			href: CANONICAL
		}]
	}),
	component: lazyRouteComponent($$splitComponentImporter, "component")
});
var rootRouteChildren = {
	IndexRoute: Route$2.update({
		id: "/",
		path: "/",
		getParentRoute: () => Route$3
	}),
	AboutRoute: Route$1.update({
		id: "/about",
		path: "/about",
		getParentRoute: () => Route$3
	}),
	HowToSearchRoute: Route.update({
		id: "/how-to-search",
		path: "/how-to-search",
		getParentRoute: () => Route$3
	})
};
var routeTree = Route$3._addFileChildren(rootRouteChildren)._addFileTypes();
var router_exports = /* @__PURE__ */ __exportAll({ getRouter: () => getRouter });
function getRouter() {
	return createRouter({
		routeTree,
		defaultErrorComponent: AppErrorComponent
	});
}
//#endregion
export { previewHit as a, trendingTopics as c, Route$2 as i, pageItems as l, TITLE as n, requestNetworkAd as o, TITLE$1 as r, suggestQueries as s, router_exports as t };
