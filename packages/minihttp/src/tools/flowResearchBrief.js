const schemaStrOrNull = (desc, def = "") => ({
  type: ["string", "null"],
  description: desc,
  default: def,
});

const intOrNull = (desc, def) => ({
  type: ["integer", "null"],
  description: desc,
  default: def,
  minimum: 1,
  maximum: 12,
});

function extractText(maybeChat) {
  // Works with your aiChat/aiRequest shape
  const msg = maybeChat?.data?.messages?.slice(-1)?.[0]?.content ?? "";
  const content = maybeChat?.data?.content ?? msg ?? "";
  return String(content || "");
}

function parseBulletsToArray(text) {
  // Tolerant parser for bullet/numbered outlines
  const lines = String(text)
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  const out = [];
  for (const s of lines) {
    const m =
      s.match(/^\s*(?:[-*•]\s+)(.+)$/) ||
      s.match(/^\s*(?:\d+[\.)-]\s+)(.+)$/) ||
      s.match(/^\s*(?:\(\d+\)\s+)(.+)$/);
    if (m) out.push(m[1].trim());
  }
  // Fallback: if we didn't match bullets, just take non-empty lines.
  return out.length ? out : lines;
}

function htmlEscape(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildHtml({ topic, sections, drafts }) {
  const body = (drafts || [])
    .map((d, i) => {
      const title = htmlEscape(sections?.[i] || `Section ${i + 1}`);
      return `<section style="margin:16px 0;">
  <h2 style="margin:0 0 6px 0; font-size:18px;">${title}</h2>
  <div style="line-height:1.5">${htmlEscape(d)}</div>
</section>`;
    })
    .join("\n");

  return `<article style="font-family:ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; color:#e7e7ea; background:#0b0b0c; padding:4px;">
  <h1 style="font-size:22px; margin:0 0 10px 0;">${htmlEscape(topic)}</h1>
  ${body || "<p><em>No sections selected.</em></p>"}
</article>`;
}

export const flowResearchBrief = {
  name: "flowResearchBrief",
  description:
    "Interactive research-brief flow: intake → outline → choose sections → per-section drafting → assembled HTML → optional revision.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      topic: schemaStrOrNull(
        "What is the topic? (If omitted, a form appears.)"
      ),
      audience: schemaStrOrNull(
        "Target audience label (e.g., ‘PMs’, ‘execs’)."
      ),
      tone: {
        type: ["string", "null"],
        description: "Writing tone",
        enum: [null, "informative", "casual", "persuasive", "technical"],
        default: "informative",
      },
      max_sections: intOrNull("Max sections to propose in the outline.", 5),
      words_per_section: intOrNull("Target words per drafted section.", 140),
    },
  },

  // 🧭 PLAN
  plan(args, _ctx) {
    return [
      // 1) Intake form (only if topic missing)
      {
        when: (_c, _last, initial) => !initial?.topic,
        output(_c, _last, initial) {
          const schema = {
            type: "object",
            additionalProperties: false,
            required: ["topic"],
            properties: {
              topic: { type: "string", description: "What’s the topic?" },
              audience: schemaStrOrNull("Optional audience label."),
              tone: {
                type: ["string", "null"],
                enum: [
                  null,
                  "informative",
                  "casual",
                  "persuasive",
                  "technical",
                ],
                default: initial?.tone ?? "informative",
              },
              max_sections: intOrNull(
                "How many outline sections?",
                initial?.max_sections ?? 5
              ),
              words_per_section: intOrNull(
                "Words per section",
                initial?.words_per_section ?? 140
              ),
            },
          };
          const values = {
            topic: initial?.topic ?? "",
            audience: initial?.audience ?? "",
            tone: initial?.tone ?? "informative",
            max_sections: initial?.max_sections ?? 5,
            words_per_section: initial?.words_per_section ?? 140,
          };
          return {
            ui: { kind: "form", title: "Start a research brief" },
            data: { form: { schema, values } },
          };
        },
        await: "awaiting user input for topic",
      },

      // 2) Ask the model for a concise outline
      {
        tool: "aiChatAsk",
        input(ctx) {
          const i = ctx.$input || {};
          const max = i.max_sections || 5;
          const tone = i.tone || "informative";
          const audience = i.audience || "general readers";
          return {
            // Your aiChat supports either `prompt` or `messages`; keep it simple:
            prompt:
              `You are a meticulous research assistant.\n` +
              `Create a clean, numbered outline with at most ${max} sections for a brief on "${i.topic}".\n` +
              `Audience: ${audience}. Tone: ${tone}.\n` +
              `Output ONLY the outline as a numbered list; no extra commentary.`,
          };
        },
        label: "outline_chat",
      },

      // 3) Parse outline into an array and show it back (chat-style), so the user sees what they’re choosing from
      {
        run(ctx, last) {
          const text = extractText(last);
          const sections = parseBulletsToArray(text).slice(
            0,
            ctx.$input?.max_sections || 5
          );
          ctx.outline = sections;

          return {
            ui: { kind: "chat", title: "Proposed outline" },
            data: {
              messages: [
                {
                  role: "assistant",
                  content: sections.length
                    ? sections.map((s, i) => `${i + 1}. ${s}`).join("\n")
                    : "I couldn’t detect sections. You can still continue.",
                },
              ],
            },
          };
        },
        label: "outline_preview",
      },

      // 4) Let the user pick which sections to draft (dynamic form of booleans)
      {
        output(ctx) {
          const props = {};
          for (let i = 0; i < (ctx.outline?.length || 0); i++) {
            const title = ctx.outline[i];
            props[`Section ${i + 1}: ${title}`] = {
              type: "boolean",
              default: true,
            };
          }
          // If no outline detected, still show a single free-text section selector
          if (!Object.keys(props).length) {
            props["Section 1: Introduction"] = {
              type: "boolean",
              default: true,
            };
          }

          return {
            ui: { kind: "form", title: "Pick sections to draft" },
            data: {
              form: {
                schema: { type: "object", properties: props },
                values: {},
              },
            },
          };
        },
        await: "choose sections",
      },

      // 5) Derive selected sections into ctx.sections (fallback to first 3)
      {
        run(ctx) {
          const snap = ctx?.form?.data?.form?.values || ctx.$input || {};
          const picked = [];
          for (const [k, v] of Object.entries(snap)) {
            if (v) {
              const m = k.match(/^Section\s+\d+:\s*(.*)$/);
              picked.push(m ? m[1] : k);
            }
          }
          const fallback = (ctx.outline || []).slice(0, 3);
          ctx.sections = picked.length
            ? picked
            : fallback.length
            ? fallback
            : ["Introduction"];
          return { selected: ctx.sections };
        },
        label: "selected_sections",
      },

      // 6) For each selected section, ask the model to write a concise section
      {
        each: (ctx) => ctx.sections || [],
        body: [
          {
            tool: "aiChatAsk",
            input(ctx) {
              const i = ctx.$input || {};
              const words = i.words_per_section || 140;
              const audience = i.audience || "general readers";
              const tone = i.tone || "informative";
              return {
                prompt:
                  `Write a concise section (~${words} words) titled "${ctx.$loop.item}" ` +
                  `for a research brief on "${i.topic}". Audience: ${audience}. Tone: ${tone}.\n` +
                  `Avoid fluff; be specific and helpful.`,
              };
            },
            label: "secDraft",
          },
        ],
        collect: "drafts", // -> ctx.drafts = [ {aiChat result} ... ]
      },

      // 7) Assemble HTML preview
      {
        run(ctx) {
          const draftsText = (ctx.drafts || []).map(extractText);
          const html = buildHtml({
            topic: ctx.$input?.topic || "Untitled",
            sections: ctx.sections || [],
            drafts: draftsText,
          });
          ctx.previewHtml = html;
          return {
            ui: { kind: "html", title: "Draft brief (preview)" },
            data: { html },
          };
        },
        label: "assembled_preview",
      },

      // 8) Optional revision instructions
      {
        output(ctx) {
          const schema = {
            type: "object",
            properties: {
              revise_instructions: schemaStrOrNull(
                "Optional: How should I revise the draft? (e.g., 'more examples', 'simpler language')"
              ),
            },
            additionalProperties: false,
          };
          return {
            ui: { kind: "form", title: "Revise?" },
            data: { form: { schema, values: { revise_instructions: "" } } },
          };
        },
        await: "revise or continue",
      },

      // 9) If user gave instructions, do one revision pass
      {
        if: (ctx) => {
          const v = ctx?.form?.data?.form?.values || ctx.$input || {};
          return !!v.revise_instructions;
        },
        then: [
          {
            tool: "aiChatAsk",
            input(ctx) {
              const v = ctx?.form?.data?.form?.values || ctx.$input || {};
              const instr = v.revise_instructions || "";
              const html = ctx.previewHtml || "";
              return {
                prompt:
                  `You are an expert editor. Here is an HTML draft of a brief.\n` +
                  `Revise it per the instruction below. Maintain structure and headings.\n` +
                  `Instruction: ${instr}\n\n` +
                  `--- DRAFT HTML ---\n${html}\n--- END ---\n` +
                  `Return ONLY revised text, no commentary.`,
              };
            },
            label: "revised_chat",
          },
          {
            run(ctx, last) {
              const text = extractText(last);
              // If the model returned plain text, treat as HTML paragraphs
              const html = /<\/?[a-z][\s\S]*>/i.test(text)
                ? text
                : `<article><pre>${htmlEscape(text)}</pre></article>`;
              ctx.previewHtml = html;
              return {
                ui: { kind: "html", title: "Revised brief (preview)" },
                data: { html },
              };
            },
            label: "revised_preview",
          },
        ],
        else: [],
      },

      // 10) Final return (lets the console render the last preview)
      {
        return(ctx) {
          return {
            ui: { kind: "html", title: "Final brief" },
            data: { html: ctx.previewHtml || "<p>(empty)</p>" },
          };
        },
      },
    ];
  },
};
