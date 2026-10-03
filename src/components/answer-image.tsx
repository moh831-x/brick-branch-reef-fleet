import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { usePromptBridge } from "@/components/prompt-bridge";
import { Download, ImageIcon, Loader2, X } from "lucide-react";
import { createAnswerImage, imageCreationStatus } from "@/lib/image.functions";
import { imageCopy } from "@/lib/image-copy";
import type { ImageRatio, ImageResult } from "@/lib/image.shared";
import type { UiLang } from "@/lib/i18n";

const PROMPT_MAX = 1000;

/**
 * Create an image for this search. There is no text box here: all prompts share the search bar.
 * Opening this panel puts the bar in image mode, so a description typed there (Enter) creates the
 * image; the button creates one from the current prompt, which starts as the search itself.
 */
export function AnswerImage({ query, answer, lang }: { query: string; answer?: string; lang: UiLang }) {
  const copy = imageCopy(lang);
  const id = useId();
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [prompt, setPrompt] = useState(query.slice(0, PROMPT_MAX));
  const [ratio, setRatio] = useState<ImageRatio>("1:1");
  const [useAnswer, setUseAnswer] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImageResult | null>(null);
  const running = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  useEffect(() => {
    if (!open || available !== null) return;
    let cancelled = false;
    imageCreationStatus().then(row => { if (!cancelled) setAvailable(row.available); }).catch(() => { if (!cancelled) setAvailable(false); });
    return () => { cancelled = true; };
  }, [open, available]);

  const bridge = usePromptBridge();
  const latest = useRef({ ratio, useAnswer, answer, available });
  latest.current = { ratio, useAnswer, answer, available };

  async function run(text: string) {
    const value = text.trim().slice(0, PROMPT_MAX);
    if (running.current || !latest.current.available || !value) return false;
    running.current = true;
    setPrompt(value);
    setBusy(true);
    setResult(null);
    try {
      const { ratio: shape, useAnswer: withAnswer, answer: context } = latest.current;
      const next = await createAnswerImage({ data: { prompt: value, ratio: shape, answer: withAnswer ? context ?? "" : "" } });
      if (alive.current) setResult(next);
    } catch { if (alive.current) setResult({ status: "error" }); }
    finally { running.current = false; if (alive.current) setBusy(false); }
    return true;
  }
  const runRef = useRef(run);
  runRef.current = run;

  function create(event: FormEvent) {
    event.preventDefault();
    void run(prompt);
  }

  // While the panel is open, the search bar takes the image description.
  useEffect(() => {
    if (!open || !bridge) return;
    bridge.register(id, {
      kind: "image",
      pending: busy || available !== true,
      maxLength: PROMPT_MAX,
      submit: (text) => {
        if (running.current || !latest.current.available) return false;
        void runRef.current(text);
        return true;
      },
    });
  }, [open, bridge, id, busy, available]);
  useEffect(() => {
    if (!open || !bridge) return;
    bridge.activate(id);
    return () => bridge.unregister(id);
  }, [open, bridge, id]);

  return (
    <div className="mt-4 border-t border-line pt-3">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-sm text-ink hover:bg-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
        <ImageIcon className="size-4 text-accent" aria-hidden="true" />{copy.create}
      </button>
      {open ? <div id={id} className="mt-3 rounded-2xl bg-bg p-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-muted">{bridge ? copy.barHint : copy.hint}</p>
          <button type="button" aria-label={copy.close} onClick={() => setOpen(false)} className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface"><X className="size-4" aria-hidden="true" /></button>
        </div>
        <form onSubmit={create} className="grid gap-3">
          <p className="grid gap-1 text-sm">
            <span className="text-muted">{copy.prompt}</span>
            <span dir="auto" className="whitespace-pre-wrap break-words border-s-2 border-accent ps-3 text-ink">{prompt}</span>
          </p>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-ink">{copy.shape}
              <select value={ratio} disabled={busy} onChange={event => setRatio(event.target.value as ImageRatio)} className="min-h-11 rounded-xl border border-line bg-surface px-3 text-ink">
                <option value="1:1">{copy.square}</option><option value="16:9">{copy.landscape}</option><option value="9:16">{copy.portrait}</option>
              </select>
            </label>
            <button type="submit" disabled={busy || !available || !prompt.trim()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm text-surface disabled:opacity-50">
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ImageIcon className="size-4" aria-hidden="true" />}{busy ? copy.creating : copy.create}
            </button>
          </div>
          {answer ? <label className="flex min-h-11 items-center gap-2 text-sm text-muted"><input type="checkbox" checked={useAnswer} disabled={busy} onChange={event => setUseAnswer(event.target.checked)} className="size-4 accent-accent" />{copy.context}</label> : null}
        </form>
        <div aria-live="polite" aria-busy={busy}>
          {available === false ? <p className="mt-3 text-sm text-muted">{copy.unconfigured}</p> : null}
          {result && result.status !== "ok" ? <p role="alert" className="mt-3 text-sm text-muted">{copy[result.status]}</p> : null}
          {result?.status === "ok" ? <figure className="mt-4">
            <img src={result.src} alt={result.prompt} className="mx-auto max-h-screen w-auto max-w-full rounded-xl" />
            <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <span>{copy.generated}</span><a href={result.src} download="zip1-image.jpg" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-sm text-ink"><Download className="size-4" aria-hidden="true" />{copy.save}</a>
            </figcaption>
          </figure> : null}
        </div>
      </div> : null}
    </div>
  );
}
