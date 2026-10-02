import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Code2, Copy } from "lucide-react";
import hljs from "highlight.js/lib/core";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import bash from "highlight.js/lib/languages/bash";
import json from "highlight.js/lib/languages/json";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";
import sql from "highlight.js/lib/languages/sql";
import type { UiLang } from "@/lib/i18n";

for (const [name, grammar] of Object.entries({ c, cpp, javascript, typescript, python, bash, json, css, xml, sql })) hljs.registerLanguage(name, grammar);
const labels: Record<UiLang, readonly [string, string, string, string]> = {
  "en-US": ["Copy code", "Copied", "Could not copy. Select the code to copy it.", "Code"],
  "bn-BD": ["কোড কপি করুন", "কপি হয়েছে", "কপি করা যায়নি। কোড নির্বাচন করে কপি করুন।", "কোড"],
  "hi-IN": ["कोड कॉपी करें", "कॉपी किया", "कॉपी नहीं हुआ। कोड चुनकर कॉपी करें।", "कोड"],
  "ar-SA": ["نسخ الكود", "تم النسخ", "تعذر النسخ. حدد الكود لنسخه.", "كود"],
  "es-ES": ["Copiar código", "Copiado", "No se pudo copiar. Selecciona el código para copiarlo.", "Código"],
  "fr-FR": ["Copier le code", "Copié", "Copie impossible. Sélectionnez le code pour le copier.", "Code"],
  "zh-CN": ["复制代码", "已复制", "无法复制，请选中代码复制。", "代码"],
  "ja-JP": ["コードをコピー", "コピー済み", "コピーできません。コードを選択してコピーしてください。", "コード"],
  "pt-BR": ["Copiar código", "Copiado", "Não foi possível copiar. Selecione o código para copiá-lo.", "Código"],
  "de-DE": ["Code kopieren", "Kopiert", "Kopieren fehlgeschlagen. Wähle den Code zum Kopieren aus.", "Code"],
};
const names: Record<string, string> = { c: "C", cpp: "C++", js: "JavaScript", javascript: "JavaScript", ts: "TypeScript", typescript: "TypeScript", py: "Python", python: "Python", sh: "Bash", shell: "Bash", bash: "Bash", html: "HTML", xml: "XML", json: "JSON", css: "CSS", sql: "SQL" };

export function AnswerCode({ code, language, lang }: { code: string; language: string; lang: UiLang }) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const [copy, copied, error, plain] = labels[lang];
  const highlighted = useMemo(() => {
    const grammar = language === "shell" ? "bash" : language;
    if (!hljs.getLanguage(grammar)) return null;
    try { return hljs.highlight(code, { language: grammar, ignoreIllegals: true }).value; } catch { return null; }
  }, [code, language]);
  async function copyCode() {
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(code);
      setState("copied");
      timer.current = setTimeout(() => setState("idle"), 2000);
    } catch { setState("error"); }
  }
  return (
    <div className="my-4 min-w-0 overflow-hidden rounded-2xl border border-line bg-bg text-ink">
      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-line px-4 text-xs">
        <span className="inline-flex items-center gap-2"><Code2 className="size-4" aria-hidden="true" /><span dir="ltr">{names[language] || language || plain}</span></span>
        <button type="button" onClick={copyCode} aria-label={copy} className="inline-flex min-h-11 items-center gap-2 rounded px-2 text-muted hover:text-accent focus-visible:outline-2 focus-visible:outline-accent">
          {state === "copied" ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
          <span aria-live="polite">{state === "copied" ? copied : copy}</span>
        </button>
      </div>
      <pre dir="ltr" tabIndex={0} aria-label={names[language] || language || plain} className="answer-code overflow-x-auto p-4 text-sm leading-relaxed focus-visible:outline-2 focus-visible:outline-accent">
        {highlighted ? <code dangerouslySetInnerHTML={{ __html: highlighted }} /> : <code>{code}</code>}
      </pre>
      {state === "error" ? <p role="status" className="px-4 pb-3 text-xs text-muted">{error}</p> : null}
    </div>
  );
}
