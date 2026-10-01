import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildPlot, cleanGraphQuery, evaluate, formatExpression, graphSuggestions, parseExpression, parseGraphQuery, ticks } from "./graph.ts";

const at = (source: string, x: number) => {
  const node = parseExpression(source);
  assert.ok(node, `parses ${source}`);
  return evaluate(node, x);
};

describe("graph expressions", () => {
  it("follows the usual order of operations", () => {
    assert.equal(at("2x+1", 3), 7);
    assert.equal(at("-x^2", 3), -9);
    assert.equal(at("2^3^2", 0), 512);
    assert.equal(at("x^-1", 4), 0.25);
    assert.equal(at("2(x+1)(x-1)", 3), 16);
    assert.equal(at("x(x+1)", 2), 6);
    assert.equal(at("(x+1)/(x-1)", 3), 2);
    assert.equal(at("6/2x", 1), 3, "6/2·x reads left to right");
  });

  it("knows the common functions and constants", () => {
    assert.equal(at("sin(pi/2)", 0), 1);
    assert.ok(Math.abs(at("cos x", Math.PI) + 1) < 1e-12);
    assert.equal(at("sqrt(x)", 9), 3);
    assert.equal(at("√x", 16), 4);
    assert.equal(at("log(x)", 1000), 3);
    assert.equal(at("ln(e)", 0), 1);
    assert.equal(at("exp(0)", 0), 1);
    assert.equal(at("abs(x)", -3), 3);
    assert.equal(at("|x - 5|", 2), 3);
    assert.equal(at("e^x", 0), 1);
    assert.equal(at("x²", 3), 9);
    assert.equal(at("3×x − 1", 2), 5);
    assert.equal(at("2πx", 1), 2 * Math.PI);
    assert.equal(at("sin 2x", Math.PI / 4), 1, "sin 2x is sin(2x)");
    assert.equal(at("sin(x)^2", Math.PI / 2), 1);
    assert.equal(at("x^(1/3)", -8), -2, "odd roots of negatives");
    assert.equal(at("arctan(x)", 1), Math.PI / 4);
  });

  it("rejects anything that isn't math in x", () => {
    for (const bad of ["theory", "x +", "2x)", "(x", "alert(1)", "x; y", "constructor", "x = 2", "", "tab", "1..2"]) {
      assert.equal(parseExpression(bad), null, bad);
    }
  });

  it("prints labels the usual way", () => {
    const label = (source: string) => formatExpression(parseExpression(source)!);
    assert.equal(label("x"), "x");
    assert.equal(label("2*x+1"), "2x + 1");
    assert.equal(label("x^2"), "x²");
    assert.equal(label("x^-1"), "x⁻¹");
    assert.equal(label("sin x"), "sin(x)");
    assert.equal(label("sqrt(x)"), "√x");
    assert.equal(label("abs(x-1)"), "|x - 1|");
    assert.equal(label("x-(x+1)"), "x - (x + 1)");
    assert.equal(label("pi*x"), "πx");
    assert.equal(label("x*sin(x)"), "x·sin(x)");
  });
});

