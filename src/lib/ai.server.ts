/**
 * Server-only providers for the optional AI answer. Keys are read from the server environment
 * and never reach the browser.
 *
 *   Grok (xAI)          XAI_API_KEY, XAI_MODEL, XAI_BASE_URL              OpenAI-compatible Chat Completions
 *   ChatGPT (OpenAI)    OPENAI_API_KEY, OPENAI_MODEL, OPENAI_BASE_URL     Chat Completions
 *   Claude (Anthropic)  ANTHROPIC_API_KEY, ANTHROPIC_MODEL, ANTHROPIC_BASE_URL  Messages API
 *
 * A provider without a key is "not set up" and is never called. The reader's pick is tried first;
 * if it fails, the next set-up provider is tried (Grok, ChatGPT, Claude order).
 */
import {
  AI_MESSAGES,
  AI_PROVIDERS,
  AI_SYSTEM_PROMPT,
  aiProviderOrder,
  buildAiPrompt,
  parseAiAnswer,
  type AiAnswer,
  type AiContextItem,
  type AiProviderId,
  type AiProviderStatus,
} from "./ai.shared.ts";

type Env = Record<string, string | undefined>;

type ProviderSpec = {
  id: AiProviderId;
  api: "chat" | "anthropic";
  keyVar: string;
  modelVar: string;
  baseVar: string;
  defaultBase: string;
  defaultModel: string;
  /** Reasoning effort sent with the default model only, so a custom model never gets a parameter it rejects. */
  defaultEffort?: string;
  effortVar?: string;
};

/**
 * Defaults are each provider's current fast, low-cost model (checked against their docs, Sep 2026):
 * xAI grok-4.3 (https://docs.x.ai/docs/models), OpenAI gpt-6-luna (https://platform.openai.com/docs/models),
 * Anthropic claude-sonnet-5-5 (https://docs.anthropic.com/en/docs/about-claude/models/overview).
 */
export const AI_PROVIDER_SPECS: Record<AiProviderId, ProviderSpec> = {
  grok: {
    id: "grok",
    api: "chat",
    keyVar: "XAI_API_KEY",
    modelVar: "XAI_MODEL",
    baseVar: "XAI_BASE_URL",
    defaultBase: "https://api.x.ai/v1",
    defaultModel: "grok-4.3",
  },
  openai: {
    id: "openai",
    api: "chat",
    keyVar: "OPENAI_API_KEY",
    modelVar: "OPENAI_MODEL",
    baseVar: "OPENAI_BASE_URL",
    defaultBase: "https://api.openai.com/v1",
    defaultModel: "gpt-6-luna",
    defaultEffort: "low",
    effortVar: "OPENAI_REASONING_EFFORT",
  },
  claude: {
    id: "claude",
    api: "anthropic",
    keyVar: "ANTHROPIC_API_KEY",
    modelVar: "ANTHROPIC_MODEL",
    baseVar: "ANTHROPIC_BASE_URL",
    defaultBase: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-5-5",
    defaultEffort: "low",
    effortVar: "ANTHROPIC_EFFORT",
  },
};

export const ANTHROPIC_VERSION = "2023-06-01";
const AI_TIMEOUT_MS = 20_000;
/** Room for a few sentences plus any reasoning tokens the model spends first. */
const MAX_OUTPUT_TOKENS = 1200;

export type ProviderConfig = {
  id: AiProviderId;
  api: ProviderSpec["api"];
  apiKey: string;
  baseUrl: string;
  model: string;
  effort?: string;
};

export function readProviderConfig(id: AiProviderId, env: Env = process.env): ProviderConfig | null {
  const spec = AI_PROVIDER_SPECS[id];
  const apiKey = env[spec.keyVar]?.trim();
  if (!apiKey) return null;
  const model = env[spec.modelVar]?.trim() || spec.defaultModel;
  const effort = (spec.effortVar && env[spec.effortVar]?.trim()) || (model === spec.defaultModel ? spec.defaultEffort : undefined);
  return {
    id,
    api: spec.api,
    apiKey,
    baseUrl: (env[spec.baseVar]?.trim() || spec.defaultBase).replace(/\/+$/, ""),
    model,
    effort,
  };
}

