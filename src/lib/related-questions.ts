import type { UiLang } from "./i18n";
import { parseGraphQuery } from "./graph.ts";

const HEADS: Record<UiLang, string> = {
  "en-US": "Related questions",
  "bn-BD": "সম্পর্কিত প্রশ্ন",
  "hi-IN": "संबंधित प्रश्न",
  "ar-SA": "أسئلة ذات صلة",
  "es-ES": "Preguntas relacionadas",
  "fr-FR": "Questions liées",
  "zh-CN": "相关问题",
  "ja-JP": "関連する質問",
  "pt-BR": "Perguntas relacionadas",
  "de-DE": "Verwandte Fragen",
};

/** Three questions about this search, in the page language. Empty for a graph, which already has its own suggestions. */
export function relatedQuestions(query: string, lang: UiLang, dives: readonly string[] = []): string[] {
  const topic = query.replace(/\s+/g, " ").trim();
  if (topic.length < 2 || parseGraphQuery(topic)) return [];
  const asked = /^(who|what|when|where|why|how|which|is|are|did|does|do|can|was|were)\b/i.test(topic) || topic.endsWith("?");
  const fromDives = asked ? [] : dives.map((dive) => questionFromDive(topic, dive)).filter((item): item is string => Boolean(item));
  const templates = asked ? moreAbout(topic, lang) : aboutTopic(topic, lang);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of [...fromDives, ...templates]) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length === 3) break;
  }
  return out;
}

export function relatedQuestionsTitle(lang: UiLang): string {
  return HEADS[lang];
}

function aboutTopic(topic: string, lang: UiLang): string[] {
  const lines: Record<UiLang, [string, string, string]> = {
    "en-US": [`Who is ${topic}?`, `What is ${topic} known for?`, `What is the latest on ${topic}?`],
    "bn-BD": [`${topic} কে?`, `${topic} কী জন্য পরিচিত?`, `${topic} নিয়ে সর্বশেষ কী?`],
    "hi-IN": [`${topic} कौन है?`, `${topic} किस लिए जाना जाता है?`, `${topic} पर ताज़ा जानकारी क्या है?`],
    "ar-SA": [`من هو ${topic}؟`, `بماذا يشتهر ${topic}؟`, `ما الجديد عن ${topic}؟`],
    "es-ES": [`¿Quién es ${topic}?`, `¿Por qué se conoce a ${topic}?`, `¿Qué hay de nuevo sobre ${topic}?`],
    "fr-FR": [`Qui est ${topic} ?`, `Pour quoi ${topic} est-il connu ?`, `Quoi de neuf sur ${topic} ?`],
    "zh-CN": [`${topic}是谁？`, `${topic}以什么著称？`, `关于${topic}的最新情况是什么？`],
    "ja-JP": [`${topic}とは誰ですか？`, `${topic}は何で知られていますか？`, `${topic}の最新情報は何ですか？`],
    "pt-BR": [`Quem é ${topic}?`, `Por que ${topic} é conhecido?`, `Qual é a novidade sobre ${topic}?`],
    "de-DE": [`Wer ist ${topic}?`, `Wofür ist ${topic} bekannt?`, `Was gibt es Neues zu ${topic}?`],
  };
  return lines[lang];
}

function moreAbout(topic: string, lang: UiLang): string[] {
  const lines: Record<UiLang, [string, string, string]> = {
    "en-US": [`What else matters about ${topic}?`, `What do the sources disagree on about ${topic}?`, `What should I read next about ${topic}?`],
    "bn-BD": [`${topic} নিয়ে আর কী জানা দরকার?`, `উৎসগুলো ${topic} নিয়ে কোথায় ভিন্নমত?`, `${topic} নিয়ে এরপর কী পড়া উচিত?`],
    "hi-IN": [`${topic} के बारे में और क्या ज़रूरी है?`, `स्रोत ${topic} पर कहाँ असहमत हैं?`, `${topic} के बारे में आगे क्या पढ़ें?`],
    "ar-SA": [`ماذا يهم أيضًا عن ${topic}؟`, `أين تختلف المصادر حول ${topic}؟`, `ماذا أقرأ بعد ذلك عن ${topic}؟`],
    "es-ES": [`¿Qué más importa sobre ${topic}?`, `¿En qué discrepan las fuentes sobre ${topic}?`, `¿Qué debería leer después sobre ${topic}?`],
    "fr-FR": [`Qu’est-ce qui compte encore sur ${topic} ?`, `Sur quoi les sources divergent-elles à propos de ${topic} ?`, `Que lire ensuite sur ${topic} ?`],
    "zh-CN": [`关于${topic}还有什么重要的？`, `来源对${topic}有哪些不同看法？`, `接下来该读关于${topic}的什么？`],
    "ja-JP": [`${topic}について他に重要なことは？`, `情報源は${topic}のどこで食い違っていますか？`, `${topic}について次に何を読むべきですか？`],
    "pt-BR": [`O que mais importa sobre ${topic}?`, `Em que as fontes discordam sobre ${topic}?`, `O que devo ler em seguida sobre ${topic}?`],
    "de-DE": [`Was ist sonst noch wichtig zu ${topic}?`, `Worin widersprechen sich die Quellen zu ${topic}?`, `Was sollte ich als Nächstes über ${topic} lesen?`],
  };
  return lines[lang];
}

const DIVE: Record<string, (topic: string) => string> = {
  wife: (topic) => `Who is ${topic}'s wife?`,
  husband: (topic) => `Who is ${topic}'s husband?`,
  spouse: (topic) => `Who is ${topic} married to?`,
  age: (topic) => `How old is ${topic}?`,
  birthday: (topic) => `When was ${topic} born?`,
  born: (topic) => `When was ${topic} born?`,
  "net worth": (topic) => `What is ${topic}'s net worth?`,
  news: (topic) => `What is the latest news about ${topic}?`,
  family: (topic) => `Who is in ${topic}'s family?`,
  children: (topic) => `Does ${topic} have children?`,
  son: (topic) => `Who is ${topic}'s son?`,
  daughter: (topic) => `Who is ${topic}'s daughter?`,
  death: (topic) => `Is ${topic} still alive?`,
  died: (topic) => `When did ${topic} die?`,
  height: (topic) => `How tall is ${topic}?`,
};

/** "Tarique Rahman wife" → "Who is Tarique Rahman's wife?" */
function questionFromDive(topic: string, dive: string): string | null {
  const text = dive.replace(/\s+/g, " ").trim();
  if (!text || text.toLowerCase() === topic.toLowerCase()) return null;
  if (text.endsWith("?")) return text;
  const rest = text.toLowerCase().startsWith(topic.toLowerCase()) ? text.slice(topic.length).trim() : "";
  const make = DIVE[rest.toLowerCase()];
  return make ? make(topic) : null;
}
