import { useContext, useEffect, useId, useRef, useState } from "react";
import { ChatInputContext } from "@/lib/chat-input-context";
import { Download, ImageIcon, Loader2, X } from "lucide-react";
import { createAnswerImage, imageCreationStatus } from "@/lib/image.functions";
import { imageCopy } from "@/lib/image-copy";
import type { ImageRatio, ImageResult } from "@/lib/image.shared";
import type { UiLang } from "@/lib/i18n";

export function AnswerImage({ query, answer, lang }: { query: string; answer?: string; lang: UiLang }) {
  const copy = imageCopy(lang);
  const bridge = useContext(ChatInputContext);
  const activateImage = bridge?.activateImage;
  const closeImage = bridge?.closeImage;
  const id = useId();
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [ratio, setRatio] = useState<ImageRatio>("1:1");
  const [useAnswer, setUseAnswer] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImageResult | null>(null);
  const running = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; closeImage?.(id); };
  }, []);
  useEffect(() => {
    if (!open || available !== null) return;
    let cancelled = false;
    imageCreationStatus().then(row => { if (!cancelled) setAvailable(row.available); }).catch(() => { if (!cancelled) setAvailable(false); });
    return () => { cancelled = true; };
  }, [open, available]);

  async function create(prompt: string) {
    if (running.current || !available || !prompt.trim()) return;
    running.current = true;
    setBusy(true);
    setResult(null);
    try {
      const next = await createAnswerImage({ data: { prompt, ratio, answer: useAnswer ? answer ?? "" : "" } });
      if (alive.current) setResult(next);
    } catch { if (alive.current) setResult({ status: "error" }); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  }

  useEffect(() => {
    if (!open) return;
    activateImage?.({ id, send: prompt => void create(prompt), placeholder: copy.prompt, initial: query.slice(0, 1000), available: available === true, busy });
    // Register the current image settings with the one shared input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, available, busy, ratio, useAnswer, answer, query, copy.prompt, activateImage, id]);
  function close() { setOpen(false); closeImage?.(id); }

  return (
    <div className="mt-4 border-t border-line pt-3">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => open ? close() : setOpen(true)} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-sm text-ink hover:bg-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
        <ImageIcon className="size-4 text-accent" aria-hidden="true" />{copy.create}
      </button>
      {open ? <div id={id} className="mt-3 rounded-2xl bg-bg p-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-muted">{copy.sharedInput}</p>
          <button type="button" aria-label={copy.close} onClick={close} className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface"><X className="size-4" aria-hidden="true" /></button>
        </div>
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-ink">{copy.shape}
              <select value={ratio} disabled={busy} onChange={event => setRatio(event.target.value as ImageRatio)} className="min-h-11 rounded-xl border border-line bg-surface px-3 text-ink">
                <option value="1:1">{copy.square}</option><option value="16:9">{copy.landscape}</option><option value="9:16">{copy.portrait}</option>
              </select>
            </label>
            {busy ? <span role="status" className="inline-flex items-center gap-2 text-sm text-muted"><Loader2 className="size-4 animate-spin" aria-hidden="true" />{copy.creating}</span> : null}
          </div>
          {answer ? <label className="flex min-h-11 items-center gap-2 text-sm text-muted"><input type="checkbox" checked={useAnswer} disabled={busy} onChange={event => setUseAnswer(event.target.checked)} className="size-4 accent-accent" />{copy.context}</label> : null}
        </div>
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
