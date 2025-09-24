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

  async handler(values) {
    return { ok: true, data: values };
  },
};

/**
 * 2) Plan: force the model to call aiOptionsRequest and hand back structured data.
 */
export const aiChatWithOptions = {
  name: "options.compose",
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

  async run(args, ctx) {
    const n = Number.isInteger(args.n) ? args.n : null;

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

    //console.log("aiChatWithOptions.run", args, ctx);

    const inArgs = {
      prompt: args.prompt + "\n\n" + (n ? hardlinerExact : hardlinerAuto),
      messages: args.messages ?? undefined,
    };

    ////console.log("aiChatWithOptions.run inArgs:", inArgs);
    const res = await ctx.$plan("aiOptionsRequest", inArgs);
    console.log(res);

    let response = typeof res?.response === "string" ? res.response : "";
    let options = Array.isArray(res?.options) ? res.options : [];
    return {
      response,
      options,
    };
  },
};
