import { i as __toESM } from "../_runtime.mjs";
import { C as require_jsx_runtime, Z as require_react, p as useRouterState, x as useNavigate } from "../_libs/@tanstack/react-router+[...].mjs";
import { a as Globe, c as ChevronRight, d as ArrowUp, f as ArrowUpRight, i as Search, l as ChevronLeft, o as Compass, r as TrendingUp, s as Clock, t as X, u as BookOpen } from "../_libs/lucide-react.mjs";
import { a as previewHit, c as trendingTopics, i as Route$2, l as pageItems, o as requestNetworkAd, s as suggestQueries } from "./router-CEyHGFY9.mjs";
import { t as SiteFooter } from "./site-footer-CwPAbZpz.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-tzmSxjgN.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var STORAGE_SOURCES = "folio-sources";
var STORAGE_RECENT = "folio-recent";
var STORAGE_ADS = "folio-ads";
var SOURCE_META = {
	web: {
		label: "Web",
		optional: false,
		blurb: "News, official sites, and the rest of the public web.",
		icon: Globe
	},
	wiki: {
		label: "Wikipedia",
		optional: true,
		blurb: "The free encyclopedia. Turn it on for articles and a short summary.",
		icon: BookOpen
	},
	grok: {
		label: "Grokipedia",
		optional: true,
		blurb: "xAI’s encyclopedia. A second write-up, only when you want it.",
		icon: Compass
	}
};
function readSources() {
	if (typeof window === "undefined") return {
		web: true,
		wiki: true,
		grok: true
	};
	try {
		const raw = localStorage.getItem(STORAGE_SOURCES);
		if (!raw) return {
			web: true,
			wiki: true,
			grok: true
		};
		const parsed = JSON.parse(raw);
		return {
			web: parsed.web !== false,
			wiki: parsed.wiki !== false,
			grok: parsed.grok !== false
		};
	} catch {
		return {
			web: true,
			wiki: true,
			grok: true
		};
	}
}
function readRecent() {
	if (typeof window === "undefined") return [];
	try {
		const raw = localStorage.getItem(STORAGE_RECENT);
		const parsed = raw ? JSON.parse(raw) : [];
		return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string").slice(0, 6) : [];
	} catch {
		return [];
	}
}
function readAds() {
	if (typeof window === "undefined") return false;
	try {
		return localStorage.getItem(STORAGE_ADS) === "1";
	} catch {
		return false;
	}
}
function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function Highlight({ text, query }) {
	const terms = [...new Set(query.toLowerCase().split(/\s+/).filter((term) => term.length > 1))];
	if (!terms.length || !text) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: text });
	const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "ig");
	const parts = text.split(pattern);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: parts.map((part, index) => terms.some((term) => part.toLowerCase() === term) ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("mark", {
		className: "rounded-sm px-0.5",
		children: part
	}, `${part}-${index}`) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: part }, `${part}-${index}`)) });
}
function formatTook(ms) {
	if (ms < 1e3) return `${ms} ms`;
	return `${(ms / 1e3).toFixed(1)} s`;
}
function FolioApp({ search, data }) {
	const navigate = useNavigate({ from: "/" });
	const loading = useRouterState({ select: (state) => state.isLoading });
	const listId = (0, import_react.useId)();
	const inputRef = (0, import_react.useRef)(null);
	const query = search.q.trim();
	const onResults = query.length > 0;
	const [draft, setDraft] = (0, import_react.useState)(query);
	const [sources, setSources] = (0, import_react.useState)({
		web: search.web !== false,
		wiki: search.wiki !== false,
		grok: search.grok !== false
	});
	const [recent, setRecent] = (0, import_react.useState)([]);
	const [suggestions, setSuggestions] = (0, import_react.useState)([]);
	const [trends, setTrends] = (0, import_react.useState)([]);
	const [open, setOpen] = (0, import_react.useState)(false);
	const [active, setActive] = (0, import_react.useState)(-1);
	const [chrome, setChrome] = (0, import_react.useState)("full");
	const [adsOn, setAdsOn] = (0, import_react.useState)(false);
	const [adsOpen, setAdsOpen] = (0, import_react.useState)(false);
	(0, import_react.useEffect)(() => {
		setAdsOn(readAds());
	}, []);
	(0, import_react.useEffect)(() => {
		setDraft(query);
		setOpen(false);
		setActive(-1);
	}, [
		query,
		search.web,
		search.wiki,
		search.grok
	]);
	(0, import_react.useEffect)(() => {
		if (!onResults) setSources(readSources());
		else setSources({
			web: search.web !== false,
			wiki: search.wiki !== false,
			grok: search.grok !== false
		});
		setRecent(readRecent());
	}, [
		onResults,
		search.web,
		search.wiki,
		search.grok
	]);
	(0, import_react.useEffect)(() => {
		const q = draft.trim();
		if (!open || q.length < 2) return;
		const handle = window.setTimeout(() => {
			suggestQueries({ data: { q } }).then((rows) => setSuggestions(rows)).catch(() => setSuggestions([]));
		}, 180);
		return () => window.clearTimeout(handle);
	}, [draft, open]);
	(0, import_react.useEffect)(() => {
		let cancelled = false;
		trendingTopics({ data: {} }).then((rows) => {
			if (!cancelled) setTrends(rows);
		}).catch(() => {
			if (!cancelled) setTrends([]);
		});
		return () => {
			cancelled = true;
		};
	}, []);
	(0, import_react.useEffect)(() => {
		document.title = query ? `${query} — Folio` : "Folio by Zip1 — Web, Wikipedia & Grokipedia Search";
	}, [query]);
	(0, import_react.useEffect)(() => {
		if (!onResults) {
			setChrome("full");
			return;
		}
		let last = window.scrollY;
		const onScroll = () => {
			const y = window.scrollY;
			const delta = y - last;
			if (y < 40) setChrome("full");
			else if (delta > 6) setChrome("hidden");
			else if (delta < -6) setChrome("search");
			last = y;
		};
		window.addEventListener("scroll", onScroll, { passive: true });
		return () => window.removeEventListener("scroll", onScroll);
	}, [onResults]);
	(0, import_react.useEffect)(() => {
		if (!query) return;
		window.scrollTo(0, 0);
	}, [
		query,
		search.webPage,
		search.wikiPage,
		search.grokPage
	]);
	(0, import_react.useEffect)(() => {
		function onKey(event) {
			if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
			const target = event.target;
			if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
			event.preventDefault();
			inputRef.current?.focus();
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);
	const anySource = sources.web || sources.wiki || sources.grok;
	function persistSources(next) {
		setSources(next);
		try {
			localStorage.setItem(STORAGE_SOURCES, JSON.stringify(next));
		} catch {}
	}
	function remember(value) {
		const next = [value, ...readRecent().filter((item) => item.toLowerCase() !== value.toLowerCase())].slice(0, 6);
		try {
			localStorage.setItem(STORAGE_RECENT, JSON.stringify(next));
		} catch {}
		setRecent(next);
	}
	function go(value, nextSources = sources) {
		const q = value.trim();
		if (!q || !nextSources.web && !nextSources.wiki && !nextSources.grok) return;
		remember(q);
		setOpen(false);
		navigate({
			to: "/",
			search: {
				q,
				near: search.near,
				web: nextSources.web,
				wiki: nextSources.wiki,
				grok: nextSources.grok
			}
		});
	}
	function toggle(key) {
		const next = {
			...sources,
			[key]: !sources[key]
		};
		persistSources(next);
		if (onResults) navigate({
			to: "/",
			search: {
				q: query,
				near: search.near,
				web: next.web,
				wiki: next.wiki,
				grok: next.grok
			}
		});
	}
	function clearRecent() {
		setRecent([]);
		try {
			localStorage.removeItem(STORAGE_RECENT);
		} catch {}
	}
	const typing = draft.trim().length >= 2;
	const menu = typing ? suggestions.map((item) => item.title) : [...trends.map((item) => item.title), ...recent];
	function onSubmit(event) {
		event.preventDefault();
		if (active >= 0 && menu[active]) go(menu[active]);
		else go(draft);
	}
	function onKeyDown(event) {
		if (event.key === "Escape") {
			setOpen(false);
			setActive(-1);
			return;
		}
		if (!open || menu.length === 0) return;
		if (event.key === "ArrowDown") {
			event.preventDefault();
			setActive((current) => (current + 1) % menu.length);
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			setActive((current) => current <= 0 ? menu.length - 1 : current - 1);
		}
	}
	function onPage(source, page) {
		const next = page <= 1 ? void 0 : page;
		navigate({
			to: "/",
			search: {
				q: query,
				near: search.near,
				web: search.web,
				wiki: search.wiki,
				grok: search.grok,
				webPage: source === "web" ? next : search.webPage,
				wikiPage: source === "wiki" ? next : search.wikiPage,
				grokPage: source === "grok" ? next : search.grokPage
			}
		});
	}
	const showMenu = open && menu.length > 0;
	function goHome() {
		setDraft("");
		setOpen(false);
		navigate({
			to: "/",
			search: {
				q: "",
				near: ""
			}
		});
	}
	const searchForm = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
		onSubmit,
		className: "relative",
		role: "search",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
				htmlFor: "folio-q",
				className: "sr-only",
				children: "Search"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex min-h-14 items-center gap-2 rounded-2xl border border-line bg-surface px-3 focus-within:border-accent",
				onMouseDown: (event) => {
					if (event.target.closest("button, input")) return;
					event.preventDefault();
					inputRef.current?.focus();
				},
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Search, {
						className: "size-5 shrink-0 text-muted",
						"aria-hidden": "true"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						ref: inputRef,
						id: "folio-q",
						value: draft,
						onChange: (event) => {
							setDraft(event.target.value);
							setOpen(true);
							setActive(-1);
						},
						onFocus: () => setOpen(true),
						onBlur: () => window.setTimeout(() => setOpen(false), 140),
						onKeyDown,
						placeholder: "Search",
						autoComplete: "off",
						enterKeyHint: "search",
						role: "combobox",
						"aria-expanded": showMenu,
						"aria-controls": listId,
						"aria-autocomplete": "list",
						className: "h-12 min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted"
					}),
					draft ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						"aria-label": "Clear search",
						onClick: () => {
							setDraft("");
							setOpen(true);
							inputRef.current?.focus();
						},
						className: "grid size-11 place-items-center rounded-full text-muted transition-transform duration-150 ease-out active:scale-[0.96]",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "size-4" })
					}) : null,
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "submit",
						disabled: !draft.trim() || !anySource,
						"aria-label": "Search",
						className: "inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-ink text-bg transition-transform duration-150 ease-out active:scale-[0.96] disabled:opacity-40",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowUp, { className: "size-4" })
					})
				]
			}),
			showMenu ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				id: listId,
				role: "listbox",
				className: "absolute right-0 left-0 z-30 mt-2 max-h-[70vh] overflow-y-auto rounded-2xl border border-line bg-surface",
				children: typing ? suggestions.map((item, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					role: "option",
					"aria-selected": index === active,
					onMouseDown: (event) => {
						event.preventDefault();
						go(item.title);
					},
					className: `flex min-h-11 w-full items-center justify-between gap-3 px-4 text-left ${index === active ? "bg-accent-soft" : ""}`,
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "truncate",
						children: item.title
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "shrink-0 text-xs tracking-wide text-muted uppercase",
						children: item.source === "wiki" ? "Wikipedia" : "Grokipedia"
					})]
				}, `${item.source}-${item.title}`)) : trends.length > 0 || recent.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [trends.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "pb-1",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "px-4 pt-3 pb-1 text-sm text-muted",
						children: "Trending now"
					}), trends.map((item, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						role: "option",
						"aria-selected": index === active,
						onMouseDown: (event) => {
							event.preventDefault();
							go(item.title);
						},
						className: `flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left ${index === active ? "bg-accent-soft" : ""}`,
						children: [item.entity && item.image ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
							src: item.image,
							alt: "",
							className: "size-8 shrink-0 rounded-full object-cover"
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TrendingUp, {
							className: "size-4 shrink-0 text-muted",
							"aria-hidden": "true"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "min-w-0",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "block truncate text-ink",
								children: item.title
							}), item.entity && item.snippet ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "block truncate text-sm text-muted",
								children: item.snippet
							}) : null]
						})]
					}, item.slug))]
				}) : null, recent.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "pb-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center justify-between px-4 pt-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-sm text-muted",
							children: "Recent"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							onMouseDown: (event) => {
								event.preventDefault();
								clearRecent();
							},
							className: "min-h-11 px-2 text-sm text-muted",
							children: "Clear"
						})]
					}), recent.map((item, index) => {
						const cursor = trends.length + index;
						return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							role: "option",
							"aria-selected": cursor === active,
							onMouseDown: (event) => {
								event.preventDefault();
								go(item);
							},
							className: `flex min-h-11 w-full items-center gap-3 px-4 text-left ${cursor === active ? "bg-accent-soft" : ""}`,
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Clock, {
								className: "size-4 shrink-0 text-muted",
								"aria-hidden": "true"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "truncate",
								children: item
							})]
						}, item);
					})]
				}) : null] }) : null
			}) : null
		]
	});
	const sourcePills = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex flex-wrap gap-2",
		children: Object.keys(SOURCE_META).map((key) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SourcePill, {
			id: key,
			on: sources[key],
			onToggle: () => toggle(key)
		}, key))
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "min-h-screen",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "fixed inset-x-0 top-0 z-30 h-0.5",
				"aria-hidden": "true",
				children: loading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "folio-bar h-full w-1/3 bg-accent" }) : null
			}),
			onResults ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("header", {
				className: `fixed inset-x-0 top-0 z-20 border-b border-line bg-bg transition-transform duration-200 ease-out ${chrome === "hidden" && !open ? "-translate-y-full" : "translate-y-0"}`,
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mx-auto flex max-w-6xl flex-col px-4 py-3 sm:px-6",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: goHome,
							className: `w-fit font-display text-2xl tracking-tight text-ink transition-transform duration-150 ease-out active:scale-[0.96] ${chrome === "search" && !open ? "hidden" : ""}`,
							children: "Folio"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: chrome === "search" && !open ? "" : "pt-4",
							children: searchForm
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: chrome === "search" && !open ? "hidden" : "pt-4",
							children: sourcePills
						})
					]
				})
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "flex min-h-screen flex-col items-center bg-bg px-4 pt-[18vh]",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
						className: "mb-6 max-w-xl text-center font-display text-4xl leading-tight tracking-tight text-ink sm:text-5xl",
						children: "Folio by Zip1 — Web, Wikipedia & Grokipedia Search"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "w-full max-w-xl",
						children: searchForm
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-4 max-w-xl text-center text-sm leading-relaxed text-muted",
						children: "Search the web with Folio by Zip1. Explore web results and optional Wikipedia and Grokipedia sources from one simple search interface."
					}),
					adsOn ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NetworkAd, {}) : null,
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => setAdsOpen(true),
						className: "mt-8 min-h-11 text-sm text-muted",
						children: "Ad preferences"
					}),
					!anySource ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-4 w-full max-w-xl",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mb-2 text-sm text-accent",
							children: "Turn on Web, Wikipedia, or Grokipedia to search."
						}), sourcePills]
					}) : null
				]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				"aria-labelledby": "how-folio",
				className: "mx-auto max-w-xl px-4 pb-16",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					id: "how-folio",
					className: "font-display text-2xl text-ink",
					children: "How Folio works"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-3 text-sm leading-relaxed text-muted",
					children: "Submit a query in the search bar. Web results are included. Wikipedia and Grokipedia are optional sources you can turn on or off."
				})]
			})] }),
			onResults ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", {
				className: "mx-auto max-w-6xl px-4 pt-52 pb-8 sm:px-6 sm:pb-10",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Results, {
					query,
					data,
					loading,
					sources,
					pages: {
						web: search.webPage ?? 1,
						wiki: search.wikiPage ?? 1,
						grok: search.grokPage ?? 1
					},
					onPage,
					onDive: (value) => go(value)
				})
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SiteFooter, {}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AdPreferences, {
				open: adsOpen,
				adsOn,
				onClose: () => setAdsOpen(false),
				onChange: (next) => {
					setAdsOn(next);
					localStorage.setItem(STORAGE_ADS, next ? "1" : "0");
				}
			})
		]
	});
}
function NetworkAd() {
	const [ad, setAd] = (0, import_react.useState)(void 0);
	(0, import_react.useEffect)(() => {
		let cancelled = false;
		requestNetworkAd({ data: {} }).then((row) => {
			if (!cancelled) setAd(row);
		}).catch(() => {
			if (!cancelled) setAd(null);
		});
		return () => {
			cancelled = true;
		};
	}, []);
	if (ad === void 0) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: "mt-6 text-sm text-muted",
		children: "Asking the ad network…"
	});
	if (!ad) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: "mt-6 text-sm text-muted",
		children: "The ad network didn’t return an ad."
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("aside", {
		className: "mt-6 w-full max-w-xl",
		"aria-label": "Paid advertisement",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", {
			href: ad.clickUrl,
			className: "block rounded-2xl border border-line bg-surface px-4 py-3 text-left",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "flex items-center gap-2 text-xs tracking-widest text-muted uppercase",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "rounded-full bg-accent-soft px-2 py-0.5 font-medium text-accent",
						children: "Ad"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: ad.network })]
				}),
				ad.imageUrl ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
					src: ad.imageUrl,
					alt: "",
					className: "mt-3 max-h-52 w-full rounded-xl object-contain"
				}) : null,
				ad.text ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "mt-2 block text-sm leading-relaxed text-ink",
					children: ad.text
				}) : null
			]
		})
	});
}
function AdPreferences({ open, adsOn, onClose, onChange }) {
	const titleId = (0, import_react.useId)();
	if (!open) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "fixed inset-0 z-50",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
			type: "button",
			"aria-label": "Close ad preferences",
			onClick: onClose,
			className: "absolute inset-0 bg-ink/35"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			role: "dialog",
			"aria-modal": "true",
			"aria-labelledby": titleId,
			className: "absolute top-1/2 left-1/2 w-[min(24rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-line bg-surface p-5",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					id: titleId,
					className: "font-display text-2xl",
					children: "Ad preferences"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 text-sm leading-relaxed text-muted",
					children: "Sponsored listings stay off unless you turn them on. Folio asks Kevel for one ad and does not send your search."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "mt-4 flex min-h-11 items-start gap-3 text-sm text-ink",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						type: "checkbox",
						className: "mt-1 size-4 accent-accent",
						checked: adsOn,
						onChange: (event) => onChange(event.target.checked)
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Call the ad network for a sponsored listing" })]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: onClose,
					className: "mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-ink px-4 text-sm font-medium text-bg",
					children: "Done"
				})
			]
		})]
	});
}
function SourcePill({ id, on, onToggle }) {
	const meta = SOURCE_META[id];
	const Icon = meta.icon;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		"aria-pressed": on,
		onClick: onToggle,
		className: `inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm transition-transform duration-150 ease-out active:scale-[0.96] ${on ? "border-accent bg-accent-soft text-ink" : "border-line bg-surface text-muted"}`,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
				className: "size-4",
				"aria-hidden": "true"
			}),
			meta.label,
			meta.optional ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "text-xs text-muted",
				children: "optional"
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "font-medium",
				children: on ? "On" : "Off"
			})
		]
	});
}
function siteHost(url) {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return "";
	}
}
function youtubeId(url) {
	try {
		const parsed = new URL(url);
		const host = parsed.hostname.replace(/^www\./, "");
		const idFrom = (value) => value && /^[A-Za-z0-9_-]{11}$/.test(value) ? value : null;
		if (host === "youtu.be") return idFrom(parsed.pathname.split("/").filter(Boolean)[0]);
		if (host !== "youtube.com" && host !== "m.youtube.com" && host !== "music.youtube.com") return null;
		const watch = idFrom(parsed.searchParams.get("v"));
		if (parsed.pathname === "/watch") return watch;
		const parts = parsed.pathname.split("/").filter(Boolean);
		if (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live" || parts[0] === "v") return idFrom(parts[1]);
		return null;
	} catch {
		return null;
	}
}
function SiteLogo({ url }) {
	const host = siteHost(url);
	const [broken, setBroken] = (0, import_react.useState)(false);
	(0, import_react.useEffect)(() => {
		setBroken(false);
	}, [host]);
	if (!host) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: "grid size-6 shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-surface",
		children: broken ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "text-xs font-medium text-muted",
			children: host.charAt(0).toUpperCase()
		}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
			src: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`,
			alt: "",
			width: 18,
			height: 18,
			loading: "lazy",
			decoding: "async",
			className: "size-[18px]",
			onError: () => setBroken(true)
		})
	});
}
function pickReferences(data) {
	const pools = [
		data.web.results,
		data.wiki.results,
		data.grok.results
	];
	const picks = [];
	const seen = /* @__PURE__ */ new Set();
	for (let index = 0; index < 3 && picks.length < 6; index += 1) for (const pool of pools) {
		const hit = pool[index];
		if (!hit || seen.has(hit.url)) continue;
		seen.add(hit.url);
		picks.push(hit);
		if (picks.length >= 6) break;
	}
	return picks;
}
function Definitions({ items }) {
	if (!items.length) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		"aria-labelledby": "word-definitions",
		className: "rounded-3xl border border-line bg-surface p-4",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
			id: "word-definitions",
			className: "font-display text-xl",
			children: "Definitions"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "mt-3 grid gap-4",
			children: items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "font-display text-3xl leading-none text-ink",
					children: item.word
				}),
				item.phonetic ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 text-sm text-muted",
					children: item.phonetic
				}) : null,
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "mt-3 grid gap-3",
					children: item.senses.map((sense) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-xs tracking-wide text-accent uppercase",
							children: sense.part
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-0.5 text-sm leading-relaxed text-ink",
							children: sense.definition
						}),
						sense.example ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "mt-1 text-sm text-muted",
							children: [
								"“",
								sense.example,
								"”"
							]
						}) : null
					] }, `${sense.part}-${sense.definition}`))
				}),
				item.source ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
					href: item.source,
					className: "mt-2 inline-flex min-h-11 items-center text-sm text-muted",
					children: "WordNet"
				}) : null
			] }, item.word))
		})]
	});
}
function References({ hits }) {
	const [expanded, setExpanded] = (0, import_react.useState)(true);
	if (hits.length < 2) return null;
	const shown = expanded ? hits : hits.slice(0, 3);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		"aria-labelledby": "search-references",
		className: "rounded-3xl border border-line bg-surface p-2",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				id: "search-references",
				className: "px-3 pt-2 font-display text-xl",
				children: "References"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { children: shown.map((hit) => {
				const host = siteHost(hit.url);
				const detail = [hit.meta, hit.snippet].filter(Boolean).join(" — ");
				return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
					className: "border-b border-line last:border-b-0",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", {
						href: hit.url,
						className: "block px-3 py-3",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "flex items-center gap-2 text-sm text-muted",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SiteLogo, { url: hit.url }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "min-w-0 truncate",
									children: host
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "mt-1 block text-base leading-snug font-medium text-ink",
								children: hit.title
							}),
							detail ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "mt-1 line-clamp-2 block text-sm leading-relaxed text-muted",
								children: detail
							}) : null
						]
					})
				}, hit.id);
			}) }),
			hits.length > 3 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: () => setExpanded((value) => !value),
				className: "mt-1 min-h-11 w-full rounded-full bg-bg text-sm font-medium text-ink",
				children: expanded ? "Show less" : "Show more"
			}) : null
		]
	});
}
function DeepDive({ topic, items, onPick }) {
	if (!items.length) return null;
	const needle = topic.trim().toLowerCase();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h3", {
		className: "font-display text-xl text-ink",
		children: ["Deep dive into ", topic]
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
		className: "mt-3 grid gap-2 sm:grid-cols-2",
		children: items.map((item) => {
			const at = needle && item.toLowerCase().startsWith(needle) ? needle.length : -1;
			const shared = at > 0 ? item.slice(0, at) : "";
			const rest = at > 0 ? item.slice(at) : item;
			return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
				type: "button",
				onClick: () => onPick(item),
				className: "flex min-h-11 w-full items-center gap-2 rounded-full border border-line bg-surface px-3 text-left text-sm text-ink",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Search, {
					className: "size-4 shrink-0 text-muted",
					"aria-hidden": "true"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "min-w-0 truncate",
					children: shared ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: shared }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "font-semibold",
						children: rest
					})] }) : item
				})]
			}) }, item);
		})
	})] });
}
function Results({ query, data, loading, sources, pages, onPage, onDive }) {
	const blocks = [
		"web",
		"wiki",
		"grok"
	].filter((key) => sources[key] && data);
	const visible = blocks.map((key) => ({
		key,
		hits: data ? data[key].results : [],
		error: data?.[key].error,
		done: data ? data[key].done : true,
		total: data?.[key].total,
		page: pages[key]
	}));
	const flat = visible.flatMap((block) => block.hits);
	const [openId, setOpenId] = (0, import_react.useState)(null);
	const openIndex = flat.findIndex((hit) => hit.id === openId);
	const openHit = openIndex >= 0 ? flat[openIndex] : null;
	(0, import_react.useEffect)(() => {
		setOpenId(null);
	}, [query, data]);
	if (!data) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "grid gap-4",
		"aria-busy": "true",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
			className: "font-display text-4xl text-ink",
			children: query
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, {})]
	});
	const anyHits = visible.some((block) => block.hits.length > 0);
	const enabled = blocks.map((key) => SOURCE_META[key].label).join(" · ");
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: loading ? "opacity-70" : void 0,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mb-6 flex flex-wrap items-end justify-between gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "font-display text-4xl text-ink sm:text-5xl",
					children: query
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "text-sm text-muted tabular-nums",
					"aria-live": "polite",
					children: [
						enabled,
						" · ",
						formatTook(data.tookMs)
					]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "order-2 grid gap-10 lg:order-1",
					children: [!anyHits && !loading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-muted",
						children: "Nothing matched. Try fewer words, or switch on another source."
					}) : null, visible.map((block) => {
						const count = resultCount(block.total, block.key);
						const last = lastPage(block.key === "web" ? void 0 : block.total, block.page, block.hits.length, block.done, block.key === "grok" ? 12 : block.key === "web" ? 10 : 8);
						return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
							"aria-labelledby": `source-${block.key}`,
							className: "grid gap-3",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "border-b border-line pb-2",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
										id: `source-${block.key}`,
										className: "font-display text-2xl",
										children: SOURCE_META[block.key].label
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
										className: "mt-1 text-sm text-muted",
										children: [
											"Search for ",
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
												className: "text-ink",
												children: [
													"“",
													query,
													"”"
												]
											}),
											count ? ` — ${count}` : ""
										]
									})]
								}),
								block.error ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "text-sm text-muted",
									children: [SOURCE_META[block.key].label, " didn’t respond. The other sources still ran."]
								}) : null,
								!block.error && block.hits.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-sm text-muted",
									children: block.page > 1 ? "Nothing on this page." : `No matches in ${SOURCE_META[block.key].label}.`
								}) : null,
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
									className: "grid",
									children: block.hits.map((hit, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_react.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
										className: `border-b border-line ${hit.id === openId ? "bg-accent-soft" : ""}`,
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "flex items-start gap-1",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
												type: "button",
												onClick: () => setOpenId(hit.id),
												"aria-pressed": hit.id === openId,
												className: "group min-w-0 flex-1 px-1 py-4 text-left",
												children: [
													/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
														className: "flex items-center gap-2 text-xs tracking-wide text-muted uppercase",
														children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SiteLogo, { url: hit.url }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
															className: "min-w-0 truncate",
															children: hit.meta
														})]
													}),
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
														className: "mt-1 font-display text-xl leading-snug text-ink group-hover:text-accent",
														children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Highlight, {
															text: hit.title,
															query
														})
													}),
													hit.snippet ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
														className: "mt-1 line-clamp-2 text-sm leading-relaxed text-muted",
														children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Highlight, {
															text: hit.snippet,
															query
														})
													}) : null
												]
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
												href: hit.url,
												target: "_blank",
												rel: "noreferrer",
												"aria-label": `Open ${hit.title} in a new tab`,
												className: "mt-3 grid size-11 shrink-0 place-items-center rounded-full text-muted hover:text-accent",
												children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowUpRight, {
													className: "size-4",
													"aria-hidden": "true"
												})
											})]
										})
									}), block.key === "web" && index === 0 && block.page === 1 && data.deepDive.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
										className: "border-b border-line py-4",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DeepDive, {
											topic: query,
											items: data.deepDive,
											onPick: onDive
										})
									}) : null] }, hit.id))
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pager, {
									label: SOURCE_META[block.key].label,
									page: block.page,
									last,
									disabled: loading || Boolean(block.error),
									onPage: (page) => onPage(block.key, page)
								}),
								block.key === "web" && block.hits.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-xs text-muted",
									children: "Web listings via Bing’s public results feed."
								}) : null
							]
						}, block.key);
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "order-1 grid gap-4 lg:order-2",
					children: [
						data.card ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Lead, { card: data.card }) : null,
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(References, { hits: pickReferences(data) }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PlaceList, {
							places: data.places,
							error: data.placesError
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Definitions, { items: data.definitions }),
						!data.card && !data.places.length && loading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, {}) : null
					]
				})]
			}),
			openHit ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ResultPeek, {
				hit: openHit,
				index: openIndex,
				total: flat.length,
				onClose: () => setOpenId(null),
				onPrev: () => {
					const prev = flat[openIndex - 1];
					if (prev) setOpenId(prev.id);
				},
				onNext: () => {
					const next = flat[openIndex + 1];
					if (next) setOpenId(next.id);
				}
			}) : null
		]
	});
}
function ResultPeek({ hit, index, total, onClose, onPrev, onNext }) {
	const closeRef = (0, import_react.useRef)(null);
	const titleId = (0, import_react.useId)();
	const [preview, setPreview] = (0, import_react.useState)(null);
	(0, import_react.useEffect)(() => {
		closeRef.current?.focus();
	}, [hit.id]);
	(0, import_react.useEffect)(() => {
		let cancelled = false;
		setPreview(null);
		if (hit.source === "web") return;
		previewHit({ data: {
			source: hit.source,
			title: hit.title,
			url: hit.url,
			snippet: hit.snippet
		} }).then((row) => {
			if (!cancelled) setPreview(row);
		}).catch(() => {
			if (!cancelled) setPreview(null);
		});
		return () => {
			cancelled = true;
		};
	}, [hit]);
	(0, import_react.useEffect)(() => {
		function onKey(event) {
			if (event.key === "Escape") onClose();
			else if (event.key === "ArrowLeft") {
				event.preventDefault();
				onPrev();
			} else if (event.key === "ArrowRight") {
				event.preventDefault();
				onNext();
			}
		}
		window.addEventListener("keydown", onKey);
		const previous = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			window.removeEventListener("keydown", onKey);
			document.body.style.overflow = previous;
		};
	}, [
		onClose,
		onPrev,
		onNext
	]);
	const paragraphs = (preview?.extract || hit.snippet).split(/\n\n+/).map((part) => part.trim()).filter(Boolean);
	const pageUrl = preview?.url || hit.url;
	const videoId = youtubeId(pageUrl);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "fixed inset-0 z-40",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
			type: "button",
			"aria-label": "Close preview",
			onClick: onClose,
			className: "absolute inset-0 bg-ink/35"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
			role: "dialog",
			"aria-modal": "true",
			"aria-labelledby": titleId,
			className: "folio-peek absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-3xl border border-line bg-surface sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:w-[min(32rem,100%)] sm:rounded-none sm:border-y-0 sm:border-r-0",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "px-4 pt-2 sm:pt-4",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mx-auto mb-2 h-1 w-10 rounded-full bg-line sm:hidden",
						"aria-hidden": "true"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center justify-between gap-2 pb-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "flex min-w-0 items-center gap-2 text-xs tracking-widest text-muted uppercase",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SiteLogo, { url: pageUrl }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "truncate",
								children: siteHost(pageUrl) || SOURCE_META[hit.source].label
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center gap-1",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: onPrev,
									disabled: index <= 0,
									"aria-label": "Previous result",
									className: "grid size-11 place-items-center rounded-full text-ink disabled:opacity-40",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronLeft, {
										className: "size-4",
										"aria-hidden": "true"
									})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "min-w-12 text-center text-xs text-muted tabular-nums",
									children: [
										index + 1,
										" / ",
										total
									]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: onNext,
									disabled: index >= total - 1,
									"aria-label": "Next result",
									className: "grid size-11 place-items-center rounded-full text-ink disabled:opacity-40",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronRight, {
										className: "size-4",
										"aria-hidden": "true"
									})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									ref: closeRef,
									type: "button",
									onClick: onClose,
									"aria-label": "Close",
									className: "grid size-11 place-items-center rounded-full text-ink",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, {
										className: "size-4",
										"aria-hidden": "true"
									})
								})
							]
						})]
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "min-h-0 flex-1 overflow-y-auto px-5 pb-6",
					children: [
						videoId ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "mb-4 aspect-video overflow-hidden rounded-xl bg-ink",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("iframe", {
								src: `https://www.youtube-nocookie.com/embed/${videoId}`,
								title: preview?.title || hit.title,
								className: "h-full w-full",
								allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
								allowFullScreen: true,
								referrerPolicy: "strict-origin-when-cross-origin"
							}, videoId)
						}) : preview?.image ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
							src: preview.image,
							alt: "",
							className: "mb-4 max-h-52 w-full rounded-xl object-cover"
						}) : null,
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							id: titleId,
							className: "font-display text-3xl leading-tight",
							children: preview?.title || hit.title
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-sm text-accent",
							children: preview?.kicker || hit.meta
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "mt-4 grid gap-3",
							children: paragraphs.map((part, partIndex) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-sm leading-relaxed text-ink",
								children: part
							}, `${hit.id}-${partIndex}`))
						}),
						!preview && hit.source !== "web" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-4 text-sm text-muted",
							children: "Loading the full preview…"
						}) : null
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "border-t border-line p-4",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", {
						href: pageUrl,
						className: "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-ink px-4 text-sm font-medium text-bg",
						children: ["Open page", /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowUpRight, {
							className: "size-4",
							"aria-hidden": "true"
						})]
					})
				})
			]
		})]
	});
}
function resultCount(total, source) {
	if (!total || total <= 0) return null;
	if (source === "web") return `About ${total.toLocaleString("en-US")} results`;
	return `${total >= 1e4 ? "10,000+" : total.toLocaleString("en-US")} result${total === 1 ? "" : "s"}`;
}
function lastPage(total, page, count, done, pageSize) {
	if (typeof total === "number" && total > 0 && !(done && count === 0)) return Math.max(1, Math.min(400, Math.ceil(total / pageSize)));
	if (done) return Math.max(1, count === 0 && page > 1 ? page - 1 : page);
	return null;
}
function Pager({ label, page, last, disabled, onPage }) {
	const hasNext = last == null || page < last;
	if (!(page > 1 || hasNext)) return null;
	const items = last == null ? page <= 4 ? [
		1,
		2,
		3,
		4,
		5
	] : [
		1,
		"…",
		page - 1,
		page,
		page + 1
	] : pageItems(Math.min(page, last), last);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("nav", {
		"aria-label": `${label} pages`,
		className: "flex flex-wrap items-center justify-center gap-1.5",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: () => onPage(page - 1),
				disabled: disabled || page <= 1,
				className: "h-11 rounded-lg px-3 text-sm text-muted transition-transform duration-150 ease-out active:scale-[0.96] disabled:opacity-40",
				children: "Previous"
			}),
			items.map((item, index) => item === "…" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "px-1 text-sm text-muted",
				"aria-hidden": "true",
				children: "…"
			}, `gap-${index}`) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: () => {
					if (item !== page) onPage(item);
				},
				disabled,
				"aria-current": item === page ? "page" : void 0,
				"aria-label": `${label} page ${item}`,
				className: `h-11 min-w-11 rounded-lg border px-2 text-sm tabular-nums transition-transform duration-150 ease-out active:scale-[0.96] disabled:opacity-40 ${item === page ? "border-line bg-line text-ink" : "border-line bg-surface text-ink"}`,
				children: item
			}, item)),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: () => onPage(Math.min(last ?? page + 1, page + 1)),
				disabled: disabled || !hasNext,
				className: "h-11 rounded-lg px-3 text-sm text-ink transition-transform duration-150 ease-out active:scale-[0.96] disabled:opacity-40",
				children: "Next"
			})
		]
	});
}
function formatCoord(lat, lon) {
	const ns = lat >= 0 ? "N" : "S";
	const ew = lon >= 0 ? "E" : "W";
	return `${Math.abs(lat).toFixed(2)}° ${ns}, ${Math.abs(lon).toFixed(2)}° ${ew}`;
}
function PlaceList({ places, error }) {
	if (!places.length && !error) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		"aria-labelledby": "location-refs",
		className: "rounded-2xl border border-line bg-surface p-4",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex items-baseline justify-between gap-3",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				id: "location-refs",
				className: "font-display text-xl",
				children: "Location references"
			}), places.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-sm text-muted tabular-nums",
				children: places.length
			}) : null]
		}), error && !places.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "mt-2 text-sm text-muted",
			children: "Location references didn’t load."
		}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ol", {
			className: "mt-2",
			children: places.map((place, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
				className: "grid grid-cols-[1.5rem_minmax(0,1fr)] gap-2 border-b border-line py-3 last:border-b-0",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "font-display text-muted tabular-nums",
					children: index + 1
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "min-w-0",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
							href: place.url,
							target: "_blank",
							rel: "noreferrer",
							className: "font-medium text-ink hover:text-accent",
							children: place.name
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-0.5 text-sm leading-relaxed text-muted",
							children: place.detail
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "tabular-nums",
									children: formatCoord(place.lat, place.lon)
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
									href: place.map,
									target: "_blank",
									rel: "noreferrer",
									className: "font-medium text-ink",
									children: "Map"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: place.source === "wiki" ? "Wikipedia" : "GeoNames" })
							]
						})
					]
				})]
			}, place.id))
		})]
	});
}
function Lead({ card }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
		className: "rounded-2xl border border-line bg-surface p-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-xs tracking-widest text-muted uppercase",
				children: card.source === "wiki" ? "Wikipedia" : "Grokipedia"
			}),
			card.image ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
				src: card.image,
				alt: "",
				className: "mt-3 max-h-48 w-full rounded-xl object-cover"
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "mt-3 font-display text-2xl leading-tight",
				children: card.title
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 text-sm text-accent",
				children: card.kicker
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-3 text-sm leading-relaxed text-muted",
				children: card.extract
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", {
				href: card.url,
				className: "mt-4 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-ink",
				children: ["Read the article", /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowUpRight, {
					className: "size-4",
					"aria-hidden": "true"
				})]
			})
		]
	});
}
function Skeleton() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "grid gap-3",
		"aria-hidden": "true",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-8 w-2/3 rounded-lg bg-line" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-20 rounded-2xl bg-line" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-20 rounded-2xl bg-line" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-20 rounded-2xl bg-line" })
		]
	});
}
function FolioRoute() {
	const search = Route$2.useSearch();
	const data = Route$2.useLoaderData();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FolioApp, {
		search,
		data
	});
}
//#endregion
export { FolioRoute as component };
