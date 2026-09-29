import { Fragment, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowUp, ArrowUpRight, BookOpen, ChevronLeft, ChevronRight, Clock, Compass, Globe, ImageIcon, Search, Share, TrendingUp, X } from "lucide-react";
import type { FolioSearch } from "@/routes/index";
import {
  previewHit,
  requestNetworkAd,
  suggestQueries,
  trendingTopics,
  type HitPreview,
  type NetworkAd,
  type SearchHit,
  type SearchPayload,
  type SourceId,
  type Suggestion,
  type PlaceRef,
  type Trend,
  type WordDefinition,
} from "@/lib/search.functions";
import { GROK_PAGE, IMAGES_MAX_PAGE, IMAGES_PAGE, MAX_PAGE, PAGE, WEB_PAGE, pageItems } from "@/lib/search.shared";
import { SiteFooter } from "@/components/site-footer";
import { shareNative, tap, useIsNativeApp } from "@/lib/native";

type Sources = { web: boolean; wiki: boolean; grok: boolean; images: boolean };

/** Web, Wikipedia, and Grokipedia start on. Images is opt-in, so a plain search costs no extra requests. */
const DEFAULT_SOURCES: Sources = { web: true, wiki: true, grok: true, images: false };

const STORAGE_SOURCES = "folio-sources";
const STORAGE_RECENT = "folio-recent";
const STORAGE_ADS = "folio-ads";

const SOURCE_META: Record<
  SourceId,
  { label: string; optional: boolean; blurb: string; icon: typeof Globe }
> = {
  web: {
    label: "Web",
    optional: false,
    blurb: "News, official sites, and the rest of the public web.",
    icon: Globe,
  },
  wiki: {
    label: "Wikipedia",
    optional: true,
    blurb: "The free encyclopedia. Turn it on for articles and a short summary.",
    icon: BookOpen,
  },
  grok: {
    label: "Grokipedia",
    optional: true,
    blurb: "xAI’s encyclopedia. A second write-up, only when you want it.",
    icon: Compass,
  },
  images: {
    label: "Images",
    optional: true,
    blurb: "Pictures from Bing’s public image results. Off until you turn it on.",
    icon: ImageIcon,
  },
};

function readSources(): Sources {
  if (typeof window === "undefined") return DEFAULT_SOURCES;
  try {
    const raw = localStorage.getItem(STORAGE_SOURCES);
    if (!raw) return DEFAULT_SOURCES;
    const parsed = JSON.parse(raw) as Partial<Sources>;
    return {
      web: parsed.web !== false,
      wiki: parsed.wiki !== false,
      grok: parsed.grok !== false,
      images: parsed.images === true,
    };
  } catch {
    return DEFAULT_SOURCES;
  }
}

function readRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_RECENT);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string").slice(0, 6) : [];
  } catch {
    return [];
  }
}

function readAds(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_ADS) === "1";
  } catch {
    return false;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function Highlight({ text, query }: { text: string; query: string }) {
  const terms = [...new Set(query.toLowerCase().split(/\s+/).filter((term) => term.length > 1))];
  if (!terms.length || !text) return <>{text}</>;
  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "ig");
  const parts = text.split(pattern);
  return (
    <>
      {parts.map((part, index) =>
        terms.some((term) => part.toLowerCase() === term) ? (
          <mark key={`${part}-${index}`} className="rounded-sm px-0.5">
            {part}
          </mark>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        ),
      )}
    </>
  );
}

