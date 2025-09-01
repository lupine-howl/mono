export const projectsSchema = {
  title: "Projects",
  description: "Projects that group multiple conversations",
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    description: { type: ["string", "null"], default: null },

    // Existing
    model: { type: ["string", "null"], default: null },
    persona: { type: ["string", "null"], default: null },

    // NEW
    customInstructions: { type: ["string", "null"], default: null },
    attachments: {
      type: ["array", "null"],
      default: null,
      items: {
        type: "object",
        additionalProperties: true,
        properties: {
          type: { type: "string" }, // "text" | "image" | "file"
          name: { type: ["string", "null"] },
          mime: { type: ["string", "null"] },
          url: { type: ["string", "null"] }, // prefer URL or data URL
          lang: { type: ["string", "null"] }, // for text
          preview: { type: ["string", "null"] }, // small preview (e.g., data URL)
        },
      },
    },

    archived: { type: ["boolean", "null"], default: null },
    orderIndex: { type: ["integer", "null"], default: null },
    meta: { type: ["object", "null"] },
    createdAt: { type: "integer" },
    updatedAt: { type: "integer" },
    lastActivityAt: { type: ["integer", "null"], default: null },
  },
  required: ["name", "createdAt", "updatedAt"],
  "x-relations": [
    "Projects",
    "hasMany",
    "Conversations",
    { foreignKey: "projectId", as: "conversations" },
  ],
};
