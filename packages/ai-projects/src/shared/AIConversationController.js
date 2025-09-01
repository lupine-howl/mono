// src/shared/lib/AIConversationController.js
// Controller wrapper around the AIConversationService singleton with a Lit-friendly API.

import { aiConversationService as conversationService } from "./AIConversationService.js";

export class AIConversationController extends EventTarget {
  constructor(host) {
    super();
    this.host = null;
    this._service = conversationService;
    this._onChange = null;

    // Public reactive snapshot (kept in sync with the service)
    this.state = {
      projectId: this._service.projectId ?? null,
      conversations: this._service.conversations ?? [],
      selectedId: this._service.selectedId ?? null,
    };

    // If used as a Lit ReactiveController, register with the host
    if (host && typeof host.addController === "function") {
      this.host = host;
      this.host.addController?.(this);
    }

    // Wire up immediately so external listeners get changes even if not a Lit controller
    this._wire();
  }

  // ---- Lit ReactiveController lifecycle (optional) ----
  hostConnected() {
    // already wired in constructor; noop
  }
  hostDisconnected() {
    this._unwire();
  }

  // ---- Wiring to the singleton service ----
  _wire() {
    if (this._onChange) return;
    this._onChange = (e) => {
      const { projectId, conversations, selectedId } = e.detail || {};
      if (projectId !== undefined) this.state.projectId = projectId;
      if (conversations) this.state.conversations = conversations;
      if (selectedId !== undefined) this.state.selectedId = selectedId;

      this._emit({ patch: e.detail || {} });
      this.host?.requestUpdate?.();
    };
    this._service.addEventListener("change", this._onChange);
  }

  _unwire() {
    if (this._onChange) {
      this._service.removeEventListener("change", this._onChange);
      this._onChange = null;
    }
  }

  _emit({ patch = {} }) {
    this.dispatchEvent(
      new CustomEvent("change", { detail: { state: this.state, patch } })
    );
  }

  // ---- Public subscribe API ----
  subscribe(fn) {
    const h = (e) => fn(e.detail.state, e.detail.patch);
    this.addEventListener("change", h);
    return () => this.removeEventListener("change", h);
  }

  // ---- Getters ----
  get service() {
    return this._service;
  }
  get stateRef() {
    return this.state;
  }
  get() {
    return this.state;
  }

  // ---- Thin pass-throughs to the singleton service ----
  sync = () => this._service?.sync?.();
  select = (id) => this._service?.select?.(id);
  create = (name) => this._service?.create?.(name);
  rename = (id, name) => this._service?.rename?.(id, name);
  moveToProject = (convId, projId) =>
    this._service?.moveToProject?.(convId, projId);
  remove = (id) => this._service?.remove?.(id);

  clearMessages = (conversationId) =>
    this._service?.clearMessages?.(conversationId);
  touch = (id, opts) => this._service?.touch?.(id, opts);

  setProjectId = (id) => this._service?.setProjectId?.(id);
  // You can still forward these if you use them elsewhere:
  setChatService = (svc) => this._service?.setChatService?.(svc);
  setProjectService = (svc) => this._service?.setProjectService?.(svc);
}
