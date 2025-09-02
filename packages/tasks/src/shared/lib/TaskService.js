// services/task-service.js
import { dbDelete, dbInsert, dbSelect, dbUpdate } from "@loki/db/util";
import { getGlobalSingleton } from "@loki/utilities";

export class TaskService {
  constructor({ table = "tasks", primaryKey = "id" } = {}) {
    this.table = table;
    this.pk = primaryKey;

    this.state = { tasks: [], selectedId: null };

    // observability & batching
    this._subs = new Set();
    this._batchDepth = 0;
    this._pendingMeta = null;

    // errors
    this._lastError = null;

    // sync guard
    this._rev = 0;
    this._ready = this.sync();
  }

  // ---------- Observable API ----------
  get() {
    return this.state;
  }
  async ready() {
    return this._ready;
  }
  getError() {
    return this._lastError;
  }

  subscribe(fn) {
    this._subs.add(fn);
    queueMicrotask(() => fn(this.state, { op: "prime" }));
    return () => this._subs.delete(fn);
  }

  // subscribe only to derived slices
  subscribeSel(selector, fn) {
    let prev = selector(this.state);
    return this.subscribe((s) => {
      const next = selector(s);
      if (next !== prev) {
        prev = next;
        fn(next);
      }
    });
  }

  // micro-batching: coalesce notifications until the batch ends
  batch(fn) {
    this._batchDepth++;
    try {
      fn();
    } finally {
      if (--this._batchDepth === 0 && this._pendingMeta) {
        const meta = this._pendingMeta;
        this._pendingMeta = null;
        queueMicrotask(() => this._notify(meta));
      }
    }
  }

  _notify(meta = {}) {
    if (this._batchDepth > 0) {
      this._pendingMeta = { ...(this._pendingMeta || {}), ...meta };
      return;
    }
    for (const fn of this._subs) fn(this.state, meta);
  }

  _setError(e, meta = {}) {
    this._lastError = String(e?.message || e);
    this._notify({ op: "error", error: this._lastError, ...meta });
  }

  // ---------- Queries ----------
  get selected() {
    const { tasks, selectedId } = this.state;
    return tasks.find((t) => t[this.pk] === selectedId) ?? null;
  }

  // ---------- Helpers ----------
  _uuid() {
    return (
      globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)
    );
  }
  _ensureSelected(tasks, selectedId) {
    if (selectedId && !tasks.some((t) => t[this.pk] === selectedId)) {
      selectedId = tasks[0]?.[this.pk] ?? null;
    }
    if (!selectedId && tasks[0]) selectedId = tasks[0][this.pk];
    return selectedId ?? null;
  }
  _setTasks(nextTasks, meta) {
    this.state = {
      tasks: nextTasks,
      selectedId: this._ensureSelected(nextTasks, this.state.selectedId),
    };
    this._notify(meta);
  }
  _applyLocal(id, patch) {
    let found = false;
    const next = this.state.tasks.map((t) => {
      if (t[this.pk] !== id) return t;
      found = true;
      return { ...t, ...patch, updatedAt: Date.now() };
    });
    if (!found) return false;
    this._setTasks(next, { op: "local:update", id, patch });
    return true;
  }
  _removeLocal(id) {
    const next = this.state.tasks.filter((t) => t[this.pk] !== id);
    if (next.length === this.state.tasks.length) return false;
    this._setTasks(next, { op: "local:remove", id });
    return true;
  }

  // ---------- Commands ----------
  select(id) {
    if (id === this.state.selectedId) return;
    this.state = {
      ...this.state,
      selectedId: this._ensureSelected(this.state.tasks, id),
    };
    this._notify({ op: "select", id: this.state.selectedId });
  }

  async sync() {
    const rev = ++this._rev;
    try {
      const r = await dbSelect({
        table: this.table,
        where: {},
        limit: 1000,
        offset: 0,
        orderBy: `"createdAt" DESC`,
      });
      if (rev !== this._rev) return; // stale
      const rows = Array.isArray(r?.items) ? r.items : [];
      rows.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      this._setTasks(rows, { op: "sync" });
    } catch (e) {
      if (this.state.tasks.length === 0) {
        const now = Date.now();
        const seed = {
          [this.pk]: this._uuid(),
          title: "Wire up tasks",
          done: false,
          notes: "",
          due: null,
          workspaceId: "",
          toolId: "",
          createdAt: now,
          updatedAt: now,
        };
        this.batch(() => {
          this._setTasks([seed], { op: "seed" });
          this.state = { ...this.state, selectedId: seed[this.pk] };
          this._notify({ op: "select", id: seed[this.pk] });
        });
      } else {
        this._setError(e, { op: "sync" });
      }
    }
  }

  async add(partial = {}) {
    const now = Date.now();
    const local = {
      [this.pk]: this._uuid(),
      title: (partial.title ?? "Untitled task").trim(),
      done: !!partial.done,
      notes: partial.notes ?? "",
      due: partial.due ?? null,
      workspaceId: partial.workspaceId ?? "",
      toolId: partial.toolId ?? "",
      createdAt: now,
      updatedAt: now,
    };

    // optimistic
    this.batch(() => {
      this._setTasks([local, ...this.state.tasks], {
        op: "add:local",
        id: local[this.pk],
      });
      this.state = { ...this.state, selectedId: local[this.pk] };
      this._notify({ op: "select", id: local[this.pk] });
    });

    try {
      const r = await dbInsert({ table: this.table, values: local });
      const srv = r?.item;
      if (!srv) throw new Error("insert: no item in response");
      const next = [
        srv,
        ...this.state.tasks.filter((x) => x[this.pk] !== local[this.pk]),
      ];
      this.batch(() => {
        this._setTasks(next, { op: "add:server", id: srv[this.pk] });
        this.state = { ...this.state, selectedId: srv[this.pk] };
        this._notify({ op: "select", id: srv[this.pk] });
      });
      return srv;
    } catch (e) {
      const next = this.state.tasks.filter(
        (t) => t[this.pk] !== local[this.pk]
      );
      this._setTasks(next, { op: "add:revert", id: local[this.pk] });
      this._setError(e, { op: "add", id: local[this.pk] });
      return Promise.reject(e);
    }
  }

  async update(id, patch) {
    if (!this._applyLocal(id, patch)) return;
    try {
      const r = await dbUpdate({ table: this.table, id, patch });
      const srv = r?.item;
      if (!srv) throw new Error("update: no item in response");
      this._applyLocal(id, srv); // normalize to server truth
    } catch (e) {
      this._setError(e, { op: "update", id });
      await this.sync();
      return Promise.reject(e);
    }
  }

  async toggle(id) {
    const t = this.state.tasks.find((x) => x[this.pk] === id);
    if (t) return this.update(id, { done: !t.done });
  }

  async remove(id) {
    const snapshot = this.state.tasks;
    if (!this._removeLocal(id)) return;
    try {
      await dbDelete({ table: this.table, id });
    } catch (e) {
      this._setTasks(snapshot, { op: "remove:revert", id });
      this._setError(e, { op: "remove", id });
      await this.sync();
      return Promise.reject(e);
    }
  }
}

// singleton per table
export function getTaskService(opts = {}) {
  const table = opts.table ?? "tasks";
  const KEY = Symbol.for(`@loki/tasks:service:${table}@1`);
  return getGlobalSingleton(KEY, () => new TaskService(opts));
}
export const taskService = getTaskService({ table: "tasks" });
