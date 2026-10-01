/**
 * Keeps React from crashing when something outside React moves the nodes it owns.
 *
 * Browser page translators (Chrome/Google Translate, Edge, Safari) replace text nodes with
 * `<font>` wrappers. React still holds the original node, so the next time it removes that node,
 * or inserts a sibling before it, the browser throws:
 *   "Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node."
 *   "Failed to execute 'insertBefore' on 'Node': The node before which the new node is to be inserted is not a child of this node."
 * and the whole page falls into the error screen (facebook/react#11538).
 *
 * The guard keeps those two calls from throwing in exactly that situation:
 * - removeChild of a node that sits deeper inside this parent (wrapped) removes it from its real parent;
 *   one that is no longer in this parent at all (swapped out) is already gone, so nothing is done.
 * - insertBefore with a reference node that was wrapped inserts before the wrapper; one that is gone appends.
 * Every other call goes straight to the browser's own method.
 */

type NodeLike = {
  parentNode: NodeLike | null;
};

type NodeProto = {
  removeChild: (child: never) => unknown;
  insertBefore: (node: never, child: never) => unknown;
};

const INSTALLED = Symbol.for("folio.domGuard");

/** The ancestor of `node` (or `node` itself) whose parent is `parent`, if `node` is inside `parent`. */
export function childOf(parent: NodeLike, node: NodeLike | null): NodeLike | null {
  let current = node;
  while (current && current.parentNode !== parent) current = current.parentNode;
  return current;
}

export function installDomGuard(proto: NodeProto, onMismatch?: (kind: "removeChild" | "insertBefore") => void): boolean {
  const target = proto as NodeProto & { [INSTALLED]?: true };
  if (target[INSTALLED]) return false;
  target[INSTALLED] = true;

  const removeChild = proto.removeChild as (this: NodeLike, child: NodeLike) => NodeLike;
  const insertBefore = proto.insertBefore as (this: NodeLike, node: NodeLike, child: NodeLike | null) => NodeLike;

  proto.removeChild = function guardedRemoveChild(this: NodeLike, child: NodeLike) {
    if (child && child.parentNode !== this) {
      onMismatch?.("removeChild");
      const holder = child.parentNode;
      if (holder && childOf(this, holder)) return removeChild.call(holder, child);
      return child;
    }
    return removeChild.call(this, child);
  } as NodeProto["removeChild"];

  proto.insertBefore = function guardedInsertBefore(this: NodeLike, node: NodeLike, child: NodeLike | null) {
    if (child && child.parentNode !== this) {
      onMismatch?.("insertBefore");
      return insertBefore.call(this, node, childOf(this, child));
    }
    return insertBefore.call(this, node, child);
  } as NodeProto["insertBefore"];

  return true;
}

/** The DOM errors a page translator (or another extension) causes by moving nodes React owns. */
export function isForeignDomError(message: string): boolean {
  return /\b(removeChild|insertBefore)\b.*not a child of this node|NotFoundError.*(removeChild|insertBefore)/i.test(message);
}

/** Install once in the browser, before React hydrates. A no-op on the server. */
export function installBrowserDomGuard(): void {
  if (typeof window === "undefined" || typeof Node === "undefined") return;
  installDomGuard(Node.prototype as unknown as NodeProto, (kind) => {
    // Visible in the console for debugging, without breaking the page.
    console.warn(`[dom-guard] ${kind} on a node moved by something outside React (often a page translator); recovered.`);
  });
}
