/**
 * Server-only provider for the optional AI answer.
 *
 * Talks to any OpenAI-compatible chat completions API. The default is xAI:
 *   XAI_API_KEY   required; without it the AI source reports "not set up" and nothing is sent
 *   XAI_MODEL     optional, defaults to DEFAULT_AI_MODEL
 *   XAI_BASE_URL  optional, defaults to https://api.x.ai/v1 (point it at another
 *                 OpenAI-compatible endpoint to swap providers)
 * The key is read from the server environment only and never reaches the browser.
 */
import { AI_MESSAGES, AI_SYSTEM_PROMPT, buildAiPrompt, parseAiAnswer, type AiAnswer, type AiContextItem } from "./ai.shared";

export const DEFAULT_AI_BASE_URL = "https://api.x.ai/v1";
/** xAI's fast general model (see https://docs.x.ai/docs/models). Override with XAI_MODEL. */
export const DEFAULT_AI_MODEL = "grok-4.3";
const AI_TIMEOUT_MS = 20_000;

type AiConfig = { apiKey: string; baseUrl: string; model: string };

export function readAiConfig(env: Record<string, string | undefined> = process.env): AiConfig | null {
  const apiKey = env.XAI_API_KEY?.trim();
  if (!apiKey) return null;
  const baseUrl = (env.XAI_BASE_URL?.trim() || DEFAULT_AI_BASE_URL).replace(/\/+$/, "");
  const model = env.XAI_MODEL?.trim() || DEFAULT_AI_MODEL;
  return { apiKey, baseUrl, model };
}

type ChatCompletion = {
  model?: string;
  choices?: Array<{ message?: { content?: string | null } }>;
};

/** Ask the model for a short cited answer. Never throws: failures come back as a status the card can show. */
export async function runAiAnswer(query: string, context: AiContextItem[]): Promise<AiAnswer> {
  const config = readAiConfig();
  if (!config) return { status: "unconfigured", message: AI_MESSAGES.unconfigured };
  if (!context.length) return { status: "no-context", message: AI_MESSAGES.noContext };

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: AI_SYSTEM_PROMPT },
          { role: "user", content: buildAiPrompt(query, context) },
        ],
        temperature: 0.2,
        // Room for a few sentences plus any reasoning tokens the model spends first.
        max_tokens: 1200,
        stream: false,
      }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
    if (!response.ok) {
      // Log the status only: never the key, and never the user's query.
      console.error(`[ai] provider returned HTTP ${response.status}`);
      return { status: "error", message: AI_MESSAGES.error };
    }
    const body = (await response.json()) as ChatCompletion;
    const raw = body.choices?.[0]?.message?.content?.trim() ?? "";
    if (!raw) return { status: "error", message: AI_MESSAGES.empty };
    const parsed = parseAiAnswer(raw, context);
    if (!parsed.text) return { status: "error", message: AI_MESSAGES.empty };
    return { status: "ok", ...parsed, model: body.model || config.model };
  } catch (error) {
    const reason = error instanceof Error ? error.name : "unknown";
    console.error(`[ai] request failed (${reason})`);
    return { status: "error", message: AI_MESSAGES.error };
  }
}
