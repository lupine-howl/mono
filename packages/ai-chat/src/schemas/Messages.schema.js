// messages.schema.js
export const messagesSchema = {
  title: "Messages",
  description: "Messages schema document",
  type: "object",
  additionalProperties: false,
  properties: {
    // identity & grouping
    id: { type: "string" },
    conversationId: { type: "string" },
    idx: { type: "integer", minimum: 0 },

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
      description: "Tool args payload (for tool_request)",
    },
    result: {
      type: ["object", "null"],
      description: "Tool result payload (for tool_result)",
    },
    ok: {
      type: ["boolean", "null"],
      description: "Success flag for tool_result",
    },
    ref: { type: ["string", "null"], description: "Links to request msg.id" },

    // NEW: friendly, user-visible rationale / display-only data
    meta: {
      type: ["object", "null"],
      description:
        "Display-only friendly rationale/context (e.g., {_meta from tool}). Not sent to executors.",
      additionalProperties: true, // allow flexible shape
      default: null,
    },

    attachments: {
      type: ["array", "null"],
      description: "Context items associated with this message",
      default: null,
      items: {}, // any
    },

    // timestamps
    t: { type: "integer" },
    createdAt: { type: "integer" },
    updatedAt: { type: "integer" },
  },

  required: ["conversationId", "role", "createdAt"],

  "x-relations": [
    "Messages",
    "hasOne",
    "Conversations",
    { foreignKey: "conversationId", as: "conversation" },
  ],
};
