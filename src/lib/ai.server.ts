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
  AI_QUESTION_PROMPT,
  aiModelOf,
  aiProviderOf,
  aiProviderOrder,
  AI_DEFAULT_TIMEOUT_MS,
  buildAiPrompt,
  modelNote,
  modelReady,
  parseAiAnswer,
  type AiAnswer,
  type AiAttempt,
  type AiFailureKind,
  type AiContextItem,
  type AiKeyFlags,
  type AiModelStatus,
  type AiProviderId,
  type AiProviderStatus,
  type AnswerProviderId,
} from "./ai.shared.ts";
import { graphAnswerBrief } from "./graph.ts";
import { LANGS } from "./i18n.ts";

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
  meta: {
    id: "meta",
    api: "chat",
    keyVar: "MODEL_API_KEY",
    modelVar: "META_MODEL",
    baseVar: "META_BASE_URL",
    defaultBase: "https://api.meta.ai/v1",
    defaultModel: "muse-spark-1.3",
    defaultEffort: "low",
    effortVar: "META_REASONING_EFFORT",
  },
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
/** Reasoning models without their own `timeoutMs` (a custom effort) think first, so they get longer. */
const AI_REASONING_TIMEOUT_MS = 35_000;
/**
 * Everything one answer may take, fallbacks included. Stays under the function's maxDuration (60 s,
 * set in vite.config.ts) with room to send the reply.
 */
export const AI_TOTAL_MS = 52_000;
/** When the pick is a slow model still thinking after this long, the fallback starts alongside it. */
export const AI_HEDGE_MS = 15_000;
/** A call with less time than this left is not started. */
const MIN_CALL_MS = 4_000;
/** Pause before the one retry after a provider 5xx. */
const RETRY_DELAY_MS = 500;

/** Server errors worth one more try (not 504, which is already a timeout). */
function isRetryable(attempt: AiAttempt): boolean {
  return attempt.kind === "server" && attempt.status !== undefined && attempt.status !== 504;
}
/** Room for a detailed answer plus any reasoning tokens the model spends first. */
const MAX_OUTPUT_TOKENS = 2200;
/** Extra room for the hidden reasoning tokens a reasoning model spends before it writes. */
const REASONING_TOKENS = 3000;
/** OpenAI-compatible endpoint. One key covers ChatGPT and Claude when they have no key of their own. */
const AI_GATEWAY_BASE = "https://ai-gateway.vercel.sh/v1";
/** Models the current AI Gateway plan can call. Direct provider keys still use their own defaults. */
const AI_GATEWAY_MODELS = {
  openai: "openai/gpt-4.1-mini",
  // Claude 3 Haiku was retired by Anthropic on Apr 20, 2026; the gateway still lists it but calls
  // fail with HTTP 500 (AI_APICallError). Haiku 4.5 is Anthropic's named replacement.
  claude: "anthropic/claude-haiku-4.5",
} as const;

export type ProviderConfig = {
  id: AnswerProviderId;
  api: ProviderSpec["api"];
  apiKey: string;
  baseUrl: string;
  model: string;
  effort?: string;
  /** Per-call limit; defaults to AI_DEFAULT_TIMEOUT_MS (35 s for a custom reasoning effort). */
  timeoutMs?: number;
  /** True when this call goes through Vercel AI Gateway instead of the provider's own API. */
  gateway?: boolean;
};

