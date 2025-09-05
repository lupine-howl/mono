export const todosSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    done: { type: "boolean" },
    createdAt: { type: "integer" },
    updatedAt: { type: "integer" }
  },
  required: ["title"]
};