# Image creation beside AI answers

Search ZIP1, open **Create image** beneath the AI answer, edit the description, choose a shape, and create a single image. Readers can include the answer as context and download the generated JPEG. Closing and reopening the panel preserves the image; searching a new query resets it.

The server uses the existing `XAI_API_KEY` with `grok-imagine-image-2.0`. Muse Spark remains the text-answer default. No image call runs on page load or while typing. Each explicit request creates one 1k, low-quality image. Missing keys, provider errors, moderation refusals, and usage limits have localized messages in all ten interface languages.

Limits and caching are best-effort per warm server instance: three paid attempts per caller per hour; eight concurrent creations across the instance; identical requests from a caller share an in-flight request and cache successful output for ten minutes. Serverless scaling and cold starts reset those limits; they are not a durable account-wide spending cap. Provider-side spending controls remain authoritative. Cached images are kept only in memory, with twelve entries maximum. No permanent image gallery is created.

Server responses include inline JPEG data so the image can be saved without depending on a temporary external URL. Keys and provider error bodies are never returned to visitors. The UI keeps the current image while the panel is closed, but navigation or reload removes it.

Official API reference: https://docs.x.ai/developers/model-capabilities/images/generation