export function readProviderConfig(id: AiProviderId, env: Env = process.env): ProviderConfig | null {
  const spec = AI_PROVIDER_SPECS[id];
  const ownKey = env[spec.keyVar]?.trim();
  const gatewayKey = id === "grok" || id === "meta" ? "" : env.AI_GATEWAY_API_KEY?.trim() || "";
  if (!ownKey && !gatewayKey) return null;
  const viaGateway = !ownKey;
  const model =
    env[spec.modelVar]?.trim() || (viaGateway && (id === "openai" || id === "claude") ? AI_GATEWAY_MODELS[id] : spec.defaultModel);
  // Effort only goes to the provider's own API. Through the gateway it would become a `reasoning`
  // object, which non-reasoning defaults (GPT-4.1 mini, Claude Haiku 4.5) don't take.
  const effort = viaGateway
    ? undefined
    : (spec.effortVar && env[spec.effortVar]?.trim()) || (model === spec.defaultModel ? spec.defaultEffort : undefined);
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

/** How long a model the AI Gateway refused for the account's plan stays marked "needs a paid plan". */
const PLAN_BLOCK_MS = 6 * 60 * 60_000;
/** Gateway model id -> until when it is treated as refused, and what the gateway said (per server instance). */
const gatewayPlanBlocks = new Map<string, { until: number; attempt?: AiAttempt }>();

/**
 * Whether a failed AI Gateway reply means "this model is not on your plan / out of paid credits",
 * as opposed to a bad key, a bad request, or an outage. Exported for tests.
 */
export function isPlanRefusal(status: number, body: string): boolean {
  if (status === 402) return true;
  if (status !== 400 && status !== 403) return false;
  return /\b(paid|plan|credits?|billing|upgrade|free (tier|plan|credits))\b/i.test(body);
}

export function markGatewayPlanBlocked(gatewayModel: string, now = Date.now(), attempt?: AiAttempt) {
  gatewayPlanBlocks.set(gatewayModel, { until: now + PLAN_BLOCK_MS, ...(attempt ? { attempt } : {}) });
}

/** The refusal that blocked this gateway model, while the block lasts. */
function planBlockFor(gatewayModel: string | undefined, now = Date.now()): AiAttempt | undefined {
  const block = gatewayModel ? gatewayPlanBlocks.get(gatewayModel) : undefined;
  return block && block.until > now ? block.attempt : undefined;
}

/** Menu model ids the gateway has refused for this plan recently. */
export function planBlockedModels(now = Date.now()): Set<string> {
  const out = new Set<string>();
  for (const spec of AI_MODELS) {
    const until = spec.gateway ? gatewayPlanBlocks.get(spec.gateway)?.until : undefined;
    if (until === undefined) continue;
    if (until > now) out.add(spec.id);
    else gatewayPlanBlocks.delete(spec.gateway!);
  }
  return out;
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
    meta: Boolean(env.MODEL_API_KEY?.trim()),
    grok: Boolean(env.XAI_API_KEY?.trim()),
    openai: Boolean(env.OPENAI_API_KEY?.trim()),
    claude: Boolean(env.ANTHROPIC_API_KEY?.trim()),
    gateway: Boolean(env.AI_GATEWAY_API_KEY?.trim()),
  };
}

/** Which listed models can run with the keys on this server. Never includes the keys. */
export function aiModelStatus(env: Env = process.env): AiModelStatus[] {
  const keys = aiKeyFlags(env);
  const blocked = planBlockedModels();
  return AI_MODELS.map((spec) => {
    const note = modelNote(spec, keys, blocked);
    return { id: spec.id, label: spec.label, provider: spec.provider, available: !note, ...(note ? { note } : {}) };
  });
}

/** Config for one menu model, using the provider's own key when it has one and the gateway otherwise. */
export function configForModel(modelId: string, env: Env = process.env): ProviderConfig | null {
  const spec = AI_MODELS.find((model) => model.id === modelId);
  if (!spec || !modelReady(spec, aiKeyFlags(env), planBlockedModels())) return null;
  if (spec.provider === "gemini") {
    const apiKey = env.AI_GATEWAY_API_KEY?.trim();
    if (!apiKey || !spec.gateway) return null;
    return { id: "gemini", api: "chat", apiKey, baseUrl: AI_GATEWAY_BASE, model: spec.gateway, gateway: true };
  }
  const base = readProviderConfig(spec.provider, env);
  if (!base) return null;
  const model = base.gateway ? spec.gateway : spec.direct;
  if (!model) return null;
  return { ...base, model, effort: spec.effort, ...(spec.timeoutMs ? { timeoutMs: spec.timeoutMs } : {}) };
}

type Request = { url: string; init: RequestInit };

