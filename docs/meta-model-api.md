# Muse Spark for ZIP1

ZIP1 uses Muse Spark 1.3 as its default AI answer model when Meta's key is configured. Explicit model selections in the menu, saved preferences, and search links take priority. Without a Meta key, ZIP1 continues using its existing configured providers. If Meta fails, the existing provider fallback applies.

## Activate in Vercel

1. Sign in at https://dev.meta.ai/ and open the Model API dashboard.
2. Under **API keys**, choose **Create API key**.
3. In ZIP1's Vercel project, open **Settings → Environment Variables** and add `MODEL_API_KEY` for Production and Preview. Keep its value server-side; never use a `VITE_` prefix or commit it.
4. Redeploy after saving the variable. Select **Muse Spark 1.3** in ZIP1's Model menu to override a previously saved choice.

Optional server settings are `META_MODEL` (default `muse-spark-1.3`), `META_BASE_URL` (default `https://api.meta.ai/v1`), and `META_REASONING_EFFORT` (default `low`). These change the provider fallback configuration; selecting a named menu model always uses that model's ID and effort.

ZIP1 calls Meta directly through Chat Completions with bearer authentication. A Vercel AI Gateway key does not enable this provider. The standard model is used; no contributor model is selected.

References: https://dev.meta.ai/docs/quickstart and https://dev.meta.ai/docs/protocols/chat-completions.
