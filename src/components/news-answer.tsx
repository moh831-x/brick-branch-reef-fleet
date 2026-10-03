import { useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { AiCitation } from "@/lib/ai.shared";
import { publisherName, relativeDay, type NewsCardItem } from "@/lib/news.shared";
import { clickAction, factsOf } from "@/lib/select-click";
import type { UiLang } from "@/lib/i18n";

/** Like the result links: not draggable, and not followed when a click ends a text selection. */
const selectSafeLink = {
  draggable: false,
  onClick: (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (clickAction(factsOf(event)) === "ignore") event.preventDefault();
  },
} as const;

const copyRows: Record<UiLang, readonly [string, string]> = {
  "en-US": ["News about this search", "Sources: {names}"],
  "bn-BD": ["এই অনুসন্ধান নিয়ে খবর", "উৎস: {names}"],
  "hi-IN": ["इस खोज से जुड़ी खबरें", "स्रोत: {names}"],
  "ar-SA": ["أخبار عن هذا البحث", "المصادر: {names}"],
  "es-ES": ["Noticias sobre esta búsqueda", "Fuentes: {names}"],
  "fr-FR": ["Actualités sur cette recherche", "Sources : {names}"],
  "zh-CN": ["与此搜索相关的新闻", "来源：{names}"],
  "ja-JP": ["この検索に関するニュース", "出典: {names}"],
  "pt-BR": ["Notícias sobre esta pesquisa", "Fontes: {names}"],
  "de-DE": ["Nachrichten zu dieser Suche", "Quellen: {names}"],
};

function newsCopy(lang: UiLang) {
  const [cards, sources] = copyRows[lang];
  return { cards, sources };
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** A site's icon (the same favicon service as the result list), or its first letter when that fails. */
export function Favicon({ url, size = 14 }: { url: string; size?: number }) {
  const host = hostOf(url);
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [host]);
  if (!host) return null;
  return broken ? (
    <span aria-hidden="true" className="grid shrink-0 place-items-center rounded-full bg-line text-[0.6rem] font-medium text-muted" style={{ width: size, height: size }}>
      {host.charAt(0).toUpperCase()}
    </span>
  ) : (
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      draggable={false}
      className="shrink-0 rounded-full"
      style={{ width: size, height: size }}
      onError={() => setBroken(true)}
    />
  );
}

/**
 * The source chip at the end of a point: the first source's icon and name, "+N" when more sources
 * back it. It opens the first source; the others are named in its tooltip and in the source list.
 */
export function SourceChip({ cites, lang, onOpen }: { cites: AiCitation[]; lang: UiLang; onOpen?: (cite: AiCitation) => void }) {
  const first = cites[0];
  if (!first) return null;
  const names = cites.map((cite) => publisherName(cite.url, cite.site));
  const label = newsCopy(lang).sources.replace("{names}", cites.map((cite, index) => `${names[index]} — ${cite.title}`).join("; "));
  const body = (
    <>
      <Favicon url={first.url} size={12} />
      <span dir="auto" className="min-w-0 truncate">{names[0]}</span>
      {cites.length > 1 ? <span className="shrink-0 tabular-nums">+{cites.length - 1}</span> : null}
    </>
  );
  const className = "ms-1 inline-flex max-w-44 translate-y-[-1px] items-center gap-1 rounded-full bg-line/70 px-1.5 py-0.5 align-middle text-[0.7rem] leading-4 font-medium text-muted no-underline hover:bg-accent-soft hover:text-ink";
  if (onOpen) {
    return (
      <button type="button" onClick={() => onOpen(first)} title={label} aria-label={label} className={className}>
        {body}
      </button>
    );
  }
  return (
    <a href={first.url} target="_blank" rel="noreferrer" {...selectSafeLink} title={label} aria-label={label} className={className}>
      {body}
    </a>
  );
}

/**
 * Up to three news articles from the search under the answer: picture, publisher, headline, and how
 * recent. Equal columns when the answer is wide enough, a swipeable row when it is not.
 */
export function NewsCards({ items, lang }: { items: NewsCardItem[]; lang: UiLang }) {
  // Dates are relative to the reader's clock, so they are worked out after the page loads.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  if (!items.length) return null;
  return (
    <ul
      aria-label={newsCopy(lang).cards}
      className="my-4 grid snap-x snap-mandatory auto-cols-[minmax(12rem,1fr)] grid-flow-col gap-3 overflow-x-auto overscroll-x-contain pb-1"
    >
      {items.map((item) => (
        <li key={item.id} className="min-w-0 snap-start">
          <NewsCard item={item} lang={lang} now={now} />
        </li>
      ))}
    </ul>
  );
}

function NewsCard({ item, lang, now }: { item: NewsCardItem; lang: UiLang; now: Date | null }) {
  const [broken, setBroken] = useState(false);
  const site = publisherName(item.url, item.site);
  const when = now ? relativeDay(item.published, lang, now) : "";
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      {...selectSafeLink}
      className="flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface text-start transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-accent"
    >
      {item.image && !broken ? (
        <img
          src={item.image.thumb}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setBroken(true)}
          className="aspect-video w-full bg-line object-cover"
        />
      ) : null}
      <span className="flex flex-1 flex-col gap-1.5 p-3">
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
          <Favicon url={item.url} size={14} />
          <span dir="auto" className="min-w-0 truncate">{site}</span>
        </span>
        <span dir="auto" className="line-clamp-3 text-sm leading-snug font-medium text-ink">{item.title}</span>
        {when ? <span className="mt-auto pt-1 text-xs text-muted">{when}</span> : null}
      </span>
    </a>
  );
}
