/**
 * Browser side of the streamed AI answer: reads the NDJSON progress lines as they arrive and hands
 * each one to `onEvent`, then returns the answer. When the stream route cannot be reached (an old
 * deployment, a proxy that rejects it), it says so with StreamUnavailable before anything was
 * read, so the caller can ask the plain server function instead; the question is never sent twice.
 * A clarifying-question line is put back on the answer it precedes.
 */
import { AI_STREAM_PATH, AI_STREAM_TYPE, parseStreamLine, splitLines, type AiProgressEvent } from "./ai-progress.ts";
import type { AiAnswer, AiContextItem } from "./ai.shared.ts";
import type { ChatMessage } from "./chat.shared.ts";
import type { AiQuestion } from "./ai-clarify.ts";

export class StreamUnavailable extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "StreamUnavailable";
  }
}

export type AnswerBody = { q: string; context: AiContextItem[]; history?: ChatMessage[]; model?: string; lang?: string };

export async function readAnswerStream(body: AnswerBody, onEvent: (event: AiProgressEvent) => void, fetcher: typeof fetch = fetch): Promise<AiAnswer> {
  let response: Response;
  try {
    response = await fetcher(AI_STREAM_PATH, {
      method: "POST",
      headers: { "content-type": "application/json", accept: AI_STREAM_TYPE },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new StreamUnavailable(error instanceof Error ? error.message : "network error");
  }
  const type = response.headers.get("content-type") ?? "";
  if (!response.ok || !response.body || !type.includes(AI_STREAM_TYPE)) {
    await response.body?.cancel().catch(() => undefined);
    throw new StreamUnavailable(`HTTP ${response.status} ${type}`.trim());
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let question: AiQuestion | undefined;
  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const { lines, rest } = splitLines(done ? `${buffer}\n` : buffer);
    buffer = rest;
    for (const line of lines) {
      const parsed = parseStreamLine(line);
      if (!parsed) continue;
      if (parsed.type === "question") {
        question = parsed.question;
        continue;
      }
      if (parsed.type === "answer") {
        await reader.cancel().catch(() => undefined);
        return question && parsed.answer.status === "ok" ? { ...parsed.answer, question } : parsed.answer;
      }
      onEvent(parsed.event);
    }
    if (done) break;
  }
  throw new Error("The answer stream ended without an answer");
}
