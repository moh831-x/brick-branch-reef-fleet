import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addClientStep,
  addDoneStep,
  addServerEvent,
  createTrace,
  finishTrace,
  finishWithAnswer,
  markSent,
  parseStreamLine,
  resolveTrace,
  splitLines,
  type AiProgressEvent,
} from "./ai-progress.ts";
import { formatDuration, joinList, PROGRESS } from "./progress-copy.ts";
import { modelName, stepLabel } from "./work-label.ts";
import { UI } from "./ui-copy.ts";
import { LANGS } from "./i18n.ts";
import { activeTarget, afterRelease, type PromptTarget } from "../components/prompt-bridge.ts";

const ev = (event: AiProgressEvent) => event;

/** A main answer: search seen live, 5 sources sent, Grok fails, ChatGPT answers. Page clock in ms. */
function sampleTrace() {
  let trace = createTrace(1000);
  trace = addDoneStep(trace, { kind: "search", sources: ["web", "wiki"] }, 1000, 2200);
  trace = addClientStep(trace, { kind: "read", count: 5 }, 2200);
  trace = markSent(trace, 2200);
  // The server's zero is 2300 on the page clock (100 ms of network); events arrive as they happen.
  trace = addServerEvent(trace, ev({ type: "ask", model: "grok-4.7", provider: "grok", fallback: false, at: 0 }), 2300);
  trace = addServerEvent(trace, ev({ type: "failed", model: "grok-4.7", provider: "grok", kind: "timeout", at: 6000 }), 8300);
  trace = addServerEvent(trace, ev({ type: "ask", model: "gpt-4.1-mini", provider: "openai", fallback: true, at: 6000 }), 8300);
  trace = addServerEvent(trace, ev({ type: "write", model: "gpt-4.1-mini", provider: "openai", at: 9000 }), 11300);
  return finishTrace(trace, 11400);
}

describe("AI progress steps", () => {
  it("orders real stages and times each one", () => {
    const view = resolveTrace(sampleTrace(), 99999);
    assert.deepEqual(view.steps.map((step) => step.kind), ["search", "read", "ask", "failed", "ask", "write"]);
    assert.deepEqual(view.steps.map((step) => step.ms), [1200, 100, 6000, undefined, 3000, 100]);
    assert.equal(view.elapsed, 10400);
    assert.equal(view.current, undefined, "nothing is live once the answer is in");
  });

  it("shows the newest open step as the live one, with the running time", () => {
    let trace = markSent(addClientStep(createTrace(0), { kind: "read", chat: true }, 0), 0);
    assert.equal(resolveTrace(trace, 50).current?.kind, "read");
    trace = addServerEvent(trace, ev({ type: "ask", model: "grok-4.7", provider: "grok", fallback: false, at: 1 }), 80);
    const view = resolveTrace(trace, 4000);
    assert.equal(view.current?.kind, "ask");
    assert.equal(view.current?.model, "grok-4.7");
    assert.equal(view.elapsed, 4000);
    assert.equal(view.steps[0]?.ms, 80, "the conversation was being sent until the server started asking");
  });

  it("keeps a slow pick and its parallel fallback open together, and closes both when writing starts", () => {
    let trace = markSent(createTrace(0), 0);
    trace = addServerEvent(trace, ev({ type: "ask", model: "grok-4.7", provider: "grok", fallback: false, at: 0 }), 10);
    trace = addServerEvent(trace, ev({ type: "hedge", model: "grok-4.7", provider: "grok", at: 12000 }), 12010);
    trace = addServerEvent(trace, ev({ type: "ask", model: "gpt-4.1-mini", provider: "openai", fallback: false, at: 12000 }), 12010);
    const live = resolveTrace(trace, 13000);
    assert.equal(live.steps.filter((step) => step.kind === "ask" && step.end === undefined).length, 2);
    assert.equal(live.current?.model, "gpt-4.1-mini");
    trace = addServerEvent(trace, ev({ type: "write", model: "grok-4.7", provider: "grok", at: 15000 }), 15010);
    const done = resolveTrace(finishTrace(trace, 15100), 0);
    assert.deepEqual(done.steps.filter((step) => step.kind === "ask").map((step) => step.ms), [15000, 3000]);
  });

  it("places steps where they happened even when the whole stream arrives at once", () => {
    let trace = markSent(createTrace(0), 0);
    // Buffered: everything shows up at 9000 ms, but the last line was written at server 8900 ms.
    trace = addServerEvent(trace, ev({ type: "ask", model: "grok-4.3", provider: "grok", fallback: false, at: 2 }), 9000);
    trace = addServerEvent(trace, ev({ type: "write", model: "grok-4.3", provider: "grok", at: 8900 }), 9000);
    const view = resolveTrace(finishTrace(trace, 9001), 0);
    assert.equal(view.steps[0]?.ms, 8898);
    assert.ok((view.steps[0]?.start ?? 0) < 200);
  });

  it("never places server steps before the request was sent or after the answer", () => {
    let trace = markSent(createTrace(500), 500);
    trace = addServerEvent(trace, ev({ type: "ask", model: "x", provider: "grok", fallback: false, at: 5000 }), 600);
    const view = resolveTrace(finishTrace(trace, 700), 0);
    assert.ok(view.steps.every((step) => step.start >= 500 && (step.end ?? 0) <= 700));
  });

  it("lists failed models from the answer when there was no stream", () => {
    let trace = markSent(addClientStep(createTrace(0), { kind: "ask", model: "grok-4.7", provider: "grok" }, 0), 0);
    trace = finishWithAnswer(trace, { status: "error", message: "x", attempts: [{ provider: "grok", model: "grok-4.7", kind: "rate-limit" }] }, 3000);
    const view = resolveTrace(trace, 0);
    assert.deepEqual(view.steps.map((step) => [step.kind, step.ms]), [["ask", 3000], ["failed", undefined]]);
    assert.equal(view.steps[1]?.reason, "rate-limit");
  });

  it("does not repeat failures the stream already reported", () => {
    let trace = markSent(createTrace(0), 0);
    trace = addServerEvent(trace, ev({ type: "failed", model: "grok-4.7", provider: "grok", kind: "auth", at: 0 }), 5);
    trace = finishWithAnswer(trace, { status: "error", message: "x", attempts: [{ provider: "grok", model: "grok-4.7", kind: "auth" }] }, 10);
    assert.equal(trace.steps.filter((step) => step.kind === "failed").length, 1);
  });
});

