// conversations.schema.js
export const conversationsSchema = {
  title: "Conversations",
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" }, // uuid/ulid
    projectId: { type: "string" }, // FK to conversations.id
    name: { type: "string" }, // display name
    createdAt: { type: "integer" }, // millis
    updatedAt: { type: "integer" }, // millis
    lastMessageAt: { type: ["integer", "null"] },
    meta: { type: ["object", "null"] },
  },
  required: ["id", "createdAt"],
};