function formatTook(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function FolioApp({ search, data }: { search: FolioSearch; data: SearchPayload | null }) {
  const navigate = useNavigate({ from: "/" });
  const loading = useRouterState({ select: (state) => state.isLoading });
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const query = search.q.trim();
  const onResults = query.length > 0;

  const [draft, setDraft] = useState(query);
  const [sources, setSources] = useState<Sources>({
    web: search.web !== false,
    wiki: search.wiki !== false,
    grok: search.grok !== false,
    images: search.images === true,
  });
  const [recent, setRecent] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [trends, setTrends] = useState<Trend[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [chrome, setChrome] = useState<"full" | "hidden" | "search">("full");
  const [adsOn, setAdsOn] = useState(false);
  const [adsOpen, setAdsOpen] = useState(false);

  useEffect(() => {
    setAdsOn(readAds());
  }, []);

  useEffect(() => {
    setDraft(query);
    setOpen(false);
    setActive(-1);
  }, [query, search.web, search.wiki, search.grok, search.images]);

  useEffect(() => {
    if (!onResults) setSources(readSources());
    else {
      setSources({
        web: search.web !== false,
        wiki: search.wiki !== false,
        grok: search.grok !== false,
        images: search.images === true,
      });
    }
    setRecent(readRecent());
  }, [onResults, search.web, search.wiki, search.grok, search.images]);

  useEffect(() => {
    const q = draft.trim();
    if (!open || q.length < 2) return;
    const handle = window.setTimeout(() => {
      suggestQueries({ data: { q } })
        .then((rows) => setSuggestions(rows))
        .catch(() => setSuggestions([]));
    }, 180);
    return () => window.clearTimeout(handle);
  }, [draft, open]);

  useEffect(() => {
    let cancelled = false;
    trendingTopics({ data: {} })
      .then((rows) => {
        if (!cancelled) setTrends(rows);
      })
      .catch(() => {
        if (!cancelled) setTrends([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.title = query ? `${query} — Folio` : "Folio by Zip1 — Web, Wikipedia & Grokipedia Search";
  }, [query]);

  useEffect(() => {
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

  useEffect(() => {
    if (!query) return;
    window.scrollTo(0, 0);
  }, [query, search.webPage, search.wikiPage, search.grokPage, search.imagesPage]);

  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      event.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const anySource = sources.web || sources.wiki || sources.grok || sources.images;

  function persistSources(next: Sources) {
    setSources(next);
    try {
      localStorage.setItem(STORAGE_SOURCES, JSON.stringify(next));
    } catch {
      /* ignore quota */
    }
  }

  function remember(value: string) {
    const next = [value, ...readRecent().filter((item) => item.toLowerCase() !== value.toLowerCase())].slice(0, 6);
    try {
      localStorage.setItem(STORAGE_RECENT, JSON.stringify(next));
    } catch {
      /* ignore quota */
    }
    setRecent(next);
  }

  function go(value: string, nextSources = sources) {
    const q = value.trim();
    if (!q || (!nextSources.web && !nextSources.wiki && !nextSources.grok && !nextSources.images)) return;
    tap("medium");
    remember(q);
    setOpen(false);
    void navigate({
      to: "/",
      search: {
        q,
        near: search.near,
        web: nextSources.web,
        wiki: nextSources.wiki,
        grok: nextSources.grok,
        images: nextSources.images,
      },
    });
  }

  function toggle(key: SourceId) {
    const next = { ...sources, [key]: !sources[key] };
    tap("select");
    persistSources(next);
    if (onResults) {
      void navigate({
        to: "/",
        search: { q: query, near: search.near, web: next.web, wiki: next.wiki, grok: next.grok, images: next.images },
      });
    }
  }

  function clearRecent() {
    setRecent([]);
    try {
      localStorage.removeItem(STORAGE_RECENT);
    } catch {
      /* ignore */
    }
  }

  const typing = draft.trim().length >= 2;
  const menu = typing ? suggestions.map((item) => item.title) : [...trends.map((item) => item.title), ...recent];

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (active >= 0 && menu[active]) go(menu[active]);
    else go(draft);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
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
      setActive((current) => (current <= 0 ? menu.length - 1 : current - 1));
    }
  }

  function onPage(source: SourceId, page: number) {
    const next = page <= 1 ? undefined : page;
    tap("light");
    void navigate({
      to: "/",
      search: {
        q: query,
        near: search.near,
        web: search.web,
        wiki: search.wiki,
        grok: search.grok,
        images: search.images,
        webPage: source === "web" ? next : search.webPage,
        wikiPage: source === "wiki" ? next : search.wikiPage,
        grokPage: source === "grok" ? next : search.grokPage,
        imagesPage: source === "images" ? next : search.imagesPage,
      },
    });
  }

  const showMenu = open && menu.length > 0;

  function goHome() {
    setDraft("");
    setOpen(false);
    void navigate({ to: "/", search: { q: "", near: "" } });
  }

  const searchForm = (
    <form onSubmit={onSubmit} className="relative" role="search">
      <label htmlFor="folio-q" className="sr-only">
        Search
      </label>
      <div
        className="flex min-h-14 items-center gap-2 rounded-2xl border border-line bg-surface px-3 focus-within:border-accent"
        onMouseDown={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest("button, input")) return;
          event.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <Search className="size-5 shrink-0 text-muted" aria-hidden="true" />
        <input
          ref={inputRef}
          id="folio-q"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 140)}
          onKeyDown={onKeyDown}
          placeholder="Search"
          autoComplete="off"
          enterKeyHint="search"
          role="combobox"
          aria-expanded={showMenu}
          aria-controls={listId}
          aria-autocomplete="list"
          className="h-12 min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted"
        />
        {draft ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setDraft("");
              setOpen(true);
              inputRef.current?.focus();
            }}
            className="grid size-11 place-items-center rounded-full text-muted transition-transform duration-150 ease-out active:scale-[0.96]"
          >
            <X className="size-4" />
          </button>
        ) : null}
        <button
          type="submit"
          disabled={!draft.trim() || !anySource}
          aria-label="Search"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-ink text-bg transition-transform duration-150 ease-out active:scale-[0.96] disabled:opacity-40"
        >
          <ArrowUp className="size-4" />
        </button>
      </div>
      {showMenu ? (
        <div
          id={listId}
          role="listbox"
          className="absolute right-0 left-0 z-30 mt-2 max-h-[70vh] overflow-y-auto rounded-2xl border border-line bg-surface"
        >
          {typing ? (
            suggestions.map((item, index) => (
              <button
                key={`${item.source}-${item.title}`}
                type="button"
                role="option"
                aria-selected={index === active}
                onMouseDown={(event) => {
                  event.preventDefault();
                  go(item.title);
                }}
                className={`flex min-h-11 w-full items-center justify-between gap-3 px-4 text-left ${
                  index === active ? "bg-accent-soft" : ""
                }`}
              >
                <span className="truncate">{item.title}</span>
                <span className="shrink-0 text-xs tracking-wide text-muted uppercase">
                  {item.source === "wiki" ? "Wikipedia" : "Grokipedia"}
                </span>
              </button>
            ))
          ) : trends.length > 0 || recent.length > 0 ? (
            <>
              {trends.length > 0 ? (
                <div className="pb-1">
                  <p className="px-4 pt-3 pb-1 text-sm text-muted">Trending now</p>
                  {trends.map((item, index) => (
                    <button
                      key={item.slug}
                      type="button"
                      role="option"
                      aria-selected={index === active}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        go(item.title);
                      }}
                      className={`flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left ${
                        index === active ? "bg-accent-soft" : ""
                      }`}
                    >
                      {item.entity && item.image ? (
                        <img src={item.image} alt="" className="size-8 shrink-0 rounded-full object-cover" />
                      ) : (
                        <TrendingUp className="size-4 shrink-0 text-muted" aria-hidden="true" />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-ink">{item.title}</span>
                        {item.entity && item.snippet ? (
                          <span className="block truncate text-sm text-muted">{item.snippet}</span>
                        ) : null}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
              {recent.length > 0 ? (
                <div className="pb-2">
                  <div className="flex items-center justify-between px-4 pt-2">
                    <p className="text-sm text-muted">Recent</p>
                    <button
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        clearRecent();
                      }}
                      className="min-h-11 px-2 text-sm text-muted"
                    >
                      Clear
                    </button>
                  </div>
                  {recent.map((item, index) => {
                    const cursor = trends.length + index;
                    return (
                      <button
                        key={item}
                        type="button"
                        role="option"
                        aria-selected={cursor === active}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          go(item);
                        }}
                        className={`flex min-h-11 w-full items-center gap-3 px-4 text-left ${
                          cursor === active ? "bg-accent-soft" : ""
                        }`}
                      >
                        <Clock className="size-4 shrink-0 text-muted" aria-hidden="true" />
                        <span className="truncate">{item}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </form>
  );

  const sourcePills = (
    <div className="flex flex-wrap gap-2">
      {(Object.keys(SOURCE_META) as SourceId[]).map((key) => (
        <SourcePill key={key} id={key} on={sources[key]} onToggle={() => toggle(key)} />
      ))}
    </div>
  );

  return (
    <div className="min-h-screen">
      <div className="fixed inset-x-0 top-0 z-30 h-0.5" aria-hidden="true">
        {loading ? <div className="folio-bar h-full w-1/3 bg-accent" /> : null}
      </div>
      {onResults ? (
        <header
          className={`fixed inset-x-0 top-0 z-20 border-b border-line bg-bg transition-transform duration-200 ease-out ${
            chrome === "hidden" && !open ? "-translate-y-full" : "translate-y-0"
          }`}
        >
          <div className="mx-auto flex max-w-6xl flex-col px-4 py-3 sm:px-6">
            <button
              type="button"
              onClick={goHome}
              className={`w-fit font-display text-2xl tracking-tight text-ink transition-transform duration-150 ease-out active:scale-[0.96] ${
                chrome === "search" && !open ? "hidden" : ""
              }`}
            >
              Folio
            </button>
            <div className={chrome === "search" && !open ? "" : "pt-4"}>{searchForm}</div>
            <div className={chrome === "search" && !open ? "hidden" : "pt-4"}>{sourcePills}</div>
          </div>
        </header>
      ) : (
        <>
        <header className="flex min-h-screen flex-col items-center bg-bg px-4 pt-[18vh]">
          <h1 className="mb-6 max-w-xl text-center font-display text-4xl leading-tight tracking-tight text-ink sm:text-5xl">
            Folio by Zip1 — Web, Wikipedia & Grokipedia Search
          </h1>
          <div className="w-full max-w-xl">{searchForm}</div>
          <p className="mt-4 max-w-xl text-center text-sm leading-relaxed text-muted">
            Search the web with Folio by Zip1. Explore web results and optional Wikipedia and Grokipedia sources from
            one simple search interface.
          </p>
          {adsOn ? <NetworkAd /> : null}
          <button
            type="button"
            onClick={() => setAdsOpen(true)}
            className="mt-8 min-h-11 text-sm text-muted"
          >
            Ad preferences
          </button>
          {!anySource ? (
            <div className="mt-4 w-full max-w-xl">
              <p className="mb-2 text-sm text-accent">Turn on Web, Wikipedia, Grokipedia, or Images to search.</p>
              {sourcePills}
            </div>
          ) : null}
        </header>
        <section aria-labelledby="how-folio" className="mx-auto max-w-xl px-4 pb-16">
          <h2 id="how-folio" className="font-display text-2xl text-ink">
            How Folio works
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Submit a query in the search bar. Web results are included. Wikipedia and Grokipedia are optional sources
            you can turn on or off. Images is optional too and adds a grid of pictures when you switch it on.
          </p>
        </section>
        </>
      )}
      {onResults ? (
        <main className="mx-auto max-w-6xl px-4 pt-52 pb-8 sm:px-6 sm:pb-10">
          <Results
            query={query}
            data={data}
            loading={loading}
            sources={sources}
            pages={{
              web: search.webPage ?? 1,
              wiki: search.wikiPage ?? 1,
              grok: search.grokPage ?? 1,
              images: search.imagesPage ?? 1,
            }}
            onPage={onPage}
            onDive={(value) => go(value)}
          />
        </main>
      ) : null}
      <SiteFooter />
      <AdPreferences
        open={adsOpen}
        adsOn={adsOn}
        onClose={() => setAdsOpen(false)}
        onChange={(next) => {
          setAdsOn(next);
          localStorage.setItem(STORAGE_ADS, next ? "1" : "0");
        }}
      />
    </div>
  );
}

function NetworkAd() {
  const [ad, setAd] = useState<NetworkAd | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    requestNetworkAd({ data: {} })
      .then((row) => {
        if (!cancelled) setAd(row);
      })
      .catch(() => {
        if (!cancelled) setAd(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (ad === undefined) return <p className="mt-6 text-sm text-muted">Asking the ad network…</p>;
  if (!ad) return <p className="mt-6 text-sm text-muted">The ad network didn’t return an ad.</p>;

  return (
    <aside className="mt-6 w-full max-w-xl" aria-label="Paid advertisement">
      <a href={ad.clickUrl} className="block rounded-2xl border border-line bg-surface px-4 py-3 text-left">
        <span className="flex items-center gap-2 text-xs tracking-widest text-muted uppercase">
          <span className="rounded-full bg-accent-soft px-2 py-0.5 font-medium text-accent">Ad</span>
          <span>{ad.network}</span>
        </span>
        {ad.imageUrl ? (
          <img src={ad.imageUrl} alt="" className="mt-3 max-h-52 w-full rounded-xl object-contain" />
        ) : null}
        {ad.text ? <span className="mt-2 block text-sm leading-relaxed text-ink">{ad.text}</span> : null}
      </a>
    </aside>
  );
}

function AdPreferences({
  open,
  adsOn,
  onClose,
  onChange,
}: {
  open: boolean;
  adsOn: boolean;
  onClose: () => void;
  onChange: (next: boolean) => void;
}) {
  const titleId = useId();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <button type="button" aria-label="Close ad preferences" onClick={onClose} className="absolute inset-0 bg-ink/35" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute top-1/2 left-1/2 w-[min(24rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-line bg-surface p-5"
      >
        <h2 id={titleId} className="font-display text-2xl">
          Ad preferences
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Sponsored listings stay off unless you turn them on. Folio asks Kevel for one ad and does not send your search.
        </p>
        <label className="mt-4 flex min-h-11 items-start gap-3 text-sm text-ink">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-accent"
            checked={adsOn}
            onChange={(event) => onChange(event.target.checked)}
          />
          <span>Call the ad network for a sponsored listing</span>
        </label>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-ink px-4 text-sm font-medium text-bg"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function SourcePill({ id, on, onToggle }: { id: SourceId; on: boolean; onToggle: () => void }) {
  const meta = SOURCE_META[id];
  const Icon = meta.icon;
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm transition-transform duration-150 ease-out active:scale-[0.96] ${
        on ? "border-accent bg-accent-soft text-ink" : "border-line bg-surface text-muted"
      }`}
    >
      <Icon className="size-4" aria-hidden="true" />
      {meta.label}
      {meta.optional ? <span className="text-xs text-muted">optional</span> : null}
      <span className="font-medium">{on ? "On" : "Off"}</span>
    </button>
  );
}


function siteHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function youtubeId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const idFrom = (value: string | null | undefined) =>
      value && /^[A-Za-z0-9_-]{11}$/.test(value) ? value : null;
    if (host === "youtu.be") return idFrom(parsed.pathname.split("/").filter(Boolean)[0]);
    if (host !== "youtube.com" && host !== "m.youtube.com" && host !== "music.youtube.com") return null;
    const watch = idFrom(parsed.searchParams.get("v"));
    if (parsed.pathname === "/watch") return watch;
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live" || parts[0] === "v") {
      return idFrom(parts[1]);
    }
    return null;
  } catch {
    return null;
  }
}

function SiteLogo({ url }: { url: string }) {
  const host = siteHost(url);
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [host]);
  if (!host) return null;
  return (
    <span className="grid size-6 shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-surface">
      {broken ? (
        <span className="text-xs font-medium text-muted">{host.charAt(0).toUpperCase()}</span>
      ) : (
        <img
          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`}
          alt=""
          width={18}
          height={18}
          loading="lazy"
          decoding="async"
          className="size-[18px]"
          onError={() => setBroken(true)}
        />
      )}
    </span>
  );
}

function pickReferences(data: SearchPayload): SearchHit[] {
  const pools = [data.web.results, data.wiki.results, data.grok.results];
  const picks: SearchHit[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < 3 && picks.length < 6; index += 1) {
    for (const pool of pools) {
      const hit = pool[index];
      if (!hit || seen.has(hit.url)) continue;
      seen.add(hit.url);
      picks.push(hit);
      if (picks.length >= 6) break;
    }
  }
  return picks;
}

function Definitions({ items }: { items: WordDefinition[] }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby="word-definitions" className="rounded-3xl border border-line bg-surface p-4">
      <h2 id="word-definitions" className="font-display text-xl">
        Definitions
      </h2>
      <div className="mt-3 grid gap-4">
        {items.map((item) => (
          <div key={item.word}>
            <p className="font-display text-3xl leading-none text-ink">{item.word}</p>
            {item.phonetic ? <p className="mt-1 text-sm text-muted">{item.phonetic}</p> : null}
            <ul className="mt-3 grid gap-3">
              {item.senses.map((sense) => (
                <li key={`${sense.part}-${sense.definition}`}>
                  <p className="text-xs tracking-wide text-accent uppercase">{sense.part}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-ink">{sense.definition}</p>
                  {sense.example ? <p className="mt-1 text-sm text-muted">“{sense.example}”</p> : null}
                </li>
              ))}
            </ul>
            {item.source ? (
              <a href={item.source} className="mt-2 inline-flex min-h-11 items-center text-sm text-muted">
                WordNet
              </a>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function References({ hits }: { hits: SearchHit[] }) {
  const [expanded, setExpanded] = useState(true);
  if (hits.length < 2) return null;
  const shown = expanded ? hits : hits.slice(0, 3);
  return (
    <section aria-labelledby="search-references" className="rounded-3xl border border-line bg-surface p-2">
      <h2 id="search-references" className="px-3 pt-2 font-display text-xl">
        References
      </h2>
      <ul>
        {shown.map((hit) => {
          const host = siteHost(hit.url);
          const detail = [hit.meta, hit.snippet].filter(Boolean).join(" — ");
          return (
            <li key={hit.id} className="border-b border-line last:border-b-0">
              <a href={hit.url} className="block px-3 py-3">
                <span className="flex items-center gap-2 text-sm text-muted">
                  <SiteLogo url={hit.url} />
                  <span className="min-w-0 truncate">{host}</span>
                </span>
                <span className="mt-1 block text-base leading-snug font-medium text-ink">{hit.title}</span>
                {detail ? <span className="mt-1 line-clamp-2 block text-sm leading-relaxed text-muted">{detail}</span> : null}
              </a>
            </li>
          );
        })}
      </ul>
      {hits.length > 3 ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-1 min-h-11 w-full rounded-full bg-bg text-sm font-medium text-ink"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </section>
  );
}

function DeepDive({
  topic,
  items,
  onPick,
}: {
  topic: string;
  items: string[];
  onPick: (query: string) => void;
}) {
  if (!items.length) return null;
  const needle = topic.trim().toLowerCase();
  return (
    <div>
      <h3 className="font-display text-xl text-ink">Deep dive into {topic}</h3>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {items.map((item) => {
          const at = needle && item.toLowerCase().startsWith(needle) ? needle.length : -1;
          const shared = at > 0 ? item.slice(0, at) : "";
          const rest = at > 0 ? item.slice(at) : item;
          return (
            <li key={item}>
              <button
                type="button"
                onClick={() => onPick(item)}
                className="flex min-h-11 w-full items-center gap-2 rounded-full border border-line bg-surface px-3 text-left text-sm text-ink"
              >
                <Search className="size-4 shrink-0 text-muted" aria-hidden="true" />
                <span className="min-w-0 truncate">
                  {shared ? (
                    <>
                      <span>{shared}</span>
                      <span className="font-semibold">{rest}</span>
                    </>
                  ) : (
                    item
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Results({
  query,
  data,
  loading,
  sources,
  pages,
  onPage,
  onDive,
}: {
  query: string;
  data: SearchPayload | null;
  loading: boolean;
  sources: Sources;
  pages: Record<SourceId, number>;
  onPage: (source: SourceId, page: number) => void;
  onDive: (query: string) => void;
}) {
  const blocks: SourceId[] = (["web", "wiki", "grok", "images"] as const).filter((key) => sources[key] && data);
  const visible = blocks.map((key) => ({
    key,
    hits: data ? data[key].results : [],
    error: data?.[key].error,
    done: data ? data[key].done : true,
    total: data?.[key].total,
    page: pages[key],
  }));
  const flat = visible.flatMap((block) => block.hits);
  const [openId, setOpenId] = useState<string | null>(null);
  const openIndex = flat.findIndex((hit) => hit.id === openId);
  const openHit = openIndex >= 0 ? flat[openIndex] : null;

  useEffect(() => {
    setOpenId(null);
  }, [query, data]);

  if (!data) {
    return (
      <div className="grid gap-4" aria-busy="true">
        <h1 className="font-display text-4xl text-ink">{query}</h1>
        <Skeleton />
      </div>
    );
  }

  const anyHits = visible.some((block) => block.hits.length > 0);
  const enabled = blocks.map((key) => SOURCE_META[key].label).join(" · ");

  return (
    <div className={loading ? "opacity-70" : undefined}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-4xl text-ink sm:text-5xl">{query}</h1>
        <div className="flex items-center gap-2">
          <p className="text-sm text-muted tabular-nums" aria-live="polite">
            {enabled} · {formatTook(data.tookMs)}
          </p>
          <NativeShareButton
            title={`${query} — Folio`}
            text={`Search results for “${query}” on Folio`}
            url={() => window.location.href}
            label="Share these results"
          />
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="order-2 grid gap-10 lg:order-1">
          {!anyHits && !loading ? (
            <p className="text-muted">Nothing matched. Try fewer words, or switch on another source.</p>
          ) : null}
          {visible.map((block) => {
            const count = resultCount(block.total, block.key);
            const last = lastPage(
              block.key === "web" || block.key === "images" ? undefined : block.total,
              block.page,
              block.hits.length,
              block.done,
              pageSize(block.key),
              block.key === "images" ? IMAGES_MAX_PAGE : MAX_PAGE,
            );
            return (
              <section key={block.key} aria-labelledby={`source-${block.key}`} className="grid gap-3">
                <div className="border-b border-line pb-2">
                  <h2 id={`source-${block.key}`} className="font-display text-2xl">
                    {SOURCE_META[block.key].label}
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    Search for <span className="text-ink">“{query}”</span>
                    {count ? ` — ${count}` : ""}
                  </p>
                </div>
                {block.error ? (
                  <p className="text-sm text-muted">{SOURCE_META[block.key].label} didn’t respond. The other sources still ran.</p>
                ) : null}
                {!block.error && block.hits.length === 0 ? (
                  <p className="text-sm text-muted">
                    {block.page > 1 ? "Nothing on this page." : `No matches in ${SOURCE_META[block.key].label}.`}
                  </p>
                ) : null}
                {block.key === "images" ? (
                  <ImageGrid hits={block.hits} query={query} openId={openId} onOpen={(id) => {
                      tap("light");
                      setOpenId(id);
                    }}
                  />
                ) : (
                  <ul className="grid grid-cols-[minmax(0,1fr)]">
                    {block.hits.map((hit, index) => (
                      <Fragment key={hit.id}>
                        <li className={`border-b border-line ${hit.id === openId ? "bg-accent-soft" : ""}`}>
                          <div className="flex items-start gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                tap("light");
                                setOpenId(hit.id);
                              }}
                              aria-pressed={hit.id === openId}
                              className="group min-w-0 flex-1 px-1 py-4 text-left"
                            >
                              <p className="flex items-center gap-2 text-xs tracking-wide text-muted uppercase">
                                <SiteLogo url={hit.url} />
                                <span className="min-w-0 truncate">{hit.meta}</span>
                              </p>
                              <p className="mt-1 font-display text-xl leading-snug text-ink group-hover:text-accent">
                                <Highlight text={hit.title} query={query} />
                              </p>
                              {hit.snippet ? (
                                <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted">
                                  <Highlight text={hit.snippet} query={query} />
                                </p>
                              ) : null}
                            </button>
                            <a
                              href={hit.url}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`Open ${hit.title} in a new tab`}
                              className="mt-3 grid size-11 shrink-0 place-items-center rounded-full text-muted hover:text-accent"
                            >
                              <ArrowUpRight className="size-4" aria-hidden="true" />
                            </a>
                          </div>
                        </li>
                        {block.key === "web" && index === 0 && block.page === 1 && data.deepDive.length > 0 ? (
                          <li className="border-b border-line py-4">
                            <DeepDive topic={query} items={data.deepDive} onPick={onDive} />
                          </li>
                        ) : null}
                      </Fragment>
                    ))}
                  </ul>
                )}
                <Pager
                  label={SOURCE_META[block.key].label}
                  page={block.page}
                  last={last}
                  disabled={loading || Boolean(block.error)}
                  onPage={(page) => onPage(block.key, page)}
                />
                {block.key === "web" && block.hits.length > 0 ? (
                  <p className="text-xs text-muted">Web listings via Bing’s public results feed.</p>
                ) : null}
                {block.key === "images" && block.hits.length > 0 ? (
                  <p className="text-xs text-muted">Images via Bing’s public image results, with SafeSearch set to moderate.</p>
                ) : null}
              </section>
            );
          })}
        </div>
        <div className="order-1 grid gap-4 lg:order-2">
          {data.card ? <Lead card={data.card} /> : null}
          <References hits={pickReferences(data)} />
          <PlaceList places={data.places} error={data.placesError} />
          <Definitions items={data.definitions} />
          {!data.card && !data.places.length && loading ? <Skeleton /> : null}
        </div>
      </div>
      {openHit ? (
        <ResultPeek
          hit={openHit}
          index={openIndex}
          total={flat.length}
          onClose={() => setOpenId(null)}
          onPrev={() => {
            const prev = flat[openIndex - 1];
            if (prev) setOpenId(prev.id);
          }}
          onNext={() => {
            const next = flat[openIndex + 1];
            if (next) setOpenId(next.id);
          }}
        />
      ) : null}
    </div>
  );
}

function ImageGrid({
  hits,
  query,
  openId,
  onOpen,
}: {
  hits: SearchHit[];
  query: string;
  openId: string | null;
  onOpen: (id: string) => void;
}) {
  if (!hits.length) return null;
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      {hits.map((hit) => {
        const open = hit.id === openId;
        return (
          <li
            key={hit.id}
            className={`group relative overflow-hidden rounded-2xl border bg-surface ${
              open ? "border-accent ring-2 ring-accent" : "border-line"
            }`}
          >
            <button type="button" onClick={() => onOpen(hit.id)} aria-pressed={open} className="block w-full text-left">
              <span className="block aspect-[4/3] overflow-hidden bg-line">
                {hit.image ? (
                  <img
                    src={hit.image.thumb}
                    alt={hit.title}
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover transition-transform duration-200 ease-out group-hover:scale-[1.03]"
                  />
                ) : null}
              </span>
              <span className="block px-3 pt-2 pb-3">
                <span className="line-clamp-2 text-sm leading-snug text-ink group-hover:text-accent">
                  <Highlight text={hit.title} query={query} />
                </span>
                <span className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
                  <SiteLogo url={hit.url} />
                  <span className="min-w-0 truncate">{siteHost(hit.url)}</span>
                </span>
              </span>
            </button>
            <a
              href={hit.url}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${hit.title} in a new tab`}
              className="absolute top-1 right-1 grid size-11 place-items-center"
            >
              <span className="grid size-8 place-items-center rounded-full bg-surface/90 text-ink shadow-sm hover:text-accent">
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function PeekImage({ image, title }: { image: NonNullable<SearchHit["image"]>; title: string }) {
  const [src, setSrc] = useState(image.full);
  const ratio = image.width && image.height ? `${image.width} / ${image.height}` : undefined;
  return (
    <div className="mb-4 grid place-items-center overflow-hidden rounded-xl bg-line">
      <img
        src={src}
        alt={title}
        referrerPolicy="no-referrer"
        decoding="async"
        style={ratio ? { aspectRatio: ratio } : undefined}
        onError={() => {
          if (src !== image.thumb) setSrc(image.thumb);
        }}
        className="max-h-[55vh] w-full object-contain"
      />
    </div>
  );
}

function ResultPeek({
  hit,
  index,
  total,
  onClose,
  onPrev,
  onNext,
}: {
  hit: SearchHit;
  index: number;
  total: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [preview, setPreview] = useState<HitPreview | null>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, [hit.id]);

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    if (hit.source === "web" || hit.source === "images") return;
    previewHit({ data: { source: hit.source, title: hit.title, url: hit.url, snippet: hit.snippet } })
      .then((row) => {
        if (!cancelled) setPreview(row);
      })
      .catch(() => {
        if (!cancelled) setPreview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [hit]);

  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
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
  }, [onClose, onPrev, onNext]);

  const extract = preview?.extract || hit.snippet;
  const paragraphs = extract.split(/\n\n+/).map((part) => part.trim()).filter(Boolean);
  const pageUrl = preview?.url || hit.url;
  const videoId = youtubeId(pageUrl);

  return (
    <div className="fixed inset-0 z-40">
      <button type="button" aria-label="Close preview" onClick={onClose} className="absolute inset-0 bg-ink/35" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="folio-peek absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-3xl border border-line bg-surface sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:w-[min(32rem,100%)] sm:rounded-none sm:border-y-0 sm:border-r-0"
      >
        <div className="px-4 pt-2 sm:pt-4">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-line sm:hidden" aria-hidden="true" />
          <div className="flex items-center justify-between gap-2 pb-3">
            <p className="flex min-w-0 items-center gap-2 text-xs tracking-widest text-muted uppercase">
              <SiteLogo url={pageUrl} />
              <span className="truncate">{siteHost(pageUrl) || SOURCE_META[hit.source].label}</span>
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onPrev}
                disabled={index <= 0}
                aria-label="Previous result"
                className="grid size-11 place-items-center rounded-full text-ink disabled:opacity-40"
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
              </button>
              <span className="min-w-12 text-center text-xs text-muted tabular-nums">
                {index + 1} / {total}
              </span>
              <button
                type="button"
                onClick={onNext}
                disabled={index >= total - 1}
                aria-label="Next result"
                className="grid size-11 place-items-center rounded-full text-ink disabled:opacity-40"
              >
                <ChevronRight className="size-4" aria-hidden="true" />
              </button>
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="grid size-11 place-items-center rounded-full text-ink"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
          {hit.image ? (
            <PeekImage key={hit.id} image={hit.image} title={hit.title} />
          ) : videoId ? (
            <div className="mb-4 aspect-video overflow-hidden rounded-xl bg-ink">
              <iframe
                key={videoId}
                src={`https://www.youtube-nocookie.com/embed/${videoId}`}
                title={preview?.title || hit.title}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
          ) : preview?.image ? (
            <img src={preview.image} alt="" className="mb-4 max-h-52 w-full rounded-xl object-cover" />
          ) : null}
          <h2 id={titleId} className="font-display text-3xl leading-tight">
            {preview?.title || hit.title}
          </h2>
          <p className="mt-1 text-sm text-accent">{preview?.kicker || hit.meta}</p>
          <div className="mt-4 grid gap-3">
            {paragraphs.map((part, partIndex) => (
              <p key={`${hit.id}-${partIndex}`} className="text-sm leading-relaxed text-ink">
                {part}
              </p>
            ))}
          </div>
          {hit.image ? (
            <a
              href={hit.image.full}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-ink hover:text-accent"
            >
              View full-size image
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </a>
          ) : null}
          {!preview && hit.source !== "web" && hit.source !== "images" ? <p className="mt-4 text-sm text-muted">Loading the full preview…</p> : null}
        </div>
        <div className="flex gap-2 border-t border-line p-4">
          <a
            href={pageUrl}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-ink px-4 text-sm font-medium text-bg"
          >
            Open page
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </a>
          <NativeShareButton
            title={preview?.title || hit.title}
            url={() => pageUrl}
            label="Share this page"
            className="border border-line"
          />
        </div>
      </aside>
    </div>
  );
}

/** Share button shown only inside the iOS app (native share sheet). Renders nothing in browsers. */
function NativeShareButton({
  title,
  text,
  url,
  label,
  className = "",
}: {
  title: string;
  text?: string;
  url: () => string;
  label: string;
  className?: string;
}) {
  const native = useIsNativeApp();
  if (!native) return null;
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        tap("light");
        void shareNative({ title, text, url: url() });
      }}
      className={`grid size-11 shrink-0 place-items-center rounded-full text-ink transition-transform duration-150 ease-out active:scale-[0.96] ${className}`}
    >
      <Share className="size-4" aria-hidden="true" />
    </button>
  );
}

function resultCount(total: number | undefined, source: SourceId): string | null {
  if (!total || total <= 0) return null;
  if (source === "web") return `About ${total.toLocaleString("en-US")} results`;
  const shown = total >= 10000 ? "10,000+" : total.toLocaleString("en-US");
  return `${shown} result${total === 1 ? "" : "s"}`;
}

function pageSize(source: SourceId): number {
  if (source === "web") return WEB_PAGE;
  if (source === "grok") return GROK_PAGE;
  if (source === "images") return IMAGES_PAGE;
  return PAGE;
}

function lastPage(
  total: number | undefined,
  page: number,
  count: number,
  done: boolean,
  pageSize: number,
  cap: number = MAX_PAGE,
): number | null {
  if (typeof total === "number" && total > 0 && !(done && count === 0)) {
    return Math.max(1, Math.min(cap, Math.ceil(total / pageSize)));
  }
  if (done) return Math.max(1, count === 0 && page > 1 ? page - 1 : page);
  if (page >= cap) return cap;
  return null;
}

function Pager({
  label,
  page,
  last,
  disabled,
  onPage,
}: {
  label: string;
  page: number;
  last: number | null;
  disabled: boolean;
  onPage: (page: number) => void;
}) {
  const hasNext = last == null || page < last;
  const show = page > 1 || hasNext;
  if (!show) return null;
  const items: Array<number | "…"> =
    last == null ? (page <= 4 ? [1, 2, 3, 4, 5] : [1, "…", page - 1, page, page + 1]) : pageItems(Math.min(page, last), last);

  return (
    <nav aria-label={`${label} pages`} className="flex flex-wrap items-center justify-center gap-1.5">
      <button
        type="button"
        onClick={() => onPage(page - 1)}
        disabled={disabled || page <= 1}
        className="h-11 rounded-lg px-3 text-sm text-muted transition-transform duration-150 ease-out active:scale-[0.96] disabled:opacity-40"
      >
        Previous
      </button>
      {items.map((item, index) =>
        item === "…" ? (
          <span key={`gap-${index}`} className="px-1 text-sm text-muted" aria-hidden="true">
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            onClick={() => {
              if (item !== page) onPage(item);
            }}
            disabled={disabled}
            aria-current={item === page ? "page" : undefined}
            aria-label={`${label} page ${item}`}
            className={`h-11 min-w-11 rounded-lg border px-2 text-sm tabular-nums transition-transform duration-150 ease-out active:scale-[0.96] disabled:opacity-40 ${
              item === page ? "border-line bg-line text-ink" : "border-line bg-surface text-ink"
            }`}
          >
            {item}
          </button>
        ),
      )}
      <button
        type="button"
        onClick={() => onPage(Math.min(last ?? page + 1, page + 1))}
        disabled={disabled || !hasNext}
        className="h-11 rounded-lg px-3 text-sm text-ink transition-transform duration-150 ease-out active:scale-[0.96] disabled:opacity-40"
      >
        Next
      </button>
    </nav>
  );
}

function formatCoord(lat: number, lon: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}° ${ns}, ${Math.abs(lon).toFixed(2)}° ${ew}`;
}

function PlaceList({ places, error }: { places: PlaceRef[]; error?: string }) {
  if (!places.length && !error) return null;
  return (
    <section aria-labelledby="location-refs" className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="location-refs" className="font-display text-xl">
          Location references
        </h2>
        {places.length > 0 ? <p className="text-sm text-muted tabular-nums">{places.length}</p> : null}
      </div>
      {error && !places.length ? (
        <p className="mt-2 text-sm text-muted">Location references didn’t load.</p>
      ) : (
        <ol className="mt-2">
          {places.map((place, index) => (
            <li key={place.id} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-2 border-b border-line py-3 last:border-b-0">
              <span className="font-display text-muted tabular-nums">{index + 1}</span>
              <div className="min-w-0">
                <a href={place.url} target="_blank" rel="noreferrer" className="font-medium text-ink hover:text-accent">
                  {place.name}
                </a>
                <p className="mt-0.5 text-sm leading-relaxed text-muted">{place.detail}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <span className="tabular-nums">{formatCoord(place.lat, place.lon)}</span>
                  <a href={place.map} target="_blank" rel="noreferrer" className="font-medium text-ink">
                    Map
                  </a>
                  <span>{place.source === "wiki" ? "Wikipedia" : "GeoNames"}</span>
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Lead({ card }: { card: NonNullable<SearchPayload["card"]> }) {
  return (
    <aside className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-xs tracking-widest text-muted uppercase">
        {card.source === "wiki" ? "Wikipedia" : "Grokipedia"}
      </p>
      {card.image ? (
        <img
          src={card.image}
          alt=""
          className="mt-3 max-h-48 w-full rounded-xl object-cover"
        />
      ) : null}
      <h2 className="mt-3 font-display text-2xl leading-tight">{card.title}</h2>
      <p className="mt-1 text-sm text-accent">{card.kicker}</p>
      <p className="mt-3 text-sm leading-relaxed text-muted">{card.extract}</p>
      <a
        href={card.url}
        className="mt-4 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-ink"
      >
        Read the article
        <ArrowUpRight className="size-4" aria-hidden="true" />
      </a>
    </aside>
  );
}

function Skeleton() {
  return (
    <div className="grid gap-3" aria-hidden="true">
      <div className="h-8 w-2/3 rounded-lg bg-line" />
      <div className="h-20 rounded-2xl bg-line" />
      <div className="h-20 rounded-2xl bg-line" />
      <div className="h-20 rounded-2xl bg-line" />
    </div>
  );
}
