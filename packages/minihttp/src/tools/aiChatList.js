// src/tools/aiChatList.js

// 1) Function tool the model must call
export const aiChatListRequest = {
  name: "aiChatListRequest", // <— dotted name
  description: "Return a strictly structured list of items.",
  safe: true,
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      items: { type: "array", items: { type: "string" } },
      comment: { type: ["string", "null"] },
      tags: { type: ["array", "null"], items: { type: "string" } },
      confidence: { type: ["number", "null"], minimum: 0, maximum: 1 },
    },
    required: ["items"],
  },
  async handler(values) {
    return { ok: true, data: values };
  },
};

// 2) Convenience plan: ask model for a list via aiRequest + ai.list.request
export const aiChatList = {
  name: "aiChatList", // <— dotted name
  description:
    "Ask the model for a list of N items using the ai.list.request function; returns a structured array.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      prompt: { type: "string" },
      messages: { type: ["array", "null"] },
      n: { type: "integer", minimum: 1, maximum: 100, default: 10 },
      system: { type: ["string", "null"] },
      model: { type: ["string", "null"] },
      temperature: { type: ["number", "null"] },
      max_tokens: { type: ["integer", "null"] },
      max_completion_tokens: { type: ["integer", "null"] },
    },
    required: ["prompt"],
  },

  async run(values, ctx) {
    const n = Number.isInteger(values.n) ? values.n : 10;

    const hardliner = [
      `You MUST call the function tool "ai.list.request" with JSON { "items": [ ... exactly ${n} strings ... ] }.`,
      `No extra text outside the function call.`,
      `Don’t include numbering/bullets in each item unless asked.`,
    ].join("\n");

    const inArgs = {
      prompt: `${values.prompt}\n\n${hardliner}`,
      messages: values.messages ?? undefined,
      model: values.model ?? undefined,
      temperature: values.temperature ?? undefined,
      max_tokens: values.max_tokens ?? undefined,
      max_completion_tokens: values.max_completion_tokens ?? undefined,
      force: true,
      toolName: "aiChatListRequest", // <— matches the dotted name above
    };

    // IMPORTANT: await and destructure
    const { items = [] } = await ctx.$plan("aiChatListRequest", inArgs);

    return {
      items,
    };
  },
};
