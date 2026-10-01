/**
 * Telling a click from the end of a text selection. Result text sits in plain elements (not
 * buttons, which browsers will not start a selection in), and links are not draggable, so a drag
 * selects text. A click that ends a drag or a selection, or the clicks of a double or triple click
 * (which select a word or line), must not open anything.
 */

/** How far (in CSS pixels) the pointer may move between press and release and still count as a click. */
export const DRAG_SLOP = 5;

export type ClickFacts = {
  /** MouseEvent.button: 0 is the main button. */
  button: number;
  /** Ctrl, Cmd, Shift, or Alt was held: leave the link to the browser (new tab, new window, download). */
  modified: boolean;
  /** MouseEvent.detail: 0 for a keyboard press, 1 for a single click, 2+ for double and triple clicks. */
  detail: number;
  /** Distance the pointer moved since it was pressed. */
  moved: number;
  /** Some text is selected on the page right now. */
  selected: boolean;
};

/** native: let the browser handle it; ignore: do nothing (and keep the selection); open: run the action. */
export type ClickAction = "native" | "ignore" | "open";

export function clickAction(facts: ClickFacts): ClickAction {
  if (facts.button !== 0 || facts.modified) return "native";
  if (facts.detail === 0) return "open";
  if (facts.moved > DRAG_SLOP || facts.selected || facts.detail > 1) return "ignore";
  return "open";
}

let lastPress: { x: number; y: number } | null = null;
let tracking = false;

/** Remember where each press starts (installed once, in the capture phase so nothing can hide it). */
export function trackPresses(): void {
  if (tracking || typeof document === "undefined") return;
  tracking = true;
  document.addEventListener(
    "pointerdown",
    (event) => {
      lastPress = { x: event.clientX, y: event.clientY };
    },
    { capture: true, passive: true },
  );
}

type ClickLike = {
  button: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  detail: number;
  clientX: number;
  clientY: number;
};

/** Read the facts for a DOM click event. */
export function factsOf(event: ClickLike): ClickFacts {
  const selection = typeof window !== "undefined" ? window.getSelection() : null;
  const selected = Boolean(selection && !selection.isCollapsed && selection.toString().trim());
  const moved = lastPress ? Math.hypot(event.clientX - lastPress.x, event.clientY - lastPress.y) : 0;
  return {
    button: event.button,
    modified: event.ctrlKey || event.metaKey || event.shiftKey || event.altKey,
    detail: event.detail,
    moved,
    selected,
  };
}
