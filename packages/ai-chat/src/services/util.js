// Small utilities shared by handlers
export async function maybeExecuteFirstTool({ registry, toolCall, args, ctx }) {
  const name = toolCall?.function?.name || "";
  if (!name || !args) return null;
  const tool = registry ? registry.find?.(name) || null : null;
  const handler = tool?.handler;
  if (typeof handler !== "function") return null;
  return await handler(args, ctx);
}

export function toOpenAIToolsFromRegistry(registry) {
  if (!registry) return [];
  if (typeof registry.toOpenAITools === "function")
    return registry.toOpenAITools();
  // fallback: if registry.list() returns items, transform
  if (typeof registry.list === "function") {
    return registry.list().map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description || "",
        parameters: t.parameters || { type: "object", properties: {} },
      },
    }));
  }
  return [];
}

export function findTool(registry, name) {
  if (!registry || !name) return null;
  if (typeof registry.find === "function") return registry.find(name);
  const list = typeof registry.list === "function" ? registry.list() : [];
  return list.find((t) => t.name === name) || null;
}

/** Normalize either `messages` (raw) or a { system, prompt } into OpenAI format. */
export function buildMessages({ messages, system, prompt }) {
  if (Array.isArray(messages) && messages.length) return messages;
  const out = [];
  if (system) out.push({ role: "system", content: String(system) });
  if (prompt) out.push({ role: "user", content: String(prompt) });
  return out;
}
