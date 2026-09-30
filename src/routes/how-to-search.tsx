import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter } from "@/components/site-footer";

const TITLE = "How to search with Folio by Zip1";
const DESCRIPTION =
  "How to use Folio: enter a query, switch Web, Wikipedia, Grokipedia, and Images on or off, open a result, and move between pages.";
const CANONICAL = "https://www.zip1.ai/how-to-search";

const howToJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  "@id": CANONICAL,
  url: CANONICAL,
  name: TITLE,
  description: DESCRIPTION,
  isPartOf: { "@id": "https://www.zip1.ai/#website" },
  mainEntity: {
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "What if every source is off?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Folio does not run the search. Turn Web, Wikipedia, Grokipedia, or Images on. The search button works again as soon as one source is on and the box is not empty.",
        },
      },
      {
        "@type": "Question",
        name: "What if one source does not respond?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "That source shows a notice that it did not respond. Sources that are still on keep their own results.",
        },
      },
      {
        "@type": "Question",
        name: "What if nothing matches?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "An empty source says it has no matches. If every source that is on is empty, Folio says nothing matched and suggests fewer words or another source.",
        },
      },
      {
        "@type": "Question",
        name: "Is a search address its own page?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "No. The query stays on the Folio search page. About and this page are the pages that explain the site.",
        },
      },
    ],
  },
};

export const Route = createFileRoute("/how-to-search")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
    scripts: [{ type: "application/ld+json", children: JSON.stringify(howToJsonLd) }],
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
          Four switches choose the sources: Web, Wikipedia, Grokipedia, and Images. Web, Wikipedia, and Grokipedia
          start on. Images starts off. Wikipedia, Grokipedia, and Images are marked optional. After you search, the
          switches sit with the search box. On the home page they stay hidden until every source is off. Then they
          appear under the message “Turn on Web, Wikipedia, Grokipedia, or Images to search.”
        </p>
        <p>
          An AI switch sits with the sources and starts on. When it is on, the first page includes an AI answer written
          from the results, with numbered sources. Grok, ChatGPT, and Claude are tabs on that answer. Later pages do not
          ask again. Turning the switch off leaves the result lists and does not write an answer. Turning every source
          off still stops the search.
        </p>
        <p>
          Turning a switch off removes that source from the search. This browser stores the choice. If all four are
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
          Turn on Images to add a grid of pictures from Bing’s public image results, with SafeSearch set to moderate.
          Each tile shows a thumbnail, a title, and the site the picture comes from. Images shows up to 24 pictures on
          a page and goes up to 10 pages, with its own page controls like the other groups.
        </p>
        <p>
          Click the title or text of a result to open a preview panel. Close it with Escape or the close control.
          While it is open, the left and right arrow keys move to the previous or next result. Open page goes to the
          original address in this window. The arrow button on the result row opens that address in a new tab. When a
          lead card is shown, Read the article opens the article in this window as well.
        </p>
        <p>
          Click a picture to open the same preview with a larger copy of the image, its title, the site, and its size.
          Open page goes to the page the picture was found on, in this window. The arrow on the tile opens that page in
          a new tab, and View full-size image opens the picture itself in a new tab.
        </p>
        <h2 className="pt-2 font-display text-2xl">Questions</h2>
        <h3 className="font-medium">What if every source is off?</h3>
        <p>
          Folio does not run the search. Turn Web, Wikipedia, Grokipedia, or Images on. The search button works again as soon
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
