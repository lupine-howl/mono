import { getGlobalSingleton } from "@loki/utilities";
import { getTodoStore } from "./TodoStore.js";
import { dbSelect, dbInsert, dbUpdate, dbDelete } from "@loki/db/util";

/**
 * UIService that calls generic DB tools over a single tool endpoint.
 * Assumes your server exposed tool RPC at POST {toolEndpoint} with body: { name, args }
 */
export class TodoUIService {
  constructor({ toolEndpoint = "/api/tools", table = "todos" } = {}) {
    this.toolEndpoint = toolEndpoint;
    this.table = table;
    this.pk = "id";
    this.store = getTodoStore();
  }
  async _tool(name, args) {
    const r = await fetch(this.toolEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, args }),
    });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  }

  async list() {
    const { items = [] } = await dbSelect({
      table: this.table,
      where: {},
      limit: 1000,
      offset: 0,
      orderBy: '"createdAt" DESC',
    });
    this.store.replaceAll(items);
  }
  async create(title) {
    const now = Date.now();
    const id =
      globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
    await dbInsert({
      table: this.table,
      values: {
        id,
        title: String(title || "Untitled").trim(),
        done: false,
        createdAt: now,
        updatedAt: now,
      },
    });
    await this.list();
  }
  async toggle(id) {
    // read current from store to compute patch
    const cur = (this.store.get().items || []).find((x) => x.id === id);
    if (!cur) return;
    await dbUpdate({
      table: this.table,
      id,
      patch: { done: !cur.done, updatedAt: Date.now() },
    });
    await this.list();
  }
  async remove(id) {
    await dbDelete({
      table: this.table,
      id,
    });
    await this.list();
  }
}

export function getTodoUIService(opts = {}) {
  return getGlobalSingleton(
    Symbol.for("@loki/todos:ui-service@1"),
    () => new TodoUIService(opts)
  );
}
export const todoUIService = getTodoUIService();
