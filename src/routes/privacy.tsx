import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter } from "@/components/site-footer";

const TITLE = "Privacy policy";
const DESCRIPTION =
  "What Folio by Zip1 does with your searches: what goes to our server and the search sources, what stays in your browser, and which other services your browser contacts.";
const CANONICAL = "https://www.zip1.ai/privacy";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [{ title: `${TITLE} — Folio by Zip1` }, { name: "description", content: DESCRIPTION }],
    links: [{ rel: "canonical", href: CANONICAL }],
  }),
  component: PrivacyPage,
});

/** Details the site owner still has to supply. Shown highlighted until replaced. */
function Fill({ children }: { children: ReactNode }) {
  return <mark className="rounded-sm px-1 font-medium">[{children}]</mark>;
}

function Out({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="text-accent" rel="noreferrer">
      {children}
    </a>
  );
}

function PrivacyPage() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 pt-12">
      <p className="mb-8">
        <Link
          to="/"
          search={{ q: "", near: "" }}
          className="font-display text-2xl tracking-tight text-ink"
        >
          Folio
        </Link>
      </p>
      <h1 className="font-display text-4xl leading-tight tracking-tight text-ink">{TITLE}</h1>
      <p className="mt-2 text-sm text-muted">
        Effective <Fill>EFFECTIVE DATE</Fill>
      </p>
      <div className="mt-6 grid gap-4 text-sm leading-relaxed text-ink">
        <p>
          This page covers Folio by Zip1 at www.zip1.ai and the Folio app for iPhone, which shows
          this same site. Folio is run by <Fill>LEGAL ENTITY NAME</Fill>. Questions go to{" "}
          <Fill>CONTACT EMAIL</Fill>.
        </p>

        <h2 className="pt-2 font-display text-2xl">In short</h2>
        <ul className="grid list-disc gap-2 pl-5">
          <li>There are no accounts. Folio never asks for your name or email address.</li>
          <li>Folio does not use its own analytics. Google AdSense may use advertising cookies and tracking.</li>
          <li>
            When you search, your search text goes to Folio’s server. The server passes it to the
            sources you have on to get results. Folio does not save your searches in a database.
          </li>
          <li>
            AI answers are off unless you turn them on. Only then does your search, with the top
            results, go to the AI provider you picked (xAI, OpenAI, or Anthropic).
          </li>
          <li>
            Your source settings and recent searches are kept in your browser, not on our server.
          </li>
          <li>
            Google AdSense may display ads and receive browser details and the page URL, which
            can include your search query on results pages.
          </li>
        </ul>

        <h2 className="pt-2 font-display text-2xl">What you type and where it goes</h2>
        <p>
          A search sends what you typed (up to 180 characters) to Folio’s server, along with which
          sources are on and which page of results you want. If a search address includes a place
          (the “near” part of the address), that place is sent too. The server then asks these
          services for results:
        </p>
        <ul className="grid list-disc gap-2 pl-5">
          <li>
            <span className="font-medium">Microsoft Bing</span>: web results, related “Deep dive”
            searches, and image results when Images is on.
          </li>
          <li>
            <span className="font-medium">Wikipedia</span> (Wikimedia Foundation): articles, the
            summary card, and coordinates for place names, when Wikipedia is on.
          </li>
          <li>
            <span className="font-medium">Grokipedia</span> (xAI): pages and summaries, when
            Grokipedia is on.
          </li>
          <li>
            <span className="font-medium">One AI provider</span>, only when AI is on: xAI for Grok,
            OpenAI for ChatGPT, or Anthropic for Claude, whichever you picked. It receives your search
            plus the titles, snippets, and addresses of the top results from the sources that are on
            (for Images, each picture’s title and the page it was found on), to write the AI answer.
            The other two providers receive nothing. If the provider you picked does not answer, Folio
            sends the same request to the next provider that is set up, and the answer says which one
            wrote it. Each provider handles the request under its own API terms and privacy policy.
          </li>
          <li>
            <span className="font-medium">Datamuse</span>: short definitions for words in your
            search.
          </li>
          <li>
            <span className="font-medium">Open-Meteo</span> geocoding: place lookups for the
            location references.
          </li>
        </ul>
        <p>
          As you type, once there are at least two characters, Folio’s server sends the text so far
          to Wikipedia and Grokipedia for suggestions. When you open a result preview, the server
          sends that result’s title and address to Wikipedia or Grokipedia to get a longer extract.
          Folio’s server makes all of these requests itself. They carry the server’s own
          identification, not your IP address, cookies, or device details. Each service handles the
          requests it receives under its own policy. Trending topics come from Google Trends and
          Grokipedia, and Folio’s server fetches them without sending anything about you.
        </p>
        <p>
          Your search is also part of the page address (for example{" "}
          <span className="font-mono">/?q=…</span>), so it appears in your browser history and in
          the address you share if you copy the link. The public search endpoint at{" "}
          <span className="font-mono">/api/search</span> works the same way. The query is in the
          address, and results come from the same services. The website asks an AI provider for a short answer on
          every search. The public search endpoint sends the query to an AI provider only when the address asks for
          an AI answer (<span className="font-mono">ai=1</span>).
        </p>

        <h2 className="pt-2 font-display text-2xl">What stays in your browser</h2>
        <p>Folio keeps three items in your browser’s local storage for this site:</p>
        <ul className="grid list-disc gap-2 pl-5">
          <li>which sources you turned on or off;</li>
          <li>which AI model you picked, if you picked one;</li>
          <li>your last six searches, shown under Recent;</li>
        </ul>
        <p>
          These stay on your device. Folio’s server does not receive them as stored data. It only
          receives the search you are running. To remove them, use Clear next to Recent, or clear
          this site’s data in your browser settings.
        </p>

        <h2 className="pt-2 font-display text-2xl">On Folio’s server</h2>
        <p>
          Folio has no user database and does not write your searches to its own logs. To avoid
          repeating the same requests, the server briefly keeps some source responses in memory (for
          up to ten minutes, and only the most recent few dozen). That memory is not linked to you
          and is cleared when the server restarts.
        </p>
        <p>
          Folio is hosted on Vercel. Like any web host, Vercel receives each request’s IP address,
          browser details, time, and the address requested, which can include your search text. How
          long Vercel keeps these request logs is <Fill>VERCEL LOG RETENTION PERIOD</Fill>. See the{" "}
          <Out href="https://vercel.com/legal/privacy-notice">Vercel privacy notice</Out>.
        </p>

        <h2 className="pt-2 font-display text-2xl">What your browser loads from other services</h2>
        <p>
          Some parts of a Folio page load straight from other companies’ servers. Those companies
          see your IP address and browser details when they do:
        </p>
        <ul className="grid list-disc gap-2 pl-5">
          <li>
            <span className="font-medium">Google Fonts</span> serves Folio’s typefaces on every
            page.
          </li>
          <li>
            <span className="font-medium">Google’s favicon service</span> serves the small site
            icons next to results. That request includes the result’s domain name.
          </li>
          <li>
            <span className="font-medium">Images in results</span> come from Bing’s image servers,
            Wikimedia, Google (pictures on trending topics), and, when you open an image preview,
            the site that hosts that image.
          </li>
          <li>
            <span className="font-medium">YouTube</span> (youtube-nocookie.com) loads only when you
            open the preview of a YouTube result.
          </li>
          <li>
            <span className="font-medium">A “Created with Grok” script</span> from grok.com (xAI)
            loads on each page. It checks with xAI’s app-builder service whether to show a small
            “Created with Grok · Remix” banner that links to Grok.
          </li>
        </ul>
        <p>
          Related policies: <Out href="https://policies.google.com/privacy">Google</Out>,{" "}
          <Out href="https://www.microsoft.com/privacy/privacystatement">Microsoft</Out>,{" "}
          <Out href="https://foundation.wikimedia.org/wiki/Policy:Privacy_policy">Wikimedia</Out>,{" "}
          <Out href="https://x.ai/legal/privacy-policy">xAI</Out>,{" "}
          <Out href="https://openai.com/policies/privacy-policy">OpenAI</Out>,{" "}
          <Out href="https://www.anthropic.com/legal/privacy">Anthropic</Out>.
        </p>

        <h2 className="pt-2 font-display text-2xl">Ads</h2>
        <p>
          Folio uses Google AdSense to display advertisements. Google and other third-party
          advertising vendors may use cookies to serve ads based on your previous visits to this
          site or other websites. Google’s advertising cookies allow it and its partners to show
          personalized ads. Ad requests may share your IP address, browser details, and page URL
          with Google. You can manage personalized advertising through{" "}
          <Out href="https://myadcenter.google.com/">Google My Ad Center</Out> or opt out of
          participating third-party vendors through{" "}
          <Out href="https://www.aboutads.info/choices/">AdChoices</Out>. Read more about{" "}
          <Out href="https://policies.google.com/technologies/ads">Google’s advertising practices</Out>.
        </p>

        <h2 className="pt-2 font-display text-2xl">Links you open</h2>
        <p>
          Results link to other sites, which have their own privacy practices. The arrow on a result
          opens the page without passing Folio’s address along. In the iPhone app, outside pages
          open in Apple’s in-app Safari view.
        </p>

        <h2 className="pt-2 font-display text-2xl">The iPhone app</h2>
        <p>
          The Folio app shows this website, so everything above applies. The app itself does not add
          accounts, analytics, advertising identifiers, or tracking, and it does not ask for your
          location, photos, or contacts. The Share button hands a link to the iOS share sheet only
          when you tap it, and you choose where it goes.
        </p>

        <h2 className="pt-2 font-display text-2xl">What Folio does not do</h2>
        <ul className="grid list-disc gap-2 pl-5">
          <li>Folio does not sell or rent information about you.</li>
          <li>Folio does not build profiles or track you across other sites and apps.</li>
          <li>
            Folio does not ask for or knowingly collect personal information from anyone, including
            children.
          </li>
        </ul>
        <p>
          Results come from the open web. Folio does not add its own content filter, so be aware of
          this if a child is using it.
        </p>

        <h2 className="pt-2 font-display text-2xl">Your choices</h2>
        <ul className="grid list-disc gap-2 pl-5">
          <li>Turn Wikipedia, Grokipedia, or Images off so a search skips them.</li>
          <li>Leave AI off so your search is never sent to an AI provider.</li>
          <li>Clear Recent, or clear this site’s data in your browser.</li>
          <li>Manage personalized ads through Google My Ad Center.</li>
          <li>
            Avoid typing personal details into the search box, since searches are sent to the
            services above.
          </li>
        </ul>

        <h2 className="pt-2 font-display text-2xl">Changes</h2>
        <p>
          If Folio’s handling of data changes, this page and the effective date above will change
          with it. Questions or requests: <Fill>CONTACT EMAIL</Fill>.
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
