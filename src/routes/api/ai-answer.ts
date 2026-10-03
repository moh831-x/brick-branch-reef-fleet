import { createFileRoute } from "@tanstack/react-router";

/** POST: the AI answer streamed as NDJSON progress lines, then the answer. See src/lib/ai-answer-stream.server.ts. */
export const Route = createFileRoute("/api/ai-answer")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { streamAiAnswer } = await import("@/lib/ai-answer-stream.server");
        return streamAiAnswer(request);
      },
    },
  },
});
