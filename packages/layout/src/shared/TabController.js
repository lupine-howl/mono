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
    this._unsub = null;

    // Subscribe immediately so constructor-time setTabs() is reflected.
    this._subscribe();

    // Keep a local snapshot, but don't trust it for reads (get() proxies service).
    this.state = this._service.get();

    // Fire an initial snapshot for any external listeners.
    this._emit({ type: "init" });
  }

  // Lit lifecycle (runs only if host-bound)
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
    // In case subscribe doesn't immediately push current state:
    this.state = this._service.get();
    this._emit({ type: "sync" });
    this.host?.requestUpdate?.();
  }

  _emit(patch = {}) {
    this.dispatchEvent(
      new CustomEvent("change", { detail: { state: this.get(), patch } })
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

  // Always read fresh state from the service to avoid stale snapshots.
  get() {
    return this._service.get();
  }

  // pass-throughs + force refresh so host re-renders immediately
  setTabs = (items) => {
    const r = this._service.setTabs(items);
    this._postOp("setTabs");
    return r;
  };
  setActive = (id) => {
    const r = this._service.setActive(id);
    this._postOp("setActive");
    return r;
  };
  addTab = (t) => {
    const r = this._service.addTab(t);
    this._postOp("addTab");
    return r;
  };
  removeTab = (id) => {
    const r = this._service.removeTab(id);
    this._postOp("removeTab");
    return r;
  };
  next = () => {
    const r = this._service.next();
    this._postOp("next");
    return r;
  };
  prev = () => {
    const r = this._service.prev();
    this._postOp("prev");
    return r;
  };

  _postOp(op) {
    this.state = this._service.get();
    this._emit({ op });
    this.host?.requestUpdate?.();
  }
}
