// src/tools/aiChat.js

// 1) Simple function tool the model calls to return a structured chat reply.
//    This exists just to define a schema the model can fill. We keep a tiny stub/handler
//    so the registry is happy, but in practice you won’t "execute" this in a plan.
export const aiChatRequest = {
  name: "aiChatRequest",
  description:
    "Return a structured chat reply. The model should call this function with the final answer.",
  safe: true,
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      role: {
        type: "string",
        enum: ["assistant", "system", "tool"],
        description: "Chat role; usually 'assistant'.",
      },
      response: {
        type: "string",
        description: "Primary answer to show the user (Markdown allowed).",
      },
      comment: {
        type: ["string", "null"],
        description:
          "Optional short aside/notes to the operator (not user-facing).",
      },
      follow_up: {
        type: ["string", "null"],
        description: "Optional suggested follow-up question or next step.",
      },
      tags: {
        type: ["array", "null"],
        items: { type: "string" },
        description: "Optional short tags for categorization.",
      },
      confidence: {
        type: ["number", "null"],
        minimum: 0,
        maximum: 1,
        description: "Optional confidence score.",
      },
    },
    required: ["response"],
  },

  // Keep execution trivial; primarily used as a schema sink for aiRequest.
  async stub(values /*, ctx */) {
    return { ok: true, data: values };
  },
  async handler(values /*, ctx */) {
    return { ok: true, data: values };
  },
};

// 2) Convenience plan: ask the model and get back aiChat args.
//    This calls your existing aiRequest tool, forcing aiChat as the selected tool.
//    Result is normalized so you always get { response, ... } even if no tool_call occurred.
export const aiChat = {
  name: "aiChat",
  description:
    "Ask the model for a reply via aiRequest using the aiChat function tool; returns the structured aiChat args.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      prompt: {
        type: "string",
        description: "User prompt to send to the model.",
      },
      messages: { type: ["array", "null"] }, // see aiRequest for full schema
      system: {
        type: ["string", "null"],
        description: "Optional system message.",
      },
      model: {
        type: ["string", "null"],
        description: "Override model (optional).",
      },
      temperature: { type: ["number", "null"] },
      max_tokens: { type: ["integer", "null"] },
      max_completion_tokens: { type: ["integer", "null"] },
    },
    required: [],
  },

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

  plan(values) {
    return [
      {
        tool: "aiRequest",
        label: "req",
        input: {
          prompt: values.prompt,
          messages: values.messages ?? null,
          system: values.system ?? null,
          model: values.model ?? undefined,
          temperature: values.temperature ?? undefined,
          max_tokens: values.max_tokens ?? undefined,
          max_completion_tokens: values.max_completion_tokens ?? undefined,
          tool_choice: "auto",
          force: true,
          toolName: "aiChatRequest",
        },
        output: (last, ctx) => {
          console.log(last.data.tool_args);
          const response = last.data.tool_args;
          return {
            ok: true,
            data: response,
            ui: {
              kind: "chat",
              title: "Assistant",
              actions: [
                // optional buttons the console can render
                // { label: "Summarize", tool: "aiChatAsk", args: { prompt: "Summarize that." } }
              ],
            },
          };
        },
      },
    ];
  },
};
