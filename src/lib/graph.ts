/**
 * Graphing searches: "graph x", "plot sin(x)", "y = x^2", "graph 2x+1 and x^2".
 *
 * A small hand-written parser turns each expression into a tree and then into a plain function of
 * x. Nothing is ever passed to eval or Function: unknown words make the parse fail, which is also
 * how "graph theory" or "plot twist" are told apart from a real graphing request.
 */

export type GraphNode =
  | { type: "num"; value: number; name?: string }
  | { type: "x" }
  | { type: "neg"; arg: GraphNode }
  | { type: "bin"; op: "+" | "-" | "*" | "/" | "^"; left: GraphNode; right: GraphNode }
  | { type: "call"; fn: FunctionName; arg: GraphNode };

const FUNCTIONS = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  sec: (v: number) => 1 / Math.cos(v),
  csc: (v: number) => 1 / Math.sin(v),
  cot: (v: number) => 1 / Math.tan(v),
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  abs: Math.abs,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log10,
  log2: Math.log2,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  sign: Math.sign,
} as const;

export type FunctionName = keyof typeof FUNCTIONS;

const ALIASES: Record<string, FunctionName> = {
  arcsin: "asin",
  arccos: "acos",
  arctan: "atan",
  sgn: "sign",
};

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E, tau: 2 * Math.PI };

/** Every word the tokenizer knows, longest first so "exp" wins over "e" and "asin" over "a…". */
const WORDS = [...Object.keys(FUNCTIONS), ...Object.keys(ALIASES), ...Object.keys(CONSTANTS), "x"].sort(
  (a, b) => b.length - a.length,
);

type Token =
  | { kind: "num"; value: number }
  | { kind: "x" }
  | { kind: "const"; value: number; name: string }
  | { kind: "fn"; name: FunctionName }
  | { kind: "op"; value: "+" | "-" | "*" | "/" | "^" }
  | { kind: "open" }
  | { kind: "close" }
  | { kind: "bar" };

const SUPERSCRIPTS: Record<string, string> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-" };

/** Fold look-alike characters into plain ASCII math. */
export function normalizeMath(text: string): string {
  return text
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, (run) => `^(${[...run].map((char) => SUPERSCRIPTS[char]).join("")})`)
    .replace(/[−–—]/g, "-")
    .replace(/[×·⋅∙]/g, "*")
    .replace(/÷/g, "/")
    .replace(/π/g, "pi")
    .replace(/√/g, "sqrt")
    .replace(/\*\*/g, "^")
    .replace(/[［【]/g, "[")
    .replace(/[］】]/g, "]")
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/＝/g, "=")
    .replace(/，/g, ",");
}

function tokenize(source: string): Token[] | null {
  const text = source.toLowerCase();
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const char = text[i]!;
    if (/\s/.test(char)) {
      i += 1;
      continue;
    }
    const number = /^(\d+(?:\.\d+)?|\.\d+)/.exec(text.slice(i));
    if (number) {
      if (text[i + number[1]!.length] === ".") return null;
      tokens.push({ kind: "num", value: Number(number[1]) });
      i += number[1]!.length;
      continue;
    }
    if ("+-*/^".includes(char)) {
      tokens.push({ kind: "op", value: char as "+" | "-" | "*" | "/" | "^" });
      i += 1;
      continue;
    }
    if (char === "(" || char === "[" || char === "{") {
      tokens.push({ kind: "open" });
      i += 1;
      continue;
    }
    if (char === ")" || char === "]" || char === "}") {
      tokens.push({ kind: "close" });
      i += 1;
      continue;
    }
    if (char === "|") {
      tokens.push({ kind: "bar" });
      i += 1;
      continue;
    }
    if (/[a-z]/.test(char)) {
      const word = WORDS.find((candidate) => text.startsWith(candidate, i));
      if (!word) return null;
      if (word === "x") tokens.push({ kind: "x" });
      else if (word in CONSTANTS) tokens.push({ kind: "const", value: CONSTANTS[word]!, name: word === "pi" ? "π" : word === "tau" ? "τ" : "e" });
      else tokens.push({ kind: "fn", name: ALIASES[word] ?? (word as FunctionName) });
      i += word.length;
      continue;
    }
    return null;
  }
  return tokens;
}

