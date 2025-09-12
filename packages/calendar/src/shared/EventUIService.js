import { getGlobalSingleton } from "@loki/utilities";
import { getEventStore } from "./EventStore.js";
import { dbSelect, dbInsert, dbUpdate, dbDelete } from "@loki/db/util";
import { rpc } from "@loki/minihttp/util";

function toEpoch(value) {
  if (value == null) return null;
  if (typeof value === "number") return value;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

export class EventUIService {
  constructor({ table = "events" } = {}) {
    this.table = table;
    this.pk = "id";
    this.store = getEventStore();
    rpc.onCall("createEvent", ({result}) => {
      console.log("createEvent received via RPC:", result);
      const values = result?.values;
      this.store.upsertOne(values);
    });
  }

  async list({ calendarId } = {}) {
    const where = calendarId ? { calendarId } : {};
    const { items = [] } = await dbSelect({
      table: this.table,
      where,
      limit: 2000,
      offset: 0,
      orderBy: '"start" ASC',
    });
    this.store.replaceAll(items);
  }

  async createOne(input) {
    const now = Date.now();
    const id =
      globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
    const values = {
      id,
      title: String(input?.title ?? "Untitled").trim(),
      description: input?.description ?? null,
      location: input?.location ?? null,
      allDay: !!input?.allDay,
      start: toEpoch(input?.start) ?? now,
      end: toEpoch(input?.end),
      calendarId: input?.calendarId ?? null,
      createdAt: now,
      updatedAt: now,
    };
    await dbInsert({ table: this.table, values });
    await this.list({ calendarId: input?.calendarId });
    return values.id;
  }

  async createMany(events = [], { calendarId } = {}) {
    for (const e of events) {
      await this.createOne({ ...e, calendarId: e?.calendarId ?? calendarId });
    }
    await this.list({ calendarId });
  }

  async update(id, patch) {
    const normalized = { ...patch };
    if ("start" in normalized) normalized.start = toEpoch(normalized.start);
    if ("end" in normalized) normalized.end = toEpoch(normalized.end);
    normalized.updatedAt = Date.now();
    await dbUpdate({ table: this.table, id, patch: normalized });
    await this.list({ calendarId: patch?.calendarId });
  }

  async remove(id) {
    await dbDelete({ table: this.table, id });
    await this.list();
  }
}

export function getEventUIService(opts = {}) {
  return getGlobalSingleton(
    Symbol.for("@loki/calendar:ui-service@1"),
    () => new EventUIService(opts)
  );
}
export const eventUIService = getEventUIService();
