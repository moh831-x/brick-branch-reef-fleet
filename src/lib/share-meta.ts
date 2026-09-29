const SHARE_KEYS = new Set(["og:title", "og:description", "og:url", "twitter:title", "twitter:description"]);

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "\u0026amp;")
    .replaceAll("<", "\u0026lt;")
    .replaceAll(">", "\u0026gt;")
    .replaceAll('"', "\u0026quot;")
    .replaceAll("'", "\u0026#39;");
}

function unescapeHtml(value: string): string {
  return value
    .replaceAll("\u0026lt;", "<")
    .replaceAll("\u0026gt;", ">")
    .replaceAll("\u0026quot;", '"')
    .replaceAll("\u0026#39;", "'")
    .replaceAll("\u0026amp;", "&");
}

function tagAttr(tag: string, name: string): string {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return match ? unescapeHtml(match[1]).trim() : "";
}

function canonicalUrl(html: string): string {
  const tags = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    if (tagAttr(tag, "rel").toLowerCase() !== "canonical") continue;
    const href = tagAttr(tag, "href");
    try {
      const url = new URL(href);
      if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) continue;
      return url.toString();
    } catch {
      continue;
    }
  }
  return "";
}

function documentTitle(html: string): string {
  const match = html.match(/<title\b[^>]*>([^<]*)<\/title>/i);
  return match ? unescapeHtml(match[1]).trim() : "";
}

function metaDescription(html: string): string {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    if (tagAttr(tag, "name").toLowerCase() !== "description") continue;
    const content = tagAttr(tag, "content");
    if (content) return content;
  }
  return "";
}

function stripShareTags(html: string): string {
  return html.replace(/<meta\b[^>]*>/gi, (tag) => {
    const name = (tagAttr(tag, "property") || tagAttr(tag, "name")).toLowerCase();
    return SHARE_KEYS.has(name) ? "" : tag;
  });
}

/**
 * The platform head injector rewrites share tags from the homepage identity.
 * Indexable pages already carry their own title, description, and canonical.
 * This puts those values back into og/twitter tags after that injector runs.
 * Pages without a canonical, including search queries, are left untouched.
 */
export function alignShareMeta(html: string): string {
  const pageUrl = canonicalUrl(html);
  const title = documentTitle(html);
  if (!pageUrl || !title) return html;
  const description = metaDescription(html);
  const tags = [
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    description ? `<meta property="og:description" content="${escapeHtml(description)}">` : "",
    `<meta property="og:url" content="${escapeHtml(pageUrl)}">`,
    `<meta name="twitter:title" content="${escapeHtml(title)}">`,
    description ? `<meta name="twitter:description" content="${escapeHtml(description)}">` : "",
  ].join("");
  const next = stripShareTags(html);
  if (/<head\b[^>]*>/i.test(next)) return next.replace(/<head\b[^>]*>/i, (open) => `${open}${tags}`);
  return next;
}
