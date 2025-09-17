// --- the tool ---
export const flowEthicalDilemma = {
  name: "flowEthicalDilemma",
  description:
    "Interactive ethical dilemma loop: pick a dilemma, then face escalating choices across multiple stages.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      seed: { type: ["number", "null"], default: null },
      stages: {
        type: ["integer", "null"],
        default: 5,
        minimum: 1,
        maximum: 10,
      },
    },
  },

  plan(args, _ctx) {
    console.log(args, _ctx);
    return [
      // 1) Get 10 dilemmas (numbered list) from the model
      {
        tool: "aiChatList",
        input: {
          prompt: "List 10 distinct ethical dilemmas (short titles).",
          n: 10,
        },
        label: "dilemmas_list",
        output(args, ctx) {
          ctx.messages = [];
          const list = Array.isArray(args?.data?.items) ? args.data.items : [];
          ctx.dilemmas = list.slice(0, 10);
          return {
            ui: { kind: "form", title: "Pick an ethical dilemma" },
            data: {
              form: {
                schema: {
                  type: "object",
                  required: ["dilemma"],
                  properties: {
                    dilemma: {
                      type: "string",
                      enum: ctx.dilemmas,
                      description: "Choose one to explore",
                    },
                  },
                },
                values: { dilemma: ctx.dilemmas[0] || "" },
              },
            },
          };
        },
        await: "wait for dilemma selection",
      },

      // 3) Store selection + init loop state
      {
        run(ctx) {
          console.log(ctx);
          // Use form values if available (from console), else $input (from API)
          const v = ctx?.form?.data?.form?.values || ctx.$input || {};
          ctx.topic = v.dilemma || ctx.dilemmas?.[0] || "Untitled dilemma";
          ctx.stage = 1;
          ctx.path = [];
          ctx.maxStages = Number.isInteger(ctx.$input?.stages)
            ? ctx.$input.stages
            : 5;
          ctx.messages.push({
            role: "system",
            content: `You are running an interactive ethical dilemma. The user has selected: ${ctx.topic}. Write a brief narrative (2–4 sentences). Then propose the options (we will render A/B/C in the UI).`,
          });
          return { selected: ctx.topic };
        },
        label: "selection",
      },

      // 4) Loop stages
      {
        while: (ctx) => (ctx.stage || 1) <= (ctx.maxStages || 5),
        body: [
          // 4a) Ask model to escalate and give 3 options
          // inside flowEthicalDilemma, stage body
          {
            tool: "aiChatWithOptions",
            input(ctx, last) {
              console.log(ctx, last);
              const stage = ctx.stage || 1;
              return {
                n: 3, // or null for auto
                messages: ctx.messages
                  ? ctx.messages.slice(-10) // last 10 messages
                  : undefined,
                // A system prompt to nudge better responses
                system:
                  "You are an expert ethical dilemma designer. You write concise, engaging narratives and present 3 clear options for the user to choose from. Each option should be distinct and lead to different consequences.",
              };
            },
            label: "stage_structured",
            output(last, ctx) {
              console.log(ctx, last);
              const resp = last?.data || {};
              ctx.currentNarrative = resp.response || "";
              ctx.messages.push({
                role: "assistant",
                content: ctx.currentNarrative,
              });
              ctx.currentOptions = Array.isArray(resp.options)
                ? resp.options
                : [];

              const actions = ctx.currentOptions.map((opt, idx) => ({
                label: opt,
                tool: "__resume__", // ToolConsole will resume with this payload
                args: { choice: opt, choiceIndex: idx },
              }));

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
                      content:
                        (ctx.currentNarrative || "") +
                        "\n\n" +
                        ctx.currentOptions
                          .map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`)
                          .join("\n"),
                    },
                  ],
                },
              };
            },
            await: "awaiting option pick",
          },

          // 4c) Record the picked option and advance
          {
            run(ctx, last) {
              console.log(ctx, last);
              const v = ctx?.form?.data?.form?.values || ctx.$input || {};
              const chosen =
                v.choice ??
                (Array.isArray(ctx.currentOptions)
                  ? ctx.currentOptions[0]
                  : "Option A");
              (ctx.path ||= []).push({ stage: ctx.stage, choice: chosen });
              ctx.stage = (ctx.stage || 1) + 1;
              ctx.messages.push({
                role: "user",
                content: `I choose: ${chosen}`,
              });
              ctx.messages.push({
                role: "system",
                content:
                  `Escalate the situation to stage ${ctx.stage} by increasing stakes and adding a new constraint.\n` +
                  `Write a brief narrative (2–4 sentences).\n` +
                  `Then propose the options (we will render A/B/C in the UI).`,
              });

              return { chosen };
            },
            label: "record_choice",
          },
        ],
      },

      // 5) Wrap-up
      {
        return(ctx) {
          const transcript =
            (ctx.path || [])
              .map((p) => `Stage ${p.stage}: ${p.choice}`)
              .join("\n") || "(no choices)";
          return {
            ui: { kind: "chat", title: "Summary" },
            data: {
              messages: [
                {
                  role: "assistant",
                  content:
                    `Thanks for exploring “${ctx.topic}”.\n\nYour path:\n` +
                    transcript +
                    `\n\nYou can rerun the tool to try a different path.`,
                },
              ],
            },
          };
        },
      },
    ];
  },
};
