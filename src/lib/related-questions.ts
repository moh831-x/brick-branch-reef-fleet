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

/** Countries and other places that must not be asked as if they were a person. */
const COUNTRIES = new Set(
  "afghanistan|albania|algeria|andorra|angola|antigua and barbuda|argentina|armenia|australia|austria|azerbaijan|bahamas|bahrain|bangladesh|barbados|belarus|belgium|belize|benin|bhutan|bolivia|bosnia|bosnia and herzegovina|botswana|brazil|brunei|bulgaria|burkina faso|burundi|cabo verde|cambodia|cameroon|canada|cape verde|central african republic|chad|chile|china|colombia|comoros|congo|costa rica|cote d'ivoire|croatia|cuba|cyprus|czechia|czech republic|democratic republic of the congo|denmark|djibouti|dominica|dominican republic|dr congo|drc|east timor|ecuador|egypt|el salvador|equatorial guinea|eritrea|estonia|eswatini|ethiopia|fiji|finland|france|gabon|gambia|georgia|germany|ghana|greece|greenland|grenada|guatemala|guinea|guinea-bissau|guyana|haiti|holy see|honduras|hong kong|hungary|iceland|india|indonesia|iran|iraq|ireland|israel|italy|ivory coast|jamaica|japan|jordan|kazakhstan|kenya|kiribati|kosovo|kuwait|kyrgyzstan|laos|latvia|lebanon|lesotho|liberia|libya|liechtenstein|lithuania|luxembourg|macao|macau|madagascar|malawi|malaysia|maldives|mali|malta|marshall islands|mauritania|mauritius|mexico|micronesia|moldova|monaco|mongolia|montenegro|morocco|mozambique|myanmar|namibia|nauru|nepal|netherlands|new zealand|nicaragua|niger|nigeria|north korea|north macedonia|norway|oman|pakistan|palau|palestine|panama|papua new guinea|paraguay|peru|philippines|poland|portugal|puerto rico|qatar|romania|russia|rwanda|saint kitts and nevis|saint lucia|saint vincent and the grenadines|samoa|san marino|sao tome and principe|saudi arabia|senegal|serbia|seychelles|sierra leone|singapore|slovakia|slovenia|solomon islands|somalia|south africa|south korea|south sudan|spain|sri lanka|sudan|suriname|swaziland|sweden|switzerland|syria|taiwan|tajikistan|tanzania|thailand|timor-leste|togo|tonga|trinidad and tobago|tunisia|turkey|turkmenistan|tuvalu|uganda|ukraine|united arab emirates|united kingdom|united states|united states of america|uruguay|uzbekistan|vanuatu|vatican city|venezuela|vietnam|yemen|zambia|zimbabwe|usa|uk|uae|us|america|england|scotland|wales|britain|holland|burma|macedonia|republic of korea|prc|dprk".split(
    "|",
  ),
);

/** Abbreviations read better with their usual capitals. */
const NAMES: Record<string, string> = {
  usa: "the USA",
  us: "the US",
  uk: "the UK",
  uae: "the UAE",
  drc: "the DRC",
  dprk: "North Korea",
  prc: "China",
  "cote d'ivoire": "Côte d'Ivoire",
  "sao tome and principe": "São Tomé and Príncipe",
};

const PERSON_RESTS = new Set([
  "wife",
  "husband",
  "spouse",
  "age",
  "birthday",
  "born",
  "net worth",
  "family",
  "children",
  "son",
  "daughter",
  "death",
  "died",
  "height",
]);

