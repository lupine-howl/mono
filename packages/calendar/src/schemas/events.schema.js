export const eventsSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    description: { type: ["string", "null"] },
    location: { type: ["string", "null"] },
    allDay: { type: ["boolean", "null"] },
    start: { type: "integer", description: "Epoch ms" },
    end: { type: ["integer", "null"], description: "Epoch ms" },
    calendarId: { type: ["string", "null"] },
    color: { type: ["string", "null"], description: "CSS color for event" },
    recurrence: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          properties: {
            freq: { enum: ["daily", "weekly", "monthly"] },
            interval: { type: "integer", minimum: 1 },
            byWeekday: { type: "array", items: { type: "integer", minimum: 0, maximum: 6 } },
            count: { type: ["integer", "null"], minimum: 1 },
            until: { type: ["integer", "null"], description: "Epoch ms" }
          },
          required: ["freq", "interval"],
          additionalProperties: true
        }
      ]
    },
    createdAt: { type: "integer" },
    updatedAt: { type: "integer" }
  },
  required: ["title", "start"]
};