class Parser {
  private at = 0;
  private readonly tokens: Token[];
  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): GraphNode | null {
    if (!this.tokens.length) return null;
    const node = this.expr();
    return node && this.at === this.tokens.length ? node : null;
  }

  private peek(): Token | undefined {
    return this.tokens[this.at];
  }

  private isOp(value: string): boolean {
    const token = this.peek();
    return token?.kind === "op" && token.value === value;
  }

  /** Whether the next token can begin a factor, for implicit multiplication ("2x", "x(x+1)"). */
  private startsFactor(): boolean {
    const token = this.peek();
    return Boolean(token && (token.kind === "num" || token.kind === "x" || token.kind === "const" || token.kind === "fn" || token.kind === "open"));
  }

  private expr(): GraphNode | null {
    let left = this.term();
    while (left && (this.isOp("+") || this.isOp("-"))) {
      const op = (this.tokens[this.at++] as { value: "+" | "-" }).value;
      const right = this.term();
      if (!right) return null;
      left = { type: "bin", op, left, right };
    }
    return left;
  }

  private term(): GraphNode | null {
    let left = this.unary();
    while (left) {
      if (this.isOp("*") || this.isOp("/")) {
        const op = (this.tokens[this.at++] as { value: "*" | "/" }).value;
        const right = this.unary();
        if (!right) return null;
        left = { type: "bin", op, left, right };
      } else if (this.startsFactor()) {
        const right = this.power();
        if (!right) return null;
        left = { type: "bin", op: "*", left, right };
      } else break;
    }
    return left;
  }

  private unary(): GraphNode | null {
    if (this.isOp("-")) {
      this.at += 1;
      const arg = this.unary();
      return arg ? { type: "neg", arg } : null;
    }
    if (this.isOp("+")) {
      this.at += 1;
      return this.unary();
    }
    return this.power();
  }

  private power(): GraphNode | null {
    const base = this.primary();
    if (!base) return null;
    if (this.isOp("^")) {
      this.at += 1;
      const exponent = this.unary();
      return exponent ? { type: "bin", op: "^", left: base, right: exponent } : null;
    }
    return base;
  }

  private primary(): GraphNode | null {
    const token = this.peek();
    if (!token) return null;
    this.at += 1;
    switch (token.kind) {
      case "num":
        return { type: "num", value: token.value };
      case "const":
        return { type: "num", value: token.value, name: token.name };
      case "x":
        return { type: "x" };
      case "open": {
        const inner = this.expr();
        if (!inner || this.peek()?.kind !== "close") return null;
        this.at += 1;
        return inner;
      }
      case "bar": {
        const inner = this.expr();
        if (!inner || this.peek()?.kind !== "bar") return null;
        this.at += 1;
        return { type: "call", fn: "abs", arg: inner };
      }
      case "fn": {
        // "sin(x)^2" squares the sine; "sin x^2" and "sin 2x" take the whole product as the argument.
        if (this.peek()?.kind === "open") {
          this.at += 1;
          const inner = this.expr();
          if (!inner || this.peek()?.kind !== "close") return null;
          this.at += 1;
          return { type: "call", fn: token.name, arg: inner };
        }
        let arg = this.power();
        while (arg && this.startsFactor() && this.peek()?.kind !== "fn") {
          const next = this.power();
          if (!next) return null;
          arg = { type: "bin", op: "*", left: arg, right: next };
        }
        return arg ? { type: "call", fn: token.name, arg } : null;
      }
      default:
        return null;
    }
  }
}

/** Parse one expression in x. Returns null for anything that isn't plain math. */
export function parseExpression(source: string): GraphNode | null {
  const tokens = tokenize(normalizeMath(source));
  if (!tokens) return null;
  return new Parser(tokens).parse();
}

export function evaluate(node: GraphNode, x: number): number {
  switch (node.type) {
    case "num":
      return node.value;
    case "x":
      return x;
    case "neg":
      return -evaluate(node.arg, x);
    case "call":
      return FUNCTIONS[node.fn](evaluate(node.arg, x));
    case "bin": {
      const a = evaluate(node.left, x);
      const b = evaluate(node.right, x);
      switch (node.op) {
        case "+":
          return a + b;
        case "-":
          return a - b;
        case "*":
          return a * b;
        case "/":
          return a / b;
        case "^":
          // Odd roots of negatives: x^(1/3) at x = -8 is -2, as on a graphing calculator.
          if (a < 0 && !Number.isInteger(b)) {
            const inverse = 1 / b;
            if (Number.isInteger(Math.round(inverse * 1e9) / 1e9) && Math.round(inverse) % 2 !== 0) return -Math.pow(-a, b);
          }
          return Math.pow(a, b);
      }
    }
  }
}

