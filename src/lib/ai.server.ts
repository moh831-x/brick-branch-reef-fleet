/**
 * Server-only providers for the optional AI answer. Keys are read from the server environment
 * and never reach the browser.
 *
 *   Grok (xAI)          XAI_API_KEY, XAI_MODEL, XAI_BASE_URL              OpenAI-compatible Chat Completions
 *   ChatGPT (OpenAI)    OPENAI_API_KEY, OPENAI_MODEL, OPENAI_BASE_URL     Chat Completions
 *   Claude (Anthropic)  ANTHROPIC_API_KEY, ANTHROPIC_MODEL, ANTHROPIC_BASE_URL  Messages API
 *
 * ChatGPT and Claude can also share one Vercel AI Gateway key, AI_GATEWAY_API_KEY, when they do
 * not have a key of their own. Their own keys still win. A provider without either key is "not
 * set up" and is never called. The reader's pick is tried first; if it fails, the next set-up
 * provider is tried (Grok, ChatGPT, Claude order).
 */
import {
  AI_MESSAGES,
  AI_MODELS,
  AI_PROVIDERS,
  AI_SYSTEM_PROMPT,
  aiModelOf,
  aiProviderOf,
  aiProviderOrder,
  buildAiPrompt,
  modelNote,
  modelReady,
  parseAiAnswer,
  type AiAnswer,
  type AiContextItem,
  type AiKeyFlags,
  type AiModelStatus,
  type AiProviderId,
  type AiProviderStatus,
  type AnswerProviderId,
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
/** OpenAI-compatible endpoint. One key covers ChatGPT and Claude when they have no key of their own. */
const AI_GATEWAY_BASE = "https://ai-gateway.vercel.sh/v1";
/** Models the current AI Gateway plan can call. Direct provider keys still use their own defaults. */
const AI_GATEWAY_MODELS = {
  openai: "openai/gpt-4.1-mini",
  claude: "anthropic/claude-3-haiku",
} as const;

export type ProviderConfig = {
  id: AnswerProviderId;
  api: ProviderSpec["api"];
  apiKey: string;
  baseUrl: string;
  model: string;
  effort?: string;
  /** True when this call goes through Vercel AI Gateway instead of the provider's own API. */
  gateway?: boolean;
};

export function readProviderConfig(id: AiProviderId, env: Env = process.env): ProviderConfig | null {
  const spec = AI_PROVIDER_SPECS[id];
  const ownKey = env[spec.keyVar]?.trim();
  const gatewayKey = id === "grok" ? "" : env.AI_GATEWAY_API_KEY?.trim() || "";
  if (!ownKey && !gatewayKey) return null;
  const viaGateway = !ownKey;
  const model =
    env[spec.modelVar]?.trim() || (viaGateway && id !== "grok" ? AI_GATEWAY_MODELS[id] : spec.defaultModel);
  const effort =
    (spec.effortVar && env[spec.effortVar]?.trim()) || (!viaGateway && model === spec.defaultModel ? spec.defaultEffort : undefined);
  return {
    id,
    api: viaGateway ? "chat" : spec.api,
    apiKey: ownKey || gatewayKey,
    baseUrl: (viaGateway ? AI_GATEWAY_BASE : env[spec.baseVar]?.trim() || spec.defaultBase).replace(/\/+$/, ""),
    model,
    effort,
    gateway: viaGateway || undefined,
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

export function aiKeyFlags(env: Env = process.env): AiKeyFlags {
  return {
    grok: Boolean(env.XAI_API_KEY?.trim()),
    openai: Boolean(env.OPENAI_API_KEY?.trim()),
    claude: Boolean(env.ANTHROPIC_API_KEY?.trim()),
    gateway: Boolean(env.AI_GATEWAY_API_KEY?.trim()),
  };
}

/** Which listed models can run with the keys on this server. Never includes the keys. */
export function aiModelStatus(env: Env = process.env): AiModelStatus[] {
  const keys = aiKeyFlags(env);
  return AI_MODELS.map((spec) => {
    const note = modelNote(spec, keys);
    return { id: spec.id, label: spec.label, provider: spec.provider, available: !note, ...(note ? { note } : {}) };
  });
}

/** Config for one menu model, using the provider's own key when it has one and the gateway otherwise. */
export function configForModel(modelId: string, env: Env = process.env): ProviderConfig | null {
  const spec = AI_MODELS.find((model) => model.id === modelId);
  if (!spec || !modelReady(spec, aiKeyFlags(env))) return null;
  if (spec.provider === "gemini") {
    const apiKey = env.AI_GATEWAY_API_KEY?.trim();
    if (!apiKey || !spec.gateway) return null;
    return { id: "gemini", api: "chat", apiKey, baseUrl: AI_GATEWAY_BASE, model: spec.gateway, gateway: true };
  }
  const base = readProviderConfig(spec.provider, env);
  if (!base) return null;
  const model = base.gateway ? spec.gateway : spec.direct;
  if (!model) return null;
  return { ...base, model, effort: undefined };
}

type Request = { url: string; init: RequestInit };

/** Build the HTTP request for one provider. Exported for tests; it performs no I/O. */
export function buildProviderRequest(config: ProviderConfig, query: string, context: AiContextItem[], language?: string): Request {
  const system = language
    ? `${AI_SYSTEM_PROMPT} Write the entire answer in ${language}, even when the results are in another language.`
    : AI_SYSTEM_PROMPT;
  const prompt = buildAiPrompt(query, context, language);
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
          system,
          messages: [{ role: "user", content: prompt }],
          ...(config.effort ? { output_config: { effort: config.effort } } : {}),
        }),
      },
    };
  }
  const openai = config.id === "openai" || config.gateway === true;
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
          { role: "system", content: system },
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

