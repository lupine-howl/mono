// @loki/tasks/src/shared/schemas/tasks.schema.js
export const tasksSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    notes: { type: "string" },
    done: { type: "boolean" },
    due: { type: "string" }, // ISO date string
    createdAt: { type: "integer" }, // millis
    updatedAt: { type: "integer" }, // millis
    orderIndex: { type: "integer" },
  },
  required: ["title"],
};