export function usesX(node: GraphNode): boolean {
  switch (node.type) {
    case "x":
      return true;
    case "num":
      return false;
    case "neg":
    case "call":
      return usesX(node.arg);
    case "bin":
      return usesX(node.left) || usesX(node.right);
  }
}

export type GraphFunction = { source: string; label: string; node: GraphNode };
export type GraphRequest = { functions: GraphFunction[]; xMin: number; xMax: number; rangeGiven: boolean };

/** Words that ask for a graph, in the site's ten languages. Matched at the start of the search. */
const LEAD_WORDS = [
  "graph of",
  "graph",
  "plot of",
  "plot",
  "draw",
  "sketch",
  "chart",
  "visualize",
  "graficar",
  "grafica",
  "gráfica de",
  "gráfica",
  "gráfico de",
  "gráfico",
  "dibujar",
  "trazar",
  "tracer",
  "tracé de",
  "courbe de",
  "plotar",
  "desenhar",
  "plotte",
  "plotten",
  "zeichne",
  "graph von",
  "ارسم",
  "رسم",
  "绘制",
  "画出",
  "画",
  "グラフ",
  "プロット",
  "ग्राफ़",
  "ग्राफ",
  "গ্রাফ",
  "প্লট",
];

/** Words that ask for a graph at the end ("x^2 graph", "x^2 のグラフ", "y=x^2 的图像"). */
const TRAIL_WORDS = ["のグラフ", "グラフ", "的图像", "的图", "图像", "graph", "plot", "का ग्राफ", "এর গ্রাফ", "গ্রাফ"];

const PREFIX = /^\s*(?:y|f\s*\(\s*x\s*\)|g\s*\(\s*x\s*\)|h\s*\(\s*x\s*\))\s*=\s*/i;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const LEAD = new RegExp(`^\\s*(?:${LEAD_WORDS.map(escapeRegExp).join("|")})(?:\\s+|\\s*[:：]\\s*|(?=[\\s\\dxyf(|√-]))`, "i");
const TRAIL = new RegExp(`\\s*(?:${TRAIL_WORDS.map(escapeRegExp).join("|")})\\s*$`, "i");
const RANGE_PATTERNS = [
  /\s+(?:for\s+(?:x\s+)?)?from\s+(-?[\d.]+|-?pi)\s+to\s+(-?[\d.]+|-?pi)\s*$/i,
  /\s*,?\s*(?:for\s+)?x\s*(?:in|∈)\s*[[(]\s*(-?[\d.]+|-?pi)\s*,\s*(-?[\d.]+|-?pi)\s*[\])]\s*$/i,
  /\s*,?\s*(?:for\s+)?(-?[\d.]+|-?pi)\s*(?:<|<=|≤)\s*x\s*(?:<|<=|≤)\s*(-?[\d.]+|-?pi)\s*$/i,
];

function readBound(text: string): number {
  const negative = text.startsWith("-");
  const body = negative ? text.slice(1) : text;
  const value = body.toLowerCase() === "pi" ? Math.PI : Number(body);
  return negative ? -value : value;
}

/** Split on "and", "&", ";", "vs", and top-level commas (never inside brackets). */
function splitFunctions(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  const words = /^(?:\s+(?:and|vs\.?|versus|with|y|et|und|و|和|と|और|এবং)\s+|\s*[&;；、]\s*)/i;
  for (let i = 0; i < text.length; ) {
    const char = text[i]!;
    if ("([{".includes(char)) depth += 1;
    if (")]}".includes(char)) depth -= 1;
    if (depth === 0) {
      const joiner = words.exec(text.slice(i));
      if (joiner) {
        parts.push(current);
        current = "";
        i += joiner[0].length;
        continue;
      }
      if (char === ",") {
        parts.push(current);
        current = "";
        i += 1;
        continue;
      }
    }
    current += char;
    i += 1;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

const SUPER: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻" };

function precedence(node: GraphNode): number {
  if (node.type === "bin") return node.op === "+" || node.op === "-" ? 1 : node.op === "^" ? 4 : 2;
  if (node.type === "neg") return 3;
  return 5;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(6)));
}

