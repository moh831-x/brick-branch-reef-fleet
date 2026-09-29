import { readBotSearch } from "../../../src/lib/search.shared";
import { runSearch, type SearchHit, type SourceBlock } from "../../../src/lib/search.server";

function block(source: SourceBlock) {
  return {
    ...(typeof source.total === "number" ? { total: source.total } : {}),
    ...(source.error ? { error: source.error } : {}),
    done: source.done,
    results: source.results.map((hit: SearchHit) => ({
      title: hit.title,
      url: hit.url,
      snippet: hit.snippet,
      meta: hit.meta,
      ...(hit.image
        ? {
            image: hit.image.full,
            thumbnail: hit.image.thumb,
            ...(hit.image.width && hit.image.height ? { width: hit.image.width, height: hit.image.height } : {}),
          }
        : {}),
    })),
  };
}

export default async function searchRoute(event: { url: URL }): Promise<Response> {
  const parsed = readBotSearch(event.url.searchParams);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400, headers: { "cache-control": "no-store" } });
  }
  try {
    const data = await runSearch({ ...parsed, card: false, near: "" });
    return Response.json(
      {
        query: data.query,
        tookMs: data.tookMs,
        web: block(data.web),
        wiki: block(data.wiki),
        grok: block(data.grok),
        ...(parsed.images ? { images: block(data.images) } : {}),
        deepDive: data.deepDive,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "Search failed" }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
