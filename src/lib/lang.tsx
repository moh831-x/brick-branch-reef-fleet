import { useEffect, useMemo, useState, type ReactNode } from "react";
import { LANG_PARAM, langDir, matchLang, type UiLang } from "./i18n";
import { UI } from "./ui-copy";
import { LangContext, type LangState } from "./lang-context";
import { clientLang, persistLang } from "./lang-state";

export function LangProvider({ initial, children }: { initial: UiLang; children: ReactNode }) {
  const [lang, setLangState] = useState<UiLang>(initial);

  useEffect(() => {
    // A language in the address is a choice: keep it for later pages and visits.
    try {
      const fromParam = matchLang(new URLSearchParams(window.location.search).get(LANG_PARAM));
      if (fromParam) persistLang(fromParam);
    } catch {
      /* ignore */
    }
    const actual = clientLang();
    if (actual !== lang) setLangState(actual);
    // Run once after hydration; later changes go through setLang.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = lang;
    root.dir = langDir(lang);
  }, [lang]);

  const value = useMemo<LangState>(
    () => ({
      lang,
      dir: langDir(lang),
      copy: UI[lang],
      setLang: (next: UiLang) => {
        persistLang(next);
        try {
          // Keep a shared ?lang= address in step with the new choice so a reload does not undo it.
          const url = new URL(window.location.href);
          if (url.searchParams.has(LANG_PARAM)) {
            url.searchParams.set(LANG_PARAM, next);
            window.history.replaceState(window.history.state, "", url);
          }
        } catch {
          /* ignore */
        }
        setLangState(next);
      },
    }),
    [lang],
  );

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}
