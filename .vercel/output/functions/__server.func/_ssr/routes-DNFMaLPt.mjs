import { i as __toESM } from "../_runtime.mjs";
import { S as require_jsx_runtime, X as require_react, b as useNavigate, p as useRouterState } from "../_libs/@tanstack/react-router+[...].mjs";
import { a as Compass, c as ArrowUp, i as Globe, l as ArrowUpRight, o as Clock, r as Search, s as BookOpen, t as X } from "../_libs/lucide-react.mjs";
import { i as pageItems, n as Route, r as suggestQueries } from "./router-CdBj_tJo.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-DNFMaLPt.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var STORAGE_SOURCES = "folio-sources";
var STORAGE_RECENT = "folio-recent";
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
	const [open, setOpen] = (0, import_react.useState)(false);
	const [active, setActive] = (0, import_react.useState)(-1);
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
		document.title = query ? `${query} — Folio` : "Folio";
	}, [query]);
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
	const menu = typing ? suggestions.map((item) => item.title) : recent;
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
				}, `${item.source}-${item.title}`)) : recent.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
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
					}), recent.map((item, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						role: "option",
						"aria-selected": index === active,
						onMouseDown: (event) => {
							event.preventDefault();
							go(item);
						},
						className: `flex min-h-11 w-full items-center gap-3 px-4 text-left ${index === active ? "bg-accent-soft" : ""}`,
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Clock, {
							className: "size-4 shrink-0 text-muted",
							"aria-hidden": "true"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "truncate",
							children: item
						})]
					}, item))]
				}) : null
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
				className: "sticky top-0 z-20 border-b border-line bg-bg",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: goHome,
							className: "w-fit font-display text-2xl tracking-tight text-ink transition-transform duration-150 ease-out active:scale-[0.96]",
							children: "Folio"
						}),
						searchForm,
						sourcePills
					]
				})
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "flex min-h-screen flex-col items-center bg-bg px-4 pt-[18vh]",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: goHome,
						className: "mb-8 font-display text-5xl tracking-tight text-ink transition-transform duration-150 ease-out active:scale-[0.96]",
						children: "Folio"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "w-full max-w-xl",
						children: searchForm
					}),
					!anySource ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-4 w-full max-w-xl",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mb-2 text-sm text-accent",
							children: "Turn on Web, Wikipedia, or Grokipedia to search."
						}), sourcePills]
					}) : null
				]
			}),
			onResults ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", {
				className: "mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10",
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
					onPage
				})
			}) : null
		]
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
function Results({ query, data, loading, sources, pages, onPage }) {
	if (!data) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "grid gap-4",
		"aria-busy": "true",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
			className: "font-display text-4xl text-ink",
			children: query
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, {})]
	});
	const blocks = [
		"web",
		"wiki",
		"grok"
	].filter((key) => sources[key]);
	const visible = blocks.map((key) => ({
		key,
		hits: data[key].results,
		error: data[key].error,
		done: data[key].done,
		total: data[key].total,
		page: pages[key]
	}));
	const anyHits = visible.some((block) => block.hits.length > 0);
	const enabled = blocks.map((key) => SOURCE_META[key].label).join(" · ");
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: loading ? "opacity-70" : void 0,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
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
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "order-2 grid gap-10 lg:order-1",
				children: [!anyHits && !loading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-muted",
					children: "Nothing matched. Try fewer words, or switch on another source."
				}) : null, visible.map((block) => {
					const count = resultCount(block.total);
					const last = lastPage(block.total, block.page, block.hits.length, block.done, block.key === "grok" ? 12 : 8);
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
								children: block.hits.map((hit) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
									className: "border-b border-line",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", {
										href: hit.url,
										target: "_blank",
										rel: "noreferrer",
										className: "group block py-4",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
												className: "text-xs tracking-wide text-muted uppercase",
												children: hit.meta
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
												className: "mt-1 flex items-start justify-between gap-3 font-display text-xl leading-snug text-ink group-hover:text-accent",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Highlight, {
													text: hit.title,
													query
												}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowUpRight, {
													className: "mt-1 size-4 shrink-0 text-muted",
													"aria-hidden": "true"
												})]
											}),
											hit.snippet ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
												className: "mt-1 line-clamp-3 text-sm leading-relaxed text-muted",
												children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Highlight, {
													text: hit.snippet,
													query
												})
											}) : null
										]
									})
								}, hit.id))
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
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PlaceList, {
						places: data.places,
						error: data.placesError
					}),
					data.card ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Lead, { card: data.card }) : null,
					!data.card && !data.places.length && loading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, {}) : null
				]
			})]
		})]
	});
}
function resultCount(total) {
	if (!total || total <= 0) return null;
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
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: place.source === "wiki" ? "Wikipedia" : "OpenStreetMap" })
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
				target: "_blank",
				rel: "noreferrer",
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
	const search = Route.useSearch();
	const data = Route.useLoaderData();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FolioApp, {
		search,
		data
	});
}
//#endregion
export { FolioRoute as component };
