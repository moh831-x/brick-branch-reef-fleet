import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { FolioApp } from "@/components/folio-app";
import { searchAll } from "@/lib/search.functions";
import { aiProviderOf, type AiProviderId } from "@/lib/ai.shared";
import { GROK_PAGE, IMAGES_MAX_PAGE, IMAGES_PAGE, PAGE, WEB_PAGE, pageOf } from "@/lib/search.shared";

const HOME_TITLE = "Folio by Zip1 — Web, Wikipedia & Grokipedia Search";
const HOME_DESCRIPTION =
  "Search the web with Folio by Zip1. Explore web results and optional Wikipedia and Grokipedia sources from one simple search interface.";
const HOME_URL = "https://www.zip1.ai/";

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Folio by Zip1",
  alternateName: "Folio",
  url: HOME_URL,
};

export type FolioSearch = {
  q: string;
  near: string;
  web?: boolean;
  wiki?: boolean;
  grok?: boolean;
  /** Images is opt-in: absent means off. */
  images?: boolean;
  /** AI is opt-in too: absent means off. It is not a loader dep, because it never changes the search itself. */
  ai?: boolean;
  /** Preferred AI provider (grok, openai, or claude). Not a loader dep either. */
  ai_model?: AiProviderId;
  webPage?: number;
  wikiPage?: number;
  grokPage?: number;
  imagesPage?: number;
};

function flag(value: unknown): boolean | undefined {
  if (value === "0" || value === 0 || value === false || value === "false") return false;
  if (value === "1" || value === 1 || value === true || value === "true") return true;
  return undefined;
}

function imagesPageOf(value: unknown): number | undefined {
  const page = pageOf(value);
  return page === undefined ? undefined : Math.min(IMAGES_MAX_PAGE, page);
}

export const Route = createFileRoute("/")({
  validateSearch: (raw: Record<string, unknown>): FolioSearch => ({
    q: typeof raw.q === "string" ? raw.q.slice(0, 180) : "",
    near: typeof raw.near === "string" ? raw.near.slice(0, 80) : "",
    web: flag(raw.web),
    wiki: flag(raw.wiki),
    grok: flag(raw.grok),
    images: flag(raw.images),
    ai: flag(raw.ai),
    ai_model: aiProviderOf(raw.ai_model),
    webPage: pageOf(raw.webPage),
    wikiPage: pageOf(raw.wikiPage),
    grokPage: pageOf(raw.grokPage),
    imagesPage: imagesPageOf(raw.imagesPage),
  }),
  search: {
    middlewares: [
      stripSearchParams({
        q: "",
        near: "",
        webPage: undefined,
        wikiPage: undefined,
        grokPage: undefined,
        imagesPage: undefined,
      }),
    ],
  },
  loaderDeps: ({ search }) => ({
    q: search.q.trim(),
    near: search.near.trim(),
    web: search.web,
    wiki: search.wiki,
    grok: search.grok,
    images: search.images,
    webPage: search.webPage ?? 1,
    wikiPage: search.wikiPage ?? 1,
    grokPage: search.grokPage ?? 1,
    imagesPage: search.imagesPage ?? 1,
  }),
  loader: ({ deps }) => {
    const q = deps.q.trim();
    if (!q) return null;
    return searchAll({
      data: {
        q,
        web: deps.web !== false,
        wiki: deps.wiki !== false,
        grok: deps.grok !== false,
        images: deps.images === true,
        webOffset: (deps.webPage - 1) * WEB_PAGE,
        wikiOffset: (deps.wikiPage - 1) * PAGE,
        grokOffset: (deps.grokPage - 1) * GROK_PAGE,
        imagesOffset: (deps.imagesPage - 1) * IMAGES_PAGE,
        card: true,
        near: deps.near.trim(),
      },
    });
  },
  head: ({ match }) => {
    const q = match.search.q.trim();
    if (q) {
      return {
        meta: [
          { title: `${q} — Folio` },
          { name: "robots", content: "noindex, follow" },
        ],
      };
    }
    return {
      meta: [
        { title: HOME_TITLE },
        { name: "description", content: HOME_DESCRIPTION },
      ],
      links: [{ rel: "canonical", href: HOME_URL }],
      scripts: [{ type: "application/ld+json", children: JSON.stringify(websiteJsonLd) }],
    };
  },
  component: FolioRoute,
});

function FolioRoute() {
  const search = Route.useSearch();
  const data = Route.useLoaderData();
  return <FolioApp search={search} data={data} />;
}
