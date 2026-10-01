import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { childOf, installDomGuard, isForeignDomError } from "./dom-guard.ts";

/** A tiny stand-in for DOM nodes whose native methods throw like the browser's do. */
class FakeNode {
  parentNode: FakeNode | null = null;
  children: FakeNode[] = [];
  readonly name: string;
  constructor(name: string) {
    this.name = name;
  }
  removeChild(child: FakeNode): FakeNode {
    const at = this.children.indexOf(child);
    if (at < 0) throw new Error("Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.");
    this.children.splice(at, 1);
    child.parentNode = null;
    return child;
  }
  insertBefore(node: FakeNode, ref: FakeNode | null): FakeNode {
    if (node.parentNode) node.parentNode.removeChild(node);
    const at = ref ? this.children.indexOf(ref) : this.children.length;
    if (at < 0) throw new Error("Failed to execute 'insertBefore' on 'Node': The node before which the new node is to be inserted is not a child of this node.");
    this.children.splice(at, 0, node);
    node.parentNode = this;
    return node;
  }
  append(...nodes: FakeNode[]): this {
    for (const node of nodes) this.insertBefore(node, null);
    return this;
  }
}

/** What Google Translate does to a text node: swap it for <font><font>translated</font></font>. */
function translate(text: FakeNode): FakeNode {
  const parent = text.parentNode!;
  const outer = new FakeNode("font");
  outer.append(new FakeNode("font").append(new FakeNode("#text translated")));
  parent.insertBefore(outer, text);
  parent.removeChild(text);
  return outer;
}

/** What Chrome's other translate mode does: wrap the original node in place. */
function wrap(text: FakeNode): FakeNode {
  const parent = text.parentNode!;
  const font = new FakeNode("font");
  parent.insertBefore(font, text);
  font.append(text);
  return font;
}

describe("dom-guard", () => {
  it("reproduces the crash without the guard", () => {
    const p = new FakeNode("p");
    const count = new FakeNode("#text — 10,000+ results");
    p.append(new FakeNode("#text Search for"), count);
    translate(count);
    assert.throws(() => p.removeChild(count), /not a child of this node/);
  });

  it("tolerates removing and inserting around translated or wrapped text", () => {
    class Guarded extends FakeNode {}
    const mismatches: string[] = [];
    assert.equal(installDomGuard(Guarded.prototype as never, (kind) => mismatches.push(kind)), true);
    assert.equal(installDomGuard(Guarded.prototype as never), false, "installs once");

    // Swapped out: removing it is a no-op, the translated text stays.
    const p = new Guarded("p");
    const label = new Guarded("#text Search for");
    const count = new Guarded("#text — 10,000+ results");
    p.append(label, count);
    const font = translate(count);
    assert.equal(p.removeChild(count), count);
    assert.deepEqual(p.children, [label, font]);

    // Wrapped in place: removed from its real parent.
    const div = new Guarded("div");
    const text = new Guarded("#text hello");
    div.append(text);
    const wrapper = wrap(text);
    div.removeChild(text);
    assert.equal(text.parentNode, null);
    assert.deepEqual(wrapper.children, []);

    // insertBefore a wrapped reference goes before the wrapper; a missing reference appends.
    const list = new Guarded("ul");
    const ref = new Guarded("#text b");
    list.append(new Guarded("#text a"), ref);
    const refWrapper = wrap(ref);
    const fresh = new Guarded("li");
    list.insertBefore(fresh, ref);
    assert.equal(list.children.indexOf(fresh), list.children.indexOf(refWrapper) - 1);
    const gone = new Guarded("#text gone");
    const last = new Guarded("li last");
    list.insertBefore(last, gone);
    assert.equal(list.children.at(-1), last);

    assert.deepEqual(mismatches, ["removeChild", "removeChild", "insertBefore", "insertBefore"]);
  });

  it("leaves normal calls alone", () => {
    class Plain extends FakeNode {}
    let warned = 0;
    installDomGuard(Plain.prototype as never, () => warned++);
    const p = new Plain("p");
    const a = new Plain("a");
    const b = new Plain("b");
    p.append(b);
    p.insertBefore(a, b);
    p.removeChild(b);
    assert.deepEqual(p.children, [a]);
    assert.equal(warned, 0);
    assert.equal(childOf(p, a), a);
    assert.equal(childOf(p, new Plain("x")), null);
  });
});

describe("isForeignDomError", () => {
  it("recognises the translator crash messages only", () => {
    assert.ok(isForeignDomError("Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node."));
    assert.ok(isForeignDomError("Failed to execute 'insertBefore' on 'Node': The node before which the new node is to be inserted is not a child of this node."));
    assert.ok(!isForeignDomError("Network request failed"));
  });
});

