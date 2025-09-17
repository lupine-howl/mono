// --- the tool ---
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

  plan(args, _ctx) {
    const MODE_META = {
      ethical_dilemma: {
        label: "Ethical dilemma",
        listPrompt: (cfg) =>
          `List 12 distinct ${cfg.style} ethical dilemmas suitable for ages ${cfg.age}. Respond as a numbered list of short titles.`,
        stageSystem: (cfg) =>
          `You are an expert ethical-dilemma designer. Keep content appropriate for ages ${cfg.age}. Tone: ${cfg.style}.
Write a brief scene (2–4 sentences) that frames the ethical tension clearly and neutrally.
Then produce ${cfg.branching} distinct options (short, action-oriented). Avoid graphic content.`,
        escalate: (nextStage) =>
          `Escalate the ethical stakes for stage ${nextStage} by introducing a new constraint, trade-off, or stakeholder.`,
        wrapupNote:
          "Offer 2–3 short reflection questions that encourage perspective-taking (we'll render separately).",
      },
      adventure: {
        label: "Choose-your-own adventure",
        listPrompt: (cfg) =>
          `List 12 ${cfg.style} adventure hooks suitable for ages ${cfg.age}. Numbered list of short titles.`,
        stageSystem: (cfg) =>
          `You are an expert adventure designer. Keep content appropriate for ages ${cfg.age}. Tone: ${cfg.style}.
Write a vivid but concise scene (2–4 sentences) ending in a clear decision point.
Then produce ${cfg.branching} distinct options (verbs up front).`,
        escalate: (nextStage) =>
          `Raise stakes for stage ${nextStage} with a twist, time pressure, or new obstacle.`,
        wrapupNote:
          "Write a 2–4 sentence epilogue resolving the most recent choice.",
      },
      mystery: {
        label: "Mystery",
        listPrompt: (cfg) =>
          `List 12 ${cfg.style} mystery premises suitable for ages ${cfg.age}. Numbered list of short titles.`,
        stageSystem: (cfg) =>
          `You are an expert mystery designer. Keep content appropriate for ages ${cfg.age}. Tone: ${cfg.style}.
Write a clue-rich scene (2–4 sentences). Then produce ${cfg.branching} investigation options.`,
        escalate: (nextStage) =>
          `For stage ${nextStage}, deepen the mystery with a clue, red herring, or suspect behavior.`,
        wrapupNote:
          "Reveal the key insight that ties the clues together (no gore).",
      },
      survival: {
        label: "Survival scenario",
        listPrompt: (cfg) =>
          `List 12 ${cfg.style} survival scenarios suitable for ages ${cfg.age}. Numbered short titles.`,
        stageSystem: (cfg) =>
          `You are an expert survival scenario writer. Keep content appropriate for ages ${cfg.age}. Tone: ${cfg.style}.
Write a concise survival scene (2–4 sentences). Then produce ${cfg.branching} pragmatic options.`,
        escalate: (nextStage) =>
          `For stage ${nextStage}, introduce resource constraints, environment hazards, or time limits.`,
        wrapupNote: "Summarise the final status and one practical takeaway.",
      },
      social_drama: {
        label: "Social drama",
        listPrompt: (cfg) =>
          `List 12 ${cfg.style} school/community social situations suitable for ages ${cfg.age}. Numbered short titles.`,
        stageSystem: (cfg) =>
          `You are an expert social scenario designer. Keep content appropriate for ages ${cfg.age}. Tone: ${cfg.style}.
Write a short scene (2–4 sentences) focusing on relationships and consequences. Then produce ${cfg.branching} options.`,
        escalate: (nextStage) =>
          `For stage ${nextStage}, add a social complication (misunderstanding, reputation cost, conflicting goals).`,
        wrapupNote: "Offer 2 practical de-escalation or repair strategies.",
      },
    };

    const AGE_GUARDS = (age) => {
      switch (age) {
        case "5-8":
          return "No violence, no injuries, no romance; simple language (~Grade 2–3). Positive framing, supportive adults.";
        case "9-12":
          return "No gore or romance; low peril; age-appropriate language (~Grade 4–6). Emphasise teamwork and learning.";
        case "13-15":
          return "PG-level content; no graphic harm. Keep language clean. Emphasise agency and consequences.";
        case "16-18":
          return "M-level themes allowed; avoid explicit content. Nuanced consequences; realistic dialogue.";
        default:
          return "General content; avoid graphic depictions. Be thoughtful and respectful.";
      }
    };

    // NEW: Beat planner to steer toward a conclusion (setup→rising→midpoint→crisis→climax)
    function beatFor(stage, total) {
      if (stage <= 1) return "Setup: establish protagonist/goal + gentle hook.";
      const mid = Math.ceil(total / 2);
      if (stage === mid) return "Midpoint: reveal twist or reframe the goal.";
      if (stage === total - 1)
        return "Crisis: toughest trade-off; consequences from prior choices bite.";
      if (stage >= total)
        return "Climax setup: immediate lead-in to ending; choices should be decisive.";
      return "Rising action: escalate stakes, add constraint, show consequences of last choice.";
    }

    // ---------- Plan begins ----------
    return [
      // 0) First page: configuration form
      {
        run(ctx) {
          const v = ctx.$input || {};
          const defaults = {
            mode: v.mode ?? "ethical_dilemma",
            age: v.age ?? "13-15",
            style: v.style ?? "realistic",
            stages: Number.isInteger(v.stages) ? v.stages : 5,
            branching: Number.isInteger(v.branching) ? v.branching : 3,
          };
          ctx.cfg = defaults;
          return {
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
          };
        },
        await: "awaiting Story Lab setup",
        label: "config",
      },

      // 1) Suggest 12 hooks based on config
      {
        tool: "aiChatList",
        input(ctx) {
          const v = ctx?.form?.data?.form?.values || ctx.cfg || {};
          ctx.cfg = { ...ctx.cfg, ...v };
          const meta = MODE_META[v.mode] || MODE_META.ethical_dilemma;
          const prompt = `${meta.listPrompt(
            v
          )}\nSafety & reading level: ${AGE_GUARDS(v.age)}.`;
          return { prompt, n: 12 };
        },
        label: "hooks_list",
        output(args, ctx) {
          const list = Array.isArray(args?.data?.items) ? args.data.items : [];
          ctx.hooks = list.slice(0, 12);
          return {
            ui: {
              kind: "form",
              title: `Pick a ${MODE_META[ctx.cfg.mode].label}`,
            },
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
                values: { topic: ctx.hooks[0] || "" },
              },
            },
          };
        },
        await: "awaiting topic selection",
      },

      // 2) Store selection + initialise loop state
      {
        run(ctx) {
          const v = ctx?.form?.data?.form?.values || ctx.$input || {};
          ctx.topic = v.topic || ctx.hooks?.[0] || "Untitled";
          ctx.stage = 1;
          ctx.path = [];
          ctx.maxStages = Number.isInteger(ctx.cfg?.stages)
            ? ctx.cfg.stages
            : 5;

          // NEW: evolving story state to avoid repetition and advance plot
          ctx.state = {
            progress: 0, // 0..1 toward resolution
            tension: 0, // 0..1 rising pressure
            flags: [], // arbitrary string tags set by choices
            inventory: [], // items/clues/alliances
            relations: {}, // npc -> (-1..+1)
            motifs: new Set(), // to avoid repeating (converted to array in prompts)
            lastSummary: "", // rolling recap
          };
          ctx.transcriptStages = []; // {stage, beat, narrative, options[], choice}

          const guard = AGE_GUARDS(ctx.cfg.age);
          const meta = MODE_META[ctx.cfg.mode];

          ctx.messages = [
            {
              role: "system",
              content:
                `You are running an interactive ${meta.label.toLowerCase()} titled: "${
                  ctx.topic
                }".\n` +
                `Audience: ages ${ctx.cfg.age}. Tone: ${ctx.cfg.style}. ${guard}`,
            },
            {
              role: "system",
              content:
                meta.stageSystem({ ...ctx.cfg, branching: ctx.cfg.branching }) +
                `\nAvoid long lists; keep outputs tight and gameable.`,
            },
          ];

          return {
            selected: {
              topic: ctx.topic,
              mode: ctx.cfg.mode,
              age: ctx.cfg.age,
              style: ctx.cfg.style,
            },
            ui: { kind: "chat", title: `Starting: ${ctx.topic}` },
            data: {
              messages: [
                { role: "assistant", content: `Let's begin “${ctx.topic}”.` },
              ],
            },
          };
        },
        label: "selection",
      },

      // 3) Loop stages
      {
        while: (ctx) => (ctx.stage || 1) <= (ctx.maxStages || 5),
        body: [
          // 3a) Ask model for scene + options with beat + anti-repetition constraints
          {
            tool: "aiChatWithOptions",
            input(ctx) {
              const n = Math.max(
                2,
                Math.min(4, Number(ctx.cfg?.branching) || 3)
              );
              const beat = beatFor(ctx.stage || 1, ctx.maxStages || 5);

              // NEW: brief machine-readable recap to steer development & avoid repeats
              const recap = [
                ctx.state.lastSummary
                  ? `Recent recap: ${ctx.state.lastSummary}`
                  : "",
                ctx.path?.length
                  ? `Last choice: ${ctx.path[ctx.path.length - 1].choice}`
                  : "",
                ctx.state.flags.length
                  ? `Flags: ${ctx.state.flags.join(", ")}`
                  : "",
                ctx.state.inventory.length
                  ? `Inventory/Clues: ${ctx.state.inventory.join(", ")}`
                  : "",
              ]
                .filter(Boolean)
                .join(" | ");

              // NEW: anti-repetition motif list
              const avoidList = Array.from(ctx.state.motifs || []).slice(-10);

              return {
                n,
                messages: ctx.messages ? ctx.messages.slice(-12) : undefined,
                system:
                  MODE_META[ctx.cfg.mode].stageSystem({
                    ...ctx.cfg,
                    branching: n,
                  }) +
                  `\nBeat for this stage: ${beat}` +
                  `\nEvolve the situation based on the recap below. Add NEW elements; avoid repeating past obstacles/motifs.` +
                  (recap ? `\n${recap}` : "") +
                  (avoidList.length
                    ? `\nAvoid repeating motifs: ${avoidList.join(", ")}`
                    : "") +
                  `\nEnsure forward motion toward a conclusion: each option should clearly change state (progress/tension/resources/relationships).`,
              };
            },
            label: "stage_structured",
            output(last, ctx) {
              const resp = last?.data || {};
              const narrative = resp.response || "";
              const options = Array.isArray(resp.options) ? resp.options : [];

              // Record narrative & present options
              ctx.currentNarrative = narrative;
              ctx.currentOptions = options;

              // Keep only narrative (no JSON dump) to reduce repetition downstream
              ctx.messages.push({
                role: "assistant",
                content: narrative + "\nOPTIONS:" + JSON.stringify(options),
              });

              const actions = options.map((opt, idx) => ({
                label: opt,
                tool: "__resume__",
                args: { choice: opt, choiceIndex: idx },
              }));

              // NEW: cache stage beat for transcript
              const beat = beatFor(ctx.stage || 1, ctx.maxStages || 5);
              ctx.transcriptStages.push({
                stage: ctx.stage,
                beat,
                narrative,
                options,
                choice: null,
              });

              return {
                ui: {
                  kind: "chat",
                  title: `Stage ${ctx.stage}: ${ctx.topic}`,
                  actions,
                },
                data: {
                  messages: [
                    {
                      role: "assistant",
                      content: narrative,
                    },
                  ],
                },
              };
            },
            await: "awaiting option pick",
          },

          // 3b) Record choice + update evolving state + prep next stage
          {
            run(ctx) {
              const v = ctx?.form?.data?.form?.values || ctx.$input || {};
              const chosen =
                v.choice ?? (ctx.currentOptions?.[0] || "Option A");

              // Update transcript (attach choice to last stage entry)
              const lastEntry =
                ctx.transcriptStages[ctx.transcriptStages.length - 1];
              if (lastEntry) lastEntry.choice = chosen;

              // Track path
              (ctx.path ||= []).push({ stage: ctx.stage, choice: chosen });
              ctx.messages.push({
                role: "user",
                content: `I choose: ${chosen}`,
              });

              // NEW: naive state evolution (simple but effective)
              const total = ctx.maxStages || 5;
              const step = 1 / Math.max(2, total); // approach 1.0 by end
              ctx.state.progress = Math.min(
                1,
                (ctx.state.progress || 0) + step
              );
              ctx.state.tension = Math.min(1, (ctx.state.tension || 0) + 0.15);

              // Derive simple flags/motifs from the choice text
              const lower = String(chosen).toLowerCase();
              const tags = [];
              if (lower.includes("help") || lower.includes("ally"))
                tags.push("ally_gained");
              if (lower.includes("wait") || lower.includes("hide"))
                tags.push("time_cost");
              if (
                lower.includes("risk") ||
                lower.includes("steal") ||
                lower.includes("fight")
              )
                tags.push("risk_taken");
              if (
                lower.includes("evidence") ||
                lower.includes("map") ||
                lower.includes("tool")
              )
                tags.push("resource_found");
              if (
                lower.includes("apolog") ||
                lower.includes("repair") ||
                lower.includes("trust")
              )
                tags.push("relationship_repair");
              ctx.state.flags.push(...tags);

              // Simple inventory/relations heuristics
              if (tags.includes("resource_found"))
                ctx.state.inventory.push(`asset@stage${ctx.stage}`);
              if (tags.includes("ally_gained"))
                ctx.state.relations["ally"] = Math.min(
                  1,
                  (ctx.state.relations["ally"] || 0) + 0.5
                );

              // NEW: rolling summary to prime the next turn
              const last2 = ctx.transcriptStages
                .slice(-2)
                .map((s) => `${s.stage}:${s.choice ?? "—"}`)
                .join(", ");
              ctx.state.lastSummary = `Progress ${
                (ctx.state.progress * 100) | 0
              }%, tension ${
                (ctx.state.tension * 100) | 0
              }% — recent choices ${last2}`;

              // NEW: remember motifs from narrative (rough heuristic: top nouns/verbs-ish)
              const motifSeeds = (ctx.currentNarrative || "")
                .split(/\W+/)
                .filter((w) => w && w.length > 4)
                .slice(0, 8);
              motifSeeds.forEach((m) => ctx.state.motifs.add(m.toLowerCase()));

              // Prepare next system guidance
              const nextStage = (ctx.stage || 1) + 1;
              const meta = MODE_META[ctx.cfg.mode];

              // If penultimate stage, explicitly set up climax; if final, prompt for decisive scene.
              let steer = "";
              if (nextStage === ctx.maxStages) {
                steer =
                  "Set up the decisive confrontation leading directly to the ending. Remove side quests.";
              } else if (nextStage > ctx.maxStages) {
                steer = "No new options; we are heading to the ending.";
              } else {
                steer = meta.escalate(nextStage);
              }

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
              return { chosen, state: ctx.state };
            },
            label: "record_choice",
          },
        ],
      },

      // 4) Tailored ending based on the whole path + state  (uses aiChat; swap to aiChatWithOptions {n:0} if needed)
      {
        tool: "aiChat",
        input(ctx) {
          const meta = MODE_META[ctx.cfg.mode];
          // Compact path for the model
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

          const guard = AGE_GUARDS(ctx.cfg.age);

          return {
            messages: ctx.messages.concat([
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
            ]),
            // Optional: you can pass temperature/top_p here if your aiChat supports them
          };
        },
        label: "ending",
        output(res, ctx) {
          const ending =
            res?.data?.content || res?.data?.response || "(ending unavailable)";
          return ending;
        },
      },

      // 5) Wrap-up & full transcript
      {
        return(ctx) {
          console.log(ctx);
          const meta = MODE_META[ctx.cfg.mode];

          // Full transcript with beats and snippets
          const fullTranscript = (ctx.transcriptStages || [])
            .map((s) => {
              const opts = (s.options || [])
                .map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`)
                .join(" ");
              const chosen = s.choice ? ` → You chose: ${s.choice}` : "";
              return `Stage ${s.stage} — ${s.beat}\n${s.narrative}\n${opts}${chosen}\n`;
            })
            .join("\n");

          // Quick path summary
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
                  content: `**Ending for “${ctx.topic}” (${meta.label})**\n\n${ctx.ending}`,
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
