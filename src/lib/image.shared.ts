export const IMAGE_RATIOS = ["1:1", "16:9", "9:16"] as const;
export type ImageRatio = (typeof IMAGE_RATIOS)[number];
export type ImageInput = { prompt: string; answer: string; ratio: ImageRatio };
export type ImageResult =
  | { status: "ok"; src: string; prompt: string }
  | { status: "unconfigured" | "limited" | "blocked" | "error" };

export function readImageInput(input: unknown): ImageInput {
  if (!input || typeof input !== "object") throw new Error("Invalid image request");
  const raw = input as Record<string, unknown>;
  const prompt = typeof raw.prompt === "string" ? raw.prompt.trim() : "";
  if (!prompt || prompt.length > 1000) throw new Error("Describe an image in 1–1000 characters");
  return {
    prompt,
    answer: typeof raw.answer === "string" ? raw.answer.trim().slice(0, 1600) : "",
    ratio: IMAGE_RATIOS.includes(raw.ratio as ImageRatio) ? raw.ratio as ImageRatio : "1:1",
  };
}