/** Three questions about this search, in the page language. Empty for a graph, which already has its own suggestions. Questions already sent in the chat are skipped, and the next ones take their place. */
export function relatedQuestions(
  query: string,
  lang: UiLang,
  dives: readonly string[] = [],
  places: readonly string[] = [],
  history: readonly string[] = [],
): string[] {
  const raw = query.replace(/\s+/g, " ").trim();
  if (raw.length < 2 || parseGraphQuery(raw)) return [];
  const topic = labelTopic(raw);
  const kind = placeKind(raw, places);
  const isQuestion = /^(who|what|when|where|why|how|which|is|are|did|does|do|can|was|were)\b/i.test(raw) || raw.endsWith("?");
  const fromDives = isQuestion
    ? []
    : dives
        .map((dive) => questionFromDive(topic, raw, dive, kind !== null))
        .filter((item): item is string => Boolean(item));
  const first = isQuestion ? [] : templatesFor(topic, lang, kind, raw);
  // The opening question ("Who is…", "Where is…") is the search itself. Once the chat has started, do not offer it again.
  const fresh = history.length ? first.slice(1) : first;
  const pool = [...(history.length || isQuestion ? [] : fromDives), ...fresh, ...moreAbout(topic, lang)];
  const used = new Set([raw, ...history].map((line) => line.replace(/\s+/g, " ").trim().toLowerCase()).filter(Boolean));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of pool) {
    const key = item.toLowerCase();
    if (seen.has(key) || used.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length === 3) break;
  }
  return out;
}

export function relatedQuestionsTitle(lang: UiLang): string {
  return HEADS[lang];
}

function placeKind(query: string, places: readonly string[]): "country" | "place" | null {
  const key = placeKey(query);
  if (COUNTRIES.has(key)) return "country";
  const named = places.some((place) => placeKey(place) === key);
  return named ? "place" : null;
}