describe("graph searches", () => {
  const labels = (query: string) => parseGraphQuery(query)?.functions.map((fn) => fn.label) ?? null;

  it("recognizes graphing requests", () => {
    assert.deepEqual(labels("graph x"), ["y = x"]);
    assert.deepEqual(labels("plot sin(x)"), ["y = sin(x)"]);
    assert.deepEqual(labels("y = x^2"), ["y = x²"]);
    assert.deepEqual(labels("graph 2x+1 and x^2"), ["y = 2x + 1", "y = x²"]);
    assert.deepEqual(labels("Graph y=x^2"), ["y = x²"]);
    assert.deepEqual(labels("f(x) = 3x - 2"), ["y = 3x - 2"]);
    assert.deepEqual(labels("plot sin x, cos x"), ["y = sin(x)", "y = cos(x)"]);
    assert.deepEqual(labels("graph of tan(x)"), ["y = tan(x)"]);
    assert.deepEqual(labels("x^2 graph"), ["y = x²"]);
    assert.deepEqual(labels("graficar x^2"), ["y = x²"]);
    assert.deepEqual(labels("x^2 のグラフ"), ["y = x²"]);
    assert.deepEqual(labels("ارسم y = x"), ["y = x"]);
    assert.deepEqual(labels("y = x and y = x^2 and y = x^3"), ["y = x", "y = x²", "y = x³"]);
  });

  it("ignores quote marks, end punctuation, and polite filler", () => {
    for (const query of [
      "y = x^2",
      '"y = x^2"',
      "“y = x^2”",
      "‘y = x^2’",
      "'y = x^2'",
      "`y = x^2`",
      "「y = x^2」",
      "«y = x^2»",
      "„y = x^2“",
      "y = x^2?",
      "y = x^2.",
      "y = x^2!",
      '"y = x^2"?',
      'graph "x^2"',
      "y=x²",
      "graph of x^2",
      "x^2 graph",
      "plot y = x^2 please",
      "please plot y = x^2",
      "can you graph x^2 for me?",
      "show me y = x^2",
      "what does y=x^2 look like",
      "what does y = x^2 look like?",
      "what is the graph of x^2?",
    ]) {
      assert.deepEqual(labels(query), ["y = x²"], query);
    }
    assert.equal(cleanGraphQuery(' "y = x^2" ?! '), "y = x^2");
    assert.equal(cleanGraphQuery("-x^2 graph"), "-x^2 graph", "a leading minus is math, not punctuation");
    assert.deepEqual(labels("graph x^2 from -10 to 10."), ["y = x²"]);
  });

  it("leaves normal searches alone", () => {
    for (const query of [
      "graph theory",
      "X (Twitter) graph",
      "x graph",
      "graph paper",
      "plot twist",
      "chart of accounts",
      "draw a circle",
      "graph database",
      "knowledge graph",
      "y = mx + b",
      "y = 5",
      "graph pie",
      "x",
      "Dubai",
      "sin",
      "graph x^2 + y^2 = 1",
      '"graph theory"',
      "graph theory?",
      '"X (Twitter) graph"',
      "x graph?",
      "what does x look like",
      "what does the new x logo look like",
      "please",
      '""',
    ]) {
      assert.equal(parseGraphQuery(query), null, query);
    }
  });

  it("reads an x range", () => {
    const request = parseGraphQuery("graph x^2 from -10 to 10");
    assert.deepEqual([request?.xMin, request?.xMax, request?.rangeGiven], [-10, 10, true]);
    const brackets = parseGraphQuery("plot sin(x) for x in [-pi, pi]");
    assert.ok(brackets && Math.abs(brackets.xMax - Math.PI) < 1e-12 && brackets.functions.length === 1);
    assert.deepEqual(parseGraphQuery("y = x from -10 to 10")?.functions.map((fn) => fn.source), ["x"]);
    assert.deepEqual([parseGraphQuery("graph x")?.xMin, parseGraphQuery("graph x")?.xMax], [-5, 5]);
  });
});

describe("graph plots", () => {
  it("uses the -5..5 plane when the curve fits", () => {
    const plot = buildPlot(parseGraphQuery("graph x")!);
    assert.deepEqual([plot.xMin, plot.xMax, plot.yMin, plot.yMax], [-5, 5, -5, 5]);
    assert.deepEqual(plot.xTicks, [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5]);
    assert.equal(plot.series[0]!.segments.length, 1);
  });

  it("fits the y range to curves that leave the plane", () => {
    const plot = buildPlot(parseGraphQuery("graph e^x")!);
    assert.ok(plot.yMax > 50 && plot.yMin < 0 && plot.yMin > -10);
  });

  it("never joins the two sides of a pole", () => {
    const tan = buildPlot(parseGraphQuery("graph tan(x)")!).series[0]!;
    // Poles at ±π/2 and ±3π/2 inside -5..5: at least five separate pieces.
    assert.ok(tan.segments.length >= 5, String(tan.segments.length));
    for (const segment of tan.segments) {
      for (let i = 1; i < segment.length; i += 1) {
        assert.ok(Math.sign(segment[i]!.y) === Math.sign(segment[i - 1]!.y) || Math.abs(segment[i]!.y - segment[i - 1]!.y) < 5);
      }
    }
    const inverse = buildPlot(parseGraphQuery("plot 1/x")!).series[0]!;
    assert.equal(inverse.segments.length, 2);
    assert.ok(inverse.segments[0]!.every((point) => point.x < 0));
    assert.ok(inverse.segments[1]!.every((point) => point.x > 0));
  });

  it("skips x values where the function isn't defined", () => {
    const root = buildPlot(parseGraphQuery("plot sqrt(x)")!).series[0]!;
    assert.equal(root.segments.length, 1);
    assert.ok(root.segments[0]!.every((point) => point.x >= 0));
  });

  it("picks round tick steps", () => {
    assert.deepEqual(ticks(0, 100, 5), [0, 20, 40, 60, 80, 100]);
    assert.deepEqual(ticks(-1, 1, 4), [-1, -0.5, 0, 0.5, 1]);
  });

  it("suggests follow-ups that are graphing searches themselves", () => {
    for (const query of ["graph x", "plot sin(x)", "graph 2x+1 and x^2", "graph x^2 from -10 to 10"]) {
      const next = graphSuggestions(parseGraphQuery(query)!);
      assert.equal(next.length, 3, query);
      for (const item of next) assert.ok(parseGraphQuery(item), `${query} -> ${item}`);
    }
    assert.deepEqual(graphSuggestions(parseGraphQuery("graph x")!), ["y = x^2", "y = sin(x)", "y = x from -10 to 10"]);
  });
});