/** Build the HTTP request for one provider. Exported for tests; it performs no I/O. */
export function buildProviderRequest(
  config: ProviderConfig,
  query: string,
  context: AiContextItem[],
  language?: string,
  graph?: string,
): Request {
  const graphNote = graph
    ? " A graph of this search is already drawn in the answer. Describe that function in plain language. Do not say the results do not answer the search. Cite a numbered result only when it is about the same function."
    : "";
  const basePrompt = context.length ? AI_SYSTEM_PROMPT : AI_QUESTION_PROMPT;
  const system = `${language ? `${basePrompt} Write the entire answer in ${language}, even when the results are in another language.` : basePrompt}${graphNote}`;
  const prompt = buildAiPrompt(query, context, language, graph);
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
          max_tokens: outputBudget(config),
          system,
          messages: [{ role: "user", content: prompt }],
          ...(config.effort ? { output_config: { effort: config.effort } } : {}),
        }),
      },
    };
  }
  const openai = config.id === "openai" || config.id === "meta" || config.gateway === true;
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
        // The AI Gateway documents `max_tokens` and maps it per provider (to max_completion_tokens for
        // OpenAI reasoning models). OpenAI itself rejects temperature and max_tokens on reasoning
        // models and wants max_completion_tokens. Reasoning tokens count against the budget, so a
        // model with `effort` gets extra room or it can stop before writing anything.
        // xAI's reasoning models (Grok 4.7 and 4.6 always reason) take max_completion_tokens too;
        // temperature is left at their default.
        ...(config.gateway
          ? { max_tokens: outputBudget(config) }
          : openai || config.effort
            ? { max_completion_tokens: outputBudget(config) }
            : { max_tokens: outputBudget(config), temperature: 0.2 }),
        // The AI Gateway takes a unified `reasoning` object; OpenAI and xAI take `reasoning_effort`.
        ...(config.effort ? (config.gateway ? { reasoning: { effort: config.effort } } : { reasoning_effort: config.effort }) : {}),
        stream: false,
      }),
    },
  };
}

/**
 * Output-token ceilings of models that are lower than our largest budget, so a request never asks
 * for more than the model allows (a custom XAI_MODEL / OPENAI_MODEL / ANTHROPIC_MODEL included).
 */
const OUTPUT_CAPS: ReadonlyArray<[RegExp, number]> = [
  [/claude-3-(haiku|opus|sonnet)/, 4096],
  [/claude-3[.-]5/, 8192],
  [/gpt-4o-mini|gpt-4o\b/, 16_384],
];

/** Output tokens to ask for: room for the answer, plus reasoning room when the model reasons. Exported for tests. */
export function outputBudget(config: Pick<ProviderConfig, "model" | "effort">): number {
  const want = config.effort ? MAX_OUTPUT_TOKENS + REASONING_TOKENS : MAX_OUTPUT_TOKENS;
  const cap = OUTPUT_CAPS.find(([pattern]) => pattern.test(config.model))?.[1];
  return cap ? Math.min(want, cap) : want;
}

/** One model call that did not produce an answer, with a reason that is safe to show and log. */
export class AiCallError extends Error {
  kind: AiFailureKind;
  status?: number;
  detail?: string;
  constructor(kind: AiFailureKind, options: { status?: number; detail?: string } = {}) {
    super([options.status ? `HTTP ${options.status}` : "", kind, options.detail ? `"${options.detail}"` : ""].filter(Boolean).join(" "));
    this.name = "AiCallError";
    this.kind = kind;
    if (options.status !== undefined) this.status = options.status;
    if (options.detail) this.detail = options.detail;
  }
}

const DETAIL_MAX = 160;

/**
 * Make a provider's error text safe to log and show: no keys or tokens, none of the reader's
 * query, one short line. Exported for tests.
 */
export function sanitizeDetail(text: string, query = ""): string {
  let clean = text.replace(/\s+/g, " ");
  const q = query.replace(/\s+/g, " ").trim();
  if (q.length >= 3) clean = clean.split(q).join("[query]");
  clean = clean
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\b(sk|xai|vck|key|pk|rk)[-_][A-Za-z0-9_-]{8,}/gi, "[redacted]")
    .replace(/[A-Za-z0-9_-]{32,}/g, "[redacted]")
    .trim();
  return clean.length <= DETAIL_MAX ? clean : `${clean.slice(0, DETAIL_MAX - 1).trimEnd()}…`;
}

