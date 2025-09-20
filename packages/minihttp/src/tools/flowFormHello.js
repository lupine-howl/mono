// src/tools/flowFormHello.js
export const flowFormHello = {
  name: "flowFormHello",
  description:
    "Start with an input form, then continue and show a chat message.",
  parameters: { type: "object", additionalProperties: false, properties: {} },

  plan() {
    return [
      // Emit a form snapshot, then immediately pause
      {
        label: "form",
        output: () => ({
          ok: true,
          data: {
            form: {
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  name: { type: "string", description: "Your name" },
                  style: {
                    type: "string",
                    enum: ["friendly", "formal"],
                    description: "Reply style",
                    default: "friendly",
                  },
                },
                required: ["name"],
              },
              values: { name: "", style: "friendly" },
            },
          },
          ui: {
            kind: "form",
            title: "Tell me about you",
            note: "Fill this in, then Continue.",
            actions: [{ label: "Continue", tool: "__resume__" }],
          },
        }),
        pause: true, // 👈 plan will return { __PLAN_PAUSED__, preview: <form> }
        reason: "awaiting user input",
      },

      // After resume: use the submitted values (console passes them to resumePlan)
      {
        label: "reply",
        run: (ctx) => {
          const { name, style = "friendly" } = ctx.$input || {};
          const content =
            style === "formal"
              ? `Greetings, ${name}. It is a pleasure to meet you.`
              : `Hey ${name}! Nice to meet you 🎉`;
          return { messages: [{ role: "assistant", content }] };
        },
      },

      // Show as chat
      {
        output: (ctx) => ({
          ok: true,
          data: { messages: ctx.reply.messages },
          ui: { kind: "chat", title: "Reply" },
        }),
      },
    ];
  },
};
