/**
 * The AI answer as a stream: one NDJSON line per real stage while the server works (asking a
 * model, a retry, a failure, a fallback, writing the answer), then one line with the answer. The
 * browser shows the stages as a live progress line, then as "Worked for 13s". A request too open to
 * answer gets a `question` line (the clarifying question card) right before the answer line.
 */
import { AI_STREAM_TYPE, type AiStreamLine } from "./ai-progress.ts";
import { AI_MESSAGES, type AiAnswer } from "./ai.shared.ts";
import { runAiAnswer } from "./ai.server.ts";
import { readAnswerRequest } from "./ai-request.ts";
import { LANG_COOKIE, languageName, matchLang, parseAcceptLanguage, pickLang, type UiLang } from "./i18n.ts";

const NO_STORE = { "cache-control": "no-store, no-transform" };

/** The page language when the browser did not send one: the saved cookie, then Accept-Language, then English. */
export function requestLang(request: Request): UiLang {
  const cookie = request.headers.get("cookie") ?? "";
  const saved = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${LANG_COOKIE}=`))
    ?.slice(LANG_COOKIE.length + 1);
  let decoded: string | undefined;
  try {
    decoded = saved ? decodeURIComponent(saved) : undefined;
  } catch {
    decoded = undefined;
  }
  return matchLang(decoded) ?? pickLang(parseAcceptLanguage(request.headers.get("accept-language"))) ?? "en-US";
}

export async function streamAiAnswer(request: Request, run: typeof runAiAnswer = runAiAnswer): Promise<Response> {
  let input: ReturnType<typeof readAnswerRequest>;
  try {
    input = readAnswerRequest(await request.json());
  } catch {
    return Response.json({ error: "Invalid answer request" }, { status: 400, headers: NO_STORE });
  }
  const lang = input.lang ?? requestLang(request);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (line: AiStreamLine) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
        } catch {
          open = false; // The reader went away.
        }
      };
      let answer: AiAnswer;
      try {
        answer = await run(input.q, input.context, input.model, {
          answerLanguage: languageName(lang),
          history: input.history,
          onProgress: (event) => send({ type: "progress", event }),
          clarify: true,
        });
      } catch {
        answer = { status: "error", message: AI_MESSAGES.error };
      }
      if (answer.status === "ok" && answer.question) {
        // The clarifying question is its own event; the answer that follows carries the short note.
        const { question, ...rest } = answer;
        send({ type: "question", question });
        answer = rest;
      }
      send({ type: "answer", answer });
      open = false;
      try {
        controller.close();
      } catch {
        // Already closed by the reader.
      }
    },
  });
  return new Response(stream, {
    headers: { ...NO_STORE, "content-type": `${AI_STREAM_TYPE}; charset=utf-8`, "x-accel-buffering": "no" },
  });
}
