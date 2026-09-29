import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter } from "@/components/site-footer";

const TITLE = "How to search with Folio by Zip1";
const DESCRIPTION =
  "How to use Folio: enter a query, switch Web, Wikipedia, and Grokipedia on or off, open a result, and move between pages.";
const CANONICAL = "https://www.zip1.ai/how-to-search";

export const Route = createFileRoute("/how-to-search")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
  }),
  component: HowToSearchPage,
});

function HowToSearchPage() {
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
          Start in the search box on the Folio home page. Type a query and press the search button, or press Enter.
          The button stays disabled while the box is empty, so an empty search does not run.
        </p>
        <p>
          Three switches choose the sources: Web, Wikipedia, and Grokipedia. They start on. Wikipedia and Grokipedia
          are marked optional. After you search, the switches sit with the search box. On the home page they stay
          hidden until every source is off. Then they appear under the message “Turn on Web, Wikipedia, or Grokipedia
          to search.”
        </p>
        <p>
          Turning a switch off removes that source from the search. This browser stores the choice. If all three are
          off, Folio does not fetch results, and the search button will not submit. Turn at least one source back on.
          If you are already on a results page and you switch the last source off, those source lists are no longer
          shown.
        </p>
        <p>
          Focus the box before two characters are typed and Folio can show recent searches from this browser plus a
          short list of trending topics. Choose one to search for it. From two characters on, that list can show
          suggestions instead. Escape closes it.
        </p>
        <p>
          Results are grouped by the sources that are on. The web group notes that its listings come from Bing’s
          public results feed. Each group has its own Previous, page numbers, and Next controls. Web shows up to 10
          results on a page, Wikipedia up to 8, and Grokipedia up to 12. Another page keeps the query and the sources,
          and moves only that group.
        </p>
        <p>
          Click the title or text of a result to open a preview panel. Close it with Escape or the close control.
          While it is open, the left and right arrow keys move to the previous or next result. Open page goes to the
          original address in this window. The arrow button on the result row opens that address in a new tab. When a
          lead card is shown, Read the article opens the article in this window as well.
        </p>
        <h2 className="pt-2 font-display text-2xl">Questions</h2>
        <h3 className="font-medium">What if every source is off?</h3>
        <p>
          Folio does not run the search. Turn Web, Wikipedia, or Grokipedia on. The search button works again as soon
          as one source is on and the box is not empty.
        </p>
        <h3 className="font-medium">What if one source does not respond?</h3>
        <p>
          That source shows a notice that it did not respond. Sources that are still on keep their own results.
        </p>
        <h3 className="font-medium">What if nothing matches?</h3>
        <p>
          An empty source says it has no matches. If every source that is on is empty, Folio says nothing matched and
          suggests fewer words or another source.
        </p>
        <h3 className="font-medium">Is a search address its own page?</h3>
        <p>
          No. The query stays on the Folio search page.{" "}
          <Link to="/about" className="text-accent">
            About
          </Link>{" "}
          and this page are the pages that explain the site.
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
