import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ANTHROPIC_VERSION,
  aiProviderStatus,
  availableAiProviders,
  buildProviderRequest,
  readProviderConfig,
  readProviderResponse,
  runAiAnswer,
} from "./ai.server.ts";
import type { AiContextItem } from "./ai.shared.ts";

const context: AiContextItem[] = [
  { source: "web", title: "One", url: "https://a.example/1", snippet: "First result." },
  { source: "images", title: "Two", url: "https://b.example/2", snippet: "Image found on b.example" },
];

const ALL = { XAI_API_KEY: "x-key", OPENAI_API_KEY: "o-key", ANTHROPIC_API_KEY: "a-key" };

function body(init: RequestInit): Record<string, unknown> {
  return JSON.parse(String(init.body));
}

function headers(init: RequestInit): Record<string, string> {
  return init.headers as Record<string, string>;
}

type Call = { url: string; body: Record<string, unknown> };

/** A fake fetch: each provider host answers with a canned response or a failure. */
function fakeFetch(fail: string[] = []) {
  const calls: Call[] = [];
  const fetcher = (async (url: string | URL, init?: RequestInit) => {
    const href = String(url);
    calls.push({ url: href, body: body(init ?? {}) });
    const provider = href.includes("x.ai") ? "grok" : href.includes("openai") ? "openai" : "claude";
    if (fail.includes(provider)) return new Response("nope", { status: 500 });
    const text = `${provider} says hi [1].`;
    const payload =
      provider === "claude"
        ? { model: "claude-test", content: [{ type: "text", text }] }
        : { model: `${provider}-test`, choices: [{ message: { content: text } }] };
    return Response.json(payload);
  }) as typeof fetch;
  return { fetcher, calls };
}

describe("provider config", () => {
  it("only lists providers with a key, in Grok, OpenAI, Claude order", () => {
    assert.deepEqual(availableAiProviders({}), []);
    assert.deepEqual(availableAiProviders({ ANTHROPIC_API_KEY: "a", OPENAI_API_KEY: "o" }), ["openai", "claude"]);
    assert.deepEqual(availableAiProviders({ XAI_API_KEY: "  " }), []);
  });

  it("uses fast defaults and honours model and base URL overrides", () => {
    assert.equal(readProviderConfig("grok", ALL)?.model, "grok-4.3");
    assert.equal(readProviderConfig("openai", ALL)?.model, "gpt-6-luna");
    assert.equal(readProviderConfig("claude", ALL)?.model, "claude-sonnet-5-5");
    const custom = readProviderConfig("openai", { ...ALL, OPENAI_MODEL: "gpt-6.1-sol", OPENAI_BASE_URL: "http://mock/v1/" });
    assert.equal(custom?.model, "gpt-6.1-sol");
    assert.equal(custom?.baseUrl, "http://mock/v1");
    // A custom model does not get the default model's effort setting.
    assert.equal(custom?.effort, undefined);
  });

  it("sets up ChatGPT and Claude through the AI Gateway when they have no key of their own", () => {
    const env = { AI_GATEWAY_API_KEY: "gateway-key" };
    assert.deepEqual(availableAiProviders(env), ["openai", "claude"]);
    assert.equal(readProviderConfig("grok", env), null);

    const openai = readProviderConfig("openai", env)!;
    assert.equal(openai.model, "openai/gpt-4.1-mini");
    assert.equal(openai.baseUrl, "https://ai-gateway.vercel.sh/v1");
    const openaiRequest = buildProviderRequest(openai, "dogs", context);
    assert.equal(openaiRequest.url, "https://ai-gateway.vercel.sh/v1/chat/completions");
    assert.equal(headers(openaiRequest.init).Authorization, "Bearer gateway-key");
    assert.equal(body(openaiRequest.init).temperature, undefined);

    const claude = readProviderConfig("claude", env)!;
    assert.equal(claude.model, "anthropic/claude-3-haiku");
    assert.equal(claude.api, "chat");
    const claudeRequest = buildProviderRequest(claude, "dogs", context);
    assert.equal(claudeRequest.url, "https://ai-gateway.vercel.sh/v1/chat/completions");
    assert.equal(headers(claudeRequest.init).Authorization, "Bearer gateway-key");
    assert.equal(headers(claudeRequest.init)["x-api-key"], undefined);

    // A provider's own key still talks to that provider, not the gateway.
    assert.equal(readProviderConfig("claude", { ...env, ANTHROPIC_API_KEY: "a-key" })?.baseUrl, "https://api.anthropic.com/v1");
    assert.ok(!JSON.stringify(aiProviderStatus(env)).includes("gateway-key"));
  });

  it("reports availability and models but never keys", () => {
    const status = aiProviderStatus({ OPENAI_API_KEY: "secret-openai" });
    assert.deepEqual(
      status.map((row) => [row.id, row.available]),
      [
        ["grok", false],
        ["openai", true],
        ["claude", false],
      ],
    );
    assert.ok(!JSON.stringify(status).includes("secret-openai"));
  });
});

