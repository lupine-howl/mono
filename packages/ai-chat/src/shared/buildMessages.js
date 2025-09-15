// src/shared/services/ai-chat/buildMessages.js

function safeStringify(obj) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    try {
      return String(obj);
    } catch {
      return "";
    }
  }
}

/**
 * Normalize a single message-like item into { role, content: string }.
 * - string  -> { role: defaultRole, content: string }
 * - {role, content} -> coerces content to string
 * - anything else -> stringified as a {role: defaultRole}
 */
function normalizeMessage(item, defaultRole = "system") {
  if (item == null) return null;

  // Already a chat message?
  if (
    typeof item === "object" &&
    typeof item.role === "string" &&
    "content" in item
  ) {
    let { role } = item;
    let content = item.content;

    if (Array.isArray(content)) {
      content = content
        .map((p) =>
          typeof p === "string"
            ? p
            : p && typeof p === "object"
            ? safeStringify(p)
            : String(p ?? "")
        )
        .filter(Boolean)
        .join("\n\n");
    } else if (typeof content !== "string") {
      content =
        typeof content === "object"
          ? safeStringify(content)
          : String(content ?? "");
    }

    if (!content.trim()) return null;
    return { role, content };
  }

  // Plain string -> system (or supplied defaultRole)
  if (typeof item === "string") {
    const content = item.trim();
    if (!content) return null;
    return { role: defaultRole, content };
  }

  // Fallback: stringify unknown types
  const content = safeStringify(item);
  if (!content.trim()) return null;
  return { role: defaultRole, content };
}

export function buildChatMessages({
  persona,
  customInstructions,
  history,
  context,
}) {
  const msgs = [];

  // Persona / custom instructions as system
  const p = (persona ?? "").trim();
  if (p) msgs.push({ role: "system", content: p });

  const ci = (customInstructions ?? "").trim();
  if (ci) msgs.push({ role: "system", content: ci });

  // Context: each entry becomes its own message (default role: system)
  if (Array.isArray(context) && context.length) {
    for (const c of context) {
      const m = normalizeMessage(c, "system");
      if (m) msgs.push(m);
    }
  }

  // History: pass through, coercing content to string
  const H = Array.isArray(history) ? history : [];
  for (let i = 0; i < H.length; i++) {
    const m = H[i];
    if (!m || typeof m !== "object") continue;
    if (m.role !== "user" && m.role !== "assistant" && m.role !== "system")
      continue;

    const normalized = normalizeMessage(
      { role: m.role, content: m.content },
      m.role
    );
    if (normalized) msgs.push(normalized);
  }

  return msgs;
}
