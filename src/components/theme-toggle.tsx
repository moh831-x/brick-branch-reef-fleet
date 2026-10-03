import { Moon, Sun } from "lucide-react";
import { useLang } from "@/lib/lang-context";
import { themeWord } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";

/** Switches the desk between paper and night. The choice is saved on this browser. */
export function ThemeToggle() {
  const { lang } = useLang();
  const { theme, toggle } = useTheme();
  const next = themeWord(lang, theme);
  const dark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={dark}
      aria-label={next}
      title={next}
      className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-line bg-surface px-3 text-sm text-ink transition-transform duration-150 ease-out active:scale-[0.96]"
    >
      {dark ? <Sun className="size-4 shrink-0 text-muted" aria-hidden="true" /> : <Moon className="size-4 shrink-0 text-muted" aria-hidden="true" />}
      <span>{next}</span>
    </button>
  );
}