describe("provider requests", () => {
  it("calls xAI chat completions with a bearer key", () => {
    const request = buildProviderRequest(readProviderConfig("grok", ALL)!, "dogs", context);
    assert.equal(request.url, "https://api.x.ai/v1/chat/completions");
    assert.equal(headers(request.init).Authorization, "Bearer x-key");
    assert.equal(body(request.init).model, "grok-4.3");
  });

  it("calls OpenAI chat completions with max_completion_tokens and no temperature", () => {
    const request = buildProviderRequest(readProviderConfig("openai", ALL)!, "dogs", context);
    const sent = body(request.init);
    assert.equal(request.url, "https://api.openai.com/v1/chat/completions");
    assert.equal(headers(request.init).Authorization, "Bearer o-key");
    assert.equal(sent.model, "gpt-6-luna");
    assert.equal(typeof sent.max_completion_tokens, "number");
    assert.equal(sent.temperature, undefined);
    assert.equal(sent.max_tokens, undefined);
    assert.equal(sent.reasoning_effort, "low");
  });

  it("calls Anthropic's Messages API with x-api-key and anthropic-version", () => {
    const request = buildProviderRequest(readProviderConfig("claude", ALL)!, "dogs", context);
    const sent = body(request.init);
    assert.equal(request.url, "https://api.anthropic.com/v1/messages");
    assert.equal(headers(request.init)["x-api-key"], "a-key");
    assert.equal(headers(request.init)["anthropic-version"], ANTHROPIC_VERSION);
    assert.equal(headers(request.init).Authorization, undefined);
    assert.equal(typeof sent.system, "string");
    assert.equal(sent.temperature, undefined);
    assert.deepEqual(sent.output_config, { effort: "low" });
    assert.match(String((sent.messages as Array<{ content: string }>)[0].content), /\[2\] Two \(Images/);
  });

  it("reads text from both response shapes", () => {
    const claude = readProviderConfig("claude", ALL)!;
    assert.deepEqual(
      readProviderResponse(claude, { model: "m", content: [{ type: "thinking" }, { type: "text", text: "Hi [1]." }] }),
      { raw: "Hi [1].", model: "m" },
    );
    const grok = readProviderConfig("grok", ALL)!;
    assert.equal(readProviderResponse(grok, { choices: [{ message: { content: " Yo " } }] }).raw, "Yo");
  });
});

describe("runAiAnswer", () => {
  it("says not set up when no provider has a key, without calling anything", async () => {
    const { fetcher, calls } = fakeFetch();
    const answer = await runAiAnswer("dogs", context, undefined, { env: {}, fetcher });
    assert.equal(answer.status, "unconfigured");
    assert.equal(calls.length, 0);
  });

  it("asks only the picked provider when it answers", async () => {
    const { fetcher, calls } = fakeFetch();
    const answer = await runAiAnswer("dogs", context, "claude", { env: ALL, fetcher });
    assert.equal(answer.status, "ok");
    assert.ok(answer.status === "ok" && answer.provider === "claude" && answer.failed.length === 0);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /anthropic/);
  });

  it("falls back to the next set-up provider and reports who answered", async () => {
    const { fetcher, calls } = fakeFetch(["grok"]);
    const answer = await runAiAnswer("dogs", context, undefined, { env: ALL, fetcher });
    assert.ok(answer.status === "ok");
    assert.equal(answer.provider, "openai");
    assert.deepEqual(answer.failed, ["grok"]);
    assert.equal(answer.citations[0].url, "https://a.example/1");
    assert.equal(calls.length, 2);
  });

  it("skips providers without a key and errors when every set-up provider fails", async () => {
    const { fetcher, calls } = fakeFetch(["openai", "claude"]);
    const answer = await runAiAnswer("dogs", context, "grok", {
      env: { OPENAI_API_KEY: "o", ANTHROPIC_API_KEY: "a" },
      fetcher,
    });
    assert.equal(answer.status, "error");
    assert.deepEqual(answer.status === "error" ? answer.failed : [], ["openai", "claude"]);
    assert.equal(calls.length, 2);
  });
});