/** Pull "message (type=…, code=…)" out of an OpenAI- or Anthropic-style error body. Exported for tests. */
export function errorDetail(body: string, query = ""): string | undefined {
  let text = body.trim();
  try {
    const parsed = JSON.parse(body) as { error?: unknown; message?: unknown; type?: unknown };
    const error = (typeof parsed.error === "object" && parsed.error !== null ? parsed.error : parsed) as Record<string, unknown>;
    const message = typeof error.message === "string" ? error.message : typeof parsed.error === "string" ? parsed.error : "";
    const tags = (["type", "code"] as const)
      .map((name) => (typeof error[name] === "string" || typeof error[name] === "number" ? `${name}=${String(error[name])}` : ""))
      .filter(Boolean);
    text = [message, tags.length ? `(${tags.join(", ")})` : ""].filter(Boolean).join(" ");
  } catch {
    // Not JSON: keep the start of the text (an HTML error page is cut short below).
    if (/^<!doctype|^<html/i.test(text)) text = "";
  }
  return sanitizeDetail(text, query) || undefined;
}

/** Sort a failed HTTP reply into a reason the reader can act on. Exported for tests. */
export function classifyFailure(status: number, body: string): AiFailureKind {
  if (isPlanRefusal(status, body)) return "plan";
  if (status === 401 || status === 403) return "auth";
  // xAI answers a bad key with 400.
  if (status === 400 && /\b(api key|authentication|unauthori[sz]ed)\b/i.test(body)) return "auth";
  if (status === 404) return "not-found";
  if (status === 429) return "rate-limit";
  if (status === 408 || status === 504) return "timeout";
  if (status >= 500) return "server";
  if (status >= 400) return "bad-request";
  return "other";
}

/** Turn whatever a call threw into an attempt record. Exported for tests. */
export function attemptFrom(config: ProviderConfig, error: unknown, timeoutMs = timeoutFor(config)): AiAttempt {
  const base = { provider: config.id, model: config.model };
  if (error instanceof AiCallError) {
    return {
      ...base,
      kind: error.kind,
      ...(error.status !== undefined ? { status: error.status } : {}),
      ...(error.detail ? { detail: error.detail } : {}),
    };
  }
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return { ...base, kind: "timeout", detail: `no reply within ${Math.round(timeoutMs / 1000)} s` };
  }
  if (error instanceof TypeError) return { ...base, kind: "network", detail: sanitizeDetail(error.message) || undefined };
  if (error instanceof SyntaxError) return { ...base, kind: "other", detail: "reply was not JSON" };
  return { ...base, kind: "other", ...(error instanceof Error && error.message ? { detail: sanitizeDetail(error.message) } : {}) };
}

/** How long one call to this model may take. Exported for tests. */
export function timeoutFor(config: ProviderConfig): number {
  return config.timeoutMs ?? (config.effort ? AI_REASONING_TIMEOUT_MS : AI_DEFAULT_TIMEOUT_MS);
}

/** One line for the server log: provider, model, and why. Never the key or the reader's text. */
export function attemptLogLine(attempt: AiAttempt): string {
  const why = [attempt.status ? `HTTP ${attempt.status}` : "", attempt.kind, attempt.detail ? `"${attempt.detail}"` : ""]
    .filter(Boolean)
    .join(" ");
  return `[ai] ${attempt.provider} ${attempt.model} failed: ${why}`;
}

type ChatCompletion = { model?: string; choices?: Array<{ finish_reason?: string; message?: { content?: string | null } }> };
type AnthropicMessage = { model?: string; content?: Array<{ type?: string; text?: string }> };

