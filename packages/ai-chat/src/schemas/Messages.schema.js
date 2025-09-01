// messages.schema.js
export const messagesSchema = {
  title: "Messages",
  description: "Messages schema document",
  type: "object",
  additionalProperties: false,
  properties: {
    // identity & grouping
    id: { type: "string" }, // ulid/uuid (client or server)
    conversationId: { type: "string" }, // FK to conversations.id
    idx: { type: "integer", minimum: 0 }, // server-assigned monotonic order

    // message semantics
    role: { enum: ["user", "assistant", "system", "tool"] },
    kind: {
      enum: ["chat", "tool_request", "tool_result", "attachment", "error"],
      default: "chat",
    },

    // content & tool fields
    content: {
      type: ["string", "null"],
      description: "Text for chat/attachment/error",
    },
    name: {
      type: ["string", "null"],
      description: "Tool name (for tool_* kinds)",
    },
    args: {
      type: ["object", "null"],
      description: "Tool args payload (for tool_request",
    },
    result: {
      type: ["object", "null"],
      description: "Tool result payload (for tool_result",
    },
    ok: {
      type: ["boolean", "null"],
      description: "Success flag for tool_result",
    },
    ref: { type: ["string", "null"], description: "Links to request msg.id" },

    // timestamps
    t: { type: "integer" }, // millis
    createdAt: { type: "integer" }, // millis
    updatedAt: { type: "integer" }, // millis
  },

  // always needed
  required: ["conversationId", "role", "createdAt"],
  "x-relations": [
    "Messages",
    "hasOne",
    "Conversations",
    { foreignKey: "conversationId", as: "conversation" },
  ],
};
