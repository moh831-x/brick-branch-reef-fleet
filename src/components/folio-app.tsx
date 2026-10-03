import { Fragment, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowUp, ArrowUpRight, Check, Copy, ThumbsUp, ThumbsDown, MessageSquare, BookOpen, ChevronDown, ChevronLeft, ChevronRight, Clock, Compass, Globe, ImageIcon, Pause, Play, RotateCw, Search, Share, Sparkles, Square, TrendingUp, Volume2, X } from "lucide-react";
import type { FolioSearch } from "@/routes/index";
import {
  listAiProviders,
  previewHit,
  suggestQueries,
  translatePreview,
  trendingTopics,
  type HitPreview,
  type SearchHit,
  type SearchPayload,
  type SourceId,
  type Suggestion,
  type PlaceRef,
  type Trend,
  type WordDefinition,
  type PreviewSection,
} from "@/lib/search.functions";
import { GROK_PAGE, IMAGES_MAX_PAGE, IMAGES_PAGE, MAX_PAGE, PAGE, WEB_PAGE, pageItems } from "@/lib/search.shared";
import {
  AI_MESSAGES,
  AI_MODELS,
  aiModelLabelFor,
  aiModelTimeoutMs,
  fallbackFailures,
  type AiAttempt,
  aiChoiceOf,
  aiProviderLabel,
  pickAiContext,
  selectedAiModel,
  type AiContextItem,
  type AiAnswer,
  type AiModelStatus,
  type AiPart,
} from "@/lib/ai.shared";
import { SiteFooter } from "@/components/site-footer";
import { fill, sourceLabel, type UiCopy } from "@/lib/ui-copy";
import { chatCopy, followUpPrompts } from "@/lib/chat-copy";
import { CHAT_INPUT_MAX, type ChatMessage } from "@/lib/chat.shared";
import { questionCopy } from "@/lib/question-copy";
import { AnswerCode } from "@/components/answer-code";
import { AnswerImage } from "@/components/answer-image";
import { WorkLive, WorkSummary } from "@/components/ai-work";
import { NewsCards, SourceChip } from "@/components/news-answer";
import { answerBlocks, groupCites, hasBullets, type AnswerBlock } from "@/lib/answer-blocks";
import { pickNewsCards } from "@/lib/news.shared";
import { askAiWithProgress } from "@/lib/ask-ai";
import { addClientStep, addDoneStep, addServerEvent, createTrace, finishWithAnswer, markSent, type WorkTrace } from "@/lib/ai-progress";
import { FAILURE_COPY } from "@/lib/work-label";
import { activeTarget, afterRelease, PromptBridgeContext, usePromptBridge, type PromptBridge, type PromptTarget } from "@/components/prompt-bridge";
import { imageCopy } from "@/lib/image-copy";
import { GraphCard } from "@/components/graph-card";
import { langDir, langInfo, PREVIEW_TRANSLATE_CHARS, type UiLang } from "@/lib/i18n";
import { clickAction, factsOf, trackPresses } from "@/lib/select-click";
import { useLang } from "@/lib/lang-context";
import { MIN_CONTENTS } from "@/lib/reader";
import { LanguagePicker } from "@/components/language-picker";
import { shareNative, tap, useIsNativeApp } from "@/lib/native";

type Sources = { web: boolean; wiki: boolean; grok: boolean; images: boolean; ai: boolean };

/** A switch in the source row. The AI answer is not a switch. */
type PillId = SourceId;

/**
 * Web, Wikipedia, and Grokipedia start on. Images is opt-in. The AI answer is always on: a search
 * sends the query and the top results to the model picked in the search bar.
 */
const DEFAULT_SOURCES: Sources = { web: true, wiki: true, grok: true, images: false, ai: true };

const STORAGE_SOURCES = "folio-sources";
const STORAGE_RECENT = "folio-recent";
const STORAGE_AI_MODEL = "folio-ai-model";

const SOURCE_META: Record<
  PillId,
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

function sourcesFrom(search: FolioSearch): Sources {
  return {
    web: search.web !== false,
    wiki: search.wiki !== false,
    grok: search.grok !== false,
    images: search.images === true,
    ai: true,
  };
}

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
      ai: true,
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