/** Pull the answer text and model name out of a provider response. Exported for tests. */
export function readProviderResponse(
  config: ProviderConfig,
  body: unknown,
): { raw: string; model: string; finishReason?: string } {
  if (config.api === "anthropic") {
    const message = body as AnthropicMessage;
    const raw = (message.content ?? [])
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text)
      .join(" ")
      .trim();
    const stop = (body as { stop_reason?: unknown }).stop_reason;
    return { raw, model: message.model || config.model, ...(typeof stop === "string" ? { finishReason: stop } : {}) };
  }
  const completion = body as ChatCompletion;
  const choice = completion.choices?.[0];
  return {
    raw: choice?.message?.content?.trim() ?? "",
    model: completion.model || config.model,
    ...(choice?.finish_reason ? { finishReason: choice.finish_reason } : {}),
  };
}

/** Every page language, English included (Grokipedia queries are translated into English). */
const TRANSLATE_NAMES: Record<string, string> = Object.fromEntries(LANGS.map((item) => [item.code, item.english]));

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

const TRANSLATE_TIMEOUT_MS = 45_000;
/** Long passages are split into pieces about this long so every reply fits its token budget. */
const TRANSLATE_CHUNK_CHARS = 1800;
/** Pieces translated at the same time. */
const TRANSLATE_PARALLEL = 5;
/** A provider that refused or timed out is tried last for this long. */
const TRANSLATE_COOLDOWN_MS = 5 * 60_000;
const translateCooldown = new Map<string, number>();

/**
 * Providers for translation, fastest first: GPT-4.1 mini (own key or AI Gateway), then Grok, then
 * Gemini Flash Lite on the gateway, then any other chat-style provider that is set up.
 */