describe("AI progress stream lines", () => {
  it("splits complete lines and keeps the unfinished tail", () => {
    assert.deepEqual(splitLines('{"a":1}\n{"b"'), { lines: ['{"a":1}'], rest: '{"b"' });
    assert.deepEqual(splitLines("\n\n x \n"), { lines: ["x"], rest: "" });
  });

  it("reads progress and answer lines and ignores anything else", () => {
    const progress = parseStreamLine(JSON.stringify({ type: "progress", event: { type: "ask", model: "grok-4.7", provider: "grok", fallback: false, at: 3 } }));
    assert.equal(progress?.type, "progress");
    const answer = parseStreamLine(JSON.stringify({ type: "answer", answer: { status: "error", message: "x" } }));
    assert.equal(answer?.type, "answer");
    assert.equal(parseStreamLine("not json"), null);
    assert.equal(parseStreamLine(JSON.stringify({ type: "progress", event: { type: "dance", model: "m", at: 1 } })), null);
    assert.equal(parseStreamLine(JSON.stringify({ type: "progress", event: { type: "ask", model: "m", at: "soon" } })), null);
    assert.equal(parseStreamLine(JSON.stringify({ type: "answer", answer: {} })), null);
  });
});

describe("AI progress words", () => {
  const en = UI["en-US"];
  it("names each step the way the reader sees it", () => {
    assert.equal(stepLabel({ kind: "search", sources: ["web", "wiki"] }, "en-US", en), "Searching the web");
    assert.equal(stepLabel({ kind: "search", sources: ["wiki", "grok"] }, "en-US", en), `Searching ${en.wiki} and ${en.grok}`);
    assert.equal(stepLabel({ kind: "read", count: 5 }, "en-US", en), "Reading 5 sources");
    assert.equal(stepLabel({ kind: "read", count: 1 }, "en-US", en), "Reading 1 source");
    assert.equal(stepLabel({ kind: "read", chat: true }, "en-US", en), "Reading the conversation");
    assert.equal(stepLabel({ kind: "ask", model: "grok-4.7", provider: "grok" }, "en-US", en), "Asking Grok 4.7");
    assert.equal(stepLabel({ kind: "ask", model: "openai/gpt-6-astra", provider: "openai", fallback: true }, "en-US", en), "Trying GPT-6 Astra instead");
    assert.equal(stepLabel({ kind: "ask" }, "en-US", en), "Asking the AI model");
    assert.equal(stepLabel({ kind: "failed", model: "grok-4.7", provider: "grok", reason: "timeout" }, "en-US", en), `Grok 4.7: ${en.failTimeout}`);
    assert.equal(stepLabel({ kind: "retry", model: "grok-4.3", provider: "grok" }, "en-US", en), "Retrying Grok 4.3");
    assert.equal(stepLabel({ kind: "write", model: "grok-4.3", provider: "grok" }, "en-US", en), "Writing the answer");
  });

  it("falls back to the provider name for a model the menu does not list", () => {
    assert.equal(modelName("gpt-6-luna", "openai"), "ChatGPT");
    assert.equal(modelName("claude-sonnet-5-5", "claude"), "Claude Sonnet 5.5");
  });

  it("uses Arabic plural forms and digits", () => {
    const ar = UI["ar-SA"];
    assert.equal(stepLabel({ kind: "read", count: 1 }, "ar-SA", ar), "جارٍ قراءة مصدر واحد");
    assert.equal(stepLabel({ kind: "read", count: 2 }, "ar-SA", ar), "جارٍ قراءة مصدرين");
    assert.equal(stepLabel({ kind: "read", count: 5 }, "ar-SA", ar), "جارٍ قراءة ٥ مصادر");
    assert.equal(stepLabel({ kind: "read", count: 12 }, "ar-SA", ar), "جارٍ قراءة ١٢ مصدرًا");
  });

  it("formats durations in each language's short units", () => {
    assert.equal(formatDuration(13_200, "en-US"), "13s");
    assert.equal(formatDuration(2_440, "en-US"), "2.4s");
    assert.equal(formatDuration(20, "en-US"), "<0.1s");
    assert.equal(formatDuration(65_000, "en-US"), "1m 5s");
    assert.equal(formatDuration(120_000, "en-US"), "2m");
    assert.equal(formatDuration(4_900, "en-US", { whole: true }), "4s");
    assert.equal(formatDuration(13_000, "ar-SA"), "١٣ ث");
    assert.equal(formatDuration(13_000, "zh-CN"), "13秒");
    assert.match(formatDuration(2_400, "de-DE"), /^2,4\s?Sek\.$/);
    assert.equal(joinList("en-US", ["Wikipedia", "Grokipedia"]), "Wikipedia and Grokipedia");
  });

  it("translates every string into all ten languages with the same placeholders", () => {
    const placeholders = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const english = PROGRESS["en-US"];
    for (const { code } of LANGS) {
      const words = PROGRESS[code];
      assert.ok(words, code);
      for (const key of Object.keys(english) as (keyof typeof english)[]) {
        if (key === "readSources") {
          assert.ok(words.readSources.other.trim(), `${code} readSources`);
          for (const form of Object.values(words.readSources)) assert.ok(placeholders(form ?? "").every((name) => name === "n"), `${code} readSources ${form}`);
          continue;
        }
        const value = words[key] as string;
        assert.ok(value.trim(), `${code} ${key} is empty`);
        assert.deepEqual(placeholders(value), placeholders(english[key] as string), `${code} ${key}`);
        if (code !== "en-US" && !["failed"].includes(key)) assert.notEqual(value, english[key], `${code} left ${key} in English`);
      }
    }
  });
});

describe("one search bar for every prompt", () => {
  const chat: PromptTarget = { kind: "chat", pending: false, maxLength: 4000, submit: () => true };
  const image: PromptTarget = { kind: "image", pending: false, maxLength: 1000, submit: () => true };
  it("sends to the chosen feature only while it is on the page", () => {
    assert.equal(activeTarget({ a: chat }, "a")?.target.kind, "chat");
    assert.equal(activeTarget({ a: chat }, null), null);
    assert.equal(activeTarget({ a: chat }, "gone"), null);
  });
  it("goes back to the conversation when image mode ends, else to searching", () => {
    assert.equal(afterRelease({ a: chat, b: image }, "b"), "a");
    assert.equal(afterRelease({ b: image }, "b"), null);
    assert.equal(afterRelease({ a: chat }, "a"), null);
  });
});