/** Print a parsed expression the way it's usually written: "2x + 1", "x²", "sin(x)", "|x|", "√x". */
export function formatExpression(node: GraphNode): string {
  const wrap = (child: GraphNode, min: number) => (precedence(child) < min ? `(${formatExpression(child)})` : formatExpression(child));
  switch (node.type) {
    case "num":
      return node.name ?? formatNumber(node.value);
    case "x":
      return "x";
    case "neg":
      return `-${wrap(node.arg, 3)}`;
    case "call": {
      if (node.fn === "abs") return `|${formatExpression(node.arg)}|`;
      if (node.fn === "sqrt") return precedence(node.arg) >= 5 && node.arg.type !== "call" ? `√${formatExpression(node.arg)}` : `√(${formatExpression(node.arg)})`;
      return `${node.fn}(${formatExpression(node.arg)})`;
    }
    case "bin": {
      if (node.op === "^") {
        const base = wrap(node.left, 5);
        const exponent = node.right.type === "neg" && node.right.arg.type === "num" && !node.right.arg.name ? -node.right.arg.value : node.right.type === "num" && !node.right.name ? node.right.value : null;
        if (exponent !== null && Number.isInteger(exponent) && Math.abs(exponent) < 1000) {
          return base + [...String(exponent)].map((char) => SUPER[char] ?? char).join("");
        }
        return `${base}^${wrap(node.right, 5)}`;
      }
      if (node.op === "*") {
        const left = wrap(node.left, 2);
        const right = wrap(node.right, 3);
        const juxtapose =
          (node.left.type === "num" && node.right.type !== "num" && !right.startsWith("-")) || right.startsWith("(");
        return juxtapose ? `${left}${right}` : `${left}·${right}`;
      }
      if (node.op === "/") return `${wrap(node.left, 2)}/${wrap(node.right, 3)}`;
      const right = node.op === "-" ? wrap(node.right, 2) : wrap(node.right, 1);
      return `${wrap(node.left, 1)} ${node.op} ${right}`;
    }
  }
}

