/**
 * Regression guard for the "removeChild / insertBefore: not a child of this node" crash.
 *
 * A JSX child that is sometimes bare text and sometimes nothing (or an element), e.g.
 * `{count ? ` — ${count}` : ""}`, makes React add and remove a text node directly. Page translators
 * replace text nodes with <font> wrappers, so that removal throws. Such children must be wrapped
 * in an element (`{count ? <span> — {count}</span> : null}`). src/lib/dom-guard.ts is the safety net.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

type Kind = "el" | "null" | "text" | "list" | "mixed";

function kindOf(node: ts.Expression): { kind: Kind; risky: boolean } {
  const e = ts.isParenthesizedExpression(node) ? node.expression : node;
  if (ts.isJsxElement(e) || ts.isJsxSelfClosingElement(e) || ts.isJsxFragment(e)) return { kind: "el", risky: false };
  if ((ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) && e.text === "") return { kind: "null", risky: false };
  if (e.kind === ts.SyntaxKind.NullKeyword || e.kind === ts.SyntaxKind.FalseKeyword || (ts.isIdentifier(e) && e.text === "undefined")) {
    return { kind: "null", risky: false };
  }
  if (ts.isConditionalExpression(e)) {
    const a = kindOf(e.whenTrue);
    const b = kindOf(e.whenFalse);
    const risky = a.risky || b.risky || (a.kind !== b.kind && (a.kind === "text" || b.kind === "text"));
    return { kind: a.kind === b.kind ? a.kind : "mixed", risky };
  }
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    const right = kindOf(e.right);
    return { kind: "mixed", risky: right.risky || right.kind === "text" };
  }
  if (ts.isCallExpression(e) && /\.map$/.test(e.expression.getText())) return { kind: "list", risky: false };
  return { kind: "text", risky: false };
}

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return tsxFiles(path);
    return entry.name.endsWith(".tsx") ? [path] : [];
  });
}

export function conditionalTextChildren(file: string, source: string): string[] {
  const src = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
      for (const child of node.children) {
        if (!ts.isJsxExpression(child) || !child.expression) continue;
        if (kindOf(child.expression).risky) {
          const { line } = src.getLineAndCharacterOfPosition(child.getStart());
          found.push(`${file}:${line + 1} ${child.getText().replace(/\s+/g, " ").slice(0, 100)}`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(src);
  return found;
}

describe("JSX text nodes", () => {
  it("flags conditional bare text and accepts wrapped text", () => {
    const bad = conditionalTextChildren(
      "x.tsx",
      'const a = <p>{copy.searchFor}{count ? ` — ${count}` : ""}{on && "yes"}{x ? <b /> : label}</p>;',
    );
    assert.equal(bad.length, 3);
    const good = conditionalTextChildren(
      "y.tsx",
      'const a = <p>{copy.searchFor}{count ? <span> — {count}</span> : null}{on ? copy.on : copy.off}{x ? <b /> : <i />}</p>;',
    );
    assert.deepEqual(good, []);
  });

  it("has no conditional bare text children in the app", () => {
    const root = join(import.meta.dirname, "..");
    const found = tsxFiles(root).flatMap((file) => conditionalTextChildren(file.slice(root.length + 1), readFileSync(file, "utf8")));
    assert.deepEqual(found, [], "Wrap these in an element (e.g. <span>) so page translators cannot break them");
  });
});
