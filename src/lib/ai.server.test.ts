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
  outputBudget,
  sanitizeDetail,
  timeoutFor,
  planBlockedModels,
  readProviderConfig,
  readProviderResponse,
  runAiAnswer,
} from "./ai.server.ts";
import type { AiContextItem } from "./ai.shared.ts";
import type { AiProgressEvent } from "./ai-progress.ts";

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
    const provider = href.includes("meta.ai") ? "meta" : href.includes("x.ai") ? "grok" : href.includes("openai") ? "openai" : "claude";
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
    assert.equal(claude.model, "anthropic/claude-haiku-4.5");
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
        ["meta", false],
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
    const answer = await runAiAnswer("dogs", context, undefined, { env: ALL, fetcher, retryDelayMs: 0 });
    assert.ok(answer.status === "ok");
    assert.equal(answer.provider, "openai");
    assert.deepEqual(answer.failed, ["grok"]);
    assert.equal(answer.citations[0].url, "https://a.example/1");
    assert.equal(calls.length, 3, "Grok's 500 is retried once, then ChatGPT answers");
    assert.equal(answer.attempts?.[0]?.detail, "nope (failed twice)");
  });

  it("skips providers without a key and errors when every set-up provider fails", async () => {
    const { fetcher, calls } = fakeFetch(["openai", "claude"]);
    const answer = await runAiAnswer("dogs", context, "grok", {
      env: { OPENAI_API_KEY: "o", ANTHROPIC_API_KEY: "a" },
      fetcher,
      retryDelayMs: 0,
    });
    assert.equal(answer.status, "error");
    assert.deepEqual(answer.status === "error" ? answer.failed : [], ["openai", "claude"]);
    assert.equal(calls.length, 4, "each 500 is retried once");
  });
});

