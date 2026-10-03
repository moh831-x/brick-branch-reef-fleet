/**
 * Live progress for an AI answer: the real stages the browser and the server go through, with
 * their timings. The server reports what it does (which model it asks, retries, failures,
 * fallbacks, writing the answer) as NDJSON lines while it works; the browser adds its own stages
 * (searching, sending the sources). Nothing here is decorative: every step comes from code that ran.
 * Pure data and helpers, safe on the server and in the browser.
 */
import type { AiAnswer, AiFailureKind, AiSourceId, AnswerProviderId } from "./ai.shared.ts";
import { cleanQuestion, type AiQuestion } from "./ai-clarify.ts";

/** What the server is doing. `at` is milliseconds since the server started on this answer. */
export type AiProgressEvent =
  | { type: "ask"; model: string; provider: AnswerProviderId; fallback: boolean; at: number }
  | { type: "retry"; model: string; provider: AnswerProviderId; at: number }
  | { type: "failed"; model: string; provider: AnswerProviderId; kind: AiFailureKind; at: number }
  | { type: "skipped"; model: string; provider: AnswerProviderId; at: number }
  | { type: "hedge"; model: string; provider: AnswerProviderId; at: number }
  | { type: "write"; model: string; provider: AnswerProviderId; at: number };

/** An event before the server stamps its time. */
export type AiProgressInput = AiProgressEvent extends infer E ? (E extends AiProgressEvent ? Omit<E, "at"> : never) : never;

/**
 * One line of the streamed answer: progress while working, then exactly one answer. When the request
 * was too open, a `question` line (the clarifying question for the card) comes just before the answer,
 * whose text is then the short note. Readers that don't know `question` lines skip them.
 */
export type AiStreamLine =
  | { type: "progress"; event: AiProgressEvent }
  | { type: "question"; question: AiQuestion }
  | { type: "answer"; answer: AiAnswer };

export const AI_STREAM_PATH = "/api/ai-answer";
export const AI_STREAM_TYPE = "application/x-ndjson";

export type WorkStepKind = "search" | "read" | "ask" | "retry" | "failed" | "skipped" | "hedge" | "write";

/** Short notes (no duration of their own): a retry, a failure, a skipped model, a slow model. */
export const NOTE_KINDS: ReadonlySet<WorkStepKind> = new Set(["retry", "failed", "skipped", "hedge"]);

/**
 * One step. Browser steps carry `start`/`end` in the page clock (performance.now()); server steps
 * carry `at`/`endAt` in the server clock and are placed on the page clock when shown (`resolveTrace`).
 */
export type WorkStep = {
  kind: WorkStepKind;
  start?: number;
  end?: number;
  at?: number;
  endAt?: number;
  model?: string;
  provider?: AnswerProviderId;
  fallback?: boolean;
  reason?: AiFailureKind;
  /** read: how many sources were sent. */
  count?: number;
  /** read: the conversation was sent (a follow-up). */
  chat?: boolean;
  /** search: which sources were searched. */
  sources?: AiSourceId[];
};

export type WorkTrace = {
  /** When the work started (page clock). */
  start: number;
  /** When the answer arrived (page clock); unset while working. */
  end?: number;
  /** When the request left the browser; server times are never placed before it. */
  sent?: number;
  /**
   * The page-clock time of the server's zero. Estimated as the smallest (arrival - at) seen, so a
   * stream that arrives late or all at once still places each step where it really happened.
   */
  serverZero?: number;
  steps: WorkStep[];
};

export function createTrace(start: number): WorkTrace {
  return { start, steps: [] };
}

function isOpen(step: WorkStep): boolean {
  return step.end === undefined && step.endAt === undefined && !NOTE_KINDS.has(step.kind);
}

/** Close the open steps that `keep` does not keep, at a page time or a server time. */
function closeOpen(steps: WorkStep[], when: { end?: number; endAt?: number }, keep: (step: WorkStep) => boolean = () => false): WorkStep[] {
  return steps.map((step) => (isOpen(step) && !keep(step) ? { ...step, ...when } : step));
}

/** A browser stage (search, read, or ask when the stream is not available) starts now; earlier open stages end. */
export function addClientStep(trace: WorkTrace, step: Omit<WorkStep, "start" | "at" | "endAt">, now: number, done = false): WorkTrace {
  const steps = closeOpen(trace.steps, { end: now });
  return { ...trace, steps: [...steps, { ...step, start: now, ...(done ? { end: now } : {}) }] };
}

/** A finished browser stage with known times (for example a search that ran before the card appeared). */
export function addDoneStep(trace: WorkTrace, step: Omit<WorkStep, "start" | "end" | "at" | "endAt">, start: number, end: number): WorkTrace {
  return { ...trace, start: Math.min(trace.start, start), steps: [...trace.steps, { ...step, start, end: Math.max(start, end) }] };
}

/** The request left the browser now. */
export function markSent(trace: WorkTrace, now: number): WorkTrace {
  return { ...trace, sent: now };
}

