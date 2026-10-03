export type ChatMessage = { role: "user" | "assistant"; content: string };
export const CHAT_INPUT_MAX = 4000;
/** Only user/assistant messages, with bounded recent history; clients cannot set system instructions. */
export function cleanChatHistory(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const messages: ChatMessage[] = [];
  let remaining = 24000;
  for (const item of raw.slice(-12).reverse()) {
    if (!item || typeof item !== "object") continue;
    const value = item as Record<string, unknown>;
    if ((value.role !== "user" && value.role !== "assistant") || typeof value.content !== "string") continue;
    const content = value.content.slice(0, Math.min(6000, remaining)).trim();
    if (!content) continue;
    remaining -= content.length;
    messages.unshift({ role: value.role, content });
    if (!remaining) break;
  }
  while (messages[0]?.role === "assistant") messages.shift();
  return messages;
}