describe("runAiAnswer progress", () => {
  it("reports asking the pick, writing, and nothing else when the pick answers", async () => {
    const { fetcher } = fakeFetch();
    const events: AiProgressEvent[] = [];
    const answer = await runAiAnswer("dogs", context, "grok-4.7", { env: ALL, fetcher, onProgress: (event) => events.push(event) });
    assert.equal(answer.status, "ok");
    assert.deepEqual(events.map((event) => [event.type, event.model]), [["ask", "grok-4.7"], ["write", "grok-4.7"]]);
    assert.equal(events[0]?.type === "ask" && events[0].fallback, false);
    assert.ok(events.every((event) => event.at >= 0));
  });

  it("reports the retry, the failure, and the fallback model in order", async () => {
    const { fetcher } = fakeFetch(["grok"]);
    const events: AiProgressEvent[] = [];
    await runAiAnswer("dogs", context, undefined, { env: ALL, fetcher, retryDelayMs: 0, onProgress: (event) => events.push(event) });
    assert.deepEqual(events.map((event) => event.type), ["ask", "retry", "failed", "ask", "write"]);
    const failed = events[2];
    assert.ok(failed?.type === "failed" && failed.kind === "server" && failed.provider === "grok");
    const fallback = events[3];
    assert.ok(fallback?.type === "ask" && fallback.fallback && fallback.provider === "openai");
  });

  it("reports a pick that is not set up before asking the next model", async () => {
    const { fetcher } = fakeFetch();
    const events: AiProgressEvent[] = [];
    await runAiAnswer("dogs", context, "grok-4.7", { env: { OPENAI_API_KEY: "o" }, fetcher, onProgress: (event) => events.push(event) });
    assert.deepEqual(events.map((event) => event.type), ["failed", "ask", "write"]);
    assert.ok(events[0]?.type === "failed" && events[0].kind === "unavailable");
    assert.ok(events[1]?.type === "ask" && events[1].fallback);
  });

  it("reports when a slow pick gets a parallel fallback", async () => {
    const fetcher = (async (url: string | URL) => {
      const slow = String(url).includes("x.ai");
      await new Promise((resolve) => setTimeout(resolve, slow ? 80 : 5));
      return Response.json({ model: slow ? "grok-4.7" : "gpt", choices: [{ message: { content: "Hi [1]." } }] });
    }) as typeof fetch;
    const events: AiProgressEvent[] = [];
    const answer = await runAiAnswer("dogs", context, "grok-4.7", { env: ALL, fetcher, hedgeMs: 20, onProgress: (event) => events.push(event) });
    assert.ok(answer.status === "ok" && answer.provider === "grok", "the pick still wins inside its limit");
    assert.deepEqual(events.slice(0, 3).map((event) => [event.type, event.model]), [["ask", "grok-4.7"], ["hedge", "grok-4.7"], ["ask", "grok-4.3"]]);
    assert.ok(events[2]?.type === "ask" && !events[2].fallback, "asked alongside, not after a failure");
    assert.ok(events.some((event) => event.type === "write" && event.model === "grok-4.7"));
  });

  it("never lets a throwing listener break the answer", async () => {
    const { fetcher } = fakeFetch();
    const answer = await runAiAnswer("dogs", context, "claude", { env: ALL, fetcher, onProgress: () => { throw new Error("listener"); } });
    assert.equal(answer.status, "ok");
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
    assert.equal(sent.max_tokens, 5200);
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
      assert.equal(claude.max_tokens, 2200);
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
    assert.equal(sent.max_completion_tokens, 5200);
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
    assert.equal(sonnet.model, "anthropic/claude-haiku-4.5");
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
    assert.equal(sent.max_completion_tokens, 5200);
    assert.equal(sent.max_tokens, undefined);
    assert.equal(sent.temperature, undefined);
    const plain = body(buildProviderRequest(configForModel("grok-4.3", env)!, "dogs", context).init);
    assert.equal(plain.reasoning_effort, undefined);
    assert.equal(plain.max_tokens, 2200);
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

describe("Claude through the AI Gateway: minimal, valid requests", () => {
  it("uses Claude Haiku 4.5 as the gateway default (Claude 3 Haiku is retired) with a minimal body", () => {
    // ANTHROPIC_EFFORT is meant for Anthropic's own API; it must not turn into `reasoning` on the gateway.
    const config = readProviderConfig("claude", { AI_GATEWAY_API_KEY: "g", ANTHROPIC_EFFORT: "low" });
    assert.ok(config);
    assert.equal(config.model, "anthropic/claude-haiku-4.5");
    assert.equal(config.effort, undefined);
    const request = buildProviderRequest(config, "dogs", context, "English");
    const sent = body(request.init);
    assert.deepEqual(Object.keys(sent).sort(), ["max_tokens", "messages", "model", "stream"]);
    assert.deepEqual((sent.messages as Array<{ role: string; content: string }>).map((m) => m.role), ["system", "user"]);
    assert.ok((sent.messages as Array<{ content: string }>).every((m) => m.content.trim().length > 0));
    assert.equal(sent.max_tokens, 2200);
    // Own Anthropic key: the effort setting still applies there.
    assert.equal(readProviderConfig("claude", { ANTHROPIC_API_KEY: "a", ANTHROPIC_EFFORT: "low" })?.effort, "low");
    // Same for OpenAI: GPT-4.1 mini on the gateway gets no reasoning field.
    assert.equal(readProviderConfig("openai", { AI_GATEWAY_API_KEY: "g", OPENAI_REASONING_EFFORT: "low" })?.effort, undefined);
  });

  it("never asks for more output than the model allows", () => {
    assert.equal(outputBudget({ model: "anthropic/claude-3-haiku" }), 2200);
    assert.equal(outputBudget({ model: "claude-3-haiku-20240307", effort: "low" }), 4096);
    assert.equal(outputBudget({ model: "claude-3-5-haiku-latest", effort: "low" }), 5200);
    assert.equal(outputBudget({ model: "openai/gpt-6-astra", effort: "low" }), 5200);
    assert.equal(outputBudget({ model: "anthropic/claude-sonnet-5.5" }), 2200);
  });

  it("retries a 5xx once on the same model before falling back", async () => {
    let calls = 0;
    const fetcher = (async (_url: string | URL, init?: RequestInit) => {
      calls += 1;
      const model = String(body(init ?? {}).model);
      if (calls === 1) return Response.json({ error: { message: "Internal Server Error", type: "AI_APICallError" } }, { status: 500 });
      return Response.json({ model, choices: [{ message: { content: "Back [1]." } }] });
    }) as typeof fetch;
    const answer = await runAiAnswer("dogs", context, "claude-haiku-4.5", { env: { AI_GATEWAY_API_KEY: "g" }, fetcher, retryDelayMs: 0 });
    assert.ok(answer.status === "ok");
    assert.equal(answer.model, "anthropic/claude-haiku-4.5");
    assert.deepEqual(answer.attempts, []);
    assert.equal(calls, 2);
  });

  it("does not retry a 4xx", async () => {
    const models: string[] = [];
    const fetcher = (async (_url: string | URL, init?: RequestInit) => {
      const model = String(body(init ?? {}).model);
      models.push(model);
      if (model === "anthropic/claude-haiku-4.5") return Response.json({ error: { message: "bad" } }, { status: 400 });
      return Response.json({ model, choices: [{ message: { content: "Hi [1]." } }] });
    }) as typeof fetch;
    const answer = await runAiAnswer("dogs", context, "claude-haiku-4.5", { env: { XAI_API_KEY: "x", AI_GATEWAY_API_KEY: "g" }, fetcher, retryDelayMs: 0 });
    assert.ok(answer.status === "ok");
    assert.deepEqual(models, ["anthropic/claude-haiku-4.5", "grok-4.3"]);
  });
});

describe("Meta Model API", () => {
  it("requires its own key and builds the documented Muse Spark request", () => {
    assert.equal(readProviderConfig("meta", { AI_GATEWAY_API_KEY: "gateway" }), null);
    const config = configForModel("muse-spark-1.3", { MODEL_API_KEY: "meta-test-key" })!;
    const request = buildProviderRequest(config, "dogs", context);
    assert.equal(request.url, "https://api.meta.ai/v1/chat/completions");
    assert.equal(headers(request.init).Authorization, "Bearer meta-test-key");
    const sent = body(request.init);
    assert.equal(sent.model, "muse-spark-1.3");
    assert.equal(sent.reasoning_effort, "low");
    assert.equal(sent.max_completion_tokens, outputBudget(config));
    assert.equal(sent.temperature, undefined);
    assert.ok(!JSON.stringify(aiModelStatus({ MODEL_API_KEY: "meta-test-key" })).includes("meta-test-key"));
  });

  it("uses Meta by default, preserves choices, and falls back after a failure", async () => {
    const env = { ...ALL, MODEL_API_KEY: "meta-test-key" };
    const first = fakeFetch();
    const answer = await runAiAnswer("dogs", context, undefined, { env, fetcher: first.fetcher });
    assert.ok(answer.status === "ok" && answer.provider === "meta");
    assert.equal(first.calls.length, 1);
    const chosen = fakeFetch();
    const explicit = await runAiAnswer("dogs", context, "grok-4.3", { env, fetcher: chosen.fetcher });
    assert.ok(explicit.status === "ok" && explicit.provider === "grok");
    const failing = fakeFetch(["meta"]);
    const fallback = await runAiAnswer("dogs", context, undefined, { env, fetcher: failing.fetcher, retryDelayMs: 0 });
    assert.ok(fallback.status === "ok" && fallback.provider === "grok");
    assert.deepEqual(fallback.status === "ok" ? fallback.failed : [], ["meta"]);
  });
});

describe("direct questions without references", () => {
  it("answers with no search results and no fabricated citations", async () => {
    const { fetcher, calls } = fakeFetch();
    const answer = await runAiAnswer("3 * 9", [], "meta", { env: { MODEL_API_KEY: "m" }, fetcher, answerLanguage: "Bangla" });
    assert.ok(answer.status === "ok");
    assert.equal(calls.length, 1);
    const messages = calls[0].body.messages as { role: string; content: string }[];
    assert.match(messages[0].content, /question directly/);
    assert.match(messages[0].content, /Do not invent citations/);
    assert.match(messages[0].content, /Bangla/);
    assert.doesNotMatch(messages[0].content, /Use only the numbered search results/);
    assert.deepEqual(answer.citations, []);
    assert.doesNotMatch(answer.text, /\[1\]/);
  });
  it("retains search grounding when references are present", () => {
    const config = readProviderConfig("grok", ALL)!;
    const request = buildProviderRequest(config, "dogs", context);
    const sent = body(request.init);
    assert.match((sent.messages as { content: string }[])[0].content, /Use only the numbered search results/);
  });
});

describe("conversational provider requests", () => {
  it("sends prior user and assistant turns to each provider before the new question", () => {
    const history = [{ role: "user" as const, content: "My name is Sam" }, { role: "assistant" as const, content: "Hello Sam" }];
    for (const provider of ["grok", "openai", "claude"] as const) {
      const request = buildProviderRequest(readProviderConfig(provider, ALL)!, "What is my name?", [], "English", undefined, history);
      const payload = body(request.init);
      const messages = payload.messages as { role: string; content: string }[];
      const offset = provider === "claude" ? 0 : 1;
      assert.deepEqual(messages.slice(offset, offset + 2), history);
      assert.ok(messages.at(-1)?.content.includes("What is my name?"));
      const system = String(provider === "claude" ? payload.system : messages[0].content);
      assert.ok(system.includes("Use the conversation"));
    }
  });
});

it("runAiAnswer carries conversation history into the actual provider request", async () => {
  const { fetcher, calls } = fakeFetch();
  const history = [{ role: "user" as const, content: "Remember the number 27." }, { role: "assistant" as const, content: "I will remember 27." }];
  const result = await runAiAnswer("Double that number.", [], "grok-4.3", { env: { XAI_API_KEY: "x-key" }, fetcher, history });
  assert.equal(result.status, "ok");
  const messages = calls[0].body.messages as { role: string; content: string }[];
  assert.deepEqual(messages.slice(1, 3), history);
  assert.ok(messages.at(-1)?.content.includes("Double that number."));
});

describe("news answers", () => {
  const system = (init: RequestInit) => String((body(init).messages as Array<{ role: string; content: string }>)[0]?.content);
  const user = (init: RequestInit) => String((body(init).messages as Array<{ role: string; content: string }>).at(-1)?.content);
  const news: AiContextItem[] = [{ source: "web", title: "Iran readies retaliation", url: "https://www.reuters.com/a", snippet: "a", site: "Reuters", date: "Oct 2, 2026" }];

  it("asks for the news format, dated, only for a news search with sources", () => {
    const grok = readProviderConfig("grok", ALL)!;
    const dated = buildProviderRequest(grok, "iran news", news, undefined, undefined, [], { news: true, today: "October 2, 2026" }).init;
    assert.match(system(dated), /This is a news search\. Today is October 2, 2026/);
    assert.match(system(dated), /\*\*double asterisks\*\*/);
    assert.match(user(dated), /\[1\] Iran readies retaliation \(Reuters, https:\/\/www\.reuters\.com\/a, Oct 2, 2026\)/);
    assert.doesNotMatch(system(buildProviderRequest(grok, "iran news", [], undefined, undefined, [], { news: true }).init), /news search/);
    assert.doesNotMatch(system(buildProviderRequest(grok, "python", news).init), /news search/);
  });

  it("turns news on from the query, on the reader's calendar", async () => {
    const { fetcher, calls } = fakeFetch();
    await runAiAnswer("iran news", news, "grok", { env: ALL, fetcher, timeZone: "America/New_York", now: new Date("2026-10-03T01:40:00Z") });
    assert.match(String((calls[0]?.body.messages as Array<{ content: string }>)[0]?.content), /Today is October 2, 2026/);
    const plain = fakeFetch();
    await runAiAnswer("python", news, "grok", { env: ALL, fetcher: plain.fetcher });
    assert.doesNotMatch(String((plain.calls[0]?.body.messages as Array<{ content: string }>)[0]?.content), /news search/);
  });

  it("uses the news format instead of the clarifying rule when a chat search is news", async () => {
    const { fetcher, calls } = fakeFetch();
    await runAiAnswer("iran news", news, "grok", { env: ALL, fetcher, clarify: true, now: new Date("2026-10-02T15:00:00Z") });
    const sent = String((calls[0]?.body.messages as Array<{ content: string }>)[0]?.content);
    assert.match(sent, /This is a news search/);
    assert.doesNotMatch(sent, /<clarify>/);
    const both = system(buildProviderRequest(readProviderConfig("grok", ALL)!, "iran news", news, undefined, undefined, [], { news: true, clarify: true }).init);
    assert.doesNotMatch(both, /<clarify>/);
  });
});

describe("clarifying questions", () => {
  const block = {
    message: "What should the code do?",
    question: "What kind of Python code do you want?",
    options: [{ label: "Starter script", description: "A main() template" }, { label: "Web / API", description: "Call an API" }, { label: "Automation", description: "Rename files" }],
    suggestions: ["Learn Python basics"],
  };
  const replyWith = (text: string) => (async () => Response.json({ model: "grok-test", choices: [{ message: { content: text } }] })) as unknown as typeof fetch;
  const system = (init: RequestInit) => String((body(init).messages as Array<{ role: string; content: string }>)[0]?.content);

  it("only adds the clarifying instructions on the chat path, and never for a graph", () => {
    const grok = readProviderConfig("grok", ALL)!;
    assert.match(system(buildProviderRequest(grok, "write a python code", [], undefined, undefined, [], { clarify: true }).init), /<clarify>/);
    assert.doesNotMatch(system(buildProviderRequest(grok, "write a python code", []).init), /<clarify>/);
    assert.doesNotMatch(system(buildProviderRequest(grok, "y = x^2", [], undefined, "y = x^2", [], { clarify: true }).init), /<clarify>/);
    const claude = body(buildProviderRequest(readProviderConfig("claude", ALL)!, "make a website", context, undefined, undefined, [], { clarify: true }).init);
    assert.match(String(claude.system), /never ask twice in a row/);
  });

  it("returns the question with its short note as the answer text", async () => {
    const answer = await runAiAnswer("write a python code", [], "grok", { env: ALL, fetcher: replyWith(`<clarify>${JSON.stringify(block)}</clarify>`), clarify: true });
    assert.equal(answer.status, "ok");
    if (answer.status !== "ok") return;
    assert.equal(answer.text, block.message);
    assert.deepEqual(answer.parts, [{ text: block.message }]);
    assert.deepEqual(answer.citations, []);
    assert.equal(answer.question?.question, block.question);
    assert.equal(answer.question?.options.length, 3);
  });

  it("answers clear prompts normally", async () => {
    const answer = await runAiAnswer("capital of France", context, "grok", { env: ALL, fetcher: replyWith("Paris [1]."), clarify: true });
    assert.equal(answer.status, "ok");
    if (answer.status !== "ok") return;
    assert.equal(answer.question, undefined);
    assert.equal(answer.citations.length, 1);
  });
});

describe("agentic search prompt", () => {
  const system = (init: RequestInit) => String((body(init).messages as Array<{ role: string; content: string }>)[0]?.content);
  const grok = () => readProviderConfig("grok", ALL)!;
  it("offers the search check only when asked, and never for a graph", () => {
    assert.match(system(buildProviderRequest(grok(), "iran news", context, undefined, undefined, [], { search: true, today: "October 2, 2026" }).init), /Search quality check \(today is October 2, 2026\)/);
    assert.doesNotMatch(system(buildProviderRequest(grok(), "iran news", context).init), /<search>/);
    assert.doesNotMatch(system(buildProviderRequest(grok(), "y = x^2", context, undefined, "y = x^2", [], { search: true, searched: [{ query: "q", from: 3, to: 4 }] }).init), /<search>|searched the web again/);
  });

  it("returns the search request instead of an answer, and drops a block it was not offered", async () => {
    const reply = '<search>{"note":"Weak results. Let me try again.","query":"better query"}</search>';
    const fetcher = (async () => Response.json({ model: "grok-test", choices: [{ message: { content: reply } }] })) as unknown as typeof fetch;
    const asked = await runAiAnswer("iran news", context, "grok", { env: ALL, fetcher, search: true });
    assert.ok(asked.status === "ok");
    assert.deepEqual(asked.search, { note: "Weak results. Let me try again.", query: "better query" });
    assert.equal(asked.text, "Weak results. Let me try again.");
    const mixed = (async () => Response.json({ model: "grok-test", choices: [{ message: { content: `Answer [1]. ${reply}` } }] })) as unknown as typeof fetch;
    const plain = await runAiAnswer("iran news", context, "grok", { env: ALL, fetcher: mixed });
    assert.ok(plain.status === "ok");
    assert.equal(plain.search, undefined);
    assert.doesNotMatch(plain.text, /<search>|better query/);
  });

  it("dates progress from the start of the whole answer", async () => {
    const { fetcher } = fakeFetch();
    const events: AiProgressEvent[] = [];
    await runAiAnswer("dogs", context, "grok", { env: ALL, fetcher, clockStart: Date.now() - 5000, onProgress: (event) => events.push(event) });
    assert.ok(events[0]!.at >= 5000);
  });
});