function readAiModel(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return aiChoiceOf(localStorage.getItem(STORAGE_AI_MODEL));
  } catch {
    return undefined;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function Highlight({ text, query }: { text: string; query: string }) {
  const terms = [...new Set(query.toLowerCase().split(/\s+/).filter((term) => term.length > 1))];
  // Always an element, never a bare text node: browser translators swap text nodes out from under React.
  if (!terms.length || !text) return <span>{text}</span>;
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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const query = search.q.trim();
  const onResults = query.length > 0;

  const [draft, setDraft] = useState(query);
  // All prompts share this one bar: follow-ups to the AI answer and image descriptions are sent
  // from here to whichever feature is active (see prompt-bridge.ts).
  const [targets, setTargets] = useState<Record<string, PromptTarget>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const queryRef = useRef(query);
  queryRef.current = query;
  const targetsRef = useRef(targets);
  targetsRef.current = targets;
  const bridge = useMemo<PromptBridge>(() => ({
    register: (id, target) => {
      const isNew = !targetsRef.current[id];
      setTargets((current) => ({ ...current, [id]: target }));
      if (isNew && target.kind === "chat") {
        // A new answer: follow up on it, unless the reader already started typing a new search.
        const typed = draftRef.current.trim();
        if (!typed || typed === queryRef.current) {
          setActiveId(id);
          setDraft("");
        }
      }
    },
    unregister: (id) => {
      setTargets((current) => {
        if (!(id in current)) return current;
        const next = { ...current };
        delete next[id];
        return next;
      });
      setActiveId((current) => (current === id ? afterRelease(targetsRef.current, id) : current));
    },
    activate: (id) => {
      setActiveId(id);
      setOpen(false);
      inputRef.current?.focus();
    },
    release: (id) => setActiveId((current) => (current === id ? afterRelease(targetsRef.current, id) : current)),
  }), []);
  const barTarget = activeTarget(targets, activeId);
  const following = Boolean(barTarget);
  const [sources, setSources] = useState<Sources>(() => sourcesFrom(search));
  /** The reader's model pick: the address wins, then this browser's saved choice. */
  const [aiModel, setAiModel] = useState<string | undefined>(search.ai_model);
  const [aiModels, setAiModels] = useState<AiModelStatus[] | "failed" | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [trends, setTrends] = useState<Trend[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [chrome, setChrome] = useState<"full" | "hidden" | "search">("full");
  // The language is picked on the home screen only; every other page follows that choice.
  const { lang: uiLang, copy } = useLang();
  const chatWords = chatCopy(uiLang);
  const imageWords = imageCopy(uiLang);
  useEffect(() => {
    // Lets result links tell a plain click from the end of a drag-selection.
    trackPresses();
  }, []);

  useEffect(() => {
    setAiModel(search.ai_model ?? readAiModel());
  }, [search.ai_model]);

  useEffect(() => {
    let cancelled = false;
    loadAiProviders()
      .then((rows) => {
        if (!cancelled) setAiModels(rows);
      })
      .catch(() => {
        if (!cancelled) setAiModels("failed");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setDraft(query);
    setOpen(false);
    setActive(-1);
  }, [query, search.web, search.wiki, search.grok, search.images, search.ai]);

  useEffect(() => {
    if (!onResults) setSources(readSources());
    else setSources(sourcesFrom(search));
    setRecent(readRecent());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the flags below are everything sourcesFrom reads
  }, [onResults, search.web, search.wiki, search.grok, search.images, search.ai]);

  useEffect(() => {
    const q = draft.trim();
    if (!open || following || q.length < 2) return;
    const handle = window.setTimeout(() => {
      suggestQueries({ data: { q, lang: uiLang } })
        .then((rows) => setSuggestions(rows))
        .catch(() => setSuggestions([]));
    }, 180);
    return () => window.clearTimeout(handle);
  }, [draft, open, following, uiLang]);

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
    document.title = query ? `${query} — Folio` : copy.homeTitle;
  }, [query, copy.homeTitle]);

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
    if (!q) return;
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
        ai_model: aiModel,
      },
    });
  }

  function toggle(key: PillId) {
    const next = { ...sources, [key]: !sources[key] };
    tap("select");
    persistSources(next);
    if (onResults) {
      void navigate({
        to: "/",
        search: {
          q: query,
          near: search.near,
          web: next.web,
          wiki: next.wiki,
          grok: next.grok,
          images: next.images,
          ai_model: aiModel,
        },
      });
    }
  }

  function chooseAiModel(id: string | undefined) {
    tap("select");
    setAiModel(id);
    try {
      if (id) localStorage.setItem(STORAGE_AI_MODEL, id);
      else localStorage.removeItem(STORAGE_AI_MODEL);
    } catch {
      /* ignore quota */
    }
    if (onResults) {
      void navigate({
        to: "/",
        search: (prev) => ({ ...prev, q: query, near: search.near, ai_model: id }),
        replace: true,
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
    if (barTarget) {
      // A follow-up to the AI answer, or an image description.
      if (barTarget.target.pending || !draft.trim()) return;
      if (barTarget.target.submit(draft.trim().slice(0, barTarget.target.maxLength))) {
        tap("medium");
        setDraft("");
        setOpen(false);
      }
      return;
    }
    if (active >= 0 && menu[active]) go(menu[active]);
    else go(draft);
  }

  /** Leave follow-up mode: the bar searches again. */
  function newSearch() {
    tap("select");
    setActiveId(null);
    setOpen(true);
    inputRef.current?.focus();
  }

  // The bar grows with a multi-line follow-up (Shift+Enter), up to a few lines.
  useLayoutEffect(() => {
    const box = inputRef.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${Math.min(box.scrollHeight, 160)}px`;
  }, [draft, following]);

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      // Enter sends; Shift+Enter starts a new line in a follow-up (a search is one line).
      if (event.shiftKey && following) return;
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
      return;
    }
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
        ai_model: search.ai_model,
        webPage: source === "web" ? next : search.webPage,
        wikiPage: source === "wiki" ? next : search.wikiPage,
        grokPage: source === "grok" ? next : search.grokPage,
        imagesPage: source === "images" ? next : search.imagesPage,
      },
    });
  }

  const showMenu = open && !following && menu.length > 0;
  const barPlaceholder = barTarget?.target.kind === "image" ? imageWords.prompt : following ? chatWords.placeholder : copy.search;
  const barChip = barTarget?.target.kind === "image" ? imageWords.chip : chatWords.followUp;

  function goHome() {
    setDraft("");
    setOpen(false);
    void navigate({ to: "/", search: { q: "", near: "" } });
  }

  const searchForm = (
    <form onSubmit={onSubmit} className="relative" role="search">
      <label htmlFor="folio-q" className="sr-only">
        {barPlaceholder}
      </label>
      <div
        className={`flex items-center gap-2 rounded-3xl border border-line bg-surface px-3 focus-within:border-accent ${onResults ? "min-h-24 flex-wrap py-2" : "min-h-14"}`}
        onMouseDown={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest("button, input, textarea")) return;
          event.preventDefault();
          inputRef.current?.focus();
        }}
      >
        {barTarget ? (
          // Follow-up or image mode: this chip says so, and tapping it goes back to searching.
          <button
            type="button"
            onClick={newSearch}
            aria-label={`${barChip}: ${chatWords.newSearch}`}
            title={chatWords.newSearch}
            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-accent-soft px-2.5 text-xs text-accent transition-transform duration-150 ease-out active:scale-[0.96]"
          >
            {barTarget.target.kind === "image" ? <ImageIcon className="size-3.5 shrink-0" aria-hidden="true" /> : <MessageSquare className="size-3.5 shrink-0" aria-hidden="true" />}
            <span className="hidden sm:inline">{barChip}</span>
            <X className="size-3.5 shrink-0" aria-hidden="true" />
          </button>
        ) : (
          <Search className="size-5 shrink-0 text-muted" aria-hidden="true" />
        )}
        <textarea
          ref={inputRef}
          id="folio-q"
          rows={1}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 140)}
          onKeyDown={onKeyDown}
          placeholder={barPlaceholder}
          maxLength={barTarget?.target.maxLength}
          dir="auto"
          autoComplete="off"
          enterKeyHint={following ? "send" : "search"}
          role="combobox"
          aria-expanded={showMenu}
          aria-controls={listId}
          aria-autocomplete="list"
          className={`block max-h-40 min-h-12 min-w-0 flex-1 resize-none bg-transparent py-3 text-base leading-6 text-ink outline-none placeholder:text-muted ${onResults ? "order-first basis-full" : ""}`}
        />
        {draft ? (
          <button
            type="button"
            aria-label={copy.clearSearch}
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
        <AiModelPicker
          models={aiModels}
          selected={aiModel && Array.isArray(aiModels) ? selectedAiModel(aiModel, aiModels.filter((row) => row.available).map((row) => row.id)) : aiModel}
          compact
          above={onResults}
          copy={copy}
          onOpenChange={(next) => {
            if (next) setOpen(false);
          }}
          onPick={chooseAiModel}
        />
        <button
          type="submit"
          disabled={!draft.trim() || Boolean(barTarget?.target.pending)}
          aria-label={barTarget?.target.kind === "image" ? imageWords.create : following ? chatWords.send : copy.search}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-ink text-bg transition-transform duration-150 ease-out active:scale-[0.96] disabled:opacity-40"
        >
          <ArrowUp className="size-4" />
        </button>
      </div>
      {showMenu ? (
        <div
          id={listId}
          role="listbox"
          className={`absolute right-0 left-0 z-30 max-h-[50vh] overflow-y-auto rounded-2xl border border-line bg-surface ${onResults ? "bottom-full mb-2" : "mt-2"}`}
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
                className={`flex min-h-11 w-full items-center justify-between gap-3 px-4 text-start ${
                  index === active ? "bg-accent-soft" : ""
                }`}
              >
                <span className="truncate">{item.title}</span>
                <span className="shrink-0 text-xs tracking-wide text-muted uppercase">
                  {item.source === "wiki" ? copy.wiki : copy.grok}
                </span>
              </button>
            ))
          ) : trends.length > 0 || recent.length > 0 ? (
            <>
              {trends.length > 0 ? (
                <div className="pb-1">
                  <p className="px-4 pt-3 pb-1 text-sm text-muted">{copy.trending}</p>
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
                      className={`flex min-h-11 w-full items-center gap-3 px-4 py-2 text-start ${
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
                    <p className="text-sm text-muted">{copy.recent}</p>
                    <button
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        clearRecent();
                      }}
                      className="min-h-11 px-2 text-sm text-muted"
                    >
                      {copy.clear}
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
                        className={`flex min-h-11 w-full items-center gap-3 px-4 text-start ${
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
    <div className={onResults ? "flex shrink-0 gap-2 whitespace-nowrap pb-1" : "flex flex-wrap gap-2"}>
      {(Object.keys(SOURCE_META) as PillId[]).map((key) => (
        <SourcePill key={key} id={key} on={sources[key]} copy={copy} onToggle={() => toggle(key)} />
      ))}
    </div>
  );

  return (
    <PromptBridgeContext.Provider value={bridge}>
    <div className="min-h-screen">
      <div className="fixed inset-x-0 top-0 z-30 h-0.5" aria-hidden="true">
        {loading ? <div className="folio-bar h-full w-1/3 bg-accent" /> : null}
      </div>
      {onResults ? (
        <>
          <header className="border-b border-line bg-bg px-4 py-3 sm:px-6">
            <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
              <button type="button" onClick={goHome} className="min-h-11 font-display text-2xl text-ink">Folio</button>
              <LanguagePicker />
            </div>
          </header>
          <div className="fixed inset-x-0 bottom-0 z-30 bg-bg px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="mx-auto max-w-3xl">
              {searchForm}
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">{sourcePills}</div>
            </div>
          </div>
        </>
      ) : (
        <>
        <header className="flex min-h-screen flex-col items-center bg-bg px-4 pt-[18vh]">
          <div className="fixed top-4 end-4 z-30">
            <LanguagePicker />
          </div>
          <h1 className="mb-6 max-w-xl text-center font-display text-4xl leading-tight tracking-tight text-ink sm:text-5xl">
            {copy.h1}
          </h1>
          <div className="w-full max-w-xl">{searchForm}</div>
          <p className="mt-4 max-w-xl text-center text-sm leading-relaxed text-muted">
            {copy.blurb}
          </p>
          {!anySource ? (
            <div className="mt-4 w-full max-w-xl">
              <p className="mb-2 text-sm text-accent">{questionCopy(uiLang).noSources}</p>
              {sourcePills}
            </div>
          ) : null}
        </header>
        <section aria-labelledby="how-folio" className="mx-auto max-w-xl px-4 pb-16">
          <h2 id="how-folio" className="font-display text-2xl text-ink">
            {copy.howTitle}
          </h2>
          <div className="mt-3 grid gap-3 text-sm leading-relaxed text-muted">
            <p>{copy.how1}</p>
            <p>{copy.howGraph}</p>
            <p>{copy.how2}</p>
            <p>
              {copy.how3before}{" "}
              <Link to="/how-to-search" className="text-accent">
                {copy.howTo}
              </Link>{" "}
              {copy.how3mid}{" "}
              <Link to="/about" className="text-accent">
                {copy.about}
              </Link>{" "}
              {copy.how3after}
            </p>
          </div>
        </section>
        </>
      )}
      {onResults ? (
        <main className="mx-auto max-w-3xl px-4 pt-6 pb-64 sm:px-6">
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
            aiModel={aiModel}
            lang={uiLang}
            copy={copy}
          />
        </main>
      ) : null}
      <SiteFooter copy={copy} />
    </div>
    </PromptBridgeContext.Provider>
  );
}

function SourcePill({ id, on, copy, onToggle }: { id: PillId; on: boolean; copy: UiCopy; onToggle: () => void }) {
  const meta = SOURCE_META[id];
  const Icon = meta.icon;
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className={`inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3 text-sm transition-transform duration-150 ease-out active:scale-[0.96] ${
        on ? "border-accent bg-accent-soft text-ink" : "border-line bg-surface text-muted"
      }`}
    >
      <Icon className="size-4" aria-hidden="true" />
      {sourceLabel(copy, id)}
      {meta.optional ? <span className="text-xs text-muted">{copy.optional}</span> : null}
      <span className="font-medium">{on ? copy.on : copy.off}</span>
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

function wikiHostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
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

/** Props for links inside result text: not draggable (so a drag selects text), and not followed when a click ends a selection. */
const selectSafeLink = {
  draggable: false,
  onClick: (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (clickAction(factsOf(event)) === "ignore") event.preventDefault();
  },
} as const;

/**
 * Link-like text that can be drag-selected. Chrome never starts a text selection inside an
 * `<a href>` (even with draggable=false), so result titles are a focusable span with the link role.
 * A plain click or Enter runs `onOpen` (by default, opens `href` in a new tab); Ctrl/Cmd/Shift-click
 * and middle-click open `href` in a new tab; a click that ends a drag or selection does nothing.
 */
function SelectableLink({
  href,
  onOpen,
  className,
  children,
  focusable = true,
  label,
  current,
  popup,
}: {
  href: string;
  onOpen?: () => void;
  className?: string;
  children: ReactNode;
  focusable?: boolean;
  label?: string;
  current?: boolean;
  popup?: boolean;
}) {
  const newTab = () => window.open(href, "_blank", "noopener,noreferrer");
  const open = onOpen ?? newTab;
  return (
    <span
      role="link"
      tabIndex={focusable ? 0 : -1}
      aria-label={label}
      aria-current={current ? "true" : undefined}
      aria-haspopup={popup ? "dialog" : undefined}
      onClick={(event) => {
        const action = clickAction(factsOf(event));
        if (action === "native") {
          if (event.button === 0) newTab();
          return;
        }
        if (action === "open") open();
      }}
      onAuxClick={(event) => {
        if (event.button === 1) newTab();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          open();
        }
      }}
      className={`cursor-pointer ${className ?? ""}`}
    >
      {children}
    </span>
  );
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
          draggable={false}
          className="size-[18px]"
          onError={() => setBroken(true)}
        />
      )}
    </span>
  );
}

function Definitions({ items, copy }: { items: WordDefinition[]; copy: UiCopy }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby="word-definitions" className="rounded-3xl border border-line bg-surface p-4">
      <h2 id="word-definitions" className="font-display text-xl">
        {copy.definitions}
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
              <a href={item.source} {...selectSafeLink} className="mt-2 inline-flex min-h-11 items-center text-sm text-muted">
                WordNet
              </a>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function DeepDive({
  topic,
  items,
  copy,
  onPick,
}: {
  topic: string;
  items: string[];
  copy: UiCopy;
  onPick: (query: string) => void;
}) {
  if (!items.length) return null;
  const needle = topic.trim().toLowerCase();
  return (
    <div>
      <h3 className="font-display text-xl text-ink">{fill(copy.deepDive, { topic })}</h3>
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
                className="flex min-h-11 w-full items-center gap-2 rounded-full border border-line bg-surface px-3 text-start text-sm text-ink"
              >
                <Search className="size-4 shrink-0 text-muted" aria-hidden="true" />
                <span className="min-w-0 truncate">
                  {shared ? (
                    <>
                      <span>{shared}</span>
                      <span className="font-semibold">{rest}</span>
                    </>
                  ) : (
                    <span>{item}</span>
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

function TranslateNote({ label, reason }: { label: string; reason: string }) {
  return (
    <p className="mt-1 text-sm text-muted" role="status">
      {label}{" "}
      <span className="text-xs" dir="ltr" lang="en">
        ({reason})
      </span>
    </p>
  );
}

function SearchedAs({ label, text }: { label: string; text: string }) {
  return (
    <p className="mt-1 text-sm text-muted">
      {label}: <bdi>{text}</bdi>
    </p>
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
  aiModel,
  lang,
  copy,
}: {
  query: string;
  data: SearchPayload | null;
  loading: boolean;
  sources: Sources;
  pages: Record<SourceId, number>;
  onPage: (source: SourceId, page: number) => void;
  onDive: (query: string) => void;
  aiModel: string | undefined;
  lang: UiLang;
  copy: UiCopy;
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

  const aiCard = <AiAnswerCard query={query} data={data} loading={loading} sources={sources} aiModel={aiModel} copy={copy} lang={lang} onPick={onDive} />;

  if (!data) {
    return (
      <div className="grid gap-4" aria-busy="true">
        <h1 className="font-display text-4xl text-ink">{query}</h1>
        {aiCard}
        <Skeleton />
      </div>
    );
  }

  const anyHits = visible.some((block) => block.hits.length > 0);
  const enabled = blocks.map((key) => sourceLabel(copy, key)).join(" · ");

  return (
    <div className={loading ? "opacity-70" : undefined}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl text-ink sm:text-5xl">{query}</h1>
          {data.webSearched && sources.web ? <SearchedAs label={copy.webSearchedAs} text={data.webSearched} /> : null}
          {data.searched && sources.wiki ? <SearchedAs label={copy.searchedAs} text={data.searched} /> : null}
          {data.grokSearched && sources.grok ? <SearchedAs label={copy.grokSearchedAs} text={data.grokSearched} /> : null}
          {data.translateError ? <TranslateNote label={copy.queryTranslateFailed} reason={data.translateError} /> : null}
        </div>
        <div className="flex items-center gap-2">
          <p className="text-sm text-muted tabular-nums" aria-live="polite">
            {blocks.length ? `${enabled} · ${formatTook(data.tookMs)}` : copy.aiAnswer}
          </p>
          <NativeShareButton
            title={`${query} — Folio`}
            text={fill(copy.shareText, { q: query })}
            url={() => window.location.href}
            label={copy.shareResults}
          />
        </div>
      </div>

      {aiCard ? <div className={blocks.length ? "mb-8 lg:me-[22.5rem]" : "mb-8 max-w-3xl"}>{aiCard}</div> : null}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="order-2 grid gap-10 lg:order-1">
          {!anyHits && !loading && blocks.length > 0 ? (
            <p className="text-muted">{copy.nothing}</p>
          ) : null}
          {visible.map((block) => {
            const count = resultCount(block.total, block.key, copy, lang);
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
                    {sourceLabel(copy, block.key)}
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    {copy.searchFor} <span className="text-ink">“{query}”</span>
                    {/* An element, not a bare text node that comes and goes: see src/lib/dom-guard.ts. */}
                    {count ? <span> — {count}</span> : null}
                  </p>
                </div>
                {block.key === "grok" && data?.grokTranslateError ? (
                  <TranslateNote label={copy.listTranslateFailed} reason={data.grokTranslateError} />
                ) : null}
                {block.error ? (
                  <p className="text-sm text-muted">{fill(copy.noResponse, { source: sourceLabel(copy, block.key) })}</p>
                ) : null}
                {!block.error && block.hits.length === 0 ? (
                  <p className="text-sm text-muted">
                    {block.page > 1 ? copy.nothingPage : fill(copy.noMatches, { source: sourceLabel(copy, block.key) })}
                  </p>
                ) : null}
                {block.key === "images" ? (
                  <ImageGrid hits={block.hits} query={query} openId={openId} copy={copy} onOpen={(id) => {
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
                            {/* Plain text, not a button: browsers will not start a text selection inside a button.
                                The title link opens the preview on a plain click; a drag or selection never does. */}
                            <div className="min-w-0 flex-1 select-text px-1 py-4 text-start">
                              <p className="flex items-center gap-2 text-xs tracking-wide text-muted uppercase">
                                <SiteLogo url={hit.url} />
                                <span className="min-w-0 truncate">{hit.meta}</span>
                              </p>
                              <p dir="auto" className="mt-1 font-display text-xl leading-snug text-ink">
                                <SelectableLink
                                  href={hit.url}
                                  popup
                                  current={hit.id === openId}
                                  onOpen={() => {
                                    tap("light");
                                    setOpenId(hit.id);
                                  }}
                                  className="hover:text-accent focus-visible:text-accent"
                                >
                                  <Highlight text={hit.title} query={query} />
                                </SelectableLink>
                              </p>
                              <p dir="ltr" className="mt-1 break-all text-xs text-muted">{hit.url}</p>
                              {hit.snippet ? (
                                <p dir="auto" className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted">
                                  <Highlight text={hit.snippet} query={query} />
                                </p>
                              ) : null}
                            </div>
                            <a
                              href={hit.url}
                              target="_blank"
                              rel="noreferrer"
                              {...selectSafeLink}
                              aria-label={fill(copy.openNew, { title: hit.title })}
                              className="mt-3 grid size-11 shrink-0 place-items-center rounded-full text-muted hover:text-accent"
                            >
                              <ArrowUpRight className="size-4" aria-hidden="true" />
                            </a>
                          </div>
                        </li>
                        {block.key === "web" && index === 0 && block.page === 1 && data.deepDive.length > 0 ? (
                          <li className="border-b border-line py-4">
                            <DeepDive topic={query} items={data.deepDive} copy={copy} onPick={onDive} />
                          </li>
                        ) : null}
                      </Fragment>
                    ))}
                  </ul>
                )}
                <Pager
                  label={sourceLabel(copy, block.key)}
                  page={block.page}
                  last={last}
                  disabled={loading || Boolean(block.error)}
                  previous={copy.previous}
                  next={copy.next}
                  pageLabel={copy.page}
                  navLabel={fill(copy.pages, { label: sourceLabel(copy, block.key) })}
                  onPage={(page) => onPage(block.key, page)}
                />
                {block.key === "web" && block.hits.length > 0 ? (
                  <p className="text-xs text-muted">{copy.webNote}</p>
                ) : null}
                {block.key === "images" && block.hits.length > 0 ? (
                  <p className="text-xs text-muted">{copy.imagesNote}</p>
                ) : null}
              </section>
            );
          })}
        </div>
        <div className="order-1 grid gap-4 lg:order-2">
          {data.card ? <Lead card={data.card} copy={copy} /> : null}
          <PlaceList places={data.places} error={data.placesError} copy={copy} />
          <Definitions items={data.definitions} copy={copy} />
          {!data.card && !data.places.length && loading ? <Skeleton /> : null}
        </div>
      </div>
      {openHit ? (
        <ResultPeek
          hit={openHit}
          index={openIndex}
          total={flat.length}
          lang={lang}
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


type AiState = { key: string; answer: AiAnswer | null; trace: WorkTrace | null };

/** One request per page load for which AI models can run on the server. */
let providersRequest: Promise<AiModelStatus[]> | null = null;
function loadAiProviders(): Promise<AiModelStatus[]> {
  providersRequest ??= listAiProviders({ data: {} }).catch((error) => {
    providersRequest = null;
    throw error;
  });
  return providersRequest;
}

/**
 * The AI answer at the top of the results. It waits for the other sources, then asks the
 * server for a short answer built from the top results of every source that is on (Web, Wikipedia,
 * Grokipedia, and Images). A function search draws its graph inside this same card. The lists
 * render first and never wait on the model. Paging a list does not ask again; switching model does.
 */
function AiAnswerCard({
  query,
  data,
  loading,
  sources,
  aiModel,
  copy,
  lang,
  onPick,
}: {
  query: string;
  data: SearchPayload | null;
  loading: boolean;
  sources: Sources;
  aiModel: string | undefined;
  copy: UiCopy;
  lang: UiLang;
  onPick: (query: string) => void;
}) {
  const [providers, setProviders] = useState<AiModelStatus[] | "failed" | null>(null);
  const [state, setState] = useState<AiState | null>(null);
  const [attempt, setAttempt] = useState(0);
  const asked = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadAiProviders()
      .then((rows) => {
        if (!cancelled) setProviders(rows);
      })
      .catch(() => {
        if (!cancelled) setProviders("failed");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const available = Array.isArray(providers) ? providers.filter((row) => row.available).map((row) => row.id) : [];
  // Nothing is asked until the list loads. If the list fails, the server still picks and falls back.
  // A known pick is always sent, even when the list says it can't run: the server then answers
  // with another model and says which pick failed and why, instead of switching quietly here.
  const picked = aiModel && AI_MODELS.some((model) => model.id === aiModel) ? aiModel : undefined;
  const selected = picked ?? (Array.isArray(providers) ? selectedAiModel(aiModel, available) : aiModel);
  const normalized = query.replace(/\s+/g, " ");
  // The page language is part of the key: switching language writes the answer again in it, and a
  // search re-run for the new language (data.pageLang) asks again with the new results.
  const key = JSON.stringify([normalized, sources.web, sources.wiki, sources.grok, sources.images, selected ?? "", lang, data?.pageLang ?? ""]);
  const ready = providers !== null && Boolean(data) && !loading && data?.query === normalized;
  const searched = (["web", "wiki", "grok", "images"] as const).filter((id) => sources[id]);
  // The search stage, for the progress line: seen live here, or (when the results came with the page)
  // the server's own measured search time.
  const searchKey = JSON.stringify([normalized, ...searched, lang]);
  const searching = !data || loading || data.query !== normalized;
  const [searchSeen, setSearchSeen] = useState<{ key: string; start: number; id: number } | null>(null);
  const usedSearch = useRef(new Set<number>());
  const askedSearch = useRef(new Set<string>());
  useEffect(() => {
    if (searching && searched.length && searchSeen?.key !== searchKey) {
      setSearchSeen({ key: searchKey, start: performance.now(), id: (searchSeen?.id ?? 0) + 1 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start the clock once per search
  }, [searching, searchKey]);

  useEffect(() => {
    if (!ready || !data) return;
    const ask = `${key}#${attempt}`;
    if (asked.current === ask) return;
    asked.current = ask;
    if (Array.isArray(providers) && available.length === 0) {
      setState({ key, answer: { status: "unconfigured", message: AI_MESSAGES.unconfigured }, trace: null });
      return;
    }
    const context = pickAiContext({
      news: sources.web ? data.news : undefined,
      web: sources.web ? data.web : undefined,
      wiki: sources.wiki ? data.wiki : undefined,
      grok: sources.grok ? data.grok : undefined,
      images: sources.images ? data.images : undefined,
    });
    const now = performance.now();
    let trace = createTrace(now);
    if (searched.length) {
      if (searchSeen && searchSeen.key === searchKey && !usedSearch.current.has(searchSeen.id)) {
        usedSearch.current.add(searchSeen.id);
        trace = addDoneStep(trace, { kind: "search", sources: [...searched] }, searchSeen.start, now);
      } else if (!askedSearch.current.has(searchKey) && data.tookMs > 0) {
        trace = addDoneStep(trace, { kind: "search", sources: [...searched] }, now - data.tookMs, now);
      }
    }
    askedSearch.current.add(searchKey);
    if (context.length) trace = addClientStep(trace, { kind: "read", count: context.length }, now);
    trace = markSent(trace, now);
    setState({ key, answer: null, trace });
    const update = (change: (trace: WorkTrace) => WorkTrace) =>
      setState((current) => (current?.key === key && current.trace && !current.answer ? { ...current, trace: change(current.trace) } : current));
    const finish = (answer: AiAnswer) =>
      setState((current) =>
        current?.key === key ? { key, answer, trace: current.trace ? finishWithAnswer(current.trace, answer, performance.now()) : null } : current,
      );
    const spec = AI_MODELS.find((model) => model.id === selected);
    askAiWithProgress(
      { q: data.query, context, model: selected, lang },
      {
        onEvent: (event) => update((current) => addServerEvent(current, event, performance.now())),
        onFallback: () => update((current) => addClientStep(current, { kind: "ask", ...(spec ? { model: spec.id, provider: spec.provider } : {}) }, performance.now())),
      },
    )
      .then(finish)
      .catch(() => finish({ status: "error", message: AI_MESSAGES.error }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ask once per query, source set, and provider, not per page
  }, [key, ready, attempt]);

  const answer = state?.key === key ? state.answer : null;
  const trace = state?.key === key ? state.trace : null;
  // Before the request leaves, the live line follows the search itself.
  const liveTrace =
    trace ??
    (searchSeen && searchSeen.key === searchKey && searching
      ? addClientStep(createTrace(searchSeen.start), { kind: "search", sources: [...searched] }, searchSeen.start)
      : null);
  const hasReferences = Boolean(
    (sources.web && data?.web.results.length) || (sources.wiki && data?.wiki.results.length) ||
    (sources.grok && data?.grok.results.length) || (sources.images && data?.images.results.length),
  );
  const question = questionCopy(lang);
  const pending = !answer;
  // A news search: articles from the news feed as cards under the answer, the ones it cited first.
  const newsCards = answer?.status === "ok" && sources.web && data?.news?.results.length ? pickNewsCards(data.news.results, answer.citations) : [];
  // After a few seconds, say how long the pick may take (slow reasoning models wait up to 40 s).
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (!pending) return;
    const timer = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(timer);
  }, [pending, key, attempt]);

  return (
    <section
      aria-labelledby="ai-answer"
      aria-busy={pending}
      className="py-4 sm:py-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="ai-answer" className="flex items-center gap-2 font-display text-xl text-ink">
          <Sparkles className="size-4 text-accent" aria-hidden="true" />
          {copy.aiAnswer}
        </h2>
        <p className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">
          {copy.aiBadge}
        </p>
      </div>
      <GraphCard query={query} copy={copy} onPick={onPick} />
      <div aria-live="polite">
        {pending ? (
          <div className="mt-3">
            <WorkLive
              trace={liveTrace}
              lang={lang}
              copy={copy}
              fallback={selected ? fill(hasReferences ? copy.asking : question.asking, { model: modelLabel(selected) }) : (hasReferences ? copy.writing : question.writing)}
            />
            {slow && selected ? (
              <p className="mt-1 text-xs text-muted">
                {fill(copy.aiSlow, { model: modelLabel(selected), seconds: String(Math.round(aiModelTimeoutMs(selected) / 1000)) })}
              </p>
            ) : null}
            <div className="mt-3 grid gap-2" aria-hidden="true">
              <div className="h-3.5 w-full animate-pulse rounded bg-line" />
              <div className="h-3.5 w-11/12 animate-pulse rounded bg-line" />
              <div className="h-3.5 w-2/3 animate-pulse rounded bg-line" />
            </div>
          </div>
        ) : answer.status === "ok" ? (
          <>
            {trace ? <WorkSummary trace={trace} lang={lang} copy={copy} /> : null}
            <div className="mt-3 min-w-0 text-base leading-relaxed text-ink">
              <AiText
                parts={answer.parts}
                citations={answer.citations}
                copy={copy}
                lang={lang}
                after={newsCards.length ? <NewsCards items={newsCards} lang={lang} /> : undefined}
              />
            </div>
            <ReadAloud
              resetKey={key}
              lang={lang}
              ready
              copy={copy}
              label={copy.listenAnswer}
              text={answer.parts.map((part) => ("text" in part ? part.text : " ")).join("").replace(/\s+/g, " ").trim()}
            />
            <AnswerSources citations={answer.citations} copy={copy} />
            <p className="mt-3 text-xs leading-relaxed text-muted">
              {fallbackFailures(answer).length > 0 ? (
                <>
                  <span>
                    {fill(copy.failedSo, {
                      failed: fallbackFailures(answer).join(", "),
                      provider: aiModelLabelFor(answer.model) === answer.model ? aiProviderLabel(answer.provider) : aiModelLabelFor(answer.model),
                    })}
                  </span>{" "}
                </>
              ) : null}
              <span>{fill(hasReferences ? copy.writtenBy : question.writtenBy, { provider: aiProviderLabel(answer.provider), model: answer.model })}</span>
            </p>
            {answer.attempts && answer.attempts.length > 0 ? <AiAttemptDetails attempts={answer.attempts} copy={copy} /> : null}
          </>
        ) : (
          <>
          {trace ? <WorkSummary trace={trace} lang={lang} copy={copy} /> : null}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted">
              {answer.status === "unconfigured" ? copy.aiUnconfigured : answer.status === "no-context" ? copy.aiNoContext : copy.aiError}
            </p>
            {answer.status === "error" ? (
              <button
                type="button"
                onClick={() => setAttempt((value) => value + 1)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line px-3 text-sm text-ink transition-transform duration-150 ease-out active:scale-[0.96]"
              >
                <RotateCw className="size-3.5" aria-hidden="true" />
                {copy.tryAgain}
              </button>
            ) : null}
          </div>
          {answer.attempts && answer.attempts.length > 0 ? <AiAttemptDetails attempts={answer.attempts} copy={copy} /> : null}
          </>
        )}
      </div>
      {answer?.status === "ok" ? <div className="flex flex-wrap items-center gap-1">
        <AnswerCopy text={answer.text} lang={lang} />
        <AnswerFeedback key={answer.text} text={answer.text} copy={copy} lang={lang} />
        <button type="button" onClick={() => setAttempt(value => value + 1)} aria-label={copy.tryAgain} title={copy.tryAgain} className="mt-2 grid size-11 place-items-center rounded-full text-muted hover:bg-accent-soft hover:text-ink"><RotateCw className="size-4" aria-hidden="true" /></button>
      </div> : null}
      <AnswerImage key={normalized} query={query} answer={answer?.status === "ok" ? answer.text : undefined} lang={lang} />
      {answer?.status === "ok" ? <ChatFollowUps key={key} query={query} initial={answer} context={pickAiContext({ news: sources.web ? data?.news : undefined, web: sources.web ? data?.web : undefined, wiki: sources.wiki ? data?.wiki : undefined, grok: sources.grok ? data?.grok : undefined, images: sources.images ? data?.images : undefined })} model={selected} lang={lang} copy={copy} /> : null}
    </section>
  );
}


/** "Why?" under a fallback answer: each model that was tried first, and what its provider said. */
function AiAttemptDetails({ attempts, copy }: { attempts: AiAttempt[]; copy: UiCopy }) {
  return (
    <details className="mt-1.5 text-xs leading-relaxed text-muted">
      <summary className="inline-flex min-h-11 cursor-pointer items-center underline-offset-2 hover:underline">{copy.aiWhy}</summary>
      <ul className="space-y-1 pb-1">
        {attempts.map((attempt, index) => (
          <li key={`${attempt.model}-${index}`}>
            <span className="text-ink">{aiModelLabelFor(attempt.model)}</span>
            <span>{": "}</span>
            <span>{copy[FAILURE_COPY[attempt.kind]]}</span>
            {attempt.status || attempt.detail ? (
              <span dir="ltr" lang="en" className="block break-words font-mono text-[11px] opacity-80">
                {[attempt.status ? `HTTP ${attempt.status}` : "", attempt.model, attempt.detail ?? ""].filter(Boolean).join(" · ")}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}

function modelLabel(id: string): string {
  return AI_MODELS.find((model) => model.id === id)?.label ?? id;
}

/** Grok, ChatGPT, Gemini, and Claude models. A model without a usable key is shown but cannot be picked. */
function AiModelPicker({
  models,
  selected,
  onPick,
  compact = false,
  above = false,
  copy,
  onOpenChange,
}: {
  models: AiModelStatus[] | "failed" | null;
  selected: string | undefined;
  onPick: (id: string | undefined) => void;
  compact?: boolean;
  above?: boolean;
  copy: UiCopy;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpenState] = useState(false);
  const [filter, setFilter] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const rows = Array.isArray(models) ? models : AI_MODELS.map((model) => ({ ...model, available: models === "failed" }));
  const current = rows.find((model) => model.id === selected) ?? AI_MODELS.find((model) => model.id === selected);

  function setOpen(next: boolean) {
    setOpenState(next);
    onOpenChange?.(next);
  }

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const query = filter.trim().toLowerCase();
  const shown = rows.filter((model) => !query || model.label.toLowerCase().includes(query));

  return (
    <div ref={root} className={compact ? "relative ms-auto shrink-0" : "relative mt-3"}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={copy.model}
        disabled={models === null}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={() => setOpen(!open)}
        className={
          compact
            ? "inline-flex h-9 max-w-36 items-center gap-1 rounded-full border border-line bg-bg px-2.5 text-xs text-ink transition-transform duration-150 ease-out active:scale-[0.96] disabled:opacity-60"
            : "inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-bg px-3 text-sm text-ink transition-transform duration-150 ease-out active:scale-[0.96] disabled:opacity-60"
        }
      >
        <span className="truncate">{selected ? current?.label ?? copy.model : copy.autoModel}</span>
        <ChevronDown className={`size-3.5 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open ? (
        <div className={`absolute end-0 z-40 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-surface p-2 shadow-lg ${above ? "bottom-full mb-2" : "top-full mt-2"}`}>
          <label className="sr-only" htmlFor="ai-model-filter">
            {copy.searchModels}
          </label>
          <input
            id="ai-model-filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") event.preventDefault();
            }}
            placeholder={copy.searchModels}
            className="mb-1 h-10 w-full rounded-xl border border-line bg-bg px-3 text-sm text-ink outline-none placeholder:text-muted"
          />
          <ul role="listbox" aria-label={copy.aiModels} className="max-h-72 overflow-y-auto">
            {!query || copy.autoModel.toLowerCase().includes(query) ? (
              <li>
                <button type="button" role="option" aria-selected={!selected}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => { onPick(undefined); setOpen(false); setFilter(""); }}
                  className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 text-start text-sm ${!selected ? "bg-accent-soft font-medium text-ink" : "text-ink hover:bg-bg"}`}>
                  <span>{copy.autoModel}</span>
                  {!selected ? <Check className="size-4" aria-hidden="true" /> : null}
                </button>
              </li>
            ) : null}
            {shown.length === 0 && query && !copy.autoModel.toLowerCase().includes(query) ? <li className="px-3 py-2 text-sm text-muted">{copy.noModels}</li> : null}
            {shown.map((model) => {
              const checked = model.id === selected;
              return (
                <li key={model.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={checked}
                    disabled={!model.available}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      if (!checked) onPick(model.id);
                      setOpen(false);
                      setFilter("");
                    }}
                    className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 text-start text-sm disabled:opacity-50 ${
                      checked ? "bg-accent-soft font-medium text-ink" : "text-ink hover:bg-bg"
                    }`}
                  >
                    <span>{model.label}</span>
                    {"note" in model && model.note ? <span className="shrink-0 text-xs text-muted">{modelNoteLabel(model.note, copy)}</span> : null}
                    {checked ? <span className="sr-only">{copy.selected}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function modelNoteLabel(note: string, copy: UiCopy): string {
  if (note === "not set up") return copy.noteNotSetUp;
  if (note === "needs a paid plan") return copy.notePaidPlan;
  return note;
}

function AiText({
  parts,
  citations,
  copy,
  lang,
  after,
}: {
  parts: AiPart[];
  lang: UiLang;
  citations: Extract<AiAnswer, { status: "ok" }>["citations"];
  copy: UiCopy;
  /** Shown after the answer, or before its closing line when it is a list (news cards). */
  after?: ReactNode;
}) {
  // An answer built from sources shows each point's sources as a chip (icon and name) where it cites them.
  const chips = citations.length > 0;
  const inline = (list: readonly AiPart[]) =>
    (chips ? groupCites(list) : list).map((part, index) => {
      if ("cites" in part) {
        const cites = part.cites.map((n) => citations[n - 1]).filter((cite): cite is (typeof citations)[number] => Boolean(cite));
        return <SourceChip key={index} cites={cites} lang={lang} />;
      }
      if ("code" in part) return <AnswerCode key={index} code={part.code} language={part.language} lang={lang} />;
      if ("text" in part) {
        const pieces = part.text.split(/(`[^`\n]+`)/g).map((text, i) => text.startsWith("`") && text.endsWith("`") ? <code key={i} dir="ltr" className="rounded bg-line px-1 font-mono text-sm">{text.slice(1, -1)}</code> : text);
        return part.strong ? <strong key={index} className="font-semibold whitespace-pre-wrap">{pieces}</strong> : <span key={index} className="whitespace-pre-wrap">{pieces}</span>;
      }
      const cite = citations[part.cite - 1];
      if (!cite) return null;
      return (
        <sup key={index} className="ms-px">
          <a
            href={cite.url}
            target="_blank"
            rel="noreferrer"
            {...selectSafeLink}
            aria-label={fill(copy.sourceN, { n: String(cite.n), title: cite.title })}
            className="inline-block rounded-full bg-accent-soft px-[0.4em] py-[0.15em] text-[0.7rem] leading-none font-medium text-accent tabular-nums hover:bg-accent hover:text-bg"
          >
            {cite.n}
          </a>
        </sup>
      );
    });
  if (!hasBullets(parts)) {
    return (
      <>
        {inline(parts)}
        {after ? <div>{after}</div> : null}
      </>
    );
  }
  // A list (news answers): intro line, bullets, and a closing line. Cards go before the closing line.
  const blocks = answerBlocks(parts);
  const groups: Array<{ kind: "ul"; items: Array<Extract<AnswerBlock, { kind: "li" }>> } | AnswerBlock> = [];
  for (const block of blocks) {
    const prev = groups[groups.length - 1];
    if (block.kind === "li" && prev?.kind === "ul") prev.items.push(block);
    else if (block.kind === "li") groups.push({ kind: "ul", items: [block] });
    else groups.push(block);
  }
  // A closing paragraph right after the list (the follow-up offer).
  const closing = groups.length > 1 && groups[groups.length - 1]?.kind === "p" && groups[groups.length - 2]?.kind === "ul" ? groups.length - 1 : groups.length;
  const rendered = groups.map((group, index) => {
    if (group.kind === "ul") {
      return (
        <ul key={index} className="my-2 list-disc space-y-2 ps-5 marker:text-muted">
          {group.items.map((item, i) => <li key={i} dir="auto" className="ps-0.5">{inline(item.parts)}</li>)}
        </ul>
      );
    }
    if (group.kind === "code") return <AnswerCode key={index} code={group.part.code} language={group.part.language} lang={lang} />;
    return <p key={index} dir="auto" className="my-2 first:mt-0">{inline(group.parts)}</p>;
  });
  return (
    <>
      {rendered.slice(0, closing)}
      {after ? <div>{after}</div> : null}
      {rendered.slice(closing)}
    </>
  );
}

function ImageGrid({
  hits,
  query,
  openId,
  copy,
  onOpen,
}: {
  hits: SearchHit[];
  query: string;
  openId: string | null;
  copy: UiCopy;
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
            <button
              type="button"
              onClick={() => onOpen(hit.id)}
              aria-pressed={open}
              aria-label={hit.title}
              className="block w-full text-start"
            >
              <span className="block aspect-[4/3] overflow-hidden bg-line">
                {hit.image ? (
                  <img
                    src={hit.image.thumb}
                    alt={hit.title}
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    draggable={false}
                    className="h-full w-full object-cover transition-transform duration-200 ease-out group-hover:scale-[1.03]"
                  />
                ) : null}
              </span>
            </button>
            {/* The caption is plain text (outside the button) so it can be selected and copied. */}
            <div className="block px-3 pt-2 pb-3 text-start">
              <SelectableLink
                href={hit.url}
                focusable={false}
                onOpen={() => onOpen(hit.id)}
                className="line-clamp-2 text-sm leading-snug text-ink group-hover:text-accent"
              >
                <Highlight text={hit.title} query={query} />
              </SelectableLink>
              <span className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
                <SiteLogo url={hit.url} />
                <span className="min-w-0 truncate">{siteHost(hit.url)}</span>
              </span>
            </div>
            <a
              href={hit.url}
              target="_blank"
              rel="noreferrer"
              {...selectSafeLink}
              aria-label={fill(copy.openNew, { title: hit.title })}
              className="absolute top-1 end-1 grid size-11 place-items-center"
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

const READ_RATES = [0.8, 1, 1.25, 1.5];

/** Split text into sentence-sized pieces. Chinese and Japanese end sentences without a space. */
function chunkSpeech(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const parts: string[] = [];
  let buf = "";
  for (const sentence of clean.split(/(?<=[.!?؟।])\s+|(?<=[。！？])/)) {
    const piece = sentence.trim();
    if (!piece) continue;
    const next = buf ? `${buf} ${piece}` : piece;
    if (next.length > 220 && buf) {
      parts.push(buf);
      buf = piece;
    } else {
      buf = next;
    }
  }
  if (buf) parts.push(buf);
  return parts;
}

/** Voice tags differ by platform ("bn-IN", "bn_IN", "ar-001"); compare them in one form. */
function voiceTag(voice: SpeechSynthesisVoice): string {
  return voice.lang.replace(/_/g, "-").toLowerCase();
}

const VOICE_KEY = "folio-read-voice";

/**
 * Installed voices for a language: the exact region first ("zh-CN" before "zh-TW"), then any
 * other region of the same language. Empty when the browser has nothing for it.
 */
function voicesFor(voices: SpeechSynthesisVoice[], lang: string): SpeechSynthesisVoice[] {
  const exact = lang.toLowerCase();
  const prefix = exact.split("-")[0] ?? exact;
  const same = voices.filter((voice) => voiceTag(voice) === exact);
  const related = voices.filter((voice) => voiceTag(voice) !== exact && (voiceTag(voice) === prefix || voiceTag(voice).startsWith(`${prefix}-`)));
  return [...same, ...related];
}

function readVoiceMap(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(VOICE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

function storeVoice(lang: string, uri: string) {
  try {
    const map = readVoiceMap();
    map[lang] = uri;
    localStorage.setItem(VOICE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function pickVoice(voices: SpeechSynthesisVoice[], lang: string, uri: string): SpeechSynthesisVoice | undefined {
  const options = voicesFor(voices, lang);
  return options.find((voice) => voice.voiceURI === uri) ?? options[0];
}

/**
 * Read text aloud with the browser's speech synthesis in the site language, which is picked on the
 * home screen. Text that is still being translated (a preview) plays once it is ready. With no
 * installed voice for the language, the utterance still carries the language tag so the system
 * can pick one, and a note says the voice may not match.
 */
function ReadAloud({
  text,
  resetKey,
  lang,
  ready,
  copy,
  label,
}: {
  text: string;
  resetKey: string;
  lang: UiLang;
  ready: boolean;
  copy: UiCopy;
  label?: string;
}) {
  const [supported, setSupported] = useState(false);
  const [rate, setRate] = useState(1);
  const [state, setState] = useState<"idle" | "playing" | "paused">("idle");
  const [open, setOpen] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceUri, setVoiceUri] = useState("");
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceBox, setVoiceBox] = useState<{ x: number; top: number; side: "left" | "right" } | null>(null);
  const generation = useRef(0);
  const pending = useRef<UiLang | null>(null);
  const voiceMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    if (!synth || typeof SpeechSynthesisUtterance === "undefined") return;
    setSupported(true);
    const load = () => setVoices(synth.getVoices());
    load();
    synth.addEventListener("voiceschanged", load);
    return () => {
      generation.current += 1;
      synth.cancel();
      synth.removeEventListener("voiceschanged", load);
    };
  }, []);

  useEffect(() => {
    generation.current += 1;
    pending.current = null;
    window.speechSynthesis?.cancel();
    setState("idle");
  }, [resetKey]);

  useEffect(() => {
    const options = voicesFor(voices, lang);
    const saved = readVoiceMap()[lang];
    setVoiceUri(options.find((voice) => voice.voiceURI === saved)?.voiceURI ?? options[0]?.voiceURI ?? "");
    setVoiceOpen(false);
  }, [voices, lang]);

  useEffect(() => {
    if (!voiceOpen) return;
    function onPointer(event: MouseEvent) {
      if (!voiceMenuRef.current?.contains(event.target as Node)) setVoiceOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [voiceOpen]);

  function play(nextLang: UiLang, nextRate = rate, spoken = text, uri = voiceUri) {
    const synth = window.speechSynthesis;
    const parts = chunkSpeech(spoken);
    if (!synth || parts.length === 0) return;
    const token = ++generation.current;
    synth.cancel();
    const voice = pickVoice(synth.getVoices(), nextLang, uri);
    parts.forEach((part, index) => {
      const utter = new SpeechSynthesisUtterance(part);
      utter.lang = nextLang;
      utter.rate = nextRate;
      if (voice) utter.voice = voice;
      const finish = () => {
        if (generation.current !== token) return;
        if (index === parts.length - 1) setState("idle");
      };
      utter.onend = finish;
      utter.onerror = finish;
      synth.speak(utter);
    });
    setRate(nextRate);
    setState("playing");
    setOpen(true);
  }

  useEffect(() => {
    if (pending.current !== lang || !ready) return;
    pending.current = null;
    play(lang);
    // play closes over the text for this language once it is ready
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, ready, text]);

  function stop() {
    generation.current += 1;
    pending.current = null;
    window.speechSynthesis?.cancel();
    setState("idle");
  }

  function togglePause() {
    const synth = window.speechSynthesis;
    if (!synth) return;
    if (state === "playing") {
      synth.pause();
      setState("paused");
    } else if (state === "paused") {
      synth.resume();
      setState("playing");
    }
  }

  function chooseVoice(uri: string) {
    setVoiceUri(uri);
    storeVoice(lang, uri);
    setVoiceOpen(false);
    if (state !== "idle") play(lang, rate, text, uri);
  }

  if (!supported) return null;

  const options = voicesFor(voices, lang);
  const missing = voices.length > 0 && options.length === 0;
  const current = langInfo(lang);
  const rtl = langDir(lang) === "rtl";

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => {
            if (!open && state === "idle") {
              // Listen reads in the page language; text still being translated plays when ready.
              if (ready) play(lang);
              else {
                pending.current = lang;
                setOpen(true);
              }
            } else setOpen((value) => !value);
          }}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-3 text-sm text-ink transition-transform duration-150 ease-out active:scale-[0.96]"
        >
          <Volume2 className="size-4" aria-hidden="true" />
          {label ?? copy.listen}
        </button>
      </div>
      {open ? (
        <div className="mt-2 grid gap-2">
          {state !== "idle" ? (
            <div className="relative flex items-center gap-1 rounded-full border border-line bg-bg px-1 py-1" role="group" aria-label={copy.controls}>
              <button type="button" onClick={togglePause} aria-label={state === "paused" ? copy.resume : copy.pause} className="grid size-11 place-items-center rounded-full text-ink">
                {state === "paused" ? <Play className="size-4" aria-hidden="true" /> : <Pause className="size-4" aria-hidden="true" />}
              </button>
              <button type="button" onClick={stop} aria-label={copy.stop} className="grid size-11 place-items-center rounded-full text-ink">
                <Square className="size-3.5 fill-current" aria-hidden="true" />
              </button>
              <div ref={voiceMenuRef} className="relative">
                <button
                  type="button"
                  aria-label={copy.voices}
                  aria-expanded={voiceOpen}
                  aria-haspopup="listbox"
                  disabled={options.length === 0}
                  onClick={(event) => {
                    if (voiceOpen) {
                      setVoiceOpen(false);
                      return;
                    }
                    const rect = event.currentTarget.getBoundingClientRect();
                    setVoiceBox(
                      rtl
                        ? { x: Math.max(8, window.innerWidth - rect.right), top: rect.bottom + 8, side: "right" }
                        : { x: rect.left, top: rect.bottom + 8, side: "left" },
                    );
                    setVoiceOpen(true);
                  }}
                  className="grid size-11 place-items-center rounded-full text-ink disabled:opacity-40"
                >
                  <span className={`size-3.5 rounded-full border-2 ${voiceUri ? "border-ink bg-ink" : "border-muted"}`} />
                </button>
                {voiceOpen && voiceBox && options.length > 0 ? (
                  <div
                    role="listbox"
                    aria-label={copy.voices}
                    style={voiceBox.side === "left" ? { left: voiceBox.x, top: voiceBox.top } : { right: voiceBox.x, top: voiceBox.top }}
                    className="fixed z-50 max-h-72 w-56 overflow-y-auto rounded-2xl border border-line bg-surface py-1 shadow-lg"
                  >
                    {options.map((voice) => {
                      const selected = voice.voiceURI === voiceUri;
                      return (
                        <button
                          key={voice.voiceURI}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onClick={() => chooseVoice(voice.voiceURI)}
                          className="flex min-h-11 w-full items-center gap-3 px-3 text-start text-sm text-ink"
                        >
                          <span className={`size-3 shrink-0 rounded-full border-2 ${selected ? "border-ink bg-ink" : "border-muted"}`} />
                          <span className="truncate" dir="auto">
                            {voice.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
              <span className="min-w-0 flex-1 truncate px-1 text-xs text-muted">{current.label}</span>
              <button
                type="button"
                aria-label={`${copy.speed}: ${rate}x`}
                onClick={() => {
                  const next = READ_RATES[(READ_RATES.indexOf(rate) + 1) % READ_RATES.length] ?? 1;
                  play(lang, next);
                }}
                className="inline-flex h-11 min-w-11 items-center justify-center rounded-full px-2 text-xs tabular-nums text-ink"
              >
                {rate}x
              </button>
              <button
                type="button"
                onClick={() => {
                  stop();
                  setOpen(false);
                }}
                aria-label={copy.closePlayer}
                className="grid size-11 place-items-center rounded-full text-ink"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          ) : null}
          {missing ? <p className="text-xs text-muted">{copy.noVoice}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Pack the lead and as many whole sections as fit in `limit` characters for translation. `sent` is
 * how many sections went in; the rest are shown untranslated after the translated ones.
 */
function packForTranslation(lead: string, sections: PreviewSection[], limit: number): { body: string; sent: number } {
  const head = lead.trim().slice(0, limit);
  let sent = 0;
  let body = head;
  for (const section of sections) {
    const next = packPreview(body, [section]);
    if (next.length > limit) break;
    body = next;
    sent += 1;
  }
  return { body, sent };
}

function packPreview(lead: string, sections: PreviewSection[]): string {
  const chunks = [lead.trim()];
  for (const section of sections) {
    const marks = "#".repeat(section.level + 1);
    chunks.push(`${marks} ${section.title}${section.text ? `\n${section.text}` : ""}`);
  }
  return chunks.filter(Boolean).join("\n\n");
}

function unpackPreview(text: string): { lead: string; sections: PreviewSection[] } {
  const sections: PreviewSection[] = [];
  const lead: string[] = [];
  let current: { title: string; level: number; lines: string[] } | null = null;
  const push = () => {
    if (!current) return;
    const title = current.title.trim();
    if (title) {
      sections.push({
        id: `s-${sections.length}`,
        title,
        level: current.level,
        text: current.lines.join(" ").replace(/\s+/g, " ").trim(),
      });
    }
    current = null;
  };
  for (const line of text.split(/\n/)) {
    const match = /^(#{2,3})\s+(.+?)\s*$/.exec(line);
    if (match) {
      push();
      current = { title: match[2] ?? "", level: (match[1] ?? "##").length - 1, lines: [] };
      continue;
    }
    if (current) current.lines.push(line);
    else lead.push(line);
  }
  push();
  return { lead: lead.join("\n").replace(/\n{3,}/g, "\n\n").trim(), sections };
}

/** Web results (except videos) and Wikipedia/Grokipedia hits load a fuller preview from the server. */
function needsPreview(hit: SearchHit): boolean {
  if (hit.source === "images") return false;
  if (hit.source === "web") return !youtubeId(hit.url);
  return true;
}

/** The section whose heading was passed last (a little below the top of the scroller), or the last one at the bottom. */
function currentSection(scroller: HTMLElement, ids: string[]): string {
  const top = scroller.getBoundingClientRect().top;
  let current = ids[0] ?? "s-0";
  for (const id of ids) {
    const element = scroller.querySelector<HTMLElement>(`#peek-${id}`);
    if (!element) continue;
    if (element.getBoundingClientRect().top - top <= 56) current = id;
    else break;
  }
  if (scroller.scrollTop > 0 && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4) current = ids[ids.length - 1] ?? current;
  return current;
}

/**
 * The Contents list beside a preview (Grokipedia, Wikipedia, and web pages read on the server):
 * h2 entries with nested h3 entries, the current section marked by a bar on the reading-start side.
 * On small screens it folds into a toggle. In a right-to-left page the grid puts it on the right.
 */
function PreviewContents({
  sections,
  active,
  copy,
  scrollerRef,
  onPick,
}: {
  sections: PreviewSection[];
  active: string;
  copy: UiCopy;
  scrollerRef: { current: HTMLDivElement | null };
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    // Keep the highlighted entry visible inside the (separately scrolling) list.
    const nav = navRef.current;
    const item = nav?.querySelector<HTMLElement>(`[data-section="${active}"]`);
    if (!nav || !item || nav.scrollHeight <= nav.clientHeight) return;
    const itemTop = item.offsetTop - nav.offsetTop;
    if (itemTop < nav.scrollTop) nav.scrollTop = itemTop - 8;
    else if (itemTop + item.offsetHeight > nav.scrollTop + nav.clientHeight) nav.scrollTop = itemTop + item.offsetHeight - nav.clientHeight + 8;
  }, [active]);

  return (
    <nav ref={navRef} aria-label={copy.contents} className="mb-4 sm:sticky sm:top-0 sm:mb-0 sm:max-h-[70vh] sm:overflow-y-auto">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border border-line px-3 text-start text-sm text-ink sm:hidden"
      >
        <span>
          {copy.contents} <span className="text-muted tabular-nums">({sections.length})</span>
        </span>
        <span className="sr-only">{open ? copy.hideContents : copy.showContents}</span>
        <ChevronDown className={`size-4 text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      <p className="hidden text-xs tracking-widest text-muted uppercase sm:block">{copy.contents}</p>
      <ol id={listId} className={`mt-2 ${open ? "block" : "hidden"} sm:block`}>
        {sections.map((section) => (
          <li key={section.id} className={section.level > 1 ? "ps-3" : ""}>
            <button
              type="button"
              data-section={section.id}
              aria-current={active === section.id ? "location" : undefined}
              onClick={() => {
                onPick(section.id);
                setOpen(false);
                const scroller = scrollerRef.current;
                const target = scroller?.querySelector<HTMLElement>(`#peek-${section.id}`);
                if (!scroller || !target) return;
                const top = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
                scroller.scrollTo({ top: Math.max(0, top - 8), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
              }}
              className={`block min-h-11 w-full border-s-2 py-1.5 ps-2 text-start leading-snug ${section.level > 1 ? "text-xs" : "text-sm"} ${
                active === section.id ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {section.title}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function PreviewSections({ sections }: { sections: PreviewSection[] }) {
  return (
    <>
      {sections.map((section) => (
        <section key={section.id} id={`peek-${section.id}`} className="scroll-mt-2 pt-3">
          <h3 dir="auto" className={section.level > 1 ? "text-base font-medium text-ink" : "font-display text-xl text-ink"}>
            {section.title}
          </h3>
          {section.text ? (
            <p dir="auto" className="mt-2 text-sm leading-relaxed text-ink">
              {section.text}
            </p>
          ) : null}
        </section>
      ))}
    </>
  );
}

function ResultPeek({
  hit,
  index,
  total,
  lang,
  onClose,
  onPrev,
  onNext,
}: {
  hit: SearchHit;
  index: number;
  total: number;
  lang: UiLang;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [peekWidth, setPeekWidth] = useState(512);
  const resizeStart = useRef<{ x: number; width: number } | null>(null);
  const clampWidth = (width: number) => Math.round(Math.min(Math.max(360, width), window.innerWidth));
  const saveWidth = (width: number) => {
    const next = clampWidth(width);
    setPeekWidth(next);
    try { localStorage.setItem("folio-preview-width", String(next)); } catch { /* Storage can be unavailable. */ }
  };
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem("folio-preview-width"));
      if (Number.isFinite(saved) && saved >= 360) setPeekWidth(clampWidth(saved));
    } catch { /* Use the default width. */ }
    const fit = () => setPeekWidth((width) => clampWidth(width));
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  const [preview, setPreview] = useState<HitPreview | null>(null);
  const [previewReady, setPreviewReady] = useState(!needsPreview(hit));
  const [translation, setTranslation] = useState<{ title: string; text: string; partial?: boolean } | null>(null);
  const [translating, setTranslating] = useState(false);
  /** Why the translation failed (from the server), or null. */
  const [translateError, setTranslateError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState("s-0");

  useEffect(() => {
    closeRef.current?.focus();
  }, [hit.id]);

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    // Web results show their snippet at once while the page itself is read on the server.
    const immediate = !needsPreview(hit);
    setPreviewReady(immediate);
    if (immediate) return;
    previewHit({ data: { source: hit.source, title: hit.title, url: hit.url, snippet: hit.snippet } })
      .then((row) => {
        if (!cancelled) setPreview(row);
      })
      .catch(() => {
        if (!cancelled) setPreview(null);
      })
      .finally(() => {
        if (!cancelled) setPreviewReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [hit]);

  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      // In a right-to-left page the previous result is to the right.
      const backKey = document.documentElement.dir === "rtl" ? "ArrowRight" : "ArrowLeft";
      const forwardKey = backKey === "ArrowLeft" ? "ArrowRight" : "ArrowLeft";
      if (event.key === "Escape") onClose();
      else if (event.key === backKey) {
        event.preventDefault();
        onPrev();
      } else if (event.key === forwardKey) {
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

  const { copy } = useLang();
  const rtl = langDir(lang) === "rtl";
  const extract = preview?.extract || hit.snippet;
  const sourceSections = preview?.sections ?? [];
  const { body: sourceBody, sent: sentSections } = packForTranslation(extract, sourceSections, PREVIEW_TRANSLATE_CHARS);
  const sourceTitle = preview?.title || hit.title;
  // A Wikipedia article from the page language's own edition is already in that language.
  const native = lang === "en-US" || (hit.source === "wiki" && wikiHostOf(hit.url) === `${langInfo(lang).wiki}.wikipedia.org`);
  const translated = !native && translation && !translateError ? translation : null;
  const unpacked = translated ? unpackPreview(translated.text) : null;
  const shownTitle = translated?.title || sourceTitle;
  const shownLead = unpacked ? unpacked.lead : extract;
  // Sections past the translation limit follow the translated ones in their original language.
  const restSections = translated ? sourceSections.slice(sentSections).map((section, index) => ({ ...section, id: `r-${index}` })) : [];
  const shownSections = translated ? [...(unpacked?.sections ?? []), ...restSections] : sourceSections;
  const shownText = [shownLead, ...shownSections.map((section) => `${section.title}. ${section.text}`)].filter(Boolean).join("\n\n");
  const leadParagraphs = shownLead.split(/\n\n+/).map((part) => part.trim()).filter(Boolean);
  const pageUrl = preview?.url || hit.url;
  const videoId = youtubeId(pageUrl);
  const speakReady = native || Boolean(translateError) || Boolean(translated && !translating);

  useEffect(() => {
    setActiveSection(shownSections[0]?.id ?? "s-0");
  }, [hit.id, lang, shownSections[0]?.id]);

  // Highlight the section being read while the preview scrolls.
  const sectionKey = shownSections.length >= MIN_CONTENTS ? shownSections.map((section) => section.id).join("|") : "";
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !sectionKey) return;
    const ids = sectionKey.split("|");
    let frame = 0;
    const update = () => {
      frame = 0;
      setActiveSection(currentSection(scroller, ids));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [sectionKey, hit.id]);

  useEffect(() => {
    // A new language drops the old translation so its text is never shown under the new buttons.
    setTranslation(null);
    setTranslateError(null);
  }, [lang]);

  useEffect(() => {
    if (native || !previewReady) return;
    let cancelled = false;
    setTranslating(true);
    setTranslateError(null);
    translatePreview({ data: { lang, title: sourceTitle, text: sourceBody } })
      .then((row) => {
        if (!cancelled) setTranslation(row);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setTranslation(null);
          setTranslateError(error instanceof Error && error.message ? error.message.slice(0, 200) : "unknown error");
        }
      })
      .finally(() => {
        if (!cancelled) setTranslating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lang, native, previewReady, hit.id, sourceTitle, sourceBody]);

  return (
    <div className="fixed inset-0 z-40">
      <button type="button" aria-label={copy.close} onClick={onClose} className="absolute inset-0 bg-ink/35" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        lang={lang}
        dir={rtl ? "rtl" : "ltr"}
        style={{ "--peek-width": `${peekWidth}px` } as CSSProperties}
        className="folio-peek absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-3xl border border-line bg-surface sm:inset-y-0 sm:end-0 sm:start-auto sm:max-h-none sm:rounded-none sm:border-y-0 sm:border-e-0"
      >
        <div
          role="separator"
          aria-label="Resize preview"
          aria-orientation="vertical"
          aria-valuemin={360}
          aria-valuemax={typeof window === "undefined" ? 1920 : window.innerWidth}
          aria-valuenow={peekWidth}
          tabIndex={0}
          title="Drag to resize · Arrow keys to adjust · Home to reset"
          className="folio-peek-resize hidden sm:flex"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            resizeStart.current = { x: event.clientX, width: peekWidth };
          }}
          onPointerMove={(event) => {
            const start = resizeStart.current;
            if (start) setPeekWidth(clampWidth(start.width + (rtl ? 1 : -1) * (event.clientX - start.x)));
          }}
          onPointerUp={(event) => {
            const start = resizeStart.current;
            if (start) saveWidth(start.width + (rtl ? 1 : -1) * (event.clientX - start.x));
            resizeStart.current = null;
          }}
          onLostPointerCapture={() => { resizeStart.current = null; }}
          onKeyDown={(event) => {
            if (event.key === "Home") { event.preventDefault(); saveWidth(512); }
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault(); event.stopPropagation();
              saveWidth(peekWidth + (event.key === "ArrowLeft" ? -1 : 1) * (rtl ? 1 : -1) * (event.shiftKey ? 80 : 24));
            }
          }}
        ><span /></div>
        <div className="px-4 pt-2 sm:pt-4">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-line sm:hidden" aria-hidden="true" />
          <div className="flex items-center justify-between gap-2 pb-3">
            <p className="flex min-w-0 items-center gap-2 text-xs tracking-widest text-muted uppercase">
              <SiteLogo url={pageUrl} />
              <span className="truncate">{siteHost(pageUrl) || sourceLabel(copy, hit.source)}</span>
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onPrev}
                disabled={index <= 0}
                aria-label={copy.previousResult}
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
                aria-label={copy.nextResult}
                className="grid size-11 place-items-center rounded-full text-ink disabled:opacity-40"
              >
                <ChevronRight className="size-4" aria-hidden="true" />
              </button>
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                aria-label={copy.close}
                className="grid size-11 place-items-center rounded-full text-ink"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
        <div ref={scrollerRef} className="relative min-h-0 flex-1 overflow-y-auto px-5 pb-6">
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
          <h2 id={titleId} dir="auto" className="font-display text-3xl leading-tight">
            {shownTitle}
          </h2>
          <p className="mt-1 text-sm text-accent">{preview?.kicker || hit.meta}</p>
          <ReadAloud
            resetKey={hit.id}
            lang={lang}
            ready={speakReady}
            copy={copy}
            text={[shownTitle, shownText].filter(Boolean).join(". ")}
          />
          {translating && !native ? <p className="mt-2 text-sm text-muted">{copy.translating}</p> : null}
          {translateError && !native ? (
            <p className="mt-2 text-sm text-muted" role="status">
              {copy.translateFailed}{" "}
              <span className="text-xs" dir="ltr" lang="en">
                ({translateError})
              </span>
            </p>
          ) : null}
          {translated?.partial && !native ? <p className="mt-2 text-sm text-muted">{copy.translatePartial}</p> : null}
          {hit.source === "web" && !previewReady ? <p className="mt-2 text-sm text-muted">{copy.readingPage}</p> : null}
          {hit.source === "web" && preview?.reader === "unavailable" ? (
            <p className="mt-2 text-sm text-muted" role="status">
              {copy.pageUnavailable}
            </p>
          ) : null}
          {shownSections.length >= MIN_CONTENTS ? (
            <div className="mt-4 sm:grid sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:gap-4">
              <PreviewContents
                sections={shownSections}
                active={activeSection}
                copy={copy}
                scrollerRef={scrollerRef}
                onPick={setActiveSection}
              />
              <div>
                {leadParagraphs.map((part, partIndex) => (
                  <p key={`${hit.id}-lead-${partIndex}`} dir="auto" className="mb-3 text-sm leading-relaxed text-ink">
                    {part}
                  </p>
                ))}
                <PreviewSections sections={shownSections} />
              </div>
            </div>
          ) : (
            <div className="mt-4 grid gap-3">
              {leadParagraphs.map((part, partIndex) => (
                <p key={`${hit.id}-${partIndex}`} dir="auto" className="text-sm leading-relaxed text-ink">
                  {part}
                </p>
              ))}
              <PreviewSections sections={shownSections} />
            </div>
          )}
          {hit.image ? (
            <a
              href={hit.image.full}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-ink hover:text-accent"
            >
              {copy.fullImage}
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </a>
          ) : null}
          {!previewReady ? <p className="mt-4 text-sm text-muted">{copy.loadingPreview}</p> : null}
        </div>
        <div className="flex gap-2 border-t border-line p-4">
          <a
            href={pageUrl}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-ink px-4 text-sm font-medium text-bg"
          >
            {copy.openPage}
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </a>
          <NativeShareButton
            title={shownTitle}
            url={() => pageUrl}
            label={copy.sharePage}
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

function resultCount(total: number | undefined, source: SourceId, copy: UiCopy, lang: UiLang): string | null {
  if (!total || total <= 0) return null;
  const format = (value: number) => {
    try {
      return value.toLocaleString(lang);
    } catch {
      return value.toLocaleString("en-US");
    }
  };
  const shown = total >= 10000 ? `${format(10000)}+` : format(total);
  if (source === "web") return fill(copy.aboutResults, { n: shown });
  return fill(total === 1 ? copy.resultOne : copy.resultMany, { n: shown });
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
  previous,
  next,
  pageLabel,
  navLabel,
  onPage,
}: {
  label: string;
  page: number;
  last: number | null;
  disabled: boolean;
  previous: string;
  next: string;
  pageLabel: string;
  navLabel: string;
  onPage: (page: number) => void;
}) {
  const hasNext = last == null || page < last;
  const show = page > 1 || hasNext;
  if (!show) return null;
  const items: Array<number | "…"> =
    last == null ? (page <= 4 ? [1, 2, 3, 4, 5] : [1, "…", page - 1, page, page + 1]) : pageItems(Math.min(page, last), last);

  return (
    <nav aria-label={navLabel} className="flex flex-wrap items-center justify-center gap-1.5">
      <button
        type="button"
        onClick={() => onPage(page - 1)}
        disabled={disabled || page <= 1}
        className="h-11 rounded-lg px-3 text-sm text-muted transition-transform duration-150 ease-out active:scale-[0.96] disabled:opacity-40"
      >
        {previous}
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
            aria-label={fill(pageLabel, { label, n: String(item) })}
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
        {next}
      </button>
    </nav>
  );
}

function formatCoord(lat: number, lon: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}° ${ns}, ${Math.abs(lon).toFixed(2)}° ${ew}`;
}

function PlaceList({ places, error, copy }: { places: PlaceRef[]; error?: string; copy: UiCopy }) {
  if (!places.length && !error) return null;
  return (
    <section aria-labelledby="location-refs" className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="location-refs" className="font-display text-xl">
          {copy.locations}
        </h2>
        {places.length > 0 ? <p className="text-sm text-muted tabular-nums">{places.length}</p> : null}
      </div>
      {error && !places.length ? (
        <p className="mt-2 text-sm text-muted">{copy.locationsFailed}</p>
      ) : (
        <ol className="mt-2">
          {places.map((place, index) => (
            <li key={place.id} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-2 border-b border-line py-3 last:border-b-0">
              <span className="font-display text-muted tabular-nums">{index + 1}</span>
              <div className="min-w-0">
                <SelectableLink href={place.url} className="font-medium text-ink hover:text-accent">
                  {place.name}
                </SelectableLink>
                <p className="mt-0.5 text-sm leading-relaxed text-muted">{place.detail}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <span className="tabular-nums">{formatCoord(place.lat, place.lon)}</span>
                  <a href={place.map} target="_blank" rel="noreferrer" {...selectSafeLink} className="font-medium text-ink">
                    {copy.map}
                  </a>
                  <span>{place.source === "wiki" ? copy.wiki : "GeoNames"}</span>
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Lead({ card, copy }: { card: NonNullable<SearchPayload["card"]>; copy: UiCopy }) {
  return (
    <aside className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-xs tracking-widest text-muted uppercase">
        {card.source === "wiki" ? copy.wiki : copy.grok}
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
        {...selectSafeLink}
        className="mt-4 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-ink"
      >
        {copy.readArticle}
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

function AnswerSources({ citations, copy }: { citations: Extract<AiAnswer, { status: "ok" }>["citations"]; copy: UiCopy }) {
  if (!citations.length) return null;
  return <details className="group mt-3">
    <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-2 rounded-full border border-line bg-bg px-3 text-sm text-ink hover:bg-accent-soft [&::-webkit-details-marker]:hidden">
      <span className="flex items-center -space-x-1" aria-hidden="true">{citations.slice(0, 3).map(cite => <SiteLogo key={cite.n} url={cite.url} />)}</span>
      <span>{fill(copy.answerSources, { count: String(citations.length) })}</span>
      <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
    </summary>
              <ol className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-1 border-t border-line pt-3">
                {citations.map((cite) => (
                  <li key={cite.n}>
                    <SelectableLink href={cite.url} className="flex min-h-11 items-center gap-2 text-sm text-ink hover:text-accent">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-medium text-accent tabular-nums">
                        {cite.n}
                      </span>
                      <SiteLogo url={cite.url} />
                      <span className="min-w-0 truncate">{cite.title}</span>
                      <span className="hidden shrink-0 text-xs text-muted sm:inline">
                        {cite.source === "images" ? <span>{copy.image} · </span> : null}
                        {siteHost(cite.url) || sourceLabel(copy, cite.source)}
                      </span>
                    </SelectableLink>
                  </li>
                ))}
              </ol>
  </details>;
}

/** Feedback is a private, page-local marker; it is not sent to model providers. */
function AnswerFeedback({ text, copy, lang }: { text: string; copy: UiCopy; lang: UiLang }) {
  const [vote, setVote] = useState<"up" | "down" | null>(null);
  const [shared, setShared] = useState(false);
  const [failed, setFailed] = useState(false);
  async function share() {
    try {
      await navigator.clipboard.writeText(`${text}\n\n${window.location.href}`);
      setShared(true); setFailed(false);
    } catch { setFailed(true); }
  }
  return <>
    <button type="button" onClick={share} aria-label={shared ? chatCopy(lang).copied : copy.shareResults} title={copy.shareResults} className="mt-2 grid size-11 place-items-center rounded-full text-muted hover:bg-accent-soft">{shared ? <Check className="size-4" /> : <Share className="size-4" />}</button>
    <button type="button" aria-label={copy.helpfulAnswer} title={copy.helpfulAnswer} aria-pressed={vote === "up"} onClick={() => setVote(vote === "up" ? null : "up")} className="mt-2 grid size-11 place-items-center rounded-full text-muted hover:bg-accent-soft aria-pressed:bg-accent-soft aria-pressed:text-accent"><ThumbsUp className="size-4" /></button>
    <button type="button" aria-label={copy.unhelpfulAnswer} title={copy.unhelpfulAnswer} aria-pressed={vote === "down"} onClick={() => setVote(vote === "down" ? null : "down")} className="mt-2 grid size-11 place-items-center rounded-full text-muted hover:bg-accent-soft aria-pressed:bg-accent-soft aria-pressed:text-accent"><ThumbsDown className="size-4" /></button>
    {failed ? <span role="status" className="text-xs text-muted">{copyFailure[lang]}</span> : null}
  </>;
}

function AnswerCopy({ text, lang }: { text: string; lang: UiLang }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const labels = chatCopy(lang);
  async function copyAnswer() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true); setFailed(false);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch { setFailed(true); }
  }
  return <div className="mt-2"><button type="button" onClick={copyAnswer} className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-xs text-muted hover:text-accent focus-visible:outline-2 focus-visible:outline-accent">
    {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}<span aria-live="polite">{copied ? labels.copied : labels.copy}</span>
  </button>{failed ? <p role="status" className="text-xs text-muted">{copyFailure[lang]}</p> : null}</div>;
}
const copyFailure: Record<UiLang, string> = {
  "en-US": "Could not copy. Select the answer to copy it.", "bn-BD": "কপি করা যায়নি। উত্তর নির্বাচন করে কপি করুন।", "hi-IN": "कॉपी नहीं हुआ। उत्तर चुनकर कॉपी करें।", "ar-SA": "تعذر النسخ. حدد الإجابة لنسخها.", "es-ES": "No se pudo copiar. Selecciona la respuesta para copiarla.", "fr-FR": "Copie impossible. Sélectionnez la réponse pour la copier.", "zh-CN": "无法复制，请选中回答复制。", "ja-JP": "コピーできません。回答を選択してコピーしてください。", "pt-BR": "Não foi possível copiar. Selecione a resposta para copiá-la.", "de-DE": "Kopieren fehlgeschlagen. Wähle die Antwort zum Kopieren aus.",
};

type ChatTurn = { question: string; answer: AiAnswer | null; trace: WorkTrace | null };

/**
 * Follow-ups to the AI answer. There is no second text box: the search bar at the top sends the
 * follow-ups while an answer is showing (see FollowUpBridge). This shows the conversation and tells
 * the search bar how to send.
 */
function ChatFollowUps({ query, initial, context, model, lang, copy }: {
  query: string; initial: Extract<AiAnswer, { status: "ok" }>;
  context: AiContextItem[];
  model?: string; lang: UiLang; copy: UiCopy;
}) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const inFlight = useRef(false);
  const alive = useRef(true);
  const end = useRef<HTMLDivElement>(null);
  const latest = useRef<ChatTurn[]>(turns);
  latest.current = turns;
  const bridge = usePromptBridge();
  const chatId = useId();
  const labels = chatCopy(lang);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const pending = turns.some(turn => turn.answer === null);
  useEffect(() => { if (turns.length) end.current?.scrollIntoView({ behavior: "auto", block: "nearest" }); }, [turns]);
  async function ask(question: string, previous: ChatTurn[]) {
    if (inFlight.current) return;
    inFlight.current = true;
    const history: ChatMessage[] = [{ role: "user", content: query }, { role: "assistant", content: initial.text }];
    for (const turn of previous) if (turn.answer?.status === "ok") history.push({ role: "user", content: turn.question }, { role: "assistant", content: turn.answer.text });
    const index = previous.length;
    const now = performance.now();
    const trace = markSent(addClientStep(createTrace(now), { kind: "read", chat: true }, now), now);
    setTurns([...previous, { question, answer: null, trace }]);
    const update = (change: (trace: WorkTrace) => WorkTrace) => {
      if (!alive.current) return;
      setTurns(current => current.map((turn, i) => (i === index && turn.answer === null && turn.trace ? { ...turn, trace: change(turn.trace) } : turn)));
    };
    const finish = (answer: AiAnswer) => {
      if (!alive.current) return;
      setTurns(current => [...current.slice(0, index), { question, answer, trace: finishWithAnswer(current[index]?.trace ?? trace, answer, performance.now()) }]);
    };
    const spec = AI_MODELS.find(item => item.id === model);
    try {
      finish(await askAiWithProgress({ q: question, history, context, model, lang }, {
        onEvent: event => update(current => addServerEvent(current, event, performance.now())),
        onFallback: () => update(current => addClientStep(current, { kind: "ask", ...(spec ? { model: spec.id, provider: spec.provider } : {}) }, performance.now())),
      }));
    } catch {
      finish({ status: "error", message: AI_MESSAGES.error });
    } finally { inFlight.current = false; }
  }
  const askRef = useRef(ask);
  askRef.current = ask;
  // Let the search bar send follow-ups while this conversation is on the page.
  useEffect(() => {
    bridge?.register(chatId, {
      kind: "chat",
      pending,
      maxLength: CHAT_INPUT_MAX,
      submit: (question: string) => {
        const text = question.trim().slice(0, CHAT_INPUT_MAX);
        if (!text || inFlight.current) return false;
        void askRef.current(text, latest.current);
        return true;
      },
    });
  }, [bridge, chatId, pending]);
  useEffect(() => () => bridge?.unregister(chatId), [bridge, chatId]);
  return <div className="mt-4 border-t border-line pt-4">
    <div className="mb-4 flex items-center justify-between gap-3"><h3 className="inline-flex items-center gap-2 text-sm font-medium"><MessageSquare className="size-4 text-accent" aria-hidden="true" />{labels.title}</h3>
      <Link to="/" search={{ q: "", near: "" }} className="inline-flex min-h-11 items-center rounded-full px-3 text-xs text-muted hover:text-accent">{labels.newChat}</Link>
    </div>
    <div className="grid min-w-0 gap-5" aria-live="polite" aria-busy={pending}>
      {turns.map((turn, index) => <div key={index} className="min-w-0">
        <div dir="auto" className="mb-4 ms-auto w-fit max-w-full whitespace-pre-wrap break-words rounded-2xl bg-accent-soft px-4 py-3 text-sm text-ink">{turn.question}</div>
        {turn.answer === null ? <WorkLive trace={turn.trace} lang={lang} copy={copy} fallback={questionCopy(lang).writing} /> : turn.answer.status === "ok" ? <>
          {turn.trace ? <WorkSummary trace={turn.trace} lang={lang} copy={copy} /> : null}
          <div className="mt-2 min-w-0 text-base leading-relaxed"><AiText parts={turn.answer.parts} citations={turn.answer.citations} copy={copy} lang={lang} /></div>
          <ReadAloud resetKey={`${index}:${turn.question}`} lang={lang} ready copy={copy} label={copy.listenAnswer} text={turn.answer.parts.map(part => "text" in part ? part.text : " ").join("")} />
          <AnswerSources citations={turn.answer.citations} copy={copy} />
          <div className="flex items-center gap-1"><AnswerCopy text={turn.answer.text} lang={lang} /><AnswerFeedback key={turn.answer.text} text={turn.answer.text} copy={copy} lang={lang} /><button type="button" disabled={pending} onClick={() => void ask(turn.question, turns.slice(0, index))} aria-label={copy.tryAgain} title={copy.tryAgain} className="mt-2 grid size-11 place-items-center rounded-full text-muted hover:bg-accent-soft disabled:opacity-50"><RotateCw className="size-4" aria-hidden="true" /></button></div>
          <AnswerImage query={turn.question} answer={turn.answer.text} lang={lang} />
          <p className="mt-2 text-xs text-muted">{fill(context.length ? copy.writtenBy : questionCopy(lang).writtenBy, { provider: aiProviderLabel(turn.answer.provider), model: turn.answer.model })}</p>
        </> : <>
          {turn.trace ? <WorkSummary trace={turn.trace} lang={lang} copy={copy} /> : null}
          <div className="mt-2 flex flex-wrap items-center gap-3"><p role="status" className="text-sm text-muted">{turn.answer.status === "unconfigured" ? copy.aiUnconfigured : copy.aiError}</p><button type="button" disabled={pending} onClick={() => void ask(turn.question, turns.slice(0, index))} className="min-h-11 rounded-full border border-line px-4 text-sm">{copy.tryAgain}</button></div>
        </>}
      </div>)}
    </div>
    <div ref={end} />
    <div className="mt-5 grid gap-1">
      {followUpPrompts[lang].map(prompt => <button key={prompt} type="button" disabled={pending}
        onClick={() => { bridge?.activate(chatId); void ask(prompt, latest.current); }}
        className="flex min-h-11 items-center gap-3 rounded-xl px-2 text-start text-sm text-muted hover:bg-accent-soft hover:text-ink disabled:opacity-50">
        <ArrowUpRight className="size-4 shrink-0" aria-hidden="true" /><span>{prompt}</span>
      </button>)}
    </div>
    <p className="mt-2 text-xs leading-relaxed text-muted">{labels.privacy}</p>
  </div>;
}
