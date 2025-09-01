// controllers/BaseCollectionController.js
export class BaseCollectionController extends EventTarget {
  /**
   * @param {{
   *   primaryKey?: string,
   *   eventName: string,            // e.g. "personas:change"
   *   hub?: EventTarget|null,       // optional shared hub for relays
   *   repo: { list:Function, insert:Function, update:Function, remove:Function },
   *   sortItems?: (a:any,b:any)=>number, // optional sort
   * }} opts
   */
  constructor({
    primaryKey = "id",
    eventName,
    hub = null,
    repo,
    sortItems = (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0),
  }) {
    super();
    this.primaryKey = primaryKey;
    this.eventName = eventName;
    this.hub = hub;
    this.repo = repo;
    this.sortItems = sortItems;

    this.items = [];
    this.selectedId = null;

    this._rev = 0;
    this._ready = this.sync();
  }

  // ---------- hooks to override in subclasses ----------
  /** Build the optimistic item to insert, given a partial. Must set PK + timestamps. */
  toInsert(partial = {}) {
    const now = Date.now();
    return {
      [this.primaryKey]: this._uuid(),
      createdAt: now,
      updatedAt: now,
      ...partial,
    };
  }
  /** Optional: normalize/merge item from server after insert/update. */
  normalizeFromServer(item) {
    return item;
  }
  /** Optional seed if sync fails & list is empty. Return null/undefined to skip. */
  makeSeed() {
    return null;
  }

  // ---------- public API ----------
  async ready() {
    return this._ready;
  }

  get selected() {
    return (
      this.items.find((t) => t[this.primaryKey] === this.selectedId) ?? null
    );
  }

  select(id) {
    if (id !== this.selectedId) {
      this.selectedId = id;
      this._emit("select", { id });
    }
  }

  async sync() {
    const rev = ++this._rev;
    try {
      const rows = await this.repo.list();
      if (rev !== this._rev) return; // ignore stale
      const sorted = Array.isArray(rows)
        ? rows.slice().sort(this.sortItems)
        : [];
      this._set(sorted);
      if (!this.selectedId && sorted[0])
        this.selectedId = sorted[0][this.primaryKey];
      this._emit("sync");
    } catch (e) {
      if (!this.items.length) {
        const seed = this.makeSeed?.();
        if (seed) {
          this._set([seed]);
          this.selectedId = seed[this.primaryKey];
          this._emit("seed");
        }
      }
    }
  }

  async add(partial = {}) {
    const local = this.toInsert(partial);
    this._set([local, ...this.items]);
    this.selectedId = local[this.primaryKey];
    this._emit("add", { item: local });

    try {
      const srv = this.normalizeFromServer(await this.repo.insert(local));
      if (!srv) throw new Error("insert: no item in response");
      const next = [
        srv,
        ...this.items.filter(
          (x) => x[this.primaryKey] !== local[this.primaryKey]
        ),
      ];
      this._set(next);
      this._emit("server:add", { item: srv });
      return srv;
    } catch (e) {
      this._removeLocal(local[this.primaryKey]);
      this._emit("revert:add", { id: local[this.primaryKey] });
      throw e;
    }
  }

  async update(id, patch) {
    if (!this._applyLocal(id, patch)) return;
    this._emit("update", { id, patch });
    try {
      const srv = this.normalizeFromServer(await this.repo.update(id, patch));
      if (!srv) throw new Error("update: no item in response");
      this._applyLocal(id, srv); // normalize with server
      this._emit("server:update", { id });
    } catch (e) {
      await this.sync();
      throw e;
    }
  }

  async remove(id) {
    const snapshot = this.items;
    if (!this._removeLocal(id)) return;
    this._emit("remove", { id });
    try {
      await this.repo.remove(id);
    } catch (e) {
      this.items = snapshot;
      this._emit("revert:remove", { id });
      await this.sync();
      throw e;
    }
  }

  // ---------- internals ----------
  _uuid() {
    return (
      globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)
    );
  }

  _emit(type, extra = {}) {
    const evt = new CustomEvent(this.eventName, {
      detail: {
        type,
        items: this.items,
        selectedId: this.selectedId,
        ...extra,
      },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(evt);
    if (this.hub && this.hub !== this) this.hub.dispatchEvent(evt);
  }

  _set(next) {
    this.items = next;
    if (
      this.selectedId &&
      !this.items.some((t) => t[this.primaryKey] === this.selectedId)
    ) {
      this.selectedId = this.items[0]?.[this.primaryKey] ?? null;
    }
    this._emit("set");
  }

  _applyLocal(id, patch) {
    const i = this.items.findIndex((t) => t[this.primaryKey] === id);
    if (i === -1) return false;
    const next = this.items.slice();
    next[i] = { ...next[i], ...patch, updatedAt: Date.now() };
    this._set(next);
    return true;
  }

  _removeLocal(id) {
    const next = this.items.filter((t) => t[this.primaryKey] !== id);
    const removed = next.length !== this.items.length;
    if (removed) {
      this._set(next);
      if (this.selectedId === id)
        this.selectedId = next[0]?.[this.primaryKey] ?? null;
    }
    return removed;
  }
}
