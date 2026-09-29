import { C as require_jsx_runtime, b as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as TITLE } from "./router-CEyHGFY9.mjs";
import { t as SiteFooter } from "./site-footer-CwPAbZpz.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/how-to-search-CW1jRQSI.js
var import_jsx_runtime = require_jsx_runtime();
function HowToSearchPage() {
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
				children: TITLE
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-6 grid gap-4 text-sm leading-relaxed text-ink",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Start in the search box on the Folio home page. Type a query and press the search button, or press Enter. The button stays disabled while the box is empty, so an empty search does not run." }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Three switches choose the sources: Web, Wikipedia, and Grokipedia. They start on. Wikipedia and Grokipedia are marked optional. After you search, the switches sit with the search box. On the home page they stay hidden until every source is off. Then they appear under the message “Turn on Web, Wikipedia, or Grokipedia to search.”" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Turning a switch off removes that source from the search. This browser stores the choice. If all three are off, Folio does not fetch results, and the search button will not submit. Turn at least one source back on. If you are already on a results page and you switch the last source off, those source lists are no longer shown." }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Focus the box before two characters are typed and Folio can show recent searches from this browser plus a short list of trending topics. Choose one to search for it. From two characters on, that list can show suggestions instead. Escape closes it." }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Results are grouped by the sources that are on. The web group notes that its listings come from Bing’s public results feed. Each group has its own Previous, page numbers, and Next controls. Web shows up to 10 results on a page, Wikipedia up to 8, and Grokipedia up to 12. Another page keeps the query and the sources, and moves only that group." }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Click the title or text of a result to open a preview panel. Close it with Escape or the close control. While it is open, the left and right arrow keys move to the previous or next result. Open page goes to the original address in this window. The arrow button on the result row opens that address in a new tab. When a lead card is shown, Read the article opens the article in this window as well." }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "pt-2 font-display text-2xl",
						children: "Questions"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
						className: "font-medium",
						children: "What if every source is off?"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Folio does not run the search. Turn Web, Wikipedia, or Grokipedia on. The search button works again as soon as one source is on and the box is not empty." }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
						className: "font-medium",
						children: "What if one source does not respond?"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "That source shows a notice that it did not respond. Sources that are still on keep their own results." }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
						className: "font-medium",
						children: "What if nothing matches?"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "An empty source says it has no matches. If every source that is on is empty, Folio says nothing matched and suggests fewer words or another source." }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
						className: "font-medium",
						children: "Is a search address its own page?"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
						"No. The query stays on the Folio search page.",
						" ",
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
							to: "/about",
							className: "text-accent",
							children: "About"
						}),
						" ",
						"and this page are the pages that explain the site."
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
export { HowToSearchPage as component };
