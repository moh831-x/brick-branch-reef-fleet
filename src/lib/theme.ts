import { createIsomorphicFn } from "@tanstack/react-start";
import type { UiLang } from "@/lib/i18n";

export type Theme = "light" | "dark";

export const THEME_STORAGE = "folio-theme";
export const THEME_COOKIE = "folio_theme";

const PAPER = "#f3efe6";
const NIGHT = "#141311";

export function isTheme(value: string | null | undefined): value is Theme {
  return value === "light" || value === "dark";
}

function cookieTheme(): Theme | null {
  if (typeof document === "undefined") return null;
  const raw = document.cookie.match(new RegExp(`(?:^|;\\s*)${THEME_COOKIE}=([^;]+)`))?.[1];
  return isTheme(raw) ? raw : null;
}

/** Saved choice. Cookie first so the server and the browser agree on the first paint. */
export function readTheme(): Theme {
  if (typeof document !== "undefined") {
    const fromCookie = cookieTheme();
    if (fromCookie) return fromCookie;
  }
  if (typeof window === "undefined") return "light";
  try {
    const stored = localStorage.getItem(THEME_STORAGE);
    if (isTheme(stored)) return stored;
  } catch {
    /* storage blocked */
  }
  return "light";
}

export function persistTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_STORAGE, theme);
  } catch {
    /* ignore quota or blocked storage */
  }
  if (typeof document !== "undefined") {
    document.cookie = `${THEME_COOKIE}=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }
}

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? NIGHT : PAPER);
}

export const detectTheme = createIsomorphicFn()
  .server(async (): Promise<Theme> => {
    try {
      const { getCookie } = await import("@tanstack/react-start/server");
      const value = getCookie(THEME_COOKIE);
      return isTheme(value) ? value : "light";
    } catch {
      return "light";
    }
  })
  .client(async (): Promise<Theme> => readTheme());

/** Short label for the appearance the button will switch to. */
export function themeWord(lang: UiLang, theme: Theme): string {
  const words: Record<UiLang, { dark: string; light: string }> = {
    "en-US": { dark: "Dark", light: "Light" },
    "bn-BD": { dark: "গাঢ়", light: "উজ্জ্বল" },
    "hi-IN": { dark: "गहरा", light: "हल्का" },
    "ar-SA": { dark: "داكن", light: "فاتح" },
    "es-ES": { dark: "Oscuro", light: "Claro" },
    "fr-FR": { dark: "Sombre", light: "Clair" },
    "zh-CN": { dark: "深色", light: "浅色" },
    "ja-JP": { dark: "ダーク", light: "ライト" },
    "pt-BR": { dark: "Escuro", light: "Claro" },
    "de-DE": { dark: "Dunkel", light: "Hell" },
  };
  const pair = words[lang] ?? words["en-US"];
  return theme === "dark" ? pair.light : pair.dark;
}
