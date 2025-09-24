// src/tools/compose_options.js
import { StructuredComposer } from "./StructuredComposer.js";

class OptionsComposer extends StructuredComposer {
  constructor() {
    super({
      namespace: "options",
      payloadSchema: {
        properties: {
          response: {
            type: "string",
            description: "Primary narrative/answer (plain or Markdown).",
          },
          options: {
            type: "array",
            minItems: 1,
            items: { type: "string" },
            description: "No bullets/letters.",
          },
          comment: { type: ["string", "null"] },
          tags: { type: ["array", "null"], items: { type: "string" } },
          confidence: { type: ["number", "null"], minimum: 0, maximum: 1 },
        },
        required: ["response", "options"],
      },
      sanitize: (data, args) => {
        const n = Number.isInteger(args?.n) ? args.n : null;
        const response = String(data?.response || "").trim() || "(no response)";
        let options = Array.isArray(data?.options) ? data.options : [];

        // dedupe, de-bullet, trim
        const seen = new Set();
        options = options
          .map((s) => this.deBullet(s))
          .filter((s) => s)
          .filter((s) => {
            const k = s.toLowerCase();
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          });

        if (n) {
          if (options.length > n) options = options.slice(0, n);
          // if too few, leave as-is; caller can re-ask
        } else {
          if (options.length < 2)
            options = options.concat(["Continue"]).slice(0, 2);
          if (options.length > 5) options = options.slice(0, 5);
        }

        return {
          response,
          options,
          comment: data?.comment ?? null,
          tags: data?.tags ?? null,
          confidence: data?.confidence ?? null,
        };
      },
      directive: (args) => {
        const n = Number.isInteger(args?.n) ? args.n : null;
        return n
          ? [
              `Return exactly ${n} options.`,
              `Each option is a short, plain label (no letters/numbers/bullets).`,
              `JSON shape: { "response": <string>, "options": <array of ${n} strings> }`,
            ].join("\n")
          : [
              `Return 2–5 options.`,
              `Each option is a short, plain label (no letters/numbers/bullets).`,
              `JSON shape: { "response": <string>, "options": <array of 2-5 strings> }`,
            ].join("\n");
      },
    });
  }

  // Extend composeSpec to add "n" param to orchestrator
  composeSpec() {
    const spec = super.composeSpec();
    spec.parameters.properties.n = {
      type: ["integer", "null"],
      minimum: 1,
      maximum: 12,
      description: "Exact number of options",
    };
    return spec;
  }
}

// Instantiate once and export the two specs (submit_* + compose_*)
const composer = new OptionsComposer();
export const options_submit = composer.submitSpec();
export const options_compose = composer.composeSpec();

// Optional: convenience register function if you want to do it here
//export function registerOptionsTools(register) {
//  composer.register((spec) => register(spec));
//}
