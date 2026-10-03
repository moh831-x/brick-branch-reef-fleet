/**
 * The searches behind an AI answer, Claude-style: "Searched the web  <query> ›" rows, each opening a
 * bordered list of what it found (icon, title, address on the far side; a row opens the page), with
 * the model's short notes between them as plain answer text. The newest search is open, earlier
 * ones closed; the reader can open or close any of them. See src/lib/research.shared.ts.
 */
import { useId, useState } from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import { Favicon } from "@/components/news-answer";
import { latestSearchId, type ResearchItem } from "@/lib/research.shared";
import type { UiLang } from "@/lib/i18n";

type Words = { searched: string; searching: string; empty: string; failed: string; results: string };

const rows: Record<UiLang, readonly [string, string, string, string, string]> = {
  "en-US": ["Searched the web", "Searching the web…", "No results", "This search didn’t go through", "Results for {query}"],
  "bn-BD": ["ওয়েবে খোঁজা হয়েছে", "ওয়েবে খোঁজা হচ্ছে…", "কোনো ফলাফল নেই", "এই অনুসন্ধানটি সম্পন্ন হয়নি", "{query}-এর ফলাফল"],
  "hi-IN": ["वेब पर खोजा", "वेब पर खोज रहे हैं…", "कोई परिणाम नहीं", "यह खोज पूरी नहीं हुई", "{query} के परिणाम"],
  "ar-SA": ["تم البحث في الويب", "جارٍ البحث في الويب…", "لا توجد نتائج", "لم يكتمل هذا البحث", "نتائج {query}"],
  "es-ES": ["Búsqueda en la web", "Buscando en la web…", "Sin resultados", "Esta búsqueda no se completó", "Resultados de {query}"],
  "fr-FR": ["Recherche web effectuée", "Recherche sur le web…", "Aucun résultat", "Cette recherche n’a pas abouti", "Résultats pour {query}"],
  "zh-CN": ["已搜索网页", "正在搜索网页…", "没有结果", "此次搜索未完成", "{query} 的结果"],
  "ja-JP": ["ウェブを検索しました", "ウェブを検索中…", "結果がありません", "この検索は完了しませんでした", "{query} の結果"],
  "pt-BR": ["Pesquisou na web", "Pesquisando na web…", "Nenhum resultado", "Esta pesquisa não foi concluída", "Resultados para {query}"],
  "de-DE": ["Im Web gesucht", "Suche im Web …", "Keine Ergebnisse", "Diese Suche ist nicht durchgekommen", "Ergebnisse für {query}"],
};

function researchCopy(lang: UiLang): Words {
  const [searched, searching, empty, failed, results] = rows[lang];
  return { searched, searching, empty, failed, results };
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

type SearchItem = Extract<ResearchItem, { kind: "search" }>;

function SearchStep({ step, open, onToggle, words }: { step: SearchItem; open: boolean; onToggle: () => void; words: Words }) {
  const listId = useId();
  if (step.status === "searching") {
    return (
      <p className="flex min-h-11 min-w-0 items-center gap-2 text-sm" data-research-step="searching">
        <span className="shrink-0 text-muted">{words.searching}</span>
        <bdi dir="auto" className="min-w-0 truncate text-ink">{step.query}</bdi>
        <Loader2 className="size-3.5 shrink-0 animate-spin text-muted" aria-hidden="true" />
      </p>
    );
  }
  return (
    <div className="min-w-0" data-research-step="done">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={onToggle}
        className="group flex min-h-11 max-w-full items-center gap-2 rounded-lg text-start text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span className="shrink-0 text-muted">{words.searched}</span>
        <bdi dir="auto" className="min-w-0 truncate text-ink">{step.query}</bdi>
        <ChevronRight
          className={`size-3.5 shrink-0 text-muted transition-transform duration-150 group-hover:text-ink ${open ? "rotate-90" : "rtl:-scale-x-100"}`}
          aria-hidden="true"
        />
      </button>
      {open ? (
        step.results.length ? (
          <ul id={listId} aria-label={words.results.replace("{query}", step.query)} className="mt-1 overflow-hidden rounded-2xl border border-line py-1">
            {step.results.map((hit) => (
              <li key={hit.url}>
                <a
                  href={hit.url}
                  target="_blank"
                  rel="noreferrer"
                  draggable={false}
                  className="flex min-h-10 min-w-0 items-center gap-3 px-3 text-sm hover:bg-accent-soft focus-visible:bg-accent-soft focus-visible:outline-none"
                >
                  <Favicon url={hit.url} size={14} />
                  <span dir="auto" className="min-w-0 flex-1 truncate text-ink">{hit.title}</span>
                  <span dir="ltr" className="max-w-[40%] shrink-0 truncate text-xs text-muted">{hostOf(hit.url)}</span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p id={listId} className="mt-1 rounded-2xl border border-line px-3 py-2.5 text-sm text-muted">{step.failed ? words.failed : words.empty}</p>
        )
      ) : null}
    </div>
  );
}

/** The search steps and notes, in order. Nothing is shown when there were none. */
export function ResearchSteps({ items, lang }: { items: ResearchItem[] | undefined; lang: UiLang }) {
  const [toggled, setToggled] = useState<Record<number, boolean>>({});
  if (!items?.length) return null;
  const words = researchCopy(lang);
  const latest = latestSearchId(items);
  const isOpen = (id: number) => toggled[id] ?? id === latest;
  return (
    <div className="mt-3 grid min-w-0 gap-1" data-ai-research="">
      {items.map((item) =>
        item.kind === "note" ? (
          <p key={`note-${item.id}`} dir="auto" className="my-1 text-base leading-relaxed text-ink">{item.text}</p>
        ) : (
          <SearchStep
            key={`search-${item.id}`}
            step={item}
            open={isOpen(item.id)}
            onToggle={() => setToggled((current) => ({ ...current, [item.id]: !isOpen(item.id) }))}
            words={words}
          />
        ),
      )}
    </div>
  );
}