export function availableAiProviders(env: Env = process.env): AiProviderId[] {
  return AI_PROVIDERS.map((provider) => provider.id).filter((id) => readProviderConfig(id, env) !== null);
}

/** What the selector needs: which providers are set up, and their model names. Never the keys. */
export function aiProviderStatus(env: Env = process.env): AiProviderStatus[] {
  return AI_PROVIDERS.map((provider) => {
    const config = readProviderConfig(provider.id, env);
    return { id: provider.id, label: provider.label, available: Boolean(config), ...(config ? { model: config.model } : {}) };
  });
}

type Request = { url: string; init: RequestInit };

/** Build the HTTP request for one provider. Exported for tests; it performs no I/O. */
export function buildProviderRequest(config: ProviderConfig, query: string, context: AiContextItem[]): Request {
  const prompt = buildAiPrompt(query, context);
  if (config.api === "anthropic") {
    return {
      url: `${config.baseUrl}/messages`,
      init: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: MAX_OUTPUT_TOKENS,
          system: AI_SYSTEM_PROMPT,
          messages: [{ role: "user", content: prompt }],
          ...(config.effort ? { output_config: { effort: config.effort } } : {}),
        }),
      },
    };
  }
  const openai = config.id === "openai";
  return {
    url: `${config.baseUrl}/chat/completions`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        messages: [
          // "system" works on xAI, OpenAI (treated as developer instructions on reasoning models), and
          // other OpenAI-compatible endpoints.
          { role: "system", content: AI_SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        // OpenAI reasoning models reject temperature and max_tokens; they use max_completion_tokens.
        ...(openai ? { max_completion_tokens: MAX_OUTPUT_TOKENS } : { max_tokens: MAX_OUTPUT_TOKENS, temperature: 0.2 }),
        ...(config.effort ? { reasoning_effort: config.effort } : {}),
        stream: false,
      }),
    },
  };
}

type ChatCompletion = { model?: string; choices?: Array<{ message?: { content?: string | null } }> };
type AnthropicMessage = { model?: string; content?: Array<{ type?: string; text?: string }> };

/** Pull the answer text and model name out of a provider response. Exported for tests. */
export function readProviderResponse(config: ProviderConfig, body: unknown): { raw: string; model: string } {
  if (config.api === "anthropic") {
    const message = body as AnthropicMessage;
    const raw = (message.content ?? [])
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text)
      .join(" ")
      .trim();
    return { raw, model: message.model || config.model };
  }
  const completion = body as ChatCompletion;
  return { raw: completion.choices?.[0]?.message?.content?.trim() ?? "", model: completion.model || config.model };
}

async function askProvider(config: ProviderConfig, query: string, context: AiContextItem[], fetcher: typeof fetch) {
  const request = buildProviderRequest(config, query, context);
  const response = await fetcher(request.url, { ...request.init, signal: AbortSignal.timeout(AI_TIMEOUT_MS) });
  // Log the status only: never the key, and never the reader's query.
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const { raw, model } = readProviderResponse(config, await response.json());
  const parsed = parseAiAnswer(raw, context);
  if (!parsed.text) throw new Error("empty answer");
  return { ...parsed, model };
}

/**
 * Ask for a short cited answer. Tries the reader's pick first, then the other set-up providers.
 * Never throws: failures come back as a status the card can show.
 */
export async function runAiAnswer(
  query: string,
  context: AiContextItem[],
  preferred?: AiProviderId,
  options: { env?: Env; fetcher?: typeof fetch } = {},
): Promise<AiAnswer> {
  const env = options.env ?? process.env;
  const fetcher = options.fetcher ?? fetch;
  const order = aiProviderOrder(preferred, availableAiProviders(env));
  if (!order.length) return { status: "unconfigured", message: AI_MESSAGES.unconfigured };
  if (!context.length) return { status: "no-context", message: AI_MESSAGES.noContext };

  const failed: AiProviderId[] = [];
  for (const id of order) {
    const config = readProviderConfig(id, env);
    if (!config) continue;
    try {
      const answer = await askProvider(config, query, context, fetcher);
      return { status: "ok", ...answer, provider: id, ...(preferred ? { requested: preferred } : {}), failed };
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 40) : "unknown";
      console.error(`[ai] ${id} failed (${reason})`);
      failed.push(id);
    }
  }
  return { status: "error", message: AI_MESSAGES.error, failed };
}
