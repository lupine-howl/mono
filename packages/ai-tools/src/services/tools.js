/** Register two tiny AI tools that call the same server logic. */
export function registerTodoTools(tools, storeOpts = {}) {
  tools.define({
    name: "randomNumberGenerator",
    description: "Generates a random number in the specified range",
    parameters: {
      type: "object",
      required: ["min", "max"],
      properties: { min: { type: "number" }, max: { type: "number" } },
      additionalProperties: false,
    },
    handler: async ({ min, max }) => {
      const randomNumber = Math.floor(Math.random() * (max - min + 1)) + min;
      return { number: randomNumber };
    },
  });
}
