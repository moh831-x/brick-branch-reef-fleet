import { createFileRoute } from "@tanstack/react-router";

/** POST: the AI answer streamed as NDJSON progress lines, then the answer. See src/lib/ai-answer-stream.server.ts. */
export const Route = createFileRoute("/api/ai-answer")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const [{ streamAiAnswer }, { runAiAnswer }, { searchForAi }] = await Promise.all([
          import("@/lib/ai-answer-stream.server"),
          import("@/lib/ai.server"),
          import("@/lib/search.server"),
        ]);
        // Extra searches (agentic search) use the same web and news feeds as the page.
        return streamAiAnswer(request, runAiAnswer, searchForAi);
      },
    },
  },
});
