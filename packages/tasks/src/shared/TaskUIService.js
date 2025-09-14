import { getGlobalSingleton } from "@loki/utilities";
import { getTaskStore } from "./TaskStore.js";
import { TaskDbService } from "./TaskDbService.js";
import { rpc } from "@loki/minihttp/util"; // matches your calendar wiring

export class TaskUIService {
  constructor({ table = "tasks", primaryKey = "id" } = {}) {
    this.table = table;
    this.pk = primaryKey;
    this.store = getTaskStore({ table, primaryKey });
    this.db = new TaskDbService({ table, primaryKey });

    // ---- External events -> update store only (DB already updated elsewhere) ----
    // If your emitter uses onToolCalled("dbtasksInsert", ...) you can swap here.
    rpc.onCall("dbtasksInsert", ({ result }) => {
      const item = result?.item;
      if (item?.[this.pk]) this.store.upsertOne(item, "hook:add");
    });
    rpc.onCall("dbtasksUpdate", ({ result }) => {
      const item = result?.item;
      if (item?.[this.pk]) this.store.upsertOne(item, "hook:update");
    });
    rpc.onCall("dbtasksDelete", ({ args }) => {
      const id = args?.id;
      if (id) this.store.removeOne(id, "hook:delete");
    });
  }

  // ---- Queries ----
  async list() {
    const { items = [] } = await this.db.list({});
    this.store.replaceAll(items);
  }

  // ---- Commands (optimistic) ----
  async add(partial = {}) {
    const local = this.store.addLocal(partial, { select: true });
    try {
      const r = await this.db.insert(local);
      const srv = r?.item;
      if (!srv) throw new Error("insert: no item in response");
      const next = [
        srv,
        ...this.store.get().tasks.filter((x) => x[this.pk] !== local[this.pk]),
      ];
      this.store.replaceAll(next);
      this.store.select(srv[this.pk]);
      return srv;
    } catch (e) {
      // remove local optimistic row
      const afterLocal = this.store
        .get()
        .tasks.filter((t) => t[this.pk] !== local[this.pk]);
      this.store.replaceAll(afterLocal);
      this.store.setError(e, { op: "add", id: local[this.pk] });
      throw e;
    }
  }

  async update(id, patch) {
    if (!this.store.applyLocalUpdate(id, patch)) return;
    try {
      const r = await this.db.update(id, patch);
      const srv = r?.item;
      if (!srv) throw new Error("update: no item in response");
      this.store.upsertOne(srv, "update:server");
    } catch (e) {
      this.store.setError(e, { op: "update", id });
      await this.list(); // reconcile
      throw e;
    }
  }

  async toggle(id) {
    const t = this.store.get().tasks.find((x) => x[this.pk] === id);
    if (t) return this.update(id, { done: !t.done });
  }

  async remove(id) {
    const snapshot = this.store.get().tasks;
    this.store.removeOne(id, "local:remove");
    try {
      await this.db.delete(id);
    } catch (e) {
      this.store.revertRemove(snapshot, id);
      this.store.setError(e, { op: "remove", id });
      await this.list();
      throw e;
    }
  }
}

export function getTaskUIService(opts = {}) {
  const table = opts.table ?? "tasks";
  return getGlobalSingleton(
    Symbol.for(`@loki/tasks:ui-service:${table}@1`),
    () => new TaskUIService(opts)
  );
}
export const taskUIService = getTaskUIService();
