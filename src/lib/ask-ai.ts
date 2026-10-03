import { answerWithAi } from "@/lib/search.functions";
import type { AiProgressEvent } from "@/lib/ai-progress";
import type { AiAnswer } from "@/lib/ai.shared";
import { readAnswerStream, StreamUnavailable, type AnswerBody } from "@/lib/ai-stream";
import type { ResearchItem } from "@/lib/research.shared";

/**
 * Ask for an answer with live progress. Uses the streamed route; if that cannot be reached at all,
 * `onFallback` runs and the plain server function answers instead (without server steps).
 */
export async function askAiWithProgress(
  body: AnswerBody,
  handlers: { onEvent: (event: AiProgressEvent) => void; onFallback: () => void; onResearch?: (item: ResearchItem) => void },
): Promise<AiAnswer> {
  // The reader's time zone dates a news answer ("as of October 2, 2026") on their calendar.
  let tz: string | undefined;
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    tz = undefined;
  }
  if (tz && !body.tz) body = { ...body, tz };
  try {
    return await readAnswerStream(body, handlers.onEvent, undefined, handlers.onResearch);
  } catch (error) {
    if (!(error instanceof StreamUnavailable)) throw error;
    handlers.onFallback();
    return answerWithAi({ data: body });
  }
}

