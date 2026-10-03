/**
 * Words for the AI progress line ("Asking Grok 4.7 · 4s") and the "Worked for 13s" summary, in
 * every site language. Durations use the browser's own unit names and digits (Intl).
 */
import type { UiLang } from "./i18n.ts";

export type ProgressCopy = {
  workedFor: string;
  steps: string;
  searchWeb: string;
  searchSources: string;
  /** Plural forms by Intl.PluralRules category; `other` is required. */
  readSources: Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
  readChat: string;
  ask: string;
  askFallback: string;
  askAny: string;
  retry: string;
  failed: string;
  skipped: string;
  hedge: string;
  write: string;
};

export const PROGRESS: Record<UiLang, ProgressCopy> = {
  "en-US": {
    workedFor: "Worked for {time}",
    steps: "Steps",
    searchWeb: "Searching the web",
    searchSources: "Searching {sources}",
    readSources: { one: "Reading {n} source", other: "Reading {n} sources" },
    readChat: "Reading the conversation",
    ask: "Asking {model}",
    askFallback: "Trying {model} instead",
    askAny: "Asking the AI model",
    retry: "Retrying {model}",
    failed: "{model}: {reason}",
    skipped: "Skipped {model}: out of time",
    hedge: "{model} is taking a while, so also asking the next model",
    write: "Writing the answer",
  },
  "bn-BD": {
    workedFor: "{time} ধরে কাজ করেছে",
    steps: "ধাপসমূহ",
    searchWeb: "ওয়েবে খোঁজা হচ্ছে",
    searchSources: "{sources}-এ খোঁজা হচ্ছে",
    readSources: { other: "{n}টি উৎস পড়া হচ্ছে" },
    readChat: "কথোপকথন পড়া হচ্ছে",
    ask: "{model}-কে জিজ্ঞাসা করা হচ্ছে",
    askFallback: "এর বদলে {model} চেষ্টা করা হচ্ছে",
    askAny: "AI মডেলকে জিজ্ঞাসা করা হচ্ছে",
    retry: "{model} আবার চেষ্টা করা হচ্ছে",
    failed: "{model}: {reason}",
    skipped: "{model} বাদ দেওয়া হয়েছে: সময় শেষ",
    hedge: "{model} সময় নিচ্ছে, তাই পরের মডেলকেও জিজ্ঞাসা করা হচ্ছে",
    write: "উত্তর লেখা হচ্ছে",
  },
  "hi-IN": {
    workedFor: "{time} तक काम किया",
    steps: "चरण",
    searchWeb: "वेब पर खोज रहे हैं",
    searchSources: "{sources} में खोज रहे हैं",
    readSources: { other: "{n} स्रोत पढ़ रहे हैं" },
    readChat: "बातचीत पढ़ रहे हैं",
    ask: "{model} से पूछ रहे हैं",
    askFallback: "इसके बजाय {model} आज़मा रहे हैं",
    askAny: "AI मॉडल से पूछ रहे हैं",
    retry: "{model} से फिर से पूछ रहे हैं",
    failed: "{model}: {reason}",
    skipped: "{model} छोड़ा गया: समय खत्म",
    hedge: "{model} समय ले रहा है, इसलिए अगले मॉडल से भी पूछ रहे हैं",
    write: "उत्तर लिख रहे हैं",
  },
  "ar-SA": {
    workedFor: "عمل لمدة {time}",
    steps: "الخطوات",
    searchWeb: "جارٍ البحث في الويب",
    searchSources: "جارٍ البحث في {sources}",
    readSources: {
      one: "جارٍ قراءة مصدر واحد",
      two: "جارٍ قراءة مصدرين",
      few: "جارٍ قراءة {n} مصادر",
      many: "جارٍ قراءة {n} مصدرًا",
      other: "جارٍ قراءة {n} مصدر",
    },
    readChat: "جارٍ قراءة المحادثة",
    ask: "جارٍ سؤال {model}",
    askFallback: "تجربة {model} بدلًا من ذلك",
    askAny: "جارٍ سؤال نموذج الذكاء الاصطناعي",
    retry: "إعادة المحاولة مع {model}",
    failed: "{model}: {reason}",
    skipped: "تم تخطي {model}: نفد الوقت",
    hedge: "{model} يستغرق وقتًا، لذا نسأل النموذج التالي أيضًا",
    write: "جارٍ كتابة الإجابة",
  },
  "es-ES": {
    workedFor: "Trabajó durante {time}",
    steps: "Pasos",
    searchWeb: "Buscando en la web",
    searchSources: "Buscando en {sources}",
    readSources: { one: "Leyendo {n} fuente", other: "Leyendo {n} fuentes" },
    readChat: "Leyendo la conversación",
    ask: "Preguntando a {model}",
    askFallback: "Probando con {model}",
    askAny: "Preguntando al modelo de IA",
    retry: "Reintentando con {model}",
    failed: "{model}: {reason}",
    skipped: "{model} omitido: sin tiempo",
    hedge: "{model} está tardando, así que también se pregunta al siguiente modelo",
    write: "Escribiendo la respuesta",
  },
  "fr-FR": {
    workedFor: "A travaillé pendant {time}",
    steps: "Étapes",
    searchWeb: "Recherche sur le web",
    searchSources: "Recherche dans {sources}",
    readSources: { one: "Lecture de {n} source", other: "Lecture de {n} sources" },
    readChat: "Lecture de la conversation",
    ask: "Interrogation de {model}",
    askFallback: "Essai avec {model} à la place",
    askAny: "Interrogation du modèle d’IA",
    retry: "Nouvel essai avec {model}",
    failed: "{model} : {reason}",
    skipped: "{model} ignoré : plus de temps",
    hedge: "{model} prend du temps, le modèle suivant est donc aussi interrogé",
    write: "Rédaction de la réponse",
  },
  "zh-CN": {
    workedFor: "已用时 {time}",
    steps: "步骤",
    searchWeb: "正在搜索网页",
    searchSources: "正在搜索{sources}",
    readSources: { other: "正在阅读 {n} 个来源" },
    readChat: "正在阅读对话",
    ask: "正在询问 {model}",
    askFallback: "改为尝试 {model}",
    askAny: "正在询问 AI 模型",
    retry: "正在重试 {model}",
    failed: "{model}：{reason}",
    skipped: "已跳过 {model}：时间不足",
    hedge: "{model} 用时较长，同时询问下一个模型",
    write: "正在撰写回答",
  },
  "ja-JP": {
    workedFor: "作業時間 {time}",
    steps: "ステップ",
    searchWeb: "ウェブを検索中",
    searchSources: "{sources}を検索中",
    readSources: { other: "{n}件の情報源を読み込み中" },
    readChat: "会話を読み込み中",
    ask: "{model}に質問中",
    askFallback: "代わりに{model}を試しています",
    askAny: "AIモデルに質問中",
    retry: "{model}に再試行中",
    failed: "{model}：{reason}",
    skipped: "{model}をスキップ：時間切れ",
    hedge: "{model}に時間がかかっているため、次のモデルにも質問中",
    write: "回答を作成中",
  },
  "pt-BR": {
    workedFor: "Trabalhou por {time}",
    steps: "Etapas",
    searchWeb: "Pesquisando na web",
    searchSources: "Pesquisando em {sources}",
    readSources: { one: "Lendo {n} fonte", other: "Lendo {n} fontes" },
    readChat: "Lendo a conversa",
    ask: "Consultando {model}",
    askFallback: "Tentando {model} no lugar",
    askAny: "Consultando o modelo de IA",
    retry: "Tentando {model} de novo",
    failed: "{model}: {reason}",
    skipped: "{model} ignorado: sem tempo",
    hedge: "{model} está demorando, então o próximo modelo também está sendo consultado",
    write: "Escrevendo a resposta",
  },
  "de-DE": {
    workedFor: "{time} gearbeitet",
    steps: "Schritte",
    searchWeb: "Web wird durchsucht",
    searchSources: "{sources} wird durchsucht",
    readSources: { one: "{n} Quelle wird gelesen", other: "{n} Quellen werden gelesen" },
    readChat: "Unterhaltung wird gelesen",
    ask: "{model} wird gefragt",
    askFallback: "Stattdessen wird {model} versucht",
    askAny: "KI-Modell wird gefragt",
    retry: "{model} wird erneut versucht",
    failed: "{model}: {reason}",
    skipped: "{model} übersprungen: keine Zeit mehr",
    hedge: "{model} braucht länger, daher wird auch das nächste Modell gefragt",
    write: "Antwort wird geschrieben",
  },
};

