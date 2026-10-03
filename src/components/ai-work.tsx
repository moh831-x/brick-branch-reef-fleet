/**
 * What the AI is doing, Grok-style: while it works, one live line with the current step and a
 * running timer ("Asking Grok 4.7 · 4s"); when it is done, a small muted "Worked for 13s ›" line
 * above the reply that opens the steps with their timings. Every step comes from a real stage (see
 * src/lib/ai-progress.ts). The text stays selectable, and Listen never reads it: it is not part of
 * the answer text.
 */
import { useEffect, useId, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { resolveTrace, type WorkStep, type WorkTrace } from "@/lib/ai-progress";
import { formatDuration, progressCopy } from "@/lib/progress-copy";
import { fill, type UiCopy } from "@/lib/ui-copy";
import { stepTemplate } from "@/lib/work-label";
import { clickAction, factsOf } from "@/lib/select-click";
import type { UiLang } from "@/lib/i18n";

/** The page clock, ticking while `active`. */
function useNow(active: boolean, every = 250): number {
  const [now, setNow] = useState(() => (typeof performance !== "undefined" ? performance.now() : 0));
  useEffect(() => {
    if (!active) return;
    setNow(performance.now());
    const timer = setInterval(() => setNow(performance.now()), every);
    return () => clearInterval(timer);
  }, [active, every]);
  return now;
}

/** A step in words. Names (models, sources) are isolated so they read correctly inside Arabic text. */
function StepText({ step, lang, copy }: { step: WorkStep; lang: UiLang; copy: UiCopy }) {
  const { template, values } = stepTemplate(step, lang, copy);
  const pieces = template.split(/(\{\w+\})/).filter(Boolean);
  return (
    <span className="min-w-0">
      {pieces.map((piece, index) => {
        const name = /^\{(\w+)\}$/.exec(piece)?.[1];
        return name ? <bdi key={index}>{values[name] ?? ""}</bdi> : <span key={index}>{piece}</span>;
      })}
    </span>
  );
}

/** The live line while the AI works. `fallback` is shown before the first step. */
export function WorkLive({ trace, lang, copy, fallback }: { trace: WorkTrace | null; lang: UiLang; copy: UiCopy; fallback: string }) {
  const now = useNow(Boolean(trace));
  const view = trace ? resolveTrace(trace, now) : null;
  return (
    <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted" data-ai-work="live">
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-accent motion-safe:animate-pulse" />
      {view?.current ? <StepText step={view.current} lang={lang} copy={copy} /> : <span className="min-w-0">{fallback}</span>}
      {view ? (
        // A ticking number is noise for screen readers; the step label above is what they hear.
        <span role="timer" aria-hidden="true" className="shrink-0 text-xs tabular-nums">
          {formatDuration(view.elapsed, lang, { whole: true })}
        </span>
      ) : null}
    </p>
  );
}

/** "Worked for 13s ›" above a finished reply; opens the steps with their timings. */
export function WorkSummary({ trace, lang, copy }: { trace: WorkTrace; lang: UiLang; copy: UiCopy }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const words = progressCopy(lang);
  const view = resolveTrace(trace, trace.end ?? trace.start);
  const toggle = () => setOpen((value) => !value);
  return (
    <div className="mt-3 text-xs text-muted" data-ai-work="summary">
      {/* Not a <button>: browsers will not start a text selection inside one. A drag or selection never toggles. */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-controls={listId}
        onClick={(event) => {
          if (clickAction(factsOf(event)) === "open") toggle();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggle();
          }
        }}
        className="inline-flex min-h-9 cursor-pointer select-text items-center gap-1 rounded-full pe-1 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span>{fill(words.workedFor, { time: formatDuration(view.elapsed, lang) })}</span>
        {open ? (
          <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0 rtl:-scale-x-100" aria-hidden="true" />
        )}
      </div>
      {open ? (
        <ol id={listId} aria-label={words.steps} className="mb-1 mt-1 grid gap-1.5 border-s border-line ps-3 leading-relaxed">
          {view.steps.map((step, index) => (
            <li key={index} className="flex min-w-0 flex-wrap items-baseline gap-x-2">
              <StepText step={step} lang={lang} copy={copy} />
              {step.ms !== undefined ? <span className="shrink-0 tabular-nums opacity-80">{formatDuration(step.ms, lang)}</span> : null}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