/** A server event arrived at page time `arrival`. */
export function addServerEvent(trace: WorkTrace, event: AiProgressEvent, arrival: number): WorkTrace {
  const floor = trace.sent ?? trace.start;
  const zero = Math.max(floor, Math.min(trace.serverZero ?? Infinity, arrival - event.at));
  const at = event.at;
  const base = { model: event.model, provider: event.provider, at };
  let steps = trace.steps;
  switch (event.type) {
    case "ask":
      // Several models can be asked side by side (a slow pick plus its fallback): keep other asks open.
      steps = closeOpen(steps, { endAt: at }, (step) => step.kind === "ask");
      steps = [...steps, { kind: "ask", ...base, fallback: event.fallback }];
      break;
    case "write":
      steps = closeOpen(steps, { endAt: at });
      steps = [...steps, { kind: "write", ...base }];
      break;
    case "failed":
    case "skipped":
      steps = closeOpen(steps, { endAt: at }, (step) => step.model !== event.model);
      steps = [...steps, { kind: event.type, ...base, ...(event.type === "failed" ? { reason: event.kind } : {}) }];
      break;
    case "retry":
    case "hedge":
      steps = [...steps, { kind: event.type, ...base }];
      break;
  }
  return { ...trace, serverZero: zero, steps };
}

/** The answer arrived: every open step ends now. */
export function finishTrace(trace: WorkTrace, now: number): WorkTrace {
  return { ...trace, end: now, steps: closeOpen(trace.steps, { end: now }) };
}

/**
 * The answer arrived. Without a stream (the plain server function answered), the server's steps
 * are unknown, so the models that failed are listed from the answer itself, as notes at the end.
 */
export function finishWithAnswer(trace: WorkTrace, answer: AiAnswer, now: number): WorkTrace {
  let next = trace;
  if (trace.serverZero === undefined && "attempts" in answer && answer.attempts?.length) {
    const notes: WorkStep[] = answer.attempts.map((attempt) => ({
      kind: "failed",
      model: attempt.model,
      provider: attempt.provider,
      reason: attempt.kind,
      start: now,
      end: now,
    }));
    next = { ...trace, steps: [...trace.steps, ...notes] };
  }
  return finishTrace(next, now);
}

export type ResolvedStep = WorkStep & { start: number; end?: number; ms?: number; note: boolean };

/** Every step on the page clock, in the order it started, with its duration once it ended. */
export function resolveTrace(trace: WorkTrace, now: number): { steps: ResolvedStep[]; elapsed: number; current?: ResolvedStep } {
  const zero = trace.serverZero ?? trace.sent ?? trace.start;
  const limit = trace.end ?? now;
  const clamp = (value: number) => Math.min(limit, Math.max(trace.start, value));
  const steps = trace.steps.map((step, index): ResolvedStep & { index: number } => {
    const start = clamp(step.start ?? zero + (step.at ?? 0));
    const rawEnd = step.end ?? (step.endAt !== undefined ? zero + step.endAt : undefined);
    const end = rawEnd === undefined ? undefined : Math.max(start, clamp(rawEnd));
    const note = NOTE_KINDS.has(step.kind);
    return { ...step, start, ...(end !== undefined ? { end } : {}), ...(end !== undefined && !note ? { ms: end - start } : {}), note, index };
  });
  steps.sort((a, b) => a.start - b.start || a.index - b.index);
  const open = steps.filter((step) => !step.note && step.end === undefined);
  const current = trace.end === undefined ? open.at(-1) : undefined;
  const clean = steps.map(({ index: _index, ...step }) => step);
  return { steps: clean, elapsed: Math.max(0, limit - trace.start), ...(current ? { current: clean[steps.indexOf(current)] } : {}) };
}

/** Split complete NDJSON lines off a buffer; the unfinished tail is kept for the next chunk. */
export function splitLines(buffer: string): { lines: string[]; rest: string } {
  const parts = buffer.split("\n");
  const rest = parts.pop() ?? "";
  return { lines: parts.map((line) => line.trim()).filter(Boolean), rest };
}

const EVENT_TYPES = new Set(["ask", "retry", "failed", "skipped", "hedge", "write"]);

/** Read one streamed line; anything malformed is ignored. */
export function parseStreamLine(line: string): AiStreamLine | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.type === "answer" && raw.answer && typeof raw.answer === "object" && typeof (raw.answer as { status?: unknown }).status === "string") {
    return { type: "answer", answer: raw.answer as AiAnswer };
  }
  if (raw.type === "question") {
    const question = cleanQuestion(raw.question);
    return question ? { type: "question", question } : null;
  }
  if (raw.type === "progress" && raw.event && typeof raw.event === "object") {
    const event = raw.event as Record<string, unknown>;
    if (typeof event.type === "string" && EVENT_TYPES.has(event.type) && typeof event.model === "string" && typeof event.at === "number" && Number.isFinite(event.at)) {
      return { type: "progress", event: event as unknown as AiProgressEvent };
    }
  }
  return null;
}
