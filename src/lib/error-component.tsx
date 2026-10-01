import { useEffect, useRef } from "react";
import { useRouter, useRouterState, type ErrorComponentProps } from "@tanstack/react-router";
import { RotateCw, TriangleAlert } from "lucide-react";
import { useLang } from "@/lib/lang-context";
import { isForeignDomError } from "@/lib/dom-guard";

const FALLBACK_MESSAGE = "An unexpected error occurred. Try reloading the page.";

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return FALLBACK_MESSAGE;
}

/**
 * The error screen. It never leaves the page dead: "Try again" reloads the route data and
 * re-renders, "Go to the home page" starts over, and moving to another address resets it too.
 */
export function AppErrorComponent({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const href = useRouterState({ select: (state) => state.location.href });
  const { copy } = useLang();
  const firstHref = useRef(href);
  const message = errorMessage(error);
  const foreignDom = isForeignDomError(message);

  useEffect(() => {
    // Back/forward or a link to another page: show that page instead of this screen.
    if (href !== firstHref.current) reset();
  }, [href, reset]);

  const retry = () => {
    reset();
    void router.invalidate();
  };

  return (
    <main
      role="alert"
      className={
        "flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center " +
        "bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50"
      }
    >
      <span className="text-red-500" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="text-lg font-semibold">{copy.errorTitle}</h1>
      {foreignDom ? <p className="max-w-md text-sm text-zinc-600 dark:text-zinc-300">{copy.errorTranslateHint}</p> : null}
      <p className="max-w-md text-xs break-words text-zinc-500 dark:text-zinc-400" dir="ltr" lang="en" translate="no">
        {message}
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={retry}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-zinc-900 px-5 text-sm font-medium text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
        >
          <RotateCw className="size-4" aria-hidden="true" />
          {copy.errorRetry}
        </button>
        <a
          href="/"
          className="inline-flex min-h-11 items-center rounded-full border border-zinc-300 px-5 text-sm font-medium dark:border-zinc-700"
        >
          {copy.errorHome}
        </a>
      </div>
    </main>
  );
}
