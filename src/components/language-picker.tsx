import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, Languages } from "lucide-react";
import { LANGS, type UiLang } from "@/lib/i18n";
import { useLang } from "@/lib/lang-context";

/**
 * The site-wide language menu. Each language is listed in its own script with its English name
 * beside it, so a reader can find theirs whatever the page is showing now.
 */
export function LanguagePicker({
  onChange,
  label,
  compact = false,
  align = "end",
}: {
  /** Called after the choice is saved. Defaults to switching the site language only. */
  onChange?: (lang: UiLang) => void;
  /** Accessible name. Defaults to the word “Language” in the current language. */
  label?: string;
  compact?: boolean;
  /** Which edge of the button the menu lines up with. */
  align?: "start" | "end";
}) {
  const { lang, copy, setLang } = useLang();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = LANGS.find((item) => item.code === lang) ?? LANGS[0];
  const name = label ?? copy.language;

  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, LANGS.findIndex((item) => item.code === lang)));
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
  }, [open, lang]);

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>(`[data-lang-index="${active}"]`)?.focus();
  }, [open, active]);

  function choose(next: UiLang) {
    setOpen(false);
    if (next === lang) return;
    setLang(next);
    onChange?.(next);
  }

  function onListKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((value) => (value + 1) % LANGS.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((value) => (value <= 0 ? LANGS.length - 1 : value - 1));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(LANGS.length - 1);
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${name}: ${current.label}`}
        title={name}
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex items-center gap-2 rounded-full border border-line bg-surface text-ink transition-transform duration-150 ease-out active:scale-[0.96] ${
          compact ? "min-h-11 px-3 text-sm" : "min-h-11 px-4 text-sm"
        }`}
      >
        <Languages className="size-4 shrink-0 text-muted" aria-hidden="true" />
        <span lang={current.code}>{current.label}</span>
        <ChevronDown className={`size-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open ? (
        <div
          id={listId}
          role="listbox"
          aria-label={name}
          onKeyDown={onListKey}
          className={`absolute z-50 mt-2 max-h-[70vh] w-60 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-line bg-surface py-1 shadow-lg ${
            align === "end" ? "end-0" : "start-0"
          }`}
        >
          {LANGS.map((item, index) => {
            const selected = item.code === lang;
            return (
              <button
                key={item.code}
                type="button"
                role="option"
                aria-selected={selected}
                data-lang-index={index}
                tabIndex={index === active ? 0 : -1}
                onClick={() => choose(item.code)}
                className={`flex min-h-11 w-full items-center justify-between gap-3 px-4 text-start text-sm text-ink outline-none focus-visible:bg-bg ${
                  selected ? "bg-accent-soft font-medium" : "hover:bg-bg"
                }`}
              >
                <span className="flex min-w-0 items-baseline gap-2">
                  <span lang={item.code} dir={item.dir}>
                    {item.label}
                  </span>
                  {item.code !== "en-US" ? (
                    <span lang="en" className="truncate text-xs text-muted">
                      {item.english}
                    </span>
                  ) : null}
                </span>
                {selected ? <Check className="size-4 shrink-0 text-accent" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
