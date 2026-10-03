import { answerWithAi } from "@/lib/search.functions";
import type { AiProgressEvent } from "@/lib/ai-progress";
import type { AiAnswer } from "@/lib/ai.shared";
import { readAnswerStream, StreamUnavailable, type AnswerBody } from "@/lib/ai-stream";

/**
 * Ask for an answer with live progress. Uses the streamed route; if that cannot be reached at all,
 * `onFallback` runs and the plain server function answers instead (without server steps).
 */
export async function askAiWithProgress(
  body: AnswerBody,
  handlers: { onEvent: (event: AiProgressEvent) => void; onFallback: () => void },
): Promise<AiAnswer> {
  try {
    return await readAnswerStream(body, handlers.onEvent);
  } catch (error) {
    if (!(error instanceof StreamUnavailable)) throw error;
    handlers.onFallback();
    return answerWithAi({ data: body });
  }
}

