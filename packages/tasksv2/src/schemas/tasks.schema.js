export const tasksSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    notes: { type: "string" },
    done: { type: "boolean" },
    due: { type: "string", format: "date-time" },
    workspaceId: { type: "string" },
    toolId: { type: "string" },
    createdAt: { type: "integer" },
    updatedAt: { type: "integer" },
    orderIndex: { type: "integer" },
  },
  required: ["title"],
};
export default tasksSchema;
