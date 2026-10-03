/**
 * Clarifying questions for the AI chat. When a request is too open to answer well ("write a python
 * code"), the model replies with a short note, one question, a few likely answers, and optional
 * follow-up prompts instead of guessing. Clear requests are answered as usual. Pure data and
 * helpers, safe on the server and in the browser.
 */

export type AiQuestionOption = { label: string; description: string };

export type AiQuestion = {
  /** One or two short sentences shown as the assistant's reply. */
  message: string;
  /** The question on the card above the prompt bar. */
  question: string;
  /** Likely answers, 2 to 5 (the prompt asks for 3 to 5). */
  options: AiQuestionOption[];
  /** Prompts the reader can send instead, shown under the reply (0 to 3). */
  suggestions: string[];
};

export const CLARIFY_MAX_OPTIONS = 5;
const MIN_OPTIONS = 2;
const MAX_SUGGESTIONS = 3;

/**
 * Added to the system prompt on the chat path. It keeps the bar high: a clarifying question is only
 * for requests to make or do something that leave out what it should be.
 */
export const AI_CLARIFY_PROMPT = [
  "Clarifying questions: ask one only when the user asks you to make or do something (write code, build, design, plan, draft, fix) and the request leaves out what it should do, so any answer would be a guess.",
  'Then reply with only this block and nothing else: <clarify>{"message":"…","question":"…","options":[{"label":"…","description":"…"}],"suggestions":["…"]}</clarify>',
  "message: one or two short sentences saying what is missing. question: one short question. options: 3 to 5 likely answers, each a label of 1 to 4 words and a description under 12 words. suggestions: 2 or 3 short prompts the user could send instead.",
  "Do not ask when a reasonable answer is possible. Answer normally, choosing sensible defaults and saying which, for questions about facts, people, places, events, news, definitions, how-to steps, math, comparisons, a search for a topic or name, and any request with enough detail to start.",
  "Never ask about something the conversation already answers, and never ask twice in a row: if your previous reply was a clarifying question, answer now.",
].join(" ");

function tidy(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

function stripFences(text: string): string {
  return text
    .trim()
    .replace(/^```[a-z]*\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

/** Validate a parsed object into a question, or null when it is not a usable one. Exported for tests. */
export function cleanQuestion(raw: unknown): AiQuestion | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as Record<string, unknown>;
  const question = tidy(value.question, 200);
  if (!question || !Array.isArray(value.options)) return null;
  const options: AiQuestionOption[] = [];
  const seen = new Set<string>();
  for (const item of value.options) {
    if (options.length >= CLARIFY_MAX_OPTIONS) break;
    const option = typeof item === "string" ? { label: tidy(item, 60), description: "" } : typeof item === "object" && item !== null
      ? { label: tidy((item as Record<string, unknown>).label, 60), description: tidy((item as Record<string, unknown>).description, 140) }
      : null;
    if (!option?.label || seen.has(option.label.toLowerCase())) continue;
    seen.add(option.label.toLowerCase());
    options.push(option);
  }
  if (options.length < MIN_OPTIONS) return null;
  const suggestions = (Array.isArray(value.suggestions) ? value.suggestions : [])
    .map((item) => tidy(item, 120))
    .filter((item, index, all) => item && all.indexOf(item) === index)
    .slice(0, MAX_SUGGESTIONS);
  const message = tidy(value.message, 400) || question;
  return { message, question, options, suggestions };
}

/**
 * Find a clarifying question in a model reply: a <clarify>{…}</clarify> block, or (when a model
 * drops the tags) a reply that is only that JSON object. `rest` is the reply without the block, so a
 * broken block never shows up as raw JSON. Exported for tests.
 */
export function readClarify(raw: string): { question: AiQuestion | null; rest: string } {
  const tagged = raw.match(/<clarify>([\s\S]*?)(?:<\/clarify>|$)/i);
  const body = tagged ? stripFences(tagged[1] ?? "") : stripFences(raw);
  const rest = tagged ? raw.replace(tagged[0], "").trim() : raw;
  if (!tagged && !/^\{[\s\S]*"question"[\s\S]*"options"[\s\S]*\}$/.test(body)) return { question: null, rest };
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return { question: null, rest };
  try {
    const question = cleanQuestion(JSON.parse(body.slice(start, end + 1)));
    return { question, rest: question ? "" : rest };
  } catch {
    return { question: null, rest };
  }
}

/** The letter shown next to an option (A, B, C…); the custom answer takes the next one. */
export function optionLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

/** What is sent as the reader's next message when they pick an option. */
export function optionReply(option: AiQuestionOption): string {
  return option.description ? `${option.label} — ${option.description}` : option.label;
}

/**
 * The assistant turn as the model should see it in the history: the note, the question, and the
 * lettered options, so a reply like "Web / API — Fetch a URL…" is understood.
 */
export function questionHistoryText(question: AiQuestion): string {
  const options = question.options.map((option, index) => `${optionLetter(index)}. ${optionReply(option)}`).join("\n");
  return `${question.message}\n\n${question.question}\n${options}`;
}
