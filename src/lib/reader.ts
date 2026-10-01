/**
 * Reader view for web results: pull the main text and its h2/h3 headings out of a page's HTML.
 * Dependency-free (a small tag tokenizer), so it runs in the server bundle and in node tests.
 */

export type ReaderSection = { id: string; title: string; level: number; text: string };

export type ReaderPage = {
  title: string;
  lead: string;
  sections: ReaderSection[];
  image?: string;
  siteName?: string;
  lang?: string;
};

/** The Contents list is shown only when a page has at least this many headings. */
export const MIN_CONTENTS = 2;

const MAX_SECTIONS = 40;
const LEAD_CHARS = 1500;
const SECTION_CHARS = 1500;
const HEADING_CHARS = 140;

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
/** Elements whose text is never part of the article. */
const SKIP_TAGS = new Set([
  "nav", "header", "footer", "aside", "form", "button", "select", "option", "label", "dialog", "menu",
  "figure", "figcaption", "iframe", "object", "canvas", "audio", "video", "map", "noscript", "template", "svg", "math",
]);
const SKIP_ROLES = /\b(navigation|banner|contentinfo|complementary|search|menu|menubar|dialog|alert|toolbar)\b/i;
const SKIP_HINTS =
  /(^|[\s_-])(nav|navbar|menu|breadcrumbs?|footer|sidebar|side-bar|comments?|cookie|consent|banner|subscribe|newsletter|share|sharing|social|related|recommend|advert|ads?|promo|popup|modal|skip|toc|table-of-contents|sr-only|visually-hidden|infobox|navbox|vertical-navbox|hatnote|dablink|metadata|noprint|ambox|mbox|coordinates|geo|editsection|shortdescription|reflist|gallery|caption)([\s_-]|$)/i;
const BLOCK = new Set([
  "p", "div", "li", "ul", "ol", "dl", "dt", "dd", "section", "article", "main", "blockquote", "pre", "table",
  "tr", "td", "th", "h1", "h2", "h3", "h4", "h5", "h6", "br", "hr", "address", "details", "summary",
]);
const SKIP_HEADING =
  /^(references|see also|external links|notes|further reading|bibliography|sources|citations|footnotes|comments?|related( articles| posts| stories)?|share( this)?|newsletter|advertisement|you may also like|recommended|most popular|read more|table of contents|contents|on this page|in this article)$/i;

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", laquo: "«", raquo: "»", copy: "©", reg: "®", trade: "™",
  middot: "·", bull: "•", eacute: "é", egrave: "è", aacute: "á", agrave: "à", oacute: "ó", uacute: "ú",
  iacute: "í", ntilde: "ñ", ccedil: "ç", uuml: "ü", ouml: "ö", auml: "ä", szlig: "ß", deg: "°", times: "×",
};

export function decodeHtml(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (all, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1] === "x" || entity[1] === "X" ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : all;
    }
    return NAMED[entity] ?? NAMED[entity.toLowerCase()] ?? all;
  });
}

/** Footnote and maintenance markers such as "[26]", "[a]", "[when?]" or "[32]: 36–37" (wikis and news sites). */
const FOOTNOTE = /\s?\[(?:\d{1,4}|[a-z]|note \d+|citation needed|when\?|who\?|which\?|where\?|clarification needed|according to whom\?|dubious[^\]]{0,20}|failed verification|better source needed)\](?::\s?\d+(?:[–-]\d+)?)?/gi;

export function stripFootnotes(value: string): string {
  return value.replace(FOOTNOTE, "");
}

function clipText(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1).replace(/\s+\S*$/, "").trim();
  return `${cut || clean.slice(0, max - 1)}…`;
}

function attr(attrs: string, name: string): string {
  const match = attrs.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return decodeHtml(match?.[1] ?? match?.[2] ?? match?.[3] ?? "");
}

