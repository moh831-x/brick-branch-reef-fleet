/**
 * Every prompt goes through the one search bar. Features that take a prompt (follow-ups to the AI
 * answer, image creation) register here instead of drawing their own text box; the bar then sends
 * to the active one, and shows which with a small chip that leads back to a plain search.
 */
import { createContext, useContext } from "react";
import type { AiQuestion } from "@/lib/ai-clarify";

export type PromptKind = "chat" | "image";

export type PromptTarget = {
  kind: PromptKind;
  /** Busy: the bar waits instead of sending. */
  pending: boolean;
  /** Longest prompt this target takes. */
  maxLength: number;
  /** Send the text; false when it could not be sent (the bar keeps it). */
  submit: (text: string) => boolean;
  /**
   * A conversation waiting on a clarifying question: the bar shows it as a card above itself. An
   * answer goes through `submit`; `dismiss` hides it (Skip, X, Escape).
   */
  question?: { key: string; value: AiQuestion; dismiss: () => void };
};

export type PromptBridge = {
  register: (id: string, target: PromptTarget) => void;
  unregister: (id: string) => void;
  /** Make this target the bar's and focus the bar. */
  activate: (id: string) => void;
  /** Stop sending to this target (back to the conversation, if any, else searching). */
  release: (id: string) => void;
};

export const PromptBridgeContext = createContext<PromptBridge | null>(null);

export function usePromptBridge(): PromptBridge | null {
  return useContext(PromptBridgeContext);
}

/**
 * Which target the bar sends to: the chosen one while it is registered, else none (plain search).
 * Pure, for tests.
 */
export function activeTarget(targets: Record<string, PromptTarget>, activeId: string | null): { id: string; target: PromptTarget } | null {
  if (!activeId) return null;
  const target = targets[activeId];
  return target ? { id: activeId, target } : null;
}

/** Where the bar goes when `releasedId` lets go: the conversation if one is on the page, else searching. */
export function afterRelease(targets: Record<string, PromptTarget>, releasedId: string): string | null {
  return Object.entries(targets).find(([id, target]) => id !== releasedId && target.kind === "chat")?.[0] ?? null;
}
