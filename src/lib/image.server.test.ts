import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateImage, imageAvailable } from "./image.server.ts";
import { readImageInput } from "./image.shared.ts";
const input = { prompt: "A lighthouse at dawn", answer: "Coastal navigation", ratio: "16:9" as const };
const env = { XAI_API_KEY: "test-secret" };
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]).toString("base64");

describe("image creation", () => {
  it("bounds prompts and context, accepts only supported shapes", () => {
    assert.throws(() => readImageInput({ prompt: " " }));
    assert.throws(() => readImageInput({ prompt: "x".repeat(1001) }));
    assert.equal(readImageInput({ prompt: "x", ratio: "99:1", answer: "a".repeat(4000) }).ratio, "1:1");
    assert.equal(readImageInput({ prompt: "x", answer: "a".repeat(4000) }).answer.length, 1600);
  });
  it("never calls the provider when unconfigured", async () => {
    assert.equal(imageAvailable({ MODEL_API_KEY: "meta" }), false);
    const result = await generateImage(input, "missing", { env: {}, fetcher: async () => { throw new Error("should not call"); } });
    assert.deepEqual(result, { status: "unconfigured" });
  });
  it("makes one bounded direct request and caches repeated creations", async () => {
    let calls = 0;
    const fetcher: typeof fetch = async (url, init) => {
      calls++;
      assert.equal(url, "https://api.x.ai/v1/images/generations");
      assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer test-secret");
      const sent = JSON.parse(String(init?.body));
      assert.equal(sent.model, "grok-imagine-image-2.0");
      assert.equal(sent.n, 1);
      assert.equal(sent.aspect_ratio, "16:9");
      assert.equal(sent.resolution, "1k");
      assert.equal(sent.quality, "low");
      assert.equal(sent.response_format, "b64_json");
      assert.match(sent.prompt, /Coastal navigation/);
      return Response.json({ data: [{ b64_json: jpeg }] });
    };
    const result = await generateImage(input, "cache-test", { env, fetcher });
    assert.ok(result.status === "ok" && result.src.startsWith("data:image/jpeg;base64,"));
    assert.ok(!JSON.stringify(result).includes("test-secret"));
    assert.deepEqual(await generateImage(input, "cache-test", { env, fetcher }), result);
    assert.equal(calls, 1);
  });
  it("caps paid requests per caller and never retries provider errors", async () => {
    let calls = 0;
    const fetcher: typeof fetch = async () => { calls++; return new Response("private provider error test-secret", { status: 500 }); };
    for (let n = 0; n < 3; n++) {
      assert.deepEqual(await generateImage({ ...input, prompt: `Image ${n}` }, "limit-test", { env, fetcher }), { status: "error" });
    }
    assert.deepEqual(await generateImage(input, "limit-test", { env, fetcher }), { status: "limited" });
    assert.equal(calls, 3);
  });
  it("rejects filtered and non-image outputs", async () => {
    const blocked = await generateImage(input, "moderation-test", { env, fetcher: async () => Response.json({ data: [{ respect_moderation: false, b64_json: jpeg }] }) });
    assert.deepEqual(blocked, { status: "blocked" });
    const unsafe = await generateImage(input, "invalid-test", { env, fetcher: async () => Response.json({ data: [{ b64_json: Buffer.from('<script>bad</script>').toString('base64') }] }) });
    assert.deepEqual(unsafe, { status: "error" });
  });
});
