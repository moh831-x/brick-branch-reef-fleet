import { C as require_jsx_runtime, b as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { r as TITLE$1 } from "./router-CEyHGFY9.mjs";
import { t as SiteFooter } from "./site-footer-CwPAbZpz.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/about-BMKMx0YD.js
var import_jsx_runtime = require_jsx_runtime();
function AboutPage() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "mx-auto min-h-screen max-w-2xl px-4 pt-12",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mb-8",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
					to: "/",
					search: {
						q: "",
						near: ""
					},
					className: "font-display text-2xl tracking-tight text-ink",
					children: "Folio"
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
				className: "font-display text-4xl leading-tight tracking-tight text-ink",
				children: TITLE$1
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-6 grid gap-4 text-sm leading-relaxed text-ink",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Folio by Zip1 is the search page at this site. You type a query and Folio lists matches from the public web. Wikipedia and Grokipedia can be included in that same search when those sources are left on." }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "This site is a search interface. It is not an encyclopedia, and it does not publish its own articles. A web result points at a page from Bing’s public results feed, which Folio notes under the web list. A Wikipedia result points at a Wikipedia article. A Grokipedia result points at a Grokipedia page. Folio is not Wikipedia, Grokipedia, or Bing." }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Web, Wikipedia, and Grokipedia start switched on. Wikipedia and Grokipedia are marked optional. You can turn any of the three off, and this browser remembers the choice. If every source is off, Folio does not run a search. The search button stays disabled, and the home page asks you to turn Web, Wikipedia, or Grokipedia on again." }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "When a search runs, each source that is on has its own list. If Wikipedia returns a first article, a short card can sit beside the lists. If Wikipedia is off and Grokipedia has a first result, that card can come from Grokipedia instead. The side of the results can also show a few references taken from the lists, place names when a location is found, and short definitions for words in the query. Those blocks show up only when the lookup returns them." }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Select a result to open a preview. On a wide screen the panel sits at the side. On a narrow screen it sits along the bottom. It shows the title and the text Folio already has. Wikipedia and Grokipedia previews can load a longer extract. If the result address is a YouTube video, the panel can play that video. Open page leaves Folio and goes to the address in the same window. The arrow on a result opens that address in a new tab." }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
						"A search address includes the query you typed. Those addresses are for searching, not articles of their own. The written pages on this site are this one and",
						" ",
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
							to: "/how-to-search",
							className: "text-accent",
							children: "How to search"
						}),
						"."
					] })
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-8",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
					to: "/",
					search: {
						q: "",
						near: ""
					},
					className: "text-sm font-medium text-ink",
					children: "Back to search"
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SiteFooter, {})
		]
	});
}
//#endregion
export { AboutPage as component };
