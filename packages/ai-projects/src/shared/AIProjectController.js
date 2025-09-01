// src/shared/lib/AIProjectController.js
import { aiProjectService } from "./AIProjectService.js";

export class AIProjectController extends EventTarget {
  constructor(host = null) {
    super();
    this.host = host && typeof host.addController === "function" ? host : null;
    this.host?.addController?.(this);

    this._service = aiProjectService;
    this.primaryKey = this._service?.primaryKey || "id";

    this.state = {
      projects: this._service?.projects ?? [],
      selectedId: this._service?.selectedId ?? null,
    };

    this._changeHandler = null;
    this._subscribe();
    this._emit({ patch: { ...this.state } });
  }

  hostConnected() {
    this._subscribe();
  }
  hostDisconnected() {
    this._unwire();
  }

  _subscribe() {
    if (!this._service || this._changeHandler) return;
    this._changeHandler = (e) => {
      const { projects, selectedId } = e.detail || {};
      if (projects) this.state.projects = projects;
      if (selectedId !== undefined) this.state.selectedId = selectedId;
      this._emit({ patch: e.detail || {} });
      this.host?.requestUpdate?.();
    };
    this._service.addEventListener("change", this._changeHandler);
  }
  _unwire() {
    if (this._service && this._changeHandler) {
      this._service.removeEventListener("change", this._changeHandler);
    }
    this._changeHandler = null;
  }

  _emit({ patch = {} }) {
    const detail = { state: this.state, patch };
    this.dispatchEvent(new CustomEvent("change", { detail }));
  }

  subscribe(fn) {
    const h = (e) => fn(e.detail.state, e.detail.patch);
    this.addEventListener("change", h);
    return () => this.removeEventListener("change", h);
  }

  get service() {
    return this._service;
  }
  get stateRef() {
    return this.state;
  }
  get() {
    return this.state;
  }
  get selected() {
    return (
      this._service?.selected ??
      this.state.projects.find(
        (p) => p[this.primaryKey] === this.state.selectedId
      ) ??
      null
    );
  }

  // pass-throughs
  ready = () => this._service?.ready?.();
  sync = () => this._service?.sync?.();
  select = (id) => this._service?.select?.(id);
  create = (name) => this._service?.create?.(name);
  rename = (id, name) => this._service?.rename?.(id, name);
  archive = (id, b = true) => this._service?.archive?.(id, b);
  remove = (id, opts) => this._service?.remove?.(id, opts);
  clearProject = (projectId) => this._service?.clearProject?.(projectId);
  touch = (projectId) => this._service?.touch?.(projectId);
  update = (id, patch) => this._service?.update?.(id, patch);
}
