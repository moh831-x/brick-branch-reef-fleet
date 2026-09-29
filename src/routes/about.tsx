import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter } from "@/components/site-footer";

const TITLE = "About Folio by Zip1";
const DESCRIPTION =
  "Folio by Zip1 is a web search page. It lists public web results and can include Wikipedia and Grokipedia when those sources are switched on.";
const CANONICAL = "https://www.zip1.ai/about";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 pt-12">
      <p className="mb-8">
        <Link to="/" search={{ q: "", near: "" }} className="font-display text-2xl tracking-tight text-ink">
          Folio
        </Link>
      </p>
      <h1 className="font-display text-4xl leading-tight tracking-tight text-ink">{TITLE}</h1>
      <div className="mt-6 grid gap-4 text-sm leading-relaxed text-ink">
        <p>
          Folio by Zip1 is the search page at this site. You type a query and Folio lists matches from the public web.
          Wikipedia and Grokipedia can be included in that same search when those sources are left on.
        </p>
        <p>
          This site is a search interface. It is not an encyclopedia, and it does not publish its own articles. A web
          result points at a page from Bing’s public results feed, which Folio notes under the web list. A Wikipedia
          result points at a Wikipedia article. A Grokipedia result points at a Grokipedia page. Folio is not Wikipedia,
          Grokipedia, or Bing.
        </p>
        <p>
          Web, Wikipedia, and Grokipedia start switched on. Images starts off and adds a grid of pictures from Bing’s
          public image results when you turn it on. Wikipedia, Grokipedia, and Images are marked optional. You can turn
          any source on or off, and this browser remembers the choice. If every source is off, Folio does not run a
          search. The search button stays disabled, and the home page asks you to turn Web, Wikipedia, Grokipedia, or
          Images on again.
        </p>
        <p>
          When a search runs, each source that is on has its own list. If Wikipedia returns a first article, a short
          card can sit beside the lists. If Wikipedia is off and Grokipedia has a first result, that card can come from
          Grokipedia instead. The side of the results can also show a few references taken from the lists, place names
          when a location is found, and short definitions for words in the query. Those blocks show up only when the
          lookup returns them.
        </p>
        <p>
          Select a result to open a preview. On a wide screen the panel sits at the side. On a narrow screen it sits
          along the bottom. It shows the title and the text Folio already has. Wikipedia and Grokipedia previews can
          load a longer extract. If the result address is a YouTube video, the panel can play that video. Open page
          leaves Folio and goes to the address in the same window. The arrow on a result opens that address in a new
          tab.
        </p>
        <p>
          A search address includes the query you typed. Those addresses are for searching, not articles of their own.
          The written pages on this site are this one,{" "}
          <Link to="/how-to-search" className="text-accent">
            How to search
          </Link>
          , and the{" "}
          <Link to="/privacy" className="text-accent">
            Privacy policy
          </Link>
          .
        </p>
      </div>
      <p className="mt-8">
        <Link to="/" search={{ q: "", near: "" }} className="text-sm font-medium text-ink">
          Back to search
        </Link>
      </p>
      <SiteFooter />
    </main>
  );
}
