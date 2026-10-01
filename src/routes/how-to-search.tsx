import { createFileRoute, Link } from "@tanstack/react-router";
import { DocPage } from "@/components/doc-page-chrome";

const TITLE = "How to search with Folio by Zip1";
const DESCRIPTION =
  "How to use Folio: enter a query, switch Web, Wikipedia, Grokipedia, and Images on or off, open a result, and move between pages.";
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
    <DocPage>
      <h1 className="font-display text-4xl leading-tight tracking-tight text-ink">Using Folio to search</h1>
      <div className="mt-6 grid gap-4 text-sm leading-relaxed text-ink">
        <p>
          Start in the search box on the Folio home page. Type a query and press the search button, or press Enter.
          The button stays disabled while the box is empty, so an empty search does not run.
        </p>
        <p>
          Four switches choose the sources: Web, Wikipedia, Grokipedia, and Images. Web, Wikipedia, and
          Grokipedia start on. Images starts off. Wikipedia, Grokipedia, and Images are marked optional.
          After you search, the switches sit with the search box. On the home page they stay hidden until every source is off. Then they
          appear under the message “Turn on Web, Wikipedia, Grokipedia, or Images to search.”
        </p>
        <p>
          Turning a switch off removes that source from the search. This browser stores the choice. If Web,
          Wikipedia, Grokipedia, and Images are all off, Folio does not fetch results, and the search button will not
          submit. Turn at least one source back on. If you are already on a results page and you switch the last
          source off, those source lists are no longer shown.
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
          Every search adds a short answer at the top of the results. Folio waits for the other sources, then sends
          your search and the top results from every source that is on to the model you picked in the search bar,
          which writes a few sentences from them. For Web, Wikipedia, and Grokipedia that means titles, snippets, and
          addresses. For Images it means each picture’s title and the page it was found on. Numbers in the answer
          link to the results it used, and the list under it opens each one in a new tab. The card is labeled as
          AI-generated because it can be wrong or leave things out, so check the sources. The other results show
          while the answer is written.
        </p>
        <p>
          The model menu is inside the search bar. A model this copy of Folio cannot run is shown but cannot be
          picked. This browser remembers your pick, and it is also part of the page address. If the model you picked
          does not answer, Folio asks the next one that is set up, and the note under the answer says which one
          wrote it.
        </p>
        <p>
          Click the title or text of a result to open a preview panel. Close it with Escape or the close control.
          While it is open, the left and right arrow keys move to the previous or next result (on a right-to-left page,
          the right arrow goes back). When a web, Wikipedia, or Grokipedia preview has sections,
          Contents lists them. Choosing one scrolls to that part. Listen reads the preview aloud in the site language.
          The player’s voice button lists the voices this browser has installed for that language, and the choice is
          remembered. Pause, stop, and speed are on the player, and closing the preview stops it. Open page goes to the
          original address in this window. The arrow button on the result row opens that address in a new tab. When a
          lead card is shown, Read the article opens the article in this window as well.
        </p>
        <p>
          The language menu at the top of the home screen switches the whole site, including search pages and these
          pages, between English, Bangla, Hindi, Arabic, Spanish, French, Simplified Chinese, Japanese, Portuguese, and German.
          Arabic switches the layout to right to left. This browser remembers the choice. Until you pick one, Folio uses
          the first of your browser’s languages that it has, or English. A link can also set it with{" "}
          <span className="font-mono">?lang=</span>, for example <span className="font-mono">?lang=ar</span>.
        </p>
        <p>
          The language also changes what Folio searches. When it is not English, Folio translates your words and
          searches that language’s Wikipedia. Bing’s web results only work reliably for words in Latin script, so the web
          is searched with your words when Bing can read them and otherwise with an English translation. Grokipedia only
          has English pages, so it is searched with an English translation, and its titles and snippets are translated
          into the site language. Lines under the query show the words each source was searched with. The AI answer is written in the site language, and Listen on the answer
          reads it with a voice for that language. A preview in another language is translated into the site language;
          a Wikipedia article from that language’s own Wikipedia is shown as it is. To change the language, go back to
          the home screen and pick another one there; your next search uses it.
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
        <h3 className="font-medium">What if the AI answer does not load?</h3>
        <p>
          Folio first tries the other providers that are set up. If none of them answers, the AI card shows a short
          note, and you can try again. The other results stay as they are. If the card says AI answers aren’t set up
          yet, this copy of Folio has no AI provider connected.
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
    </DocPage>
  );
}
