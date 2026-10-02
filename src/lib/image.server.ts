import { createHash } from "node:crypto";
import { readImageInput, type ImageInput, type ImageResult } from "./image.shared.ts";

const MODEL = "grok-imagine-image-2.0";
const HOUR = 60 * 60 * 1000;
const LIMIT = 3;
const MAX_CALLERS = 1000;
const MAX_CACHE = 12;
// Best-effort limits per server instance. No raw IPs, keys, or prompts are logged.
const usage = new Map<string, { count: number; until: number }>();
const images = new Map<string, { result: ImageResult; until: number }>();
const pending = new Map<string, Promise<ImageResult>>();

export function imageAvailable(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.XAI_API_KEY?.trim());
}

export async function generateImage(
  input: ImageInput,
  caller: string,
  options: { env?: Record<string, string | undefined>; fetcher?: typeof fetch; now?: number } = {},
): Promise<ImageResult> {
  const data = readImageInput(input);
  const env = options.env ?? process.env;
  const apiKey = env.XAI_API_KEY?.trim();
  if (!apiKey) return { status: "unconfigured" };
  const now = options.now ?? Date.now();
  const identity = createHash("sha256").update(caller).digest("hex");
  const key = createHash("sha256").update(JSON.stringify([identity, data])).digest("hex");
  for (const [id, row] of usage) if (row.until <= now) usage.delete(id);
  for (const [id, row] of images) if (row.until <= now) images.delete(id);
  const cached = images.get(key);
  if (cached) return cached.result;
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;
  const used = usage.get(identity);
  if ((used?.count ?? 0) >= LIMIT || (!used && usage.size >= MAX_CALLERS) || pending.size >= 8) {
    return { status: "limited" };
  }
  usage.set(identity, { count: (used?.count ?? 0) + 1, until: used?.until ?? now + HOUR });
  const request = (async (): Promise<ImageResult> => {
    try {
      const response = await (options.fetcher ?? fetch)("https://api.x.ai/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: MODEL,
          prompt: data.answer
            ? `${data.prompt}\n\nUse this answer as background for the illustration:\n${data.answer}`
            : data.prompt,
          n: 1,
          aspect_ratio: data.ratio,
          resolution: "1k",
          quality: "low",
          response_format: "b64_json",
        }),
        signal: AbortSignal.timeout(55_000),
      });
      if (!response.ok) return { status: response.status === 429 ? "limited" : "error" };
      const payload = await response.json() as { data?: { b64_json?: string; respect_moderation?: boolean }[] };
      const image = payload.data?.[0];
      if (image?.respect_moderation === false) return { status: "blocked" };
      const encoded = image?.b64_json;
      // Keep server-function responses below Vercel's payload limit; only accept JPEG output.
      if (!encoded || encoded.length > 3_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return { status: "error" };
      const bytes = Buffer.from(encoded, "base64");
      if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return { status: "error" };
      const result: ImageResult = { status: "ok", src: `data:image/jpeg;base64,${encoded}`, prompt: data.prompt };
      if (images.size >= MAX_CACHE) images.delete(images.keys().next().value!);
      images.set(key, { result, until: now + 10 * 60 * 1000 });
      return result;
    } catch {
      return { status: "error" };
    }
  })();
  pending.set(key, request);
  try { return await request; } finally { pending.delete(key); }
}
