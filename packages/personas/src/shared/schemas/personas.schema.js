// @loki/personas/src/shared/schemas/personas.schema.js
export const personasSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    description: { type: "string" }, // For browsing humans
    model: { type: "string" },       // Default model id/name
    persona: { type: "string" },     // System prompt text
    createdAt: { type: "integer" },  // millis
    updatedAt: { type: "integer" },  // millis
    orderIndex: { type: "integer" }
  },
  required: ["name", "persona"]
};