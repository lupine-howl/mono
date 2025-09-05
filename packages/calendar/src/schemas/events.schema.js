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
    createdAt: { type: "integer" },
    updatedAt: { type: "integer" }
  },
  required: ["title", "start"]
};
