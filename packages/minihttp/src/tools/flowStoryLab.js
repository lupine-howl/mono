// flowStoryLab — streamlined with ctx.tools & ctx.ui and small helpers

import {
  MODE_META,
  ageGuard,
  beatFor,
  clampBranching,
  makeRecap,
  evolveStateAfterChoice,
  makeChoiceActions,
} from "./flowStoryHelpers.js";

export const flowStoryLab = {
  name: "flowStoryLab",
  description:
    "Interactive story generator: pick age bracket, mode (ethical, adventure, mystery…), style, steps, and branching. The story evolves toward a climax and ending.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      seed: { type: ["number", "null"], default: null },
      stages: {
        type: ["integer", "null"],
        default: 5,
        minimum: 1,
        maximum: 12,
      },
      mode: {
        type: ["string", "null"],
        enum: [
          "ethical_dilemma",
          "adventure",
          "mystery",
          "survival",
          "social_drama",
          null,
        ],
        default: null,
      },
      age: {
        type: ["string", "null"],
        enum: ["5-8", "9-12", "13-15", "16-18", "adult", null],
        default: null,
      },
      style: {
        type: ["string", "null"],
        enum: [
          "neutral",
          "humorous",
          "noir",
          "fantasy",
          "sci-fi",
          "realistic",
          "whimsical",
          null,
        ],
        default: null,
      },
      branching: {
        type: ["integer", "null"],
        default: 3,
        minimum: 2,
        maximum: 4,
      },
    },
  },

  steps() {
    // --- tiny helpers that use ctx.tools with graceful fallbacks ---
    async function listHooks(ctx, prompt) {
      const { items } = await ctx.tools.aiChatList({ prompt });
      return items || [];
    }

    async function composeOptions(ctx, { branching, system, messages }) {
      // preferred: options.compose
      try {
        return await ctx.tools.options.compose({
          n: branching,
          system,
          messages,
        });
      } catch {
        // back-compat: aiChatWithOptions
        return await ctx.$call("aiChatWithOptions", {
          n: branching,
          system,
          messages,
        });
      }
    }

    async function chatEnding(ctx, messages) {
      // preferred: ai.chat
      try {
        return await ctx.tools.ai.chat({ messages });
      } catch {
        // back-compat: aiChatRequest plan
        return await ctx.$plan("aiChatRequest", { messages });
      }
    }

    return [
      // 0) Setup form
      {
        label: "setup_form",
        async run(_args, ctx) {
          const v = ctx.$input || {};
          const defaults = {
            mode: v.mode ?? "ethical_dilemma",
            age: v.age ?? "13-15",
            style: v.style ?? "realistic",
            stages: Number.isInteger(v.stages) ? v.stages : 5,
            branching: Number.isInteger(v.branching) ? v.branching : 3,
          };
          ctx.cfg = defaults;

          ctx.ui.clear();
          ctx.ui.open({
            ui: { kind: "form", title: "Story Lab — setup" },
            data: {
              form: {
                schema: {
                  type: "object",
                  required: ["mode", "age", "style", "stages", "branching"],
                  properties: {
                    mode: {
                      type: "string",
                      enum: Object.keys(MODE_META),
                      description: "Story mode",
                    },
                    age: {
                      type: "string",
                      enum: ["5-8", "9-12", "13-15", "16-18", "adult"],
                      description: "Audience age bracket",
                    },
                    style: {
                      type: "string",
                      enum: [
                        "neutral",
                        "humorous",
                        "noir",
                        "fantasy",
                        "sci-fi",
                        "realistic",
                        "whimsical",
                      ],
                      description: "Tone/style",
                    },
                    stages: {
                      type: "integer",
                      minimum: 1,
                      maximum: 12,
                      description: "Number of stages",
                    },
                    branching: {
                      type: "integer",
                      minimum: 2,
                      maximum: 4,
                      description: "Choices per stage",
                    },
                  },
                },
                values: defaults,
              },
            },
          });

          const { values } = await ctx.ui.awaitResume();
          ctx.cfg = { ...ctx.cfg, ...values };
        },
      },

      // 1) Generate hooks and pick topic
      {
        label: "pick_topic",
        async run(_args, ctx) {
          const meta = MODE_META[ctx.cfg.mode] || MODE_META.ethical_dilemma;
          const prompt = `${meta.listPrompt(
            ctx.cfg
          )}\nSafety & reading level: ${ageGuard(ctx.cfg.age)}.`;

          ctx.hooks = await listHooks(ctx, prompt);

          ctx.ui.update({
            ui: { kind: "form", title: `Pick a ${meta.label}` },
            data: {
              form: {
                schema: {
                  type: "object",
                  required: ["topic"],
                  properties: {
                    topic: {
                      type: "string",
                      enum: ctx.hooks,
                      description: "Choose one to explore",
                    },
                  },
                },
                values: { topic: ctx.hooks?.[0] || "" },
              },
            },
          });

          const { values } = await ctx.ui.awaitResume();
          ctx.topic = values?.topic || ctx.hooks?.[0] || "Untitled Topic";
        },
      },

      // 2) Init loop state
      {
        label: "init_loop_state",
        run(_args, ctx) {
          ctx.maxStages = Number(ctx.cfg?.stages) || 5;
          ctx.stage = 1;
          ctx.state = {
            progress: 0,
            tension: 0,
            flags: [],
            inventory: [],
            relations: {},
            motifs: new Set(),
            lastSummary: "",
          };
          ctx.transcriptStages = [];
          ctx.path = [];
          ctx.messages = [
            {
              role: "system",
              content:
                MODE_META[ctx.cfg.mode].stageSystem({
                  ...ctx.cfg,
                  branching: ctx.cfg.branching,
                }) +
                `\nAccount for evolving state and consequences. Avoid repeating earlier obstacles.`,
            },
          ];
          return { ok: true };
        },
      },

      // 3) Stage loop
      {
        label: "stage_loop",
        async run(_args, ctx) {
          while (ctx.stage <= ctx.maxStages) {
            const branching = clampBranching(ctx.cfg?.branching);
            const beat = beatFor(ctx.stage || 1, ctx.maxStages || 5);
            const recap = makeRecap(ctx);
            const avoidList = Array.from(ctx.state.motifs || []).slice(-10);

            const system =
              MODE_META[ctx.cfg.mode].stageSystem({ ...ctx.cfg, branching }) +
              `\nBeat for this stage: ${beat}` +
              `\nEvolve the situation based on the recap below. Add NEW elements; avoid repeating past obstacles/motifs.` +
              (recap ? `\n${recap}` : "") +
              (avoidList.length
                ? `\nAvoid repeating motifs: ${avoidList.join(", ")}`
                : "") +
              `\nEnsure forward motion toward a conclusion: each option should clearly change state (progress/tension/resources/relationships).`;

            const resp = await composeOptions(ctx, {
              branching,
              system,
              messages: ctx.messages ? ctx.messages.slice(-12) : undefined,
            });

            const narrative = resp?.response || "";
            const options =
              Array.isArray(resp?.options) && resp.options.length
                ? resp.options
                : ["Continue"];

            ctx.currentNarrative = narrative;
            ctx.currentOptions = options;

            ctx.messages.push({
              role: "assistant",
              content: narrative + "\nOPTIONS:" + JSON.stringify(options),
            });

            // show choice
            ctx.transcriptStages.push({
              stage: ctx.stage,
              beat,
              narrative,
              options,
              choice: null,
            });
            ctx.ui.update({
              ui: {
                kind: "choice",
                title: `Stage ${ctx.stage}: ${ctx.topic}`,
                message: narrative,
                actions: makeChoiceActions(options),
              },
            });

            const picked = await ctx.ui.awaitResume();
            const chosen =
              picked?.values?.choice ??
              options[picked?.values?.choiceIndex ?? 0] ??
              options[0];

            // attach choice
            const lastEntry = ctx.transcriptStages.at(-1);
            if (lastEntry) lastEntry.choice = chosen;

            // path + prime next turn
            (ctx.path ||= []).push({ stage: ctx.stage, choice: chosen });
            ctx.messages.push({ role: "user", content: `I choose: ${chosen}` });

            // evolve state
            evolveStateAfterChoice(ctx, chosen);

            // next stage steering
            const nextStage = (ctx.stage || 1) + 1;
            const meta = MODE_META[ctx.cfg.mode];
            let steer =
              nextStage === ctx.maxStages
                ? "Set up the decisive confrontation leading directly to the ending. Remove side quests."
                : nextStage > ctx.maxStages
                ? "No new options; we are heading to the ending."
                : meta.escalate(nextStage);

            ctx.messages.push({
              role: "system",
              content:
                `${steer}\n` +
                `${meta.stageSystem({
                  ...ctx.cfg,
                  branching: ctx.cfg.branching,
                })}` +
                `\nAccount for evolving state and consequences. Avoid repeating earlier obstacles.`,
            });

            ctx.stage = nextStage;
            if (ctx.stage > ctx.maxStages) break;
          }
          return { ok: true };
        },
      },

      // 4) Ending
      {
        label: "ending",
        async run(_args, ctx) {
          ctx.ui.loading({
            ui: { kind: "loading", title: "Composing ending…" },
          });

          const meta = MODE_META[ctx.cfg.mode];
          const pathLines = (ctx.path || [])
            .map((p) => `Stage ${p.stage}: ${p.choice}`)
            .join("\n");
          const beats = (ctx.transcriptStages || [])
            .map(
              (s) =>
                `Stage ${s.stage} [${beatFor(s.stage, ctx.maxStages)}]: ${
                  s.choice || "(no choice)"
                } — "${(s.narrative || "").slice(0, 120)}..."`
            )
            .join("\n");

          const endingSpec =
            ctx.cfg.mode === "ethical_dilemma"
              ? "Deliver a balanced resolution acknowledging trade-offs and impacted stakeholders."
              : ctx.cfg.mode === "mystery"
              ? "Reveal the solution by tying clues together logically; avoid gore."
              : ctx.cfg.mode === "survival"
              ? "Resolve with practical outcomes of resource/decision management; concise and grounded."
              : ctx.cfg.mode === "social_drama"
              ? "Resolve relationships with believable consequences and at least one repair step."
              : "Deliver a satisfying adventure climax and falling action; keep it punchy.";

          const guard = ageGuard(ctx.cfg.age);

          const messages = ctx.messages.concat([
            {
              role: "system",
              content:
                `You craft endings that pay off prior decisions. Tone: ${ctx.cfg.style}. Audience ages: ${ctx.cfg.age}. ${guard}\n` +
                `Write a fitting ending in 4–8 sentences. It must flow naturally from the path and state below.`,
            },
            {
              role: "user",
              content:
                `STORY MODE: ${meta.label}\nTOPIC: ${ctx.topic}\n` +
                `PATH:\n${pathLines || "(no choices)"}\n\n` +
                `BEATS:\n${beats}\n\n` +
                `STATE: progress=${ctx.state?.progress}, tension=${
                  ctx.state?.tension
                }, flags=${(ctx.state?.flags || []).join(", ")}, inventory=${(
                  ctx.state?.inventory || []
                ).join(", ")}\n\n` +
                `ENDING SPEC: ${endingSpec}`,
            },
          ]);

          const final = await chatEnding(ctx, messages);
          ctx.ui.clear();
          ctx.ending =
            final?.content || final?.response || "(ending unavailable)";
          return { ok: true };
        },
      },

      // 5) Wrap-up
      {
        label: "wrap_up",
        run(_args, ctx) {
          const meta = MODE_META[ctx.cfg.mode];

          const fullTranscript = (ctx.transcriptStages || [])
            .map((s) => {
              const opts = (s.options || [])
                .map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`)
                .join(" ");
              const chosen = s.choice ? ` → You chose: ${s.choice}` : "";
              return `Stage ${s.stage} — ${s.beat}\n${s.narrative}\n${opts}${chosen}\n`;
            })
            .join("\n");

          const pathSummary =
            (ctx.path || [])
              .map((p) => `Stage ${p.stage}: ${p.choice}`)
              .join("\n") || "(no choices)";

          const extras =
            ctx.cfg.mode === "ethical_dilemma"
              ? `\n\nReflection prompts:\n- What value did each option prioritise?\n- Who benefited and who bore the cost?\n- What might you do differently next time?`
              : ctx.cfg.mode === "adventure"
              ? `\n\nEpilogue hook: What new journey might follow from this ending?`
              : ctx.cfg.mode === "mystery"
              ? `\n\nTakeaway: Which clue mattered most, and why?`
              : ctx.cfg.mode === "survival"
              ? `\n\nTakeaway: What single habit would improve survival odds next time?`
              : `\n\nNext step: How could you repair relationships or strengthen trust?`;

          return {
            ui: { kind: "chat", title: "Ending & Transcript" },
            data: {
              messages: [
                {
                  role: "assistant",
                  content: `**Ending for “${ctx.topic}” (${meta.label})**\n\n${
                    ctx.ending || "(ending unavailable)"
                  }`,
                },
                {
                  role: "assistant",
                  content: `**Your path**\n${pathSummary}${extras}`,
                },
                {
                  role: "assistant",
                  content: `**Full transcript**\n${fullTranscript}`,
                },
              ],
            },
          };
        },
      },
    ];
  },
};
