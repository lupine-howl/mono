import { getGlobalSingleton } from "@loki/utilities";

export class TaskStore {
  constructor({ primaryKey = "id" } = {}) {
    this.pk = primaryKey;
    this.state = { tasks: [], selectedId: null };
    this._subs = new Set();

    // batching + errors
    this._batchDepth = 0;
    this._pendingMeta = null;
    this._lastError = null;
  }

  // ---- observable ----
  get() {
    return this.state;
  }
  subscribe(fn) {
    this._subs.add(fn);
    queueMicrotask(() => fn(this.state, { op: "prime" }));
    return () => this._subs.delete(fn);
  }
  _notify(meta = {}) {
    if (this._batchDepth > 0) {
      this._pendingMeta = { ...(this._pendingMeta || {}), ...meta };
      return;
    }
    for (const fn of this._subs) fn(this.state, meta);
  }
  batch(fn) {
    this._batchDepth++;
    try {
      fn();
    } finally {
      if (--this._batchDepth === 0 && this._pendingMeta) {
        const m = this._pendingMeta;
        this._pendingMeta = null;
        queueMicrotask(() => this._notify(m));
      }
    }
  }
  setError(e, meta = {}) {
    this._lastError = String(e?.message || e);
    this._notify({ op: "error", error: this._lastError, ...meta });
  }

  // ---- selectors ----
  get selected() {
    const { tasks, selectedId } = this.state;
    return tasks.find((t) => t[this.pk] === selectedId) ?? null;
  }

  // ---- helpers ----
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
  _setTasks(next, meta) {
    this.state = {
      tasks: next,
      selectedId: this._ensureSelected(next, this.state.selectedId),
    };
    this._notify(meta);
  }

  // ---- store-level mutations used by service/hooks ----
  replaceAll(rows) {
    const sorted = [...(rows || [])].sort(
      (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)
    );
    this._setTasks(sorted, { op: "sync" });
  }
  upsertOne(item, metaOp = "upsert") {
    const id = item?.[this.pk];
    if (!id) return;
    const exists = this.state.tasks.some((t) => t[this.pk] === id);
    const next = exists
      ? this.state.tasks.map((t) => (t[this.pk] === id ? { ...t, ...item } : t))
      : [item, ...this.state.tasks];

    next.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    this._setTasks(next, { op: metaOp, id });
  }
  removeOne(id, metaOp = "remove") {
    const next = this.state.tasks.filter((t) => t[this.pk] !== id);
    if (next.length === this.state.tasks.length) return;
    this._setTasks(next, { op: metaOp, id });
  }
  select(id) {
    if (id === this.state.selectedId) return;
    this.state = {
      ...this.state,
      selectedId: this._ensureSelected(this.state.tasks, id),
    };
    this._notify({ op: "select", id: this.state.selectedId });
  }

  // helpers for optimistic flows (UIService may call these)
  addLocal(partial = {}, { select = true } = {}) {
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
    this.batch(() => {
      this._setTasks([local, ...this.state.tasks], {
        op: "add:local",
        id: local[this.pk],
      });
      if (select) {
        this.state = { ...this.state, selectedId: local[this.pk] };
        this._notify({ op: "select", id: local[this.pk] });
      }
    });
    return local;
  }

  applyLocalUpdate(id, patch) {
    let changed = false;
    const next = this.state.tasks.map((t) => {
      if (t[this.pk] !== id) return t;
      changed = true;
      return { ...t, ...patch, updatedAt: Date.now() };
    });
    if (!changed) return false;
    this._setTasks(next, { op: "local:update", id, patch });
    return true;
  }

  revertRemove(snapshot, id) {
    this._setTasks(snapshot, { op: "remove:revert", id });
  }
}

export function getTaskStore(opts = {}) {
  const table = opts.table ?? "tasks";
  return getGlobalSingleton(
    Symbol.for(`@loki/tasks:store:${table}@1`),
    () => new TaskStore({ primaryKey: opts.primaryKey ?? "id" })
  );
}
export const taskStore = getTaskStore();