/** Quote marks people put around a formula: straight, curly, low, angle, corner, full-width, backtick. */
const QUOTES = /["'`“”‘’‚„‟‹›«»「」『』〝〞＂＇]/g;
/** Politeness and filler around the request. */
const POLITE_LEAD = /^(?:(?:please|pls|can you|could you|would you|will you|kindly|show me|show|display|help me|i want to see|let me see)\s+)+/i;
const POLITE_TRAIL = /(?:\s+(?:please|pls|for me|thanks|thank you))+$/i;
const LOOKS_LIKE = /^(?:what\s+(?:does|do|would|will)\s+(.+?)\s+look\s+like|what\s+is\s+the\s+(?:graph|plot)\s+of\s+(.+))$/i;

/**
 * Tidy a search before reading it as math: fold look-alike characters, drop quote marks anywhere
 * ('"y = x^2"', '「y = x^2」'), polite filler ("please", "can you"), and end punctuation ("?", ".").
 * Exported for tests.
 */
export function cleanGraphQuery(query: string): string {
  let text = normalizeMath(query).replace(QUOTES, " ").replace(/\s+/g, " ").trim();
  for (let pass = 0; pass < 3; pass += 1) {
    const before = text;
    text = text
      .replace(/[\s?.!。？！…]+$/u, "")
      .replace(POLITE_LEAD, "")
      .replace(POLITE_TRAIL, "")
      .replace(/^[\s:：]+/, "")
      .trim();
    if (text === before) break;
  }
  return text;
}

const MAX_FUNCTIONS = 5;
const MAX_LENGTH = 160;

/**
 * Read a search as a graphing request, or return null. It needs either a lead word ("graph",
 * "plot", …) or a trailing one, or the form "y = …" / "f(x) = …", and every piece must be plain
 * math in x.
 */
export function parseGraphQuery(query: string): GraphRequest | null {
  let text = cleanGraphQuery(query);
  if (!text || text.length > MAX_LENGTH) return null;
  let asked: boolean | "trail" = false;
  // "what does y=x^2 look like", "what is the graph of x^2": a request, but "what does x look like"
  // is more likely about X, so a lone x needs "y =" (same rule as a trailing "graph").
  const looks = LOOKS_LIKE.exec(text);
  if (looks) {
    text = (looks[1] ?? looks[2] ?? "").trim();
    asked = "trail";
  }
  const lead = LEAD.exec(text);
  if (lead) {
    text = text.slice(lead[0].length).trim();
    asked = true;
  } else {
    const trail = TRAIL.exec(text);
    if (trail) {
      text = text.slice(0, trail.index).trim();
      asked ||= "trail";
    }
  }
  text = text.replace(/^(?:the\s+)?(?:graph|plot)\s+of\s+/i, "").replace(/^(?:the\s+)?(?:function|equation|line|curve)\s+/i, "").trim();

  let xMin = -5;
  let xMax = 5;
  let rangeGiven = false;
  for (const pattern of RANGE_PATTERNS) {
    const match = pattern.exec(text);
    if (!match) continue;
    const low = readBound(match[1]!);
    const high = readBound(match[2]!);
    if (Number.isFinite(low) && Number.isFinite(high) && high > low && high - low <= 1e6) {
      xMin = low;
      xMax = high;
      rangeGiven = true;
      text = text.slice(0, match.index).trim();
    }
    break;
  }

  const pieces = splitFunctions(text);
  if (!pieces.length || pieces.length > MAX_FUNCTIONS) return null;
  const functions: GraphFunction[] = [];
  let equations = 0;
  for (const piece of pieces) {
    const prefixed = PREFIX.exec(piece);
    const body = prefixed ? piece.slice(prefixed[0].length) : piece;
    if (prefixed) equations += 1;
    if (!body || body.includes("=")) return null;
    const node = parseExpression(body);
    if (!node || !usesX(node)) return null;
    // A lone "x" after a trailing word is too likely to be the site X ("X graph").
    if (asked === "trail" && node.type === "x" && !prefixed) return null;
    functions.push({ source: body.trim(), label: `y = ${formatExpression(node)}`, node });
  }
  if (!asked && equations !== pieces.length) return null;
  return { functions, xMin, xMax, rangeGiven };
}

export type GraphPoint = { x: number; y: number };
export type GraphSeries = { label: string; source: string; segments: GraphPoint[][] };
export type GraphPlot = {
  series: GraphSeries[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  xTicks: number[];
  yTicks: number[];
};

const SAMPLES = 480;

function niceStep(span: number, target: number): number {
  const raw = span / target;
  const power = Math.pow(10, Math.floor(Math.log10(raw)));
  const scaled = raw / power;
  const nice = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 2.5 ? 2.5 : scaled <= 5 ? 5 : 10;
  return nice * power;
}

export function ticks(min: number, max: number, target = 10): number[] {
  const step = niceStep(max - min, target);
  const out: number[] = [];
  for (let value = Math.ceil(min / step) * step; value <= max + step * 1e-9; value += step) {
    out.push(Math.abs(value) < step * 1e-9 ? 0 : Number(value.toPrecision(12)));
  }
  return out;
}

function percentile(sorted: number[], fraction: number): number {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round(fraction * (sorted.length - 1))));
  return sorted[index]!;
}

/**
 * Sample every function and pick the view. The y range is -5..5 when everything fits there (the
 * classic coordinate plane); otherwise it follows the middle 96% of the values, so a pole (tan,
 * 1/x) doesn't flatten the rest of the curve.
 */
