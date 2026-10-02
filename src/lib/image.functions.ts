import { createServerFn } from "@tanstack/react-start";
import { readImageInput } from "./image.shared";
import { generateImage, imageAvailable } from "./image.server";

export const imageCreationStatus = createServerFn({ method: "POST" })
  .validator(() => ({}))
  .handler(async () => ({ available: imageAvailable() }));

export const createAnswerImage = createServerFn({ method: "POST" })
  .validator(readImageInput)
  .handler(async ({ data }) => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const caller = getRequestHeader("x-vercel-forwarded-for") ?? getRequestHeader("x-forwarded-for") ?? "unknown";
    return generateImage(data, caller.split(",")[0].trim());
  });
