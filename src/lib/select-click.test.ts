import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clickAction, DRAG_SLOP } from "./select-click.ts";

const click = { button: 0, modified: false, detail: 1, moved: 0, selected: false };

describe("clickAction", () => {
  it("opens on a plain click and on a keyboard press", () => {
    assert.equal(clickAction(click), "open");
    assert.equal(clickAction({ ...click, detail: 0, moved: 400 }), "open");
    assert.equal(clickAction({ ...click, moved: DRAG_SLOP }), "open");
  });

  it("ignores a click that ends a drag or a text selection", () => {
    assert.equal(clickAction({ ...click, moved: DRAG_SLOP + 1 }), "ignore");
    assert.equal(clickAction({ ...click, selected: true }), "ignore");
  });

  it("ignores the extra clicks of a double or triple click (word and line selection)", () => {
    assert.equal(clickAction({ ...click, detail: 2 }), "ignore");
    assert.equal(clickAction({ ...click, detail: 3 }), "ignore");
  });

  it("leaves modified and non-main-button clicks to the browser", () => {
    assert.equal(clickAction({ ...click, modified: true }), "native");
    assert.equal(clickAction({ ...click, button: 1 }), "native");
  });
});