export function buildPlot(request: GraphRequest): GraphPlot {
  const { xMin, xMax } = request;
  const step = (xMax - xMin) / SAMPLES;
  const values: number[] = [];
  const sampled = request.functions.map((fn) => {
    const points: Array<GraphPoint | null> = [];
    for (let i = 0; i <= SAMPLES; i += 1) {
      const x = xMin + i * step;
      const y = evaluate(fn.node, x);
      if (Number.isFinite(y)) {
        points.push({ x, y });
        values.push(y);
      } else points.push(null);
    }
    return { fn, points };
  });

  let yMin = -5;
  let yMax = 5;
  if (values.length) {
    const sorted = [...values].sort((a, b) => a - b);
    let low = percentile(sorted, 0.05);
    let high = percentile(sorted, 0.95);
    const squareX = xMin === -5 && xMax === 5;
    if (!(squareX && low >= -5 && high <= 5)) {
      if (high - low < 1e-9) {
        low -= 1;
        high += 1;
      }
      const pad = (high - low) * 0.1;
      low -= pad;
      high += pad;
      // Keep the x-axis in view when it's close, without a big empty band below (or above) it.
      const rawLow = low + pad;
      const rawHigh = high - pad;
      if (rawLow >= 0 && rawLow < (rawHigh - rawLow) * 0.5) low = -(high - low) * 0.04;
      if (rawHigh <= 0 && -rawHigh < (rawHigh - rawLow) * 0.5) high = (high - low) * 0.04;
      yMin = low;
      yMax = high;
    }
  }
  const viewSpan = yMax - yMin;

  const series = sampled.map(({ fn, points }) => {
    const segments: GraphPoint[][] = [];
    let current: GraphPoint[] = [];
    for (let i = 0; i < points.length; i += 1) {
      const point = points[i];
      if (!point) {
        if (current.length) segments.push(current);
        current = [];
        continue;
      }
      const previous = current[current.length - 1];
      if (previous && Math.abs(point.y - previous.y) > viewSpan * 0.5) {
        // A big jump: a pole or a step if the midpoint isn't between the two values.
        const mid = evaluate(fn.node, (previous.x + point.x) / 2);
        const lo = Math.min(previous.y, point.y);
        const hi = Math.max(previous.y, point.y);
        if (!Number.isFinite(mid) || mid < lo - viewSpan * 0.01 || mid > hi + viewSpan * 0.01 || Math.abs(point.y - previous.y) > viewSpan * 3) {
          segments.push(current);
          current = [];
        }
      }
      current.push(point);
    }
    if (current.length) segments.push(current);
    return { label: fn.label, source: fn.source, segments: segments.filter((segment) => segment.length > 0) };
  });

  return { series, xMin, xMax, yMin, yMax, xTicks: ticks(xMin, xMax), yTicks: ticks(yMin, yMax, 8) };
}

/** Facts about a plotted search, for the AI answer. Null when the query is not a graph. */
export function graphAnswerBrief(query: string): string | null {
  const request = parseGraphQuery(query);
  if (!request) return null;
  const plot = buildPlot(request);
  if (!plot.series.length) return null;
  const num = (value: number) => String(Number(value.toPrecision(4)));
  const names = plot.series.map((series) => series.label).join(", ");
  return `Folio plotted ${names} as a smooth curve from hundreds of sample points, not a chart of integers. x is from ${num(plot.xMin)} to ${num(plot.xMax)} and y is from ${num(plot.yMin)} to ${num(plot.yMax)}. The curve is already drawn in the answer. Describe its shape. Do not say it looks angular, jagged, or that it only connects integer x values.`;
}

/** Follow-up searches: a zoom change and one or two related functions. Always graphing requests. */
export function graphSuggestions(request: GraphRequest): string[] {
  const shown = request.functions.map((fn) => fn.source.replace(/\s+/g, "").toLowerCase());
  const first = request.functions[0]!.source.trim();
  const out: string[] = [];
  const related: Record<string, string[]> = {
    sin: ["y = sin(x) and y = cos(x)", "y = tan(x)"],
    cos: ["y = sin(x) and y = cos(x)", "y = tan(x)"],
    tan: ["y = sin(x) and y = cos(x)", "y = 1/x"],
    "^2": ["y = x^3", "y = x^2 and y = 2x + 1"],
    log: ["y = e^x and y = ln(x)", "y = sqrt(x)"],
    ln: ["y = e^x and y = ln(x)", "y = sqrt(x)"],
    "e^": ["y = e^x and y = ln(x)", "y = x^2"],
    "1/": ["y = tan(x)", "y = 1/x^2"],
  };
  const key = Object.keys(related).find((word) => shown.some((source) => source.includes(word)));
  for (const candidate of [...(key ? related[key]! : []), "y = x^2", "y = sin(x)", "y = 2x + 1 and y = x^2", "y = sqrt(x)"]) {
    const bare = candidate.replace(/^y = /, "").replace(/\s+/g, "").toLowerCase();
    if (shown.includes(bare) || out.includes(candidate)) continue;
    out.push(candidate);
    if (out.length === 2) break;
  }
  const span = request.xMax - request.xMin;
  const zoom = span <= 10 ? "from -10 to 10" : "from -5 to 5";
  const all = request.functions.map((fn) => `y = ${fn.source}`).join(" and ");
  out.push(`${request.functions.length > 1 ? all : `y = ${first}`} ${zoom}`);
  return out;
}
