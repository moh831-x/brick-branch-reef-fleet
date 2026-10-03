/**
 * Lay an AI answer out as lines: paragraphs, bullet items ("- ", "* ", "• "), and code blocks.
 * Used for news answers, which come as a dated intro, bold-headline bullets, and a closing line.
 * Pure, for tests.
 */
import type { AiPart } from "./ai.shared.ts";

export type AnswerBlock = { kind: "p"; parts: AiPart[] } | { kind: "li"; parts: AiPart[] } | { kind: "code"; part: Extract<AiPart, { code: string }> };

// Only unnumbered bullets: numbered steps keep their numbers as written.
const BULLET = /^\s*[-*•‣]\s+/;

/** True when the answer has at least one bullet line, so it is shown as a list. */
export function hasBullets(parts: readonly AiPart[]): boolean {
  let lineStart = true;
  for (const part of parts) {
    if (!("text" in part)) {
      lineStart = false;
      continue;
    }
    const lines = part.text.split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      if ((index > 0 || lineStart) && BULLET.test(lines[index] ?? "")) return true;
    }
    lineStart = part.text.endsWith("\n");
  }
  return false;
}

/** Split the parts into one block per line; citations and bold runs stay with their line. */
export function answerBlocks(parts: readonly AiPart[]): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  let current: { kind: "p" | "li"; parts: AiPart[] } | null = null;
  const close = () => {
    if (current && current.parts.some((part) => !("text" in part) || part.text.trim())) {
      // Trim the line's ends.
      const first = current.parts[0];
      if (first && "text" in first) current.parts[0] = { ...first, text: first.text.trimStart() };
      const lastIndex = current.parts.length - 1;
      const last = current.parts[lastIndex];
      if (last && "text" in last) current.parts[lastIndex] = { ...last, text: last.text.trimEnd() };
      current.parts = current.parts.filter((part) => !("text" in part) || part.text);
      blocks.push(current);
    }
    current = null;
  };
  const add = (part: AiPart) => {
    current ??= { kind: "p", parts: [] };
    current.parts.push(part);
  };
  for (const part of parts) {
    if ("code" in part) {
      close();
      blocks.push({ kind: "code", part });
      continue;
    }
    if ("cite" in part) {
      add(part);
      continue;
    }
    const lines = part.text.split("\n");
    lines.forEach((line, index) => {
      if (index > 0) close();
      if (!current && BULLET.test(line)) {
        current = { kind: "li", parts: [] };
        line = line.replace(BULLET, "");
      }
      if (line) add(part.strong ? { text: line, strong: true } : { text: line });
    });
  }
  close();
  return blocks;
}

/** Group consecutive citation parts, so a run like [1][3] becomes one source chip. */
export function groupCites(parts: readonly AiPart[]): Array<AiPart | { cites: number[] }> {
  const out: Array<AiPart | { cites: number[] }> = [];
  for (const part of parts) {
    if ("cite" in part) {
      const prev = out[out.length - 1];
      if (prev && "cites" in prev) {
        if (!prev.cites.includes(part.cite)) prev.cites.push(part.cite);
      } else out.push({ cites: [part.cite] });
    } else out.push(part);
  }
  return out;
}
