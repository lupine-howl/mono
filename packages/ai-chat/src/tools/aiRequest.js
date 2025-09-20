// src/tools/aiRequest.js
import { getToolRegistry } from "@loki/minihttp/util";
let OPENAI_API_KEY = "";
if (typeof process !== "undefined" && process?.env) {
  OPENAI_API_KEY = process.env.OPENAI_API_KEY;
}

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

// ---------- helpers: meta injection + message building ----------
function injectFriendlyMeta(openAiTools) {
  return (openAiTools || []).map((t) => {
    const fn = t.function || {};
    const params =
      fn.parameters && typeof fn.parameters === "object"
        ? { ...fn.parameters }
        : { type: "object", properties: {}, required: [] };

    const properties = { ...(params.properties || {}) };
    const required = new Set(
      Array.isArray(params.required) ? params.required : []
    );

    properties._meta = {
      type: "object",
      description:
        "User-visible explanation of this action. Used only for chat display; removed before executing the tool.",
      properties: {
        summary: { type: "string" },
        why: { type: "string" },
        key_params: { type: "string" },
        safety: { type: "string" },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        next: { type: "string" },
      },
      required: ["summary", "why", "key_params"],
      additionalProperties: false,
    };
    required.add("_meta");

    return {
      ...t,
      function: {
        ...fn,
        parameters: {
          ...params,
          type: "object",
          properties,
          required: Array.from(required),
          additionalProperties:
            typeof params.additionalProperties === "boolean"
              ? params.additionalProperties
              : false,
        },
      },
    };
  });
}

function metaSystemNudge() {
  return {
    role: "system",
    content:
      "When calling any tool, you MUST include a `_meta` object with: `summary`, `why` (2–5 markdown bullets), `key_params`, and optionally `safety`, `confidence` (0–1), `next`. Keep it concise, specific, and warm. Do not paste raw JSON into `key_params`.",
  };
}

function buildMessages({ messages, system, prompt }) {
  const out = [];
  if (system) out.push({ role: "system", content: String(system) });
  out.push(metaSystemNudge());

  if (Array.isArray(messages) && messages.length) {
    for (const m of messages) {
      if (!m) continue;
      const role = m.role || "user";
      // Keep it simple: stringifies non-strings (you can switch to parts if needed)
      const content =
        typeof m.content === "string" ? m.content : JSON.stringify(m.content);
      out.push({ role, content });
    }
  } else if (prompt) {
    out.push({ role: "user", content: String(prompt) });
  }
  return out;
}

// ---------- dynamic schema (parameters can be a function) ----------
const aiRequestParams = async () => {
  const registry = getToolRegistry();
  const toolNames = registry
    .list()
    .map((t) => t.name)
    .sort();

  return {
    type: "object",
    additionalProperties: false,
    properties: {
      prompt: { type: ["string", "null"] },
      system: { type: ["string", "null"] },
      messages: {
        type: ["array", "null"],
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            role: { type: "string" },
            // Allow: string | object | array<(string|object)>
            content: {
              type: ["string", "object", "array"],
              items: { type: ["string", "object"] },
            },
          },
          required: ["role", "content"],
        },
      },
      model: { type: "string" },
      temperature: { type: ["number", "null"] },
      max_tokens: { type: ["integer", "null"] },
      max_completion_tokens: { type: ["integer", "null"] },
      tool_choice: {
        type: "string",
        enum: ["none", "auto"],
        default: "auto",
        description: "Whether to let the model choose a function call.",
      },
      force: {
        type: "boolean",
        default: false,
        description: "If true with toolName, force that tool.",
      },
      toolName: {
        type: ["string", "null"],
        enum: [...toolNames],
      },
      baseUrl: { type: ["string", "null"], default: DEFAULT_BASE_URL },
      apiKey: { type: ["string", "null"] }, // defaults to process.env on server
    },
    required: [],
  };
};

