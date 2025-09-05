import { dbInsert } from "@loki/db/util";

function toEpoch(value) {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

export function registerCalendarTools(tools, { table = "events" } = {}) {
  tools.define({
    name: "createEvent",
    description: "Create a calendar event",
    parameters: {
      type: "object",
      required: ["title", "start"],
      properties: {
        title: { type: "string" },
        description: { type: ["string", "null"], default: null },
        location: { type: ["string", "null"], default: null },
        allDay: { type: ["boolean", "null"], default: false },
        start: { anyOf: [{ type: "integer" }, { type: "string" }], description: "Epoch ms or ISO date" },
        end: { anyOf: [{ type: "integer" }, { type: "string" }, { type: "null" }] },
        calendarId: { type: ["string", "null"] }
      },
      additionalProperties: false
    },
    handler: async (args) => {
      const now = Date.now();
      const id = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
      const values = {
        id,
        title: String(args.title).trim(),
        description: args.description ?? null,
        location: args.location ?? null,
        allDay: !!args.allDay,
        start: toEpoch(args.start) ?? now,
        end: toEpoch(args.end),
        calendarId: args.calendarId ?? null,
        createdAt: now,
        updatedAt: now
      };
      await dbInsert({ table, values });
      return { created: true, id, values };
    },
    tags: ["Calendar"]
  });

  tools.define({
    name: "createEventsBulk",
    description: "Create multiple calendar events in bulk",
    parameters: {
      type: "object",
      required: ["events"],
      properties: {
        events: {
          type: "array",
          items: {
            type: "object",
            required: ["title", "start"],
            properties: {
              title: { type: "string" },
              description: { type: ["string", "null"] },
              location: { type: ["string", "null"] },
              allDay: { type: ["boolean", "null"] },
              start: { anyOf: [{ type: "integer" }, { type: "string" }] },
              end: { anyOf: [{ type: "integer" }, { type: "string" }, { type: "null" }] },
              calendarId: { type: ["string", "null"] }
            },
            additionalProperties: false
          }
        }
      },
      additionalProperties: false
    },
    handler: async ({ events }) => {
      const created = [];
      for (const e of events) {
        const now = Date.now();
        const id = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
        const values = {
          id,
          title: String(e.title).trim(),
          description: e.description ?? null,
          location: e.location ?? null,
          allDay: !!e.allDay,
          start: toEpoch(e.start) ?? now,
          end: toEpoch(e.end),
          calendarId: e.calendarId ?? null,
          createdAt: now,
          updatedAt: now
        };
        await dbInsert({ table, values });
        created.push({ id, values });
      }
      return { createdCount: created.length, created };
    },
    tags: ["Calendar"]
  });
}
