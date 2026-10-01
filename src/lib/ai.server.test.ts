import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ANTHROPIC_VERSION,
  aiProviderStatus,
  availableAiProviders,
  buildProviderRequest,
  aiModelStatus,
  configForModel,
  attemptFrom,
  attemptLogLine,
  classifyFailure,
  errorDetail,
  isPlanRefusal,
  sanitizeDetail,
  timeoutFor,
  planBlockedModels,
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
    // Claude Sonnet runs through the gateway too, until the gateway refuses it for the plan (tested below).
    assert.equal(configForModel("claude-sonnet-5.5", env)?.model, "anthropic/claude-sonnet-5.5");
    assert.equal(configForModel("gpt-4o-mini", env)?.model, "openai/gpt-4o-mini");
    assert.equal(configForModel("gemini-2.5-flash-lite", env)?.model, "google/gemini-2.5-flash-lite");
    assert.equal(configForModel("grok-4.7", { XAI_API_KEY: "x-key" })?.model, "grok-4.7");
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

  it("asks the chosen model instead of the provider default", async () => {
    const { fetcher, calls } = fakeFetch();
    const answer = await runAiAnswer("dogs", context, "grok-4.7", { env: ALL, fetcher });
    assert.equal(answer.status, "ok");
    assert.equal(calls[0].body.model, "grok-4.7");
    assert.equal(calls.length, 1);
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

describe("GPT-6 Astra and Claude through the AI Gateway", () => {
  const GATEWAY = { XAI_API_KEY: "x", AI_GATEWAY_API_KEY: "g-key" };

  it("sends the exact gateway model ids, low reasoning effort for Astra, and no temperature", () => {
    const astra = configForModel("gpt-6-astra", GATEWAY);
    assert.ok(astra);
    const request = buildProviderRequest(astra, "dogs", context);
    assert.equal(request.url, "https://ai-gateway.vercel.sh/v1/chat/completions");
    assert.equal(headers(request.init).Authorization, "Bearer g-key");
    const sent = body(request.init);
    assert.equal(sent.model, "openai/gpt-6-astra");
    assert.deepEqual(sent.reasoning, { effort: "low" });
    assert.equal(sent.reasoning_effort, undefined);
    assert.equal(sent.temperature, undefined);
    // The gateway documents max_tokens; reasoning tokens need room on top of the answer.
    assert.equal(sent.max_tokens, 4200);
    assert.equal(sent.max_completion_tokens, undefined);
    assert.equal(sent.stream, false);

    for (const [id, model] of [
      ["claude-sonnet-5.5", "anthropic/claude-sonnet-5.5"],
      ["claude-haiku-4.5", "anthropic/claude-haiku-4.5"],
    ] as const) {
      const config = configForModel(id, GATEWAY);
      assert.ok(config, id);
      const claude = body(buildProviderRequest(config, "dogs", context).init);
      assert.equal(claude.model, model);
      assert.equal(claude.reasoning, undefined);
      assert.equal(claude.max_tokens, 1200);
      assert.equal(claude.max_completion_tokens, undefined);
      assert.equal(claude.temperature, undefined);
    }
  });

  it("uses OpenAI's and Anthropic's own ids with their own keys", () => {
    const astra = configForModel("gpt-6-astra", { OPENAI_API_KEY: "o" });
    assert.ok(astra);
    const sent = body(buildProviderRequest(astra, "dogs", context).init);
    assert.equal(sent.model, "gpt-6-astra");
    assert.equal(sent.reasoning_effort, "low");
    assert.equal(sent.max_completion_tokens, 4200);
    assert.equal(sent.max_tokens, undefined);
    assert.equal(sent.temperature, undefined);
    const haiku = configForModel("claude-haiku-4.5", { ANTHROPIC_API_KEY: "a" });
    assert.ok(haiku);
    const request = buildProviderRequest(haiku, "dogs", context);
    assert.match(request.url, /api\.anthropic\.com\/v1\/messages$/);
    assert.equal(body(request.init).model, "claude-haiku-4-5");
  });

  it("tells plan refusals apart from other failures", () => {
    assert.equal(isPlanRefusal(402, ""), true);
    assert.equal(isPlanRefusal(403, '{"error":{"message":"This model requires a paid plan. Purchase credits to continue."}}'), true);
    assert.equal(isPlanRefusal(403, "forbidden"), false);
    assert.equal(isPlanRefusal(401, "invalid api key"), false);
    assert.equal(isPlanRefusal(500, "paid plan"), false);
  });

  it("answers with the picked model, and after a plan refusal falls back and marks it 'needs a paid plan'", async () => {
    const calls: string[] = [];
    const fetcher = (async (_url: string | URL, init?: RequestInit) => {
      const model = String(body(init ?? {}).model);
      calls.push(model);
      if (model === "anthropic/claude-sonnet-5.5") {
        return Response.json({ error: { message: "Free credits cannot be used with this model. Upgrade to a paid plan." } }, { status: 403 });
      }
      return Response.json({ model, choices: [{ message: { content: `${model} says hi [1].` } }] });
    }) as typeof fetch;

    const astra = await runAiAnswer("dogs", context, "gpt-6-astra", { env: GATEWAY, fetcher });
    assert.ok(astra.status === "ok");
    assert.equal(astra.model, "openai/gpt-6-astra");
    assert.equal(astra.provider, "openai");

    const haiku = await runAiAnswer("dogs", context, "claude-haiku-4.5", { env: GATEWAY, fetcher });
    assert.ok(haiku.status === "ok" && haiku.model === "anthropic/claude-haiku-4.5");

    assert.ok(!planBlockedModels().has("claude-sonnet-5.5"));
    const sonnet = await runAiAnswer("dogs", context, "claude-sonnet-5.5", { env: GATEWAY, fetcher });
    assert.ok(sonnet.status === "ok");
    assert.equal(sonnet.provider, "claude", "falls back to the gateway's Claude default");
    assert.equal(sonnet.model, "anthropic/claude-3-haiku");
    assert.equal(sonnet.picked, "claude-sonnet-5.5");
    assert.deepEqual(sonnet.attempts?.map((a) => [a.model, a.kind, a.status]), [["anthropic/claude-sonnet-5.5", "plan", 403]]);
    assert.match(sonnet.attempts?.[0]?.detail ?? "", /Free credits cannot be used/);
    assert.ok(planBlockedModels().has("claude-sonnet-5.5"));
    // Picked again while blocked: still named as the model that didn't answer, with the earlier reason.
    const again = await runAiAnswer("dogs", context, "claude-sonnet-5.5", { env: GATEWAY, fetcher });
    assert.ok(again.status === "ok");
    assert.equal(again.attempts?.[0]?.kind, "plan");
    assert.match(again.attempts?.[0]?.detail ?? "", /^refused earlier on this server: .*Free credits/);
    const row = aiModelStatus(GATEWAY).find((model) => model.id === "claude-sonnet-5.5");
    assert.deepEqual({ available: row?.available, note: row?.note }, { available: false, note: "needs a paid plan" });
    assert.equal(configForModel("claude-sonnet-5.5", GATEWAY), null);
    // Marks expire.
    assert.ok(!planBlockedModels(Date.now() + 7 * 60 * 60_000).has("claude-sonnet-5.5"));
  });
});


describe("why a model didn't answer", () => {
  it("sorts HTTP failures", () => {
    assert.equal(classifyFailure(402, ""), "plan");
    assert.equal(classifyFailure(401, "bad key"), "auth");
    assert.equal(classifyFailure(403, "forbidden"), "auth");
    assert.equal(classifyFailure(400, '{"error":{"message":"Unsupported parameter: max_tokens"}}'), "bad-request");
    assert.equal(classifyFailure(404, ""), "not-found");
    assert.equal(classifyFailure(400, '{"error":"Incorrect API key provided."}'), "auth");
    assert.equal(classifyFailure(429, ""), "rate-limit");
    assert.equal(classifyFailure(503, ""), "server");
  });

  it("keeps the gateway's message, type, and code, without keys or the reader's query", () => {
    const detail = errorDetail(
      JSON.stringify({ error: { message: "Model failed for nike stock price, key sk-abcdefghijklmnop", type: "invalid_request_error", code: 400 } }),
      "nike stock price",
    );
    assert.equal(detail, "Model failed for [query], key [redacted] (type=invalid_request_error, code=400)");
    assert.equal(errorDetail("<html><body>Bad gateway</body></html>"), undefined);
    assert.equal(sanitizeDetail("Bearer vck_123456789012345 x".repeat(1)), "Bearer [redacted] x");
    assert.ok(sanitizeDetail("a".repeat(20) + " " + "word ".repeat(80)).length <= 160);
  });

  it("names timeouts and empty replies", async () => {
    const config = configForModel("gpt-6-astra", { AI_GATEWAY_API_KEY: "g" });
    assert.ok(config);
    const timeout = Object.assign(new Error("aborted"), { name: "TimeoutError" });
    assert.deepEqual(attemptFrom(config, timeout), { provider: "openai", model: "openai/gpt-6-astra", kind: "timeout", detail: "no reply within 40 s" });
    assert.equal(
      attemptLogLine({ provider: "claude", model: "anthropic/claude-sonnet-5.5", kind: "plan", status: 402, detail: "Insufficient credits" }),
      '[ai] claude anthropic/claude-sonnet-5.5 failed: HTTP 402 plan "Insufficient credits"',
    );

    const fetcher = (async (_url: string | URL, init?: RequestInit) => {
      const model = String(body(init ?? {}).model);
      if (model === "openai/gpt-6-astra") return Response.json({ model, choices: [{ finish_reason: "length", message: { content: "" } }] });
      return Response.json({ model, choices: [{ message: { content: "Fine [1]." } }] });
    }) as typeof fetch;
    const answer = await runAiAnswer("dogs", context, "gpt-6-astra", { env: { AI_GATEWAY_API_KEY: "g" }, fetcher });
    assert.ok(answer.status === "ok");
    assert.equal(answer.model, "openai/gpt-4.1-mini");
    assert.equal(answer.provider, "openai");
    assert.deepEqual(answer.attempts, [{ provider: "openai", model: "openai/gpt-6-astra", kind: "empty", detail: "finish_reason=length" }]);
  });

  it("reports a pick that isn't set up instead of switching quietly", async () => {
    const fetcher = (async (_url: string | URL, init?: RequestInit) =>
      Response.json({ model: String(body(init ?? {}).model), choices: [{ message: { content: "Hi [1]." } }] })) as typeof fetch;
    const answer = await runAiAnswer("dogs", context, "claude-haiku-4.5", { env: { XAI_API_KEY: "x" }, fetcher });
    assert.ok(answer.status === "ok");
    assert.equal(answer.provider, "grok");
    assert.equal(answer.attempts?.[0]?.kind, "unavailable");
    assert.equal(answer.attempts?.[0]?.model, "claude-haiku-4.5");
  });
});

describe("slow models: timeouts, low effort, and an early fallback", () => {
  it("gives reasoning models longer limits and low effort, and others 20 s", () => {
    const env = { XAI_API_KEY: "x", AI_GATEWAY_API_KEY: "g" };
    const limits = Object.fromEntries(
      ["grok-4.7", "grok-4.6", "grok-4.3", "gpt-6-astra", "gpt-4.1-mini", "claude-sonnet-5.5", "claude-haiku-4.5"].map((id) => {
        const config = configForModel(id, env);
        assert.ok(config, id);
        return [id, timeoutFor(config)];
      }),
    );
    assert.deepEqual(limits, {
      "grok-4.7": 40_000,
      "grok-4.6": 40_000,
      "grok-4.3": 20_000,
      "gpt-6-astra": 40_000,
      "gpt-4.1-mini": 20_000,
      "claude-sonnet-5.5": 35_000,
      "claude-haiku-4.5": 20_000,
    });
    const grok = configForModel("grok-4.7", env);
    assert.ok(grok);
    const sent = body(buildProviderRequest(grok, "dogs", context).init);
    assert.equal(sent.model, "grok-4.7");
    assert.equal(sent.reasoning_effort, "low");
    assert.equal(sent.max_completion_tokens, 4200);
    assert.equal(sent.max_tokens, undefined);
    assert.equal(sent.temperature, undefined);
    const plain = body(buildProviderRequest(configForModel("grok-4.3", env)!, "dogs", context).init);
    assert.equal(plain.reasoning_effort, undefined);
    assert.equal(plain.max_tokens, 1200);
  });

  const reply = (model: string) => Response.json({ model, choices: [{ message: { content: `${model} [1].` } }] });
  /** A fetch where each model answers (or hangs) after a set delay, honoring the abort signal. */
  function timedFetch(delays: Record<string, number | "hang">) {
    const started: string[] = [];
    const fetcher = ((_url: string | URL, init?: RequestInit) => {
      const model = String(body(init ?? {}).model);
      started.push(model);
      return new Promise<Response>((resolve, reject) => {
        const signal = init?.signal;
        const fail = () => reject(signal?.reason ?? Object.assign(new Error("aborted"), { name: "AbortError" }));
        if (signal?.aborted) return fail();
        // AbortSignal.timeout's timer doesn't keep Node alive; a real socket would, so this does.
        const alive = setInterval(() => {}, 1000);
        signal?.addEventListener("abort", () => (clearInterval(alive), fail()), { once: true });
        const delay = delays[model] ?? 0;
        if (delay !== "hang") setTimeout(() => (clearInterval(alive), resolve(reply(model))), delay);
      });
    }) as typeof fetch;
    return { fetcher, started };
  }

  it("starts the fallback while a slow pick is still thinking, and uses it when the pick times out", async () => {
    const { fetcher, started } = timedFetch({ "grok-4.7": "hang", "grok-4.3": 10 });
    const t0 = Date.now();
    const answer = await runAiAnswer("dogs", context, "grok-4.7", { env: { XAI_API_KEY: "x" }, fetcher, hedgeMs: 30, totalMs: 300, minCallMs: 20 });
    assert.ok(answer.status === "ok");
    assert.equal(answer.model, "grok-4.3");
    assert.deepEqual(started, ["grok-4.7", "grok-4.3"]);
    assert.deepEqual(answer.attempts?.map((a) => [a.model, a.kind]), [["grok-4.7", "timeout"]]);
    assert.ok(Date.now() - t0 < 1000, "stays within the total budget");
  });

  it("still prefers the slow pick when it answers after the fallback started", async () => {
    const { fetcher, started } = timedFetch({ "grok-4.7": 80, "grok-4.3": 10 });
    const answer = await runAiAnswer("dogs", context, "grok-4.7", { env: { XAI_API_KEY: "x" }, fetcher, hedgeMs: 20, totalMs: 2000, minCallMs: 20 });
    assert.ok(answer.status === "ok");
    assert.equal(answer.model, "grok-4.7");
    assert.deepEqual(answer.attempts, []);
    assert.deepEqual(started, ["grok-4.7", "grok-4.3"]);
  });

  it("does not start a second call when the pick answers before the hedge point", async () => {
    const { fetcher, started } = timedFetch({ "grok-4.7": 5 });
    const answer = await runAiAnswer("dogs", context, "grok-4.7", { env: { XAI_API_KEY: "x" }, fetcher, hedgeMs: 200, totalMs: 2000, minCallMs: 20 });
    assert.ok(answer.status === "ok" && answer.model === "grok-4.7");
    assert.deepEqual(started, ["grok-4.7"]);
  });

  it("stops at the total budget and says which models ran out of time", async () => {
    const { fetcher } = timedFetch({ "grok-4.7": "hang", "grok-4.3": "hang" });
    const answer = await runAiAnswer("dogs", context, "grok-4.7", { env: { XAI_API_KEY: "x" }, fetcher, hedgeMs: 10, totalMs: 150, minCallMs: 100 });
    assert.equal(answer.status, "error");
    assert.deepEqual(answer.attempts?.map((a) => [a.model, a.kind]), [["grok-4.7", "timeout"], ["grok-4.3", "timeout"]]);
  });
});
