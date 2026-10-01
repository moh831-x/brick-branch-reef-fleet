import { createContext, useContext } from "react";
import { DEFAULT_LANG, type UiLang } from "./i18n";
import { UI, type UiCopy } from "./ui-copy";

export type LangState = {
  lang: UiLang;
  dir: "ltr" | "rtl";
  copy: UiCopy;
  setLang: (lang: UiLang) => void;
};

export const LangContext = createContext<LangState>({
  lang: DEFAULT_LANG,
  dir: "ltr",
  copy: UI[DEFAULT_LANG],
  setLang: () => {},
});

export function useLang(): LangState {
  return useContext(LangContext);
}
