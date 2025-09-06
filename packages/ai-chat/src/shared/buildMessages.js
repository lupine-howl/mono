// src/shared/services/ai-chat/buildMessages.js
export function buildChatMessages({ persona, customInstructions, history, context }) {
  const msgs = [];
  const p = (persona ?? "").trim();
  const ci = (customInstructions ?? "").trim();
  if (p) msgs.push({ role: "system", content: p });
  if (ci) msgs.push({ role: "system", content: ci });

  const H = Array.isArray(history) ? history : [];
  for (let i = 0; i < H.length; i++) {
    const m = H[i];
    if (m?.role === "user" || m?.role === "assistant" || m?.role === "system") {
      const content = typeof m.content === "string"
        ? m.content
        : m?.content?.toString?.() ?? "";
      msgs.push({ role: m.role, content });
    }
  }

  if (context && context.length) {
    const ctx = typeof context === "string" ? context : JSON.stringify(context, null, 2);
    msgs.push({ role: "system", content: ctx });
  }
  return msgs;
}