export function translateConfigs(env: Env = process.env): ProviderConfig[] {
  const list = [
    configForModel("gpt-4.1-mini", env),
    readProviderConfig("grok", env),
    configForModel("gemini-2.5-flash-lite", env),
    readProviderConfig("openai", env),
    readProviderConfig("claude", env),
  ];
  const seen = new Set<string>();
  const out: ProviderConfig[] = [];
  for (const config of list) {
    if (!config || config.api !== "chat") continue;
    const key = `${config.id}:${config.model}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(config);
  }
  return out;
}

function failureReason(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") return "timeout";
    return error.message.slice(0, 60) || "error";
  }
  return "error";
}

/** Thrown when every provider failed; the message lists each provider's reason (never keys or text). */
export class TranslateError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "TranslateError";
  }
}

/**
 * One chat completion for translation, trying each set-up provider until one answers. Throws a
 * TranslateError naming why each provider failed.
 */
async function translateCall(
  system: string,
  user: string,
  maxTokens: number,
  options: { env?: Env; fetcher?: typeof fetch; now?: number } = {},
): Promise<string> {
  const env = options.env ?? process.env;
  const fetcher = options.fetcher ?? fetch;
  const configs = translateConfigs(env);
  if (!configs.length) throw new TranslateError("unconfigured: no AI key is set on this server");
  const now = options.now ?? Date.now();
  const cooling = (config: ProviderConfig) => (translateCooldown.get(`${config.id}:${config.model}`) ?? 0) > now;
  const ordered = [...configs.filter((config) => !cooling(config)), ...configs.filter(cooling)];
  const reasons: string[] = [];
  for (const config of ordered) {
    const openai = config.id === "openai" || config.id === "gemini" || config.gateway === true;
    try {
      const response = await fetcher(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          ...(openai ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens, temperature: 0 }),
          stream: false,
        }),
        signal: AbortSignal.timeout(TRANSLATE_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const completion = await response.json();
      if ((completion as ChatCompletion).choices?.[0]?.finish_reason === "length") {
        throw new Error("truncated reply");
      }
      const { raw } = readProviderResponse(config, completion);
      const text = stripFences(raw);
      if (!text) throw new Error("empty reply");
      translateCooldown.delete(`${config.id}:${config.model}`);
      return text;
    } catch (error) {
      const reason = failureReason(error);
      reasons.push(`${config.id} (${config.model}): ${reason}`);
      if (reason === "timeout" || /^HTTP (40[0-4]|429|5\d\d)$/.test(reason)) {
        translateCooldown.set(`${config.id}:${config.model}`, now + TRANSLATE_COOLDOWN_MS);
      }
    }
  }
  const message = reasons.join("; ");
  // Status only: never the key and never the reader's text.
  console.warn(`[translate] all providers failed: ${message}`);
  throw new TranslateError(message);
}

function stripFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```[a-z]*\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

/** Split text into pieces of at most `size` characters at paragraph, then line, then sentence breaks. Exported for tests. */
export function splitForTranslation(text: string, size = TRANSLATE_CHUNK_CHARS): string[] {
  const chunks: string[] = [];
  let current = "";
  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };
  const add = (piece: string, joiner: string) => {
    if (!piece.trim()) return;
    if (current && current.length + joiner.length + piece.length > size) flush();
    if (piece.length <= size) {
      current = current ? `${current}${joiner}${piece}` : piece;
      return;
    }
    // A single piece longer than the limit: break it at sentence ends, then hard-wrap.
    flush();
    const sentences = piece.match(/[^.!?。！？।؟]+[.!?。！？।؟]*\s*/g) ?? [piece];
    for (const sentence of sentences) {
      if (current.length + sentence.length > size) flush();
      if (sentence.length > size) {
        for (let at = 0; at < sentence.length; at += size) chunks.push(sentence.slice(at, at + size).trim());
      } else current += sentence;
    }
    flush();
  };
  for (const paragraph of text.split(/\n{2,}/)) add(paragraph.trim(), "\n\n");
  flush();
  return chunks.filter(Boolean);
}

async function mapLimit<T, R>(items: T[], limit: number, run: (item: T, index: number) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      try {
        results[index] = { status: "fulfilled", value: await run(items[index] as T, index) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function translatePrompt(language: string): string {
  return (
    `You are a translator. Translate the user's text into ${language}. Reply with the translation only: ` +
    "no notes, no quotes, no preamble. Keep the line breaks. Lines that start with # are headings: keep the # marks " +
    "and translate the words after them. Keep names, dates, numbers, and web addresses."
  );
}

/** Output budget for one piece: generous, because some scripts take several tokens per word. */
function tokenBudget(chars: number): number {
  return Math.min(8000, Math.max(800, Math.ceil(chars * 3)));
}

/** Translate a short search query. Throws a TranslateError when no provider could do it. */
export async function translateQuery(
  query: string,
  lang: string,
  options: { env?: Env; fetcher?: typeof fetch } = {},
): Promise<string> {
  const language = TRANSLATE_NAMES[lang];
  if (!language) return query;
  const system =
    `Translate this web search query into ${language}. Reply with the translated query only, on one line, ` +
    "with no quotes or notes. If it is already in that language, repeat it unchanged.";
  const raw = await translateCall(system, query, 1000, options);
  return raw.split("\n")[0]?.replace(/^["“”'«»]+|["“”'«»]+$/g, "").replace(/\s+/g, " ").trim() || query;
}

/**
 * Translate a list of short strings (result titles and snippets) in one call. Throws a
 * TranslateError when no provider could do it or the reply does not line up.
 */
export async function translateList(
  items: string[],
  lang: string,
  options: { env?: Env; fetcher?: typeof fetch } = {},
): Promise<string[]> {
  const language = TRANSLATE_NAMES[lang];
  if (!language || items.length === 0) return items;
  const system =
    `Translate each string in the JSON array into ${language}. Reply with only a JSON array of strings, ` +
    "the same length and in the same order. Keep empty strings empty. Keep names, dates, and numbers.";
  const input = JSON.stringify(items);
  const raw = await translateCall(system, input, tokenBudget(input.length), options);
  const parsed = readStringArray(raw);
  if (!parsed || parsed.length !== items.length) throw new TranslateError("reply did not match the list");
  return parsed.map((value, index) => value.trim() || (items[index] ?? ""));
}

/** Pull a JSON array of strings out of a model reply. Exported for tests. */
export function readStringArray(raw: string): string[] | null {
  const trimmed = stripFences(raw);
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    if (!Array.isArray(parsed)) return null;
    if (!parsed.every((value) => typeof value === "string")) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Translate a preview title and passage (Grokipedia or Wikipedia article text, web page text).
 * Long text is split into pieces translated side by side, so a long article never overruns one
 * reply. Pieces that fail stay in the original language and `partial` is set; when nothing could be
 * translated it throws a TranslateError that says why.
 */
export async function runTranslate(
  input: { lang: string; title: string; text: string },
  options: { env?: Env; fetcher?: typeof fetch } = {},
): Promise<{ title: string; text: string; partial?: boolean }> {
  const language = TRANSLATE_NAMES[input.lang];
  if (!language) return { title: input.title, text: input.text };
  const system = translatePrompt(language);
  const pieces = [input.title, ...splitForTranslation(input.text)];
  const settled = await mapLimit(pieces, TRANSLATE_PARALLEL, (piece) =>
    translateCall(system, piece, tokenBudget(piece.length), options),
  );
  const done = settled.filter((row) => row.status === "fulfilled").length;
  if (done === 0) {
    const first = settled.find((row): row is PromiseRejectedResult => row.status === "rejected");
    throw first?.reason instanceof Error ? first.reason : new TranslateError("translation failed");
  }
  const out = settled.map((row, index) =>
    row.status === "fulfilled" ? row.value : (pieces[index] ?? ""),
  );
  const title = (out[0] ?? input.title).split("\n")[0]?.replace(/^#+\s*/, "").trim() || input.title;
  return {
    title: title.slice(0, 240),
    text: out.slice(1).join("\n\n"),
    ...(done < pieces.length ? { partial: true } : {}),
  };
}

async function askProvider(
  config: ProviderConfig,
  query: string,
  context: AiContextItem[],
  fetcher: typeof fetch,
  language?: string,
  limits: { timeoutMs?: number; signal?: AbortSignal } = {},
  graph?: string,
) {
  const request = buildProviderRequest(config, query, context, language, graph);
  const timeout = AbortSignal.timeout(limits.timeoutMs ?? timeoutFor(config));
  const signal = limits.signal ? AbortSignal.any([timeout, limits.signal]) : timeout;
  const response = await fetcher(request.url, { ...request.init, signal });
  // Keep the status and the provider's own short message; never the key, and never the reader's query.
  if (!response.ok) {
    const body = (await response.text().catch(() => "")).slice(0, 4000);
    const kind = classifyFailure(response.status, body);
    const error = new AiCallError(kind, { status: response.status, detail: errorDetail(body, query) });
    if (config.gateway && kind === "plan") markGatewayPlanBlocked(config.model, Date.now(), attemptFrom(config, error));
    throw error;
  }
  const { raw, model, finishReason } = readProviderResponse(config, await response.json());
  const parsed = parseAiAnswer(raw, context);
  if (!parsed.text) {
    throw new AiCallError("empty", { detail: finishReason ? `finish_reason=${sanitizeDetail(finishReason)}` : "no text in reply" });
  }
  return { ...parsed, model };
}

type Answered = Awaited<ReturnType<typeof askProvider>> & { config: ProviderConfig };

/**
 * Ask for a short cited answer. Tries the reader's pick first, then the other set-up providers.
 * When the pick is a slow model (its own limit is longer than the hedge point) and it is still
 * thinking after AI_HEDGE_MS, the fallback chain starts alongside it: the pick still wins if it
 * answers within its limit, and if it doesn't, the fallback's answer is usually ready already.
 * The whole thing stays within AI_TOTAL_MS. Never throws: failures come back as a status the card
 * can show.
 */
export async function runAiAnswer(
  query: string,
  context: AiContextItem[],
  preferred?: string,
  options: { env?: Env; fetcher?: typeof fetch; answerLanguage?: string; totalMs?: number; hedgeMs?: number; minCallMs?: number; retryDelayMs?: number } = {},
): Promise<AiAnswer> {
  const env = options.env ?? process.env;
  const fetcher = options.fetcher ?? fetch;
  const graph = graphAnswerBrief(query);
  const totalMs = options.totalMs ?? AI_TOTAL_MS;
  const hedgeMs = options.hedgeMs ?? AI_HEDGE_MS;
  const minCallMs = options.minCallMs ?? MIN_CALL_MS;
  const retryDelayMs = options.retryDelayMs ?? RETRY_DELAY_MS;
  const started = Date.now();
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
  const before: AiAttempt[] = [];
  const pickedSpec = modelId ? AI_MODELS.find((model) => model.id === modelId) : undefined;
  if (pickedSpec) {
    const config = configForModel(pickedSpec.id, env);
    if (config) push(config);
    else {
      // The pick can't be called right now. Say so instead of quietly answering with another model.
      const blocked = planBlockFor(pickedSpec.gateway);
      before.push(
        blocked
          ? { ...blocked, detail: sanitizeDetail(`refused earlier on this server${blocked.detail ? `: ${blocked.detail}` : ""}`) }
          : {
              provider: pickedSpec.provider,
              model: pickedSpec.id,
              kind: "unavailable",
              detail: modelNote(pickedSpec, aiKeyFlags(env), planBlockedModels()) ?? "not set up on this server",
            },
      );
    }
  }
  for (const id of order) push(readProviderConfig(id, env));
  const picked = pickedSpec ? { picked: pickedSpec.id } : {};
  if (!queue.length) return { status: "unconfigured", message: AI_MESSAGES.unconfigured, ...picked };

  const remaining = () => totalMs - (Date.now() - started);
  /** Try each model in turn until one answers; failures go into `log`. */
  const chain = async (configs: ProviderConfig[], log: AiAttempt[], stop?: AbortSignal): Promise<Answered | null> => {
    for (const config of configs) {
      if (stop?.aborted) return null;
      const left = remaining();
      if (left < minCallMs) {
        log.push({ provider: config.id, model: config.model, kind: "timeout", detail: "not tried: out of time" });
        continue;
      }
      let retried = false;
      for (;;) {
        const timeoutMs = Math.min(timeoutFor(config), remaining());
        try {
          const answer = await askProvider(config, query, context, fetcher, options.answerLanguage, { timeoutMs, signal: stop }, graph ?? undefined);
          return { ...answer, config };
        } catch (error) {
          if (stop?.aborted) return null;
          const attempt = attemptFrom(config, error, timeoutMs);
          // A 5xx is often a passing provider hiccup: try the same model once more if there's time.
          if (!retried && isRetryable(attempt) && remaining() >= minCallMs + retryDelayMs) {
            retried = true;
            console.error(`${attemptLogLine(attempt)} (retrying once)`);
            await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
            if (stop?.aborted) return null;
            continue;
          }
          if (retried) attempt.detail = sanitizeDetail(`${attempt.detail ? `${attempt.detail} ` : ""}(failed twice)`);
          console.error(attemptLogLine(attempt));
          log.push(attempt);
          break;
        }
      }
    }
    return null;
  };

  const [first, ...rest] = queue as [ProviderConfig, ...ProviderConfig[]];
  const firstLog: AiAttempt[] = [];
  const restLog: AiAttempt[] = [];
  const firstRun = chain([first], firstLog);
  let winner: Answered | null;
  if (rest.length && timeoutFor(first) > hedgeMs) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const hedge = new Promise<"hedge">((resolve) => {
      timer = setTimeout(() => resolve("hedge"), hedgeMs);
    });
    const early = await Promise.race([firstRun, hedge]);
    clearTimeout(timer);
    if (early !== "hedge") {
      winner = early ?? (await chain(rest, restLog));
    } else {
      // The pick is still thinking: start the fallback now, but prefer the pick if it answers in time.
      const stopRest = new AbortController();
      const restRun = chain(rest, restLog, stopRest.signal);
      winner = await firstRun;
      if (winner) {
        stopRest.abort();
        restLog.length = 0;
      } else {
        winner = await restRun;
      }
    }
  } else {
    winner = (await firstRun) ?? (await chain(rest, restLog));
  }

  const attempts = [...before, ...firstLog, ...restLog];
  const failed: AnswerProviderId[] = [];
  for (const attempt of attempts) if (!failed.includes(attempt.provider)) failed.push(attempt.provider);
  if (!winner) return { status: "error", message: AI_MESSAGES.error, failed, ...picked, attempts };
  const { config, ...answer } = winner;
  const requested = pickedProvider ?? providerPref;
  return { status: "ok", ...answer, provider: config.id, ...(requested ? { requested } : {}), failed, ...picked, attempts };
}