export function progressCopy(lang: UiLang): ProgressCopy {
  return PROGRESS[lang] ?? PROGRESS["en-US"];
}

function numberFormat(lang: UiLang, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  try {
    return new Intl.NumberFormat(lang, options);
  } catch {
    return new Intl.NumberFormat("en-US", options);
  }
}

/**
 * A duration in the language's own short units: "0.4s" and "2.4s" under ten seconds, "13s" up to a
 * minute, then "1m 5s". `whole` rounds down to whole seconds (the live timer). Under 0.1 s reads
 * "<0.1s" rather than a misleading zero.
 */
export function formatDuration(ms: number, lang: UiLang, options: { whole?: boolean } = {}): string {
  const value = Math.max(0, ms);
  const seconds = (digits: number, n: number) =>
    numberFormat(lang, { style: "unit", unit: "second", unitDisplay: "narrow", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
  if (value < 60_000) {
    if (options.whole) return seconds(0, Math.floor(value / 1000));
    if (value < 50) return `<${seconds(1, 0.1)}`;
    if (value < 9_950) return seconds(1, Math.round(value / 100) / 10);
    return seconds(0, Math.round(value / 1000));
  }
  const total = options.whole ? Math.floor(value / 1000) : Math.round(value / 1000);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  const min = numberFormat(lang, { style: "unit", unit: "minute", unitDisplay: "narrow" }).format(minutes);
  return rest ? `${min} ${seconds(0, rest)}` : min;
}

/** "Web and Wikipedia" in the language's own list style. */
export function joinList(lang: UiLang, items: string[]): string {
  try {
    return new Intl.ListFormat(lang, { style: "long", type: "conjunction" }).format(items);
  } catch {
    return items.join(", ");
  }
}
