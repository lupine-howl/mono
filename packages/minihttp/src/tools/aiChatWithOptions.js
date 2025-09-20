// src/tools/aiChatWithOptions.js
// Structured “chat + options” result: no parsing, just response + array of options.

/**
 * 1) Function tool: the model MUST call this with the final structured answer.
 */
export const aiOptionsRequest = {
  name: "aiOptionsRequest",
  description:
    "Return a structured chat response with an array of options the user can pick.",
  safe: true,
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      response: {
        type: "string",
        description:
          "Primary narrative/answer shown to the user (plain text or Markdown).",
      },
      options: {
        type: "array",
        minItems: 1,
        items: { type: "string" },
        description:
          "Plain-text option labels (no A/B/C prefixes; those can be rendered by the UI).",
      },
      comment: {
        type: ["string", "null"],
        description: "Optional operator note (not user-facing).",
      },
      tags: {
        type: ["array", "null"],
        items: { type: "string" },
      },
      confidence: {
        type: ["number", "null"],
        minimum: 0,
        maximum: 1,
      },
    },
    required: ["response", "options"],
  },

  async stub(values) {
    return { ok: true, data: values };
  },
  async handler(values) {
    return { ok: true, data: values };
  },
};

/**
 * 2) Plan: force the model to call aiOptionsRequest and hand back structured data.
 */
export const aiChatWithOptions = {
  name: "aiChatWithOptions",
  description:
    "Ask the model for a narrative response PLUS an array of options. Returns { response, options }.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      prompt: {
        type: "string",
        description:
          "What you want the model to do before proposing options (the narrative context).",
      },
      messages: { type: ["array", "null"] }, // see aiRequest for full schema
      n: {
        type: ["integer", "null"],
        minimum: 1,
        maximum: 12,
        default: null,
        description:
          "Optional exact number of options to return. If null, the model chooses (typically 2–5).",
      },
      system: { type: ["string", "null"], description: "Optional system msg." },
      model: { type: ["string", "null"], description: "Override model." },
      temperature: { type: ["number", "null"] },
      max_tokens: { type: ["integer", "null"] },
      max_completion_tokens: { type: ["integer", "null"] },
    },
    required: [],
  },

  beforeRun(values) {
    const n = Math.max(2, Math.min(4, Number(values?.n) || 3));
    const opts = Array.from({ length: n }, () => "…");
    return {
      async: true,
      runArgs: values,
      optimistic: {
        ok: true,
        data: { response: "Thinking…", options: opts },
        ui: { kind: "chat", title: values?.title || "Thinking…" },
        // Optional: emit disabled actions; or let your step.output build them
      },
    };
  },

  plan(values) {
    const n = Number.isInteger(values.n) ? values.n : null;

    const hardlinerExact = [
      `You MUST call the function tool "aiOptionsRequest" with JSON:`,
      `{ "response": <string>, "options": <array of exactly ${n} strings> }`,
      `Do NOT include letters, numbers, or bullets in each option string.`,
      `Do NOT output text outside the function call.`,
    ].join("\n");

    const hardlinerAuto = [
      `You MUST call the function tool "aiOptionsRequest" with JSON:`,
      `{ "response": <string>, "options": <array of 2-5 strings> }`,
      `Choose a natural number of options between 2 and 5.`,
      `Do NOT include letters, numbers, or bullets in each option string.`,
      `Do NOT output text outside the function call.`,
    ].join("\n");

    return [
      {
        tool: "aiRequest",
        label: "req",
        input: {
          prompt: values.prompt + "\n\n" + (n ? hardlinerExact : hardlinerAuto),
          messages: values.messages ?? undefined,
          model: values.model ?? undefined,
          temperature: values.temperature ?? undefined,
          max_tokens: values.max_tokens ?? undefined,
          max_completion_tokens: values.max_completion_tokens ?? undefined,
          tool_choice: "auto",
          force: true,
          toolName: "aiOptionsRequest",
        },
      },

      // Normalize: always return { response, options } and a small chat preview
      {
        finalise: (ctx) => {
          const d = ctx.req?.data || {};
          const args =
            d.tool_args && typeof d.tool_args === "object" ? d.tool_args : null;

          let response =
            typeof args?.response === "string" ? args.response : "";
          let options = Array.isArray(args?.options) ? args.options : [];

          // Defensive constraints (should be guaranteed by tool call)
          if (n && options.length !== n) {
            // pad or trim to exactly n (labels are harmless if we had to pad)
            if (options.length > n) options = options.slice(0, n);
            if (options.length < n) {
              const deficit = n - options.length;
              options = options.concat(
                Array.from(
                  { length: deficit },
                  (_, i) => `Option ${options.length + i + 1}`
                )
              );
            }
          }
          // Strip any accidental prefixes like "A) " or "1. "
          options = options.map((s) =>
            String(s)
              .replace(/^\s*(?:[A-Z]\)|\d+[\.)-])\s+/, "")
              .trim()
          );

          // Pretty chat preview (no actions; flows can add __resume__ buttons)
          const content =
            response +
            (options.length
              ? "\n\n" +
                options
                  .map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`)
                  .join("\n")
              : "");

          return {
            ok: true,
            data: { response, options },
            ui: {
              kind: "chat",
              title: "Assistant",
            },
            // console renders from data.messages if present (nice preview)
            messages: [{ role: "assistant", content }],
          };
        },
      },
    ];
  },
};