function templatesFor(topic: string, lang: UiLang, kind: "country" | "place" | null, raw: string): string[] {
  if (kind === "country") return aboutCountry(topic, lang);
  if (kind === "place") return aboutPlace(topic, lang);
  const words = raw.split(/\s+/);
  const person = words.length >= 2 && words.length <= 4 && words.every((word) => /^[\p{L}][\p{L}'.-]*$/u.test(word));
  return person ? aboutPerson(topic, lang) : aboutThing(topic, lang);
}

function placeKey(query: string): string {
  return query
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function labelTopic(topic: string): string {
  const named = NAMES[placeKey(topic)];
  if (named) return named;
  if (topic !== topic.toLowerCase()) return topic;
  const small = new Set(["of", "the", "and", "de", "da", "del", "la", "el", "al"]);
  return topic
    .split(" ")
    .map((word, index) => (index > 0 && small.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

function aboutPerson(topic: string, lang: UiLang): string[] {
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

function aboutCountry(topic: string, lang: UiLang): string[] {
  const lines: Record<UiLang, [string, string, string]> = {
    "en-US": [`Where is ${topic}?`, `What is the capital of ${topic}?`, `What is ${topic} known for?`],
    "bn-BD": [`${topic} কোথায়?`, `${topic}-এর রাজধানী কী?`, `${topic} কী জন্য পরিচিত?`],
    "hi-IN": [`${topic} कहाँ है?`, `${topic} की राजधानी क्या है?`, `${topic} किस लिए जाना जाता है?`],
    "ar-SA": [`أين تقع ${topic}؟`, `ما عاصمة ${topic}؟`, `بماذا تشتهر ${topic}؟`],
    "es-ES": [`¿Dónde está ${topic}?`, `¿Cuál es la capital de ${topic}?`, `¿Por qué se conoce a ${topic}?`],
    "fr-FR": [`Où se trouve ${topic} ?`, `Quelle est la capitale de ${topic} ?`, `Pour quoi ${topic} est-il connu ?`],
    "zh-CN": [`${topic}在哪里？`, `${topic}的首都是哪里？`, `${topic}以什么著称？`],
    "ja-JP": [`${topic}はどこにありますか？`, `${topic}の首都はどこですか？`, `${topic}は何で知られていますか？`],
    "pt-BR": [`Onde fica ${topic}?`, `Qual é a capital de ${topic}?`, `Por que ${topic} é conhecido?`],
    "de-DE": [`Wo liegt ${topic}?`, `Was ist die Hauptstadt von ${topic}?`, `Wofür ist ${topic} bekannt?`],
  };
  return lines[lang];
}

function aboutPlace(topic: string, lang: UiLang): string[] {
  const lines: Record<UiLang, [string, string, string]> = {
    "en-US": [`Where is ${topic}?`, `What is ${topic} known for?`, `What is the latest on ${topic}?`],
    "bn-BD": [`${topic} কোথায়?`, `${topic} কী জন্য পরিচিত?`, `${topic} নিয়ে সর্বশেষ কী?`],
    "hi-IN": [`${topic} कहाँ है?`, `${topic} किस लिए जाना जाता है?`, `${topic} पर ताज़ा जानकारी क्या है?`],
    "ar-SA": [`أين تقع ${topic}؟`, `بماذا تشتهر ${topic}؟`, `ما الجديد عن ${topic}؟`],
    "es-ES": [`¿Dónde está ${topic}?`, `¿Por qué se conoce a ${topic}?`, `¿Qué hay de nuevo sobre ${topic}?`],
    "fr-FR": [`Où se trouve ${topic} ?`, `Pour quoi ${topic} est-il connu ?`, `Quoi de neuf sur ${topic} ?`],
    "zh-CN": [`${topic}在哪里？`, `${topic}以什么著称？`, `关于${topic}的最新情况是什么？`],
    "ja-JP": [`${topic}はどこにありますか？`, `${topic}は何で知られていますか？`, `${topic}の最新情報は何ですか？`],
    "pt-BR": [`Onde fica ${topic}?`, `Por que ${topic} é conhecido?`, `Qual é a novidade sobre ${topic}?`],
    "de-DE": [`Wo liegt ${topic}?`, `Wofür ist ${topic} bekannt?`, `Was gibt es Neues zu ${topic}?`],
  };
  return lines[lang];
}

function aboutThing(topic: string, lang: UiLang): string[] {
  const lines: Record<UiLang, [string, string, string]> = {
    "en-US": [`What is ${topic}?`, `What is ${topic} known for?`, `What is the latest on ${topic}?`],
    "bn-BD": [`${topic} কী?`, `${topic} কী জন্য পরিচিত?`, `${topic} নিয়ে সর্বশেষ কী?`],
    "hi-IN": [`${topic} क्या है?`, `${topic} किस लिए जाना जाता है?`, `${topic} पर ताज़ा जानकारी क्या है?`],
    "ar-SA": [`ما هو ${topic}؟`, `بماذا يشتهر ${topic}؟`, `ما الجديد عن ${topic}؟`],
    "es-ES": [`¿Qué es ${topic}?`, `¿Por qué se conoce a ${topic}?`, `¿Qué hay de nuevo sobre ${topic}?`],
    "fr-FR": [`Qu’est-ce que ${topic} ?`, `Pour quoi ${topic} est-il connu ?`, `Quoi de neuf sur ${topic} ?`],
    "zh-CN": [`${topic}是什么？`, `${topic}以什么著称？`, `关于${topic}的最新情况是什么？`],
    "ja-JP": [`${topic}とは何ですか？`, `${topic}は何で知られていますか？`, `${topic}の最新情報は何ですか？`],
    "pt-BR": [`O que é ${topic}?`, `Por que ${topic} é conhecido?`, `Qual é a novidade sobre ${topic}?`],
    "de-DE": [`Was ist ${topic}?`, `Wofür ist ${topic} bekannt?`, `Was gibt es Neues zu ${topic}?`],
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
  capital: (topic) => `What is the capital of ${topic}?`,
  population: (topic) => `What is the population of ${topic}?`,
  map: (topic) => `Where is ${topic}?`,
  currency: (topic) => `What is the currency of ${topic}?`,
  language: (topic) => `What language is spoken in ${topic}?`,
};

/** "Tarique Rahman wife" → "Who is Tarique Rahman's wife?" A place never gets a person question. */
function questionFromDive(topic: string, raw: string, dive: string, place: boolean): string | null {
  const text = dive.replace(/\s+/g, " ").trim();
  if (!text || text.toLowerCase() === raw.toLowerCase()) return null;
  if (text.endsWith("?")) return text;
  const rest = text.toLowerCase().startsWith(raw.toLowerCase()) ? text.slice(raw.length).trim().toLowerCase() : "";
  if (place && PERSON_RESTS.has(rest)) return null;
  const make = DIVE[rest];
  return make ? make(topic) : null;
}
