import { getGlobalSingleton } from "@loki/utilities";

export class EventStore {
  constructor() {
    this.state = { items: [], selectedId: null };
    this._subs = new Set();
  }
  get() { return this.state; }
  subscribe(fn) { this._subs.add(fn); queueMicrotask(() => fn(this.state)); return () => this._subs.delete(fn); }
  _emit() { for (const fn of this._subs) fn(this.state); }

  replaceAll(items) {
    const selectedId = this.state.selectedId && items.some(x => x.id === this.state.selectedId)
      ? this.state.selectedId
      : (items[0]?.id ?? null);
    this.state = { items, selectedId };
    this._emit();
  }
  upsertOne(ev) {
    const items = [...(this.state.items || [])];
    const i = items.findIndex(x => x.id === ev.id);
    if (i >= 0) items[i] = ev; else items.push(ev);
    this.state = { ...this.state, items };
    this._emit();
  }
  remove(id) {
    const items = (this.state.items || []).filter(x => x.id !== id);
    const selectedId = this.state.selectedId === id ? (items[0]?.id ?? null) : this.state.selectedId;
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

export function getEventStore() {
  return getGlobalSingleton(Symbol.for("@loki/calendar:store@1"), () => new EventStore());
}
export const eventStore = getEventStore();
