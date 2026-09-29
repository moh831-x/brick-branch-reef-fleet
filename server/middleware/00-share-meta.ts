import { alignShareMeta } from "../../src/lib/share-meta";

interface ShareEvent {
  url: URL;
  req: { method: string; headers: Headers };
}

function isDocument(pathname: string): boolean {
  return (
    !pathname.startsWith("/__grok/") &&
    !pathname.startsWith("/api/") &&
    !pathname.startsWith("/@") &&
    !/\.[a-z0-9]+$/i.test(pathname)
  );
}

export default async function shareMetaMiddleware(
  event: ShareEvent,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  if ((event.req.method ?? "GET").toUpperCase() !== "GET" || !isDocument(event.url.pathname)) return next();
  const result = await next();
  if (!(result instanceof Response) || !result.body) return result;
  if (!String(result.headers.get("content-type") ?? "").includes("text/html")) return result;
  if (result.headers.get("content-encoding")) return result;
  const html = alignShareMeta(await result.text());
  const headers = new Headers(result.headers);
  headers.delete("content-length");
  return new Response(html, { status: result.status, statusText: result.statusText, headers });
}