const TRANSLATE_NAMES: Record<string, string> = {
  "zh-CN": "Simplified Chinese",
  "hi-IN": "Hindi",
  "bn-BD": "Bangla",
};

/** Pull a translation object out of a model reply. Exported for tests. */
export function readTranslation(raw: string): { title: string; text: string } | null {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1)) as { title?: unknown; text?: unknown };
    const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
    const text = typeof parsed.text === "string" ? parsed.text.trim() : "";
    if (!title || !text) return null;
    return { title: title.slice(0, 240), text: text.slice(0, 6000) };
  } catch {
    return null;
  }
}

/**
 * Translate a preview title and passage. Uses Grok when that key is set, otherwise the first
 * gateway model that is set up. Throws when nothing is configured or the reply is not usable.
 */
export async function runTranslate(
  input: { lang: string; title: string; text: string },
  options: { env?: Env; fetcher?: typeof fetch } = {},
): Promise<{ title: string; text: string }> {
  const language = TRANSLATE_NAMES[input.lang];
  if (!language) return { title: input.title, text: input.text };
  const env = options.env ?? process.env;
  const config =
    readProviderConfig("grok", env) ??
    configForModel("gpt-4.1-mini", env) ??
    configForModel("gemini-2.5-flash-lite", env);
  if (!config) throw new Error("unconfigured");
  const fetcher = options.fetcher ?? fetch;
  const prompt = `Translate into ${language}. Reply with JSON only: {"title":"...","text":"..."}. Keep lines that start with # as headings: translate the words after the # marks and leave the # marks in place. Keep names, dates, and numbers. Do not add notes.\n\nTitle: ${input.title}\n\nText:\n${input.text}`;
  const openai = config.id === "openai" || config.id === "gemini" || config.gateway === true;
  const response = await fetcher(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: "You translate. Return JSON only." },
        { role: "user", content: prompt },
      ],
      ...(openai ? { max_completion_tokens: 1200 } : { max_tokens: 1200, temperature: 0 }),
      stream: false,
    }),
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const { raw } = readProviderResponse(config, await response.json());
  const parsed = readTranslation(raw);
  if (!parsed) throw new Error("empty translation");
  return parsed;
}

async function askProvider(
  config: ProviderConfig,
  query: string,
  context: AiContextItem[],
  fetcher: typeof fetch,
  language?: string,
) {
  const request = buildProviderRequest(config, query, context, language);
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
  preferred?: string,
  options: { env?: Env; fetcher?: typeof fetch; answerLanguage?: string } = {},
): Promise<AiAnswer> {
  const env = options.env ?? process.env;
  const fetcher = options.fetcher ?? fetch;
  const modelId = aiModelOf(preferred);
  const pickedProvider = modelId ? AI_MODELS.find((model) => model.id === modelId)?.provider : undefined;
  const providerPref = pickedProvider && pickedProvider !== "gemini" ? pickedProvider : aiProviderOf(preferred);
  const order = aiProviderOrder(providerPref, availableAiProviders(env));
  const queue: ProviderConfig[] = [];
  const seen = new Set<string>();
  const push = (config: ProviderConfig | null) => {
    if (!config) return;
    const key = `${config.id}:${config.model}`;
    if (seen.has(key)) return;
    seen.add(key);
    queue.push(config);
  };
  if (modelId) push(configForModel(modelId, env));
  for (const id of order) push(readProviderConfig(id, env));
  if (!queue.length) return { status: "unconfigured", message: AI_MESSAGES.unconfigured };
  if (!context.length) return { status: "no-context", message: AI_MESSAGES.noContext };

  const failed: AnswerProviderId[] = [];
  for (const config of queue) {
    try {
      const answer = await askProvider(config, query, context, fetcher, options.answerLanguage);
      const requested = pickedProvider ?? providerPref;
      return { status: "ok", ...answer, provider: config.id, ...(requested ? { requested } : {}), failed };
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 40) : "unknown";
      console.error(`[ai] ${config.id} ${config.model} failed (${reason})`);
      if (!failed.includes(config.id)) failed.push(config.id);
    }
  }
  return { status: "error", message: AI_MESSAGES.error, failed };
}