function metaContent(html: string, key: string): string {
  const re = /<meta\b([^>]*)>/gi;
  for (const match of html.matchAll(re)) {
    const attrs = match[1] ?? "";
    if (attr(attrs, "property").toLowerCase() === key || attr(attrs, "name").toLowerCase() === key) {
      const content = attr(attrs, "content").trim();
      if (content) return content;
    }
  }
  return "";
}

function absolute(url: string, base: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const out = new URL(url, base);
    return out.protocol === "https:" || out.protocol === "http:" ? out.toString() : undefined;
  } catch {
    return undefined;
  }
}

function skipElement(tag: string, attrs: string): boolean {
  if (SKIP_TAGS.has(tag)) return true;
  if (/\bhidden\b/i.test(attrs) && /(?:^|\s)hidden(?:\s|=|$)/i.test(attrs)) return true;
  if (/aria-hidden\s*=\s*["']?true/i.test(attrs)) return true;
  if (/display\s*:\s*none/i.test(attr(attrs, "style"))) return true;
  const role = attr(attrs, "role");
  if (role && SKIP_ROLES.test(role)) return true;
  const hint = `${attr(attrs, "class")} ${attr(attrs, "id")}`;
  return hint.trim() !== "" && SKIP_HINTS.test(hint);
}

type Block = { kind: "text"; text: string } | { kind: "heading"; level: number; text: string };

/** Walk the HTML, keeping text outside skipped elements, split into paragraphs and headings. */
function blocks(html: string, onlyInside?: RegExp): Block[] {
  const out: Block[] = [];
  const stack: Array<{ tag: string; skip: boolean; inside: boolean }> = [];
  let skipDepth = 0;
  let insideDepth = 0;
  let text = "";
  let heading: { level: number; text: string } | null = null;
  const flush = () => {
    const clean = stripFootnotes(text.replace(/\s+/g, " ")).trim();
    if (clean) out.push({ kind: "text", text: clean });
    text = "";
  };
  const active = () => skipDepth === 0 && (!onlyInside || insideDepth > 0);
  const tokens = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)|</g;
  for (const match of html.matchAll(tokens)) {
    const [, closing, rawTag, attrs = "", chunk] = match;
    if (chunk !== undefined || !rawTag) {
      if (!active()) continue;
      const value = decodeHtml(chunk ?? "<");
      if (heading) heading.text += value;
      else text += value;
      continue;
    }
    const tag = rawTag.toLowerCase();
    if (closing) {
      const at = stack.map((item) => item.tag).lastIndexOf(tag);
      if (at < 0) continue;
      while (stack.length > at) {
        const item = stack.pop();
        if (item?.skip) skipDepth -= 1;
        if (item?.inside) insideDepth -= 1;
      }
      if (heading && /^h[1-6]$/.test(tag)) {
        const clean = heading.text.replace(/\s+/g, " ").trim();
        if (clean) out.push({ kind: "heading", level: heading.level, text: clean });
        heading = null;
      } else if (BLOCK.has(tag) && active()) flush();
      continue;
    }
    if (BLOCK.has(tag) && active() && !heading) flush();
    if (VOID.has(tag) || attrs.trimEnd().endsWith("/")) continue;
    const skip = skipElement(tag, attrs);
    const inside = Boolean(onlyInside && onlyInside.test(`<${tag}${attrs}>`));
    stack.push({ tag, skip, inside });
    if (skip) skipDepth += 1;
    if (inside) insideDepth += 1;
    if (/^h[1-6]$/.test(tag) && active()) {
      flush();
      heading = { level: Number(tag[1]), text: "" };
    }
  }
  flush();
  return out;
}

function textLength(list: Block[]): number {
  return list.reduce((sum, block) => sum + (block.kind === "text" ? block.text.length : 0), 0);
}

/** Pull the reader text, headings, and basic metadata from a page. `url` resolves relative image links. */
export function extractReadable(html: string, url?: string): ReaderPage {
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? html.slice(0, 20000);
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg|math|head)\b[\s\S]*?<\/\1\s*>/gi, " ");
  const body = cleaned.match(/<body\b[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? cleaned;

  // Prefer the page's main/article region when it holds the bulk of the text.
  let list = blocks(body, /^<(main|article)\b|\brole\s*=\s*["']?main\b|\bitemprop\s*=\s*["']?articleBody\b/i);
  if (textLength(list) < 400) list = blocks(body);

  const title =
    metaContent(head, "og:title") ||
    decodeHtml(head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim() ||
    (list.find((block) => block.kind === "heading" && block.level === 1)?.text ?? "");

  // Sections come from the two highest heading levels used among h2–h4 (h1 is the page title).
  const levels = [...new Set(list.filter((block) => block.kind === "heading" && block.level >= 2 && block.level <= 4).map((block) => (block as { level: number }).level))].sort();
  const top = levels[0];
  const second = levels[1];
  const lead: string[] = [];
  const sections: ReaderSection[] = [];
  let current: { title: string; level: number; parts: string[] } | null = null;
  let skipping = false;
  const push = () => {
    if (current && sections.length < MAX_SECTIONS) {
      sections.push({
        id: `s-${sections.length}`,
        title: current.title,
        level: current.level,
        text: clipText(current.parts.join("\n\n"), SECTION_CHARS),
      });
    }
    current = null;
  };
  for (const block of list) {
    if (block.kind === "heading") {
      if (block.level === 1) continue;
      const level = block.level === top ? 1 : block.level === second ? 2 : 0;
      // Drop anchor glyphs and trailing separators ("History ¶", "News •").
      const name = block.text.replace(/[\s#¶§•·|:–—-]+$/, "").trim();
      if (level === 0) {
        // Deeper headings stay as text in the section they belong to.
        if (current && !skipping) current.parts.push(name);
        continue;
      }
      push();
      skipping = !name || name.length > HEADING_CHARS || SKIP_HEADING.test(name);
      if (!skipping) current = { title: name, level, parts: [] };
      continue;
    }
    if (skipping) continue;
    if (current) current.parts.push(block.text);
    else lead.push(block.text);
  }
  push();

  const image = absolute(metaContent(head, "og:image") || metaContent(head, "twitter:image"), url);
  const siteName = metaContent(head, "og:site_name") || undefined;
  const lang = html.match(/<html\b[^>]*\blang\s*=\s*["']?([a-zA-Z-]+)/i)?.[1];
  const description = metaContent(head, "og:description") || metaContent(head, "description");
  const leadText = clipText(lead.filter((part) => part.length > 40 || lead.length < 4).join(" "), LEAD_CHARS);
  return {
    title: clipText(title, 200),
    lead: leadText || clipText(description, LEAD_CHARS),
    sections,
    ...(image ? { image } : {}),
    ...(siteName ? { siteName } : {}),
    ...(lang ? { lang } : {}),
  };
}

/** Find the character set a page declares (header first, then meta tags). */
export function pageCharset(contentType: string | null, head: string): string {
  const fromHeader = contentType?.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1];
  if (fromHeader) return fromHeader.toLowerCase();
  const fromMeta = head.match(/<meta[^>]+charset\s*=\s*["']?([\w-]+)/i)?.[1];
  return (fromMeta ?? "utf-8").toLowerCase();
}

/** True for host names and IP literals that must never be fetched from the server (SSRF guard). */
export function isPrivateHost(host: string): boolean {
  const name = host.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!name || name === "localhost" || /\.(localhost|local|internal|lan|home|corp|intranet)$/.test(name)) return true;
  if (!name.includes(".") && !name.includes(":")) return true;
  const v4 = name.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (name.includes(":")) {
    if (name === "::" || name === "::1") return true;
    const mapped = name.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped?.[1]) return isPrivateHost(mapped[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(name);
  }
  return false;
}