// ---------- the tool ----------
export const aiRequest = {
  name: "aiRequest",
  description:
    "Call OpenAI chat.completions with registry tools injected (with `_meta`), returning the reply and any tool call (clean args + tool_meta).",
  parameters: aiRequestParams,

  /*
  beforeRun(values) {
    return {
      async: true,
      runArgs: values,
      optimistic: {
        ok: true,
        data: { content: "…" }, // or response: "…"
        ui: {
          kind: "chat",
          title: values?.title || "Thinking…",
        },
        messages: [{ role: "assistant", content: "Thinking…" }],
      },
    };
  },
  /*
  async runServer(args, ctx) {
    console.log("aiRequest.runServer", args, ctx);
    const result = await this.handler(args, ctx);
    return result;
  },
*/
  /*
  async afterRun(result, args, ctx) {
    console.log("aiRequest.afterRun", { result, args, ctx });
    return result;
  },
*/
  // Put the network call in handler so it runs server-side.
  async runServer(values, ctx) {
    const aiChatService = await import("@loki/ai-chat/util").then(
      (m) => m.aiChatService
    );
    console.log(values);
    console.log(aiChatService);
    const {
      prompt,
      system,
      messages,
      model = aiChatService.state.model || "gpt-4o-mini",
      temperature,
      max_tokens,
      max_completion_tokens,
      tool_choice: requestedToolChoice = "auto",
      force = false,
      toolName = null,
      baseUrl = DEFAULT_BASE_URL,
      apiKey,
    } = values || {};

    const registry = getToolRegistry();

    // IMPORTANT: toOpenAITools is async — await it.
    const baseTools = (await registry.toOpenAITools?.(ctx)) || [];
    const toolsWithMeta = injectFriendlyMeta(baseTools);

    const msgs = buildMessages({ messages, system, prompt });

    // Decide tool_choice + which tools to send
    let tool_choice;
    let tools;
    if (force && toolName) {
      tool_choice = { type: "function", function: { name: toolName } };
      tools = toolsWithMeta.filter((t) => t.function?.name === toolName);
    } else if (requestedToolChoice === "auto") {
      tool_choice = "auto";
      tools = toolsWithMeta;
    } else {
      tool_choice = "none";
      tools = [];
    }

    const payload = {
      model,
      messages: msgs,
      tools,
      tool_choice,
      ...(temperature != null ? { temperature } : {}),
      ...(max_tokens != null ? { max_tokens } : {}),
      ...(max_completion_tokens != null ? { max_completion_tokens } : {}),
    };

    const key =
      apiKey ||
      (typeof process !== "undefined" && process?.env?.OPENAI_API_KEY) ||
      OPENAI_API_KEY;
    if (!key.trim()) {
      return {
        ok: false,
        error: "Missing OpenAI API key",
        data: { sent: { model, tool_choice } },
      };
    }

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        error: data?.error?.message || `OpenAI HTTP ${res.status}`,
        data: { openai: data },
      };
    }

    // Extract first tool call + parse args
    const choice = data?.choices?.[0] || {};
    const message = choice.message || {};
    const toolCalls = Array.isArray(message.tool_calls)
      ? message.tool_calls
      : [];
    const firstCall = toolCalls[0] || null;

    let rawArgs = null;
    let cleanArgs = null;
    let toolMeta = null;
    if (firstCall?.function?.arguments) {
      try {
        rawArgs = JSON.parse(firstCall.function.arguments);
      } catch {}
      if (rawArgs && typeof rawArgs === "object") {
        const { _meta, ...rest } = rawArgs;
        toolMeta = _meta || null;
        cleanArgs = rest;
      }
    }

    return {
      ok: true,
      data: {
        sent: { model, tool_choice, toolsCount: tools.length },
        openai: data,
        content: message.content || "",
        tool_call: firstCall,
        tool_name: firstCall?.function?.name || null,
        tool_args: cleanArgs,
        tool_meta: toolMeta,
      },
    };
  },

  // No stub: prevents accidental client-side OpenAI calls / key exposure.
  // stub: undefined,
};
