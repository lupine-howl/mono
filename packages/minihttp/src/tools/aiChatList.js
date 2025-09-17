// src/tools/aiChatList.js
// A function tool + a convenience plan that forces an array-of-N result.

/**
 * 1) Function tool the model must call to return a list.
 *    This guarantees we get a structured array instead of free text.
 */
export const aiListRequest = {
  name: "aiListRequest",
  description:
    "Return a strictly structured list of items. The model MUST call this function with the final items.",
  safe: true,
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      items: {
        type: "array",
        description: "List items (plain text).",
        items: { type: "string" }, // <-- important: include items schema
      },
      comment: {
        type: ["string", "null"],
        description: "Optional short operator note (not user-facing).",
      },
      tags: {
        type: ["array", "null"],
        items: { type: "string" },
        description: "Optional tags for categorization.",
      },
      confidence: {
        type: ["number", "null"],
        minimum: 0,
        maximum: 1,
        description: "Optional confidence score.",
      },
    },
    required: ["items"],
  },

  async stub(values) {
    return { ok: true, data: values };
  },
  async handler(values) {
    return { ok: true, data: values };
  },
};

/**
 * 2) Convenience plan: ask the model for a list via aiRequest and aiListRequest.
 *    Returns { items } and a small table UI.
 */
export const aiChatList = {
  name: "aiChatList",
  description:
    "Ask the model for a list of N items via aiRequest using the aiListRequest function; returns a structured array.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      prompt: {
        type: "string",
        description:
          "User prompt describing what the list should contain (e.g., '10 ethical dilemmas').",
      },
      messages: { type: ["array", "null"] }, // see aiRequest for full schema
      n: {
        type: "integer",
        minimum: 1,
        maximum: 100,
        default: 10,
        description: "Exact number of items to return.",
      },
      system: { type: ["string", "null"], description: "Optional system msg." },
      model: { type: ["string", "null"], description: "Override model." },
      temperature: { type: ["number", "null"] },
      max_tokens: { type: ["integer", "null"] },
      max_completion_tokens: { type: ["integer", "null"] },
    },
    required: ["prompt"],
  },

  plan(values) {
    const n = Number.isInteger(values.n) ? values.n : 10;

    const hardliner = [
      `You are to produce a list of EXACTLY ${n} items.`,
      `You MUST return your final answer by calling the function tool "aiListRequest"`,
      `with a JSON array field "items" that has exactly ${n} strings.`,
      `No extra commentary or leading/trailing text outside of the function call.`,
      `Do not embed numbering, bullets, or markdown in each item unless the user explicitly asks for it.`,
    ].join("\n");

    return [
      {
        tool: "aiRequest",
        label: "req",
        input: {
          prompt: `${values.prompt}\n\n${hardliner}`,
          messages: values.messages ?? undefined,
          model: values.model ?? undefined,
          temperature: values.temperature ?? undefined,
          max_tokens: values.max_tokens ?? undefined,
          max_completion_tokens: values.max_completion_tokens ?? undefined,
          tool_choice: "auto",
          force: true,
          toolName: "aiListRequest",
        },
      },

      // Normalize the result so the caller always sees { items: string[] }
      {
        finalise: (ctx) => {
          const d = ctx.req?.data || {};
          const toolArgs =
            d.tool_args && typeof d.tool_args === "object" ? d.tool_args : null;

          let items = Array.isArray(toolArgs?.items) ? toolArgs.items : [];

          // Defensive trimming / padding to ensure exactly n (shouldn't be needed if the tool call is correct)
          if (items.length > n) items = items.slice(0, n);
          if (items.length < n) {
            const deficit = n - items.length;
            items = items.concat(
              Array.from(
                { length: deficit },
                (_, i) => `Item ${items.length + i + 1}`
              )
            );
          }

          // UI: small table
          const rows = items.map((text, i) => ({ index: i + 1, item: text }));

          return {
            ok: true,
            data: { items },
            ui: {
              kind: "table",
              title: `List (${n})`,
            },
            rows, // optional top-level mirror for convenience (your console uses data or data.rows)
          };
        },
      },
    ];
  },
};
