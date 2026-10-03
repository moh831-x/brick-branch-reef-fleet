/** Reading an AI answer request from the browser, shared by the server function and the streamed answer route. */
import { AI_MAX_CONTEXT, aiChoiceOf, cleanContextItem, type AiContextItem } from "./ai.shared.ts";
import { CHAT_INPUT_MAX, cleanChatHistory, type ChatMessage } from "./chat.shared.ts";
import { matchLang, type UiLang } from "./i18n.ts";
import { cleanTimeZone } from "./news.shared.ts";

export type AnswerRequest = { q: string; context: AiContextItem[]; history: ChatMessage[]; model?: string; lang?: UiLang; tz?: string };

/** Validate and bound everything the browser sent. Throws on a missing question. */
export function readAnswerRequest(input: unknown): AnswerRequest {
  if (typeof input !== "object" || input === null) throw new Error("Invalid answer request");
  const raw = input as Record<string, unknown>;
  const q = typeof raw.q === "string" ? raw.q.trim().slice(0, CHAT_INPUT_MAX) : "";
  if (!q) throw new Error("Enter a search");
  const context: AiContextItem[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(raw.context) ? raw.context.slice(0, AI_MAX_CONTEXT) : []) {
    const clean = cleanContextItem(item);
    if (!clean || seen.has(clean.url)) continue;
    seen.add(clean.url);
    context.push(clean);
  }
  const requested = matchLang(typeof raw.lang === "string" ? raw.lang : "");
  const tz = cleanTimeZone(raw.tz);
  return { q, context, history: cleanChatHistory(raw.history), model: aiChoiceOf(raw.model), ...(requested ? { lang: requested } : {}), ...(tz ? { tz } : {}) };
}
