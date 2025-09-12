import { getGlobalSingleton } from "@loki/utilities";

export class TabService extends EventTarget {
  constructor({ storageKey = "tabs.active" } = {}) {
    super();
    this.storageKey = storageKey;
    this.items = []; // [{ id, label }]
    this.active = ""; // id
    // hydrate active from localStorage (items will resolve it later)
    try {
      this.active = localStorage.getItem(this.storageKey) || "";
    } catch {}
  }

  // ---- pub/sub ----
  get() {
    return { items: this.items, active: this.active };
  }
  subscribe(fn) {
    const h = (e) => fn(this.get(), e.detail || {});
    this.addEventListener("change", h);
    return () => this.removeEventListener("change", h);
  }
  _emit(patch = {}) {
    this.dispatchEvent(new CustomEvent("change", { detail: patch }));
  }

  // ---- state setters ----
  setTabs(items = []) {
    this.items = Array.isArray(items) ? items : [];
    // ensure active is valid
    if (this.items.length && !this.items.some((t) => t.id === this.active)) {
      this.active = this.items[0].id;
      this._persistActive();
    }
    this._emit({ items: this.items, active: this.active });
  }

  setActive(id) {
    if (!id || id === this.active) return;
    // if we have tabs, only allow valid ids
    if (this.items.length && !this.items.some((t) => t.id === id)) return;
    this.active = id;
    this._persistActive();
    this._emit({ active: this.active });
  }

  addTab(tab) {
    const id = tab?.id || crypto.randomUUID?.() || String(Date.now());
    const label = tab?.label ?? "Tab";
    const t = { id, label };
    this.items = [...this.items, t];
    if (!this.active) this.active = id;
    this._persistActive();
    this._emit({ items: this.items, active: this.active });
    return id;
  }

  removeTab(id) {
    const idx = this.items.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const wasActive = this.active === id;
    this.items = this.items.filter((t) => t.id !== id);
    if (wasActive) this.active = this.items[0]?.id || "";
    this._persistActive();
    this._emit({ items: this.items, active: this.active });
  }

  next() {
    if (!this.items.length) return;
    const i = Math.max(
      0,
      this.items.findIndex((t) => t.id === this.active)
    );
    const ni = (i + 1) % this.items.length;
    this.setActive(this.items[ni].id);
  }
  prev() {
    if (!this.items.length) return;
    const i = Math.max(
      0,
      this.items.findIndex((t) => t.id === this.active)
    );
    const pi = (i - 1 + this.items.length) % this.items.length;
    this.setActive(this.items[pi].id);
  }

  _persistActive() {
    try {
      localStorage.setItem(this.storageKey, this.active || "");
    } catch {}
  }
}

// ---- Singleton helpers ----
export function getTabService(opts = {}) {
  const KEY = Symbol.for("@loki/ai-layout:tabs-service@1");
  return getGlobalSingleton(KEY, () => new TabService(opts));
}
export const tabService = getTabService();

export function setActiveTab(id) {
  tabService.setActive(id);
}
export function nextTab() {
  tabService.next();
}
