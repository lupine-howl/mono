// tab-controller.js
import { tabService } from "./TabService.js";

export class TabController extends EventTarget {
  constructor(host = null) {
    super();
    this.host = null;
    if (host?.addController) {
      this.host = host;
      host.addController(this);
    }

    this._service = tabService;
    this.state = this._service.get();
    this._unsub = null;

    // ✅ Only auto-subscribe when NOT host-bound
    if (!this.host) this._subscribe();

    // fire an initial snapshot for any outside listeners
    this._emit({});
  }

  // Lit lifecycle (will run only if host-bound)
  hostConnected() {
    this._subscribe();
  }
  hostDisconnected() {
    this._unsub?.();
    this._unsub = null;
  }

  _subscribe() {
    if (this._unsub) return; // guard against double wiring
    this._unsub = this._service.subscribe((st, patch) => {
      this.state = st;
      this._emit(patch);
      this.host?.requestUpdate?.();
    });
  }

  _emit(patch = {}) {
    this.dispatchEvent(
      new CustomEvent("change", { detail: { state: this.state, patch } })
    );
  }
  subscribe(fn) {
    const h = (e) => fn(e.detail.state, e.detail.patch);
    this.addEventListener("change", h);
    return () => this.removeEventListener("change", h);
  }

  // convenience
  get service() {
    return this._service;
  }
  get() {
    return this.state;
  }

  // pass-throughs
  setTabs = (items) => this._service.setTabs(items);
  setActive = (id) => this._service.setActive(id);
  addTab = (t) => this._service.addTab(t);
  removeTab = (id) => this._service.removeTab(id);
  next = () => this._service.next();
  prev = () => this._service.prev();
}
