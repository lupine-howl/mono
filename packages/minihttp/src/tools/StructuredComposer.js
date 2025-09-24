// src/tools/base/StructuredComposer.js
// A thin base for “compose_* -> submit_*” tool pairs (underscore-only names).

function toSafeName(s) {
  return String(s || "")
    .trim()
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export class StructuredComposer {
  /**
   * @param {object} cfg
   * @param {string} cfg.namespace - e.g. "options" -> names: submit_options / compose_options
   * @param {object} cfg.payloadSchema - JSON Schema for the submit payload (properties + required)
   * @param {function(any, object): any} [cfg.sanitize] - sanitize/normalize the model payload (data, args) => data
   * @param {function(object): string} [cfg.directive] - builds extra model guidance appended to the user message
   */
  constructor({ namespace, payloadSchema, sanitize, directive }) {
    if (!namespace) throw new Error("StructuredComposer: namespace required");
    if (!payloadSchema)
      throw new Error("StructuredComposer: payloadSchema required");

    const safeNS = toSafeName(namespace);

    this.namespace = safeNS;
    this.submitName = `${safeNS}_submit`;
    this.composeName = `${safeNS}_compose`;
    this.payloadSchema = payloadSchema;
    this._sanitize = sanitize || ((data) => data);
    this._directive = directive || (() => "");
  }

  // ---- helpers you can reuse/override -------------------------------------

  hardliner(text) {
    // Ensures the model *must* call the submit tool and nothing else.
    return [
      `You MUST call the function tool "${this.submitName}" with JSON as specified.`,
      ...(text ? [text] : []),
      `Do NOT output any text outside the function call.`,
    ].join("\n");
  }

  buildMessages(args, extraTail = "") {
    const tail = extraTail ? `\n\n${extraTail}` : "";
    if (Array.isArray(args?.messages) && args.messages.length) {
      return {
        messages: [
          ...args.messages,
          { role: "user", content: this.hardliner("") },
        ],
      };
    }
    const sys = args?.llm?.system || args?.system || "";
    const prompt = (args?.prompt || "").trim();
    const msgs = [];
    if (sys) msgs.push({ role: "system", content: sys });
    msgs.push({ role: "user", content: prompt + tail });
    msgs.push({ role: "user", content: this.hardliner("") });
    return { messages: msgs };
  }

  // Generic de-bullet for options-like strings
  deBullet(s) {
    return String(s ?? "")
      .replace(/^\s*[-*•\u2022\u25CF]?\s*/g, "")
      .replace(/^\s*\d+[\.)\]]\s*/g, "")
      .replace(/^\s*[A-Za-z][\.)\]]\s*/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Allow subclasses to pass through llm knobs (model, temperature, etc.)
  llmArgs(args) {
    const out = {};
    const llm = args?.llm || {};
    for (const k of [
      "model",
      "temperature",
      "max_tokens",
      "max_completion_tokens",
    ]) {
      if (llm[k] !== undefined && llm[k] !== null) out[k] = llm[k];
      else if (args[k] !== undefined && args[k] !== null) out[k] = args[k];
    }
    return out;
  }

  // ---- tool specs ----------------------------------------------------------

  submitSpec() {
    const properties = this.payloadSchema.properties || {};
    const required = this.payloadSchema.required || [];
    return {
      name: this.submitName, // e.g. submit_options
      description: `Submit structured ${this.namespace} payload.`,
      safe: true,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties,
        required,
      },
      async handler(values) {
        return { ok: true, data: values };
      },
    };
  }

  composeSpec() {
    // Default orchestrator:
    // 1) builds messages (+directive),
    // 2) calls the submit tool via ctx.$plan (aiRequest),
    // 3) sanitizes/normalizes what came back.
    const self = this;
    return {
      name: this.composeName, // e.g. compose_options
      description: `Compose ${this.namespace} via LLM and return structured payload.`,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          prompt: { type: "string" },
          messages: { type: ["array", "null"] },
          llm: {
            type: ["object", "null"],
            additionalProperties: false,
            properties: {
              model: { type: ["string", "null"] },
              temperature: { type: ["number", "null"] },
              max_tokens: { type: ["integer", "null"] },
              max_completion_tokens: { type: ["integer", "null"] },
              system: { type: ["string", "null"] },
            },
          },
        },
      },
      async run(args, ctx) {
        const directive = self._directive(args) || "";
        const inArgs = {
          ...self.buildMessages(args, directive),
          ...self.llmArgs(args),
        };
        // Uses your runner’s ctx.$plan -> aiRequest(toolName: submit_*)
        const res = await ctx.$plan(self.submitName, inArgs);
        const raw = res?.data ?? res;
        const clean = self._sanitize(raw, args) || {};
        return clean;
      },
    };
  }

  // Optional convenience: register both specs
  register(registerFn) {
    const submit = this.submitSpec();
    const compose = this.composeSpec();
    if (typeof registerFn === "function") {
      registerFn(submit);
      registerFn(compose);
    }
    return { submit, compose };
  }
}
