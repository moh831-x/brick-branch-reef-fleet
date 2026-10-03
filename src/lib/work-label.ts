/** The words for each AI progress step, in the page language. Pure, safe on the server and in the browser. */
import { AI_MODELS, aiModelLabelFor, aiProviderLabel, type AiFailureKind, type AnswerProviderId } from "./ai.shared.ts";
import type { WorkStep } from "./ai-progress.ts";
import type { UiLang } from "./i18n.ts";
import { joinList, progressCopy } from "./progress-copy.ts";
import { fill, sourceLabel, type UiCopy } from "./ui-copy.ts";

export const FAILURE_COPY: Record<AiFailureKind, keyof UiCopy> = {
  plan: "failPlan",
  auth: "failAuth",
  "bad-request": "failBadRequest",
  "not-found": "failNotFound",
  "rate-limit": "failRateLimit",
  timeout: "failTimeout",
  server: "failServer",
  empty: "failEmpty",
  network: "failNetwork",
  unavailable: "failUnavailable",
  other: "failOther",
};

/** The menu name for a model id the server sent ("openai/gpt-6-astra" -> "GPT-6 Astra"), else the provider's name. */
export function modelName(model: string | undefined, provider: AnswerProviderId | undefined): string {
  if (model) {
    const label = aiModelLabelFor(model);
    if (label !== model || AI_MODELS.some((spec) => spec.id === model)) return label;
  }
  return provider ? aiProviderLabel(provider) : model ?? "";
}

/** A step's template and its values, so the page can isolate names (model, sources) for right-to-left text. */
export function stepTemplate(step: WorkStep, lang: UiLang, copy: UiCopy): { template: string; values: Record<string, string> } {
  const words = progressCopy(lang);
  const model = modelName(step.model, step.provider);
  switch (step.kind) {
    case "search": {
      const sources = step.sources ?? [];
      if (!sources.length || sources.includes("web")) return { template: words.searchWeb, values: {} };
      return { template: words.searchSources, values: { sources: joinList(lang, sources.map((id) => sourceLabel(copy, id))) } };
    }
    case "read": {
      if (step.chat || !step.count) return { template: words.readChat, values: {} };
      let category: Intl.LDMLPluralRule = "other";
      try {
        category = new Intl.PluralRules(lang).select(step.count);
      } catch {
        // Keep "other".
      }
      let n = String(step.count);
      try {
        n = step.count.toLocaleString(lang);
      } catch {
        // Keep the plain number.
      }
      return { template: words.readSources[category] ?? words.readSources.other, values: { n } };
    }
    case "ask":
      if (!step.model && !step.provider) return { template: words.askAny, values: {} };
      return { template: step.fallback ? words.askFallback : words.ask, values: { model } };
    case "retry":
      return { template: words.retry, values: { model } };
    case "failed":
      return { template: words.failed, values: { model, reason: copy[FAILURE_COPY[step.reason ?? "other"]] } };
    case "skipped":
      return { template: words.skipped, values: { model } };
    case "hedge":
      return { template: words.hedge, values: { model } };
    case "write":
      return { template: words.write, values: {} };
  }
}

export function stepLabel(step: WorkStep, lang: UiLang, copy: UiCopy): string {
  const { template, values } = stepTemplate(step, lang, copy);
  return fill(template, values);
}
