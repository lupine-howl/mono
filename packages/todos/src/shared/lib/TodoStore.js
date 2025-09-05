// Pure state & pub/sub. No fetch. No server knowledge.
import { getGlobalSingleton } from "@loki/utilities";

export class TodoStore {
  constructor() {
    this.state = { items: [], selectedId: null };
    this._subs = new Set();
  }
  get() {
    return this.state;
  }
  subscribe(fn) {
    this._subs.add(fn);
    queueMicrotask(() => fn(this.state));
    return () => this._subs.delete(fn);
  }
  _emit() {
    for (const fn of this._subs) fn(this.state);
  }

  // mutations
  replaceAll(items) {
    const selectedId = items[0]?.id ?? null;
    this.state = { items, selectedId };
    this._emit();
  }
  upsert(item) {
    const map = new Map(this.state.items.map((x) => [x.id, x]));
    map.set(item.id, { ...(map.get(item.id) || {}), ...item });
    const items = Array.from(map.values()).sort(
      (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
    );
    this.state = {
      items,
      selectedId: this.state.selectedId ?? items[0]?.id ?? null,
    };
    this._emit();
  }
  remove(id) {
    const items = this.state.items.filter((x) => x.id !== id);
    const selectedId =
      this.state.selectedId === id
        ? items[0]?.id ?? null
        : this.state.selectedId;
    this.state = { items, selectedId };
    this._emit();
  }
  select(id) {
    if (this.state.selectedId !== id) {
      this.state = { ...this.state, selectedId: id };
      this._emit();
    }
  }
}

export function getTodoStore() {
  return getGlobalSingleton(
    Symbol.for("@loki/todos:store@1"),
    () => new TodoStore()
  );
}
export const todoStore = getTodoStore();
