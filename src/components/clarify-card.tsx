import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { CornerDownRight, X } from "lucide-react";
import { optionLetter, optionReply, type AiQuestion } from "@/lib/ai-clarify";
import { clarifyCopy } from "@/lib/clarify-copy";
import type { UiLang } from "@/lib/i18n";

function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.tagName === "SELECT" || element.isContentEditable;
}

/**
 * The clarifying question above the prompt bar: lettered answers (tap one, or press its letter),
 * a custom answer sent with Done or Enter, and Skip / X / Escape to dismiss. Whatever is picked is
 * sent as the reader's next message in the same conversation.
 */
export function ClarifyCard({
  question,
  lang,
  onAnswer,
  onDismiss,
}: {
  question: AiQuestion;
  lang: UiLang;
  onAnswer: (text: string) => void;
  onDismiss: () => void;
}) {
  const copy = clarifyCopy(lang);
  const titleId = useId();
  const hintId = useId();
  const [custom, setCustom] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const customRef = useRef<HTMLInputElement>(null);
  const customLetter = optionLetter(question.options.length);
  const latest = useRef({ question, onAnswer, onDismiss });
  latest.current = { question, onAnswer, onDismiss };

  /** A letter picks its answer (or opens the custom answer); Escape dismisses. True when handled. */
  function handleKey(key: string): boolean {
    const { question: current, onAnswer: answer, onDismiss: dismiss } = latest.current;
    if (key === "Escape") {
      dismiss();
      return true;
    }
    if (key.length !== 1) return false;
    const index = key.toUpperCase().charCodeAt(0) - 65;
    if (index >= 0 && index < current.options.length) {
      answer(optionReply(current.options[index]!));
      return true;
    }
    if (index === current.options.length) {
      customRef.current?.focus();
      return true;
    }
    return false;
  }

  // Letters work anywhere on the page while nothing else is being typed into.
  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      if (root.current?.contains(event.target as Node)) return; // The card's own handler runs.
      if (event.key === "Escape") return; // Escape belongs to whatever has focus outside the card.
      if (handleKey(event.key)) event.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function onCardKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target === customRef.current) {
      if (event.key === "Escape") {
        event.preventDefault();
        onDismiss();
      }
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const items = Array.from(root.current?.querySelectorAll<HTMLElement>("[data-clarify-item]") ?? []);
      const at = items.indexOf(document.activeElement as HTMLElement);
      const next = items[(at + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length];
      if (next) {
        event.preventDefault();
        next.focus();
      }
      return;
    }
    if (handleKey(event.key)) event.preventDefault();
  }

  function sendCustom() {
    const text = custom.trim();
    if (text) onAnswer(text);
  }

  return (
    <div
      ref={root}
      role="group"
      aria-labelledby={titleId}
      aria-describedby={hintId}
      onKeyDown={onCardKey}
      className="mb-2 max-h-[min(26rem,52vh)] overflow-y-auto overscroll-contain scroll-pb-16 rounded-3xl border border-line bg-surface px-3 pt-3 shadow-sm sm:px-4 sm:pt-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 ps-1">
          <p className="text-xs text-muted">{copy.label}</p>
          <p id={titleId} dir="auto" className="mt-0.5 text-base leading-snug font-semibold text-ink">{question.question}</p>
          <p id={hintId} className="sr-only">{copy.keys}</p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={copy.close}
          title={copy.close}
          className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-accent-soft hover:text-ink"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      <ul className="mt-2 grid gap-0.5">
        {question.options.map((option, index) => (
          <li key={`${index}-${option.label}`}>
            <button
              type="button"
              data-clarify-item
              aria-keyshortcuts={optionLetter(index)}
              onClick={() => onAnswer(optionReply(option))}
              className="flex min-h-11 w-full items-start gap-3 rounded-xl px-1.5 py-2 text-start text-sm hover:bg-accent-soft focus-visible:bg-accent-soft focus-visible:outline-none sm:min-h-10 sm:py-1.5"
            >
              <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-md bg-line text-xs font-medium text-muted">{optionLetter(index)}</span>
              <span dir="auto" className="min-w-0 pt-0.5 leading-snug">
                <span className="font-medium text-ink">{option.label}</span>
                {option.description ? <span className="text-muted"> — {option.description}</span> : null}
              </span>
            </button>
          </li>
        ))}
        <li>
          <label className="flex min-h-11 w-full cursor-text items-center gap-3 rounded-xl px-1.5 py-1 text-sm focus-within:bg-accent-soft hover:bg-accent-soft">
            <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-md bg-line text-xs font-medium text-muted">{customLetter}</span>
            <span className="sr-only">{copy.custom}</span>
            <input
              ref={customRef}
              data-clarify-item
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  sendCustom();
                }
              }}
              aria-keyshortcuts={customLetter}
              placeholder={copy.custom}
              maxLength={1000}
              dir="auto"
              enterKeyHint="send"
              className="min-h-9 min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted sm:text-sm"
            />
          </label>
        </li>
      </ul>
      {/* Stays in view while a long list scrolls inside the card (small screens). */}
      <div className="sticky bottom-0 mt-1 flex items-center justify-end gap-2 bg-surface pt-1 pb-3 sm:pb-4">
        <button type="button" onClick={onDismiss} className="inline-flex min-h-11 items-center rounded-full px-3 text-sm text-muted hover:text-ink">
          {copy.skip}
        </button>
        <button
          type="button"
          onClick={sendCustom}
          disabled={!custom.trim()}
          className="inline-flex min-h-11 items-center rounded-full bg-ink px-4 text-sm text-bg transition-transform duration-150 ease-out active:scale-[0.96] disabled:opacity-40"
        >
          {copy.done}
        </button>
      </div>
    </div>
  );
}

/** Prompts the model suggested instead of guessing, as ↳ rows under its reply. Tapping one sends it. */
export function FollowUpSuggestions({
  items,
  lang,
  disabled,
  onPick,
}: {
  items: readonly string[] | undefined;
  lang: UiLang;
  disabled?: boolean;
  onPick: (prompt: string) => void;
}) {
  if (!items?.length) return null;
  return (
    <ul aria-label={clarifyCopy(lang).suggestions} className="mt-2 grid gap-0.5">
      {items.map((prompt) => (
        <li key={prompt}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onPick(prompt)}
            className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-2 text-start text-sm text-muted hover:bg-accent-soft hover:text-ink disabled:opacity-50"
          >
            <CornerDownRight className="size-4 shrink-0" aria-hidden="true" />
            <span dir="auto">{prompt}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
