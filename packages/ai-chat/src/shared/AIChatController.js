// src/shared/lib/AIChatController.js
import { aiChatService as defaultService } from "./AIChatService.js";

/**
 * AIChatController
 * - Optional Lit ReactiveController (pass the host as first arg)
 * - Also an EventTarget that re-emits service patches as "change"
 */
export class AIChatController extends EventTarget {
  constructor(hostOrService, maybeService) {
    super();
    this.host = null;
    this._service = null;
    this._unsub = null;
    this.state = {};

    if (hostOrService && typeof hostOrService.addController === "function") {
      this.host = hostOrService;
      this.host.addController?.(this);
      this.setService(maybeService || defaultService);
    } else if (hostOrService?.subscribe) {
      this.setService(hostOrService);
    } else {
      this.setService(defaultService);
    }
  }

  // ---- Lit lifecycle (optional) ----
  hostConnected() {
    this._subscribe();
  }
  hostDisconnected() {
    this._unsub?.();
    this._unsub = null;
  }

  // ---- Service wiring ----
  setService(svc) {
    if (svc === this._service) return;
    this._unsub?.();
    this._service = svc || defaultService;

    const s = this._service?.get?.();
    if (s) {
      this.state = s;
      this._emit({});
    }
    this._subscribe();
    this.host?.requestUpdate?.();
  }
  _subscribe() {
    this._unsub?.();
    if (!this._service?.subscribe) return;
    this._unsub = this._service.subscribe((st, patch) => {
      this.state = st;
      this._emit(patch || {});
      this.host?.requestUpdate?.();
    });
  }
  _emit(patch) {
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
  get() {
    return this.state;
  }

  // ---- Pass-throughs (match AIChatService API) ----
  submit = (prompt) => this._service?.submit?.(prompt);

  set = (patch) => this._service?.set?.(patch);
  setModel = (v) => this._service?.setModel?.(v);
  setPersona = (v) => this._service?.setPersona?.(v);
  setContext = (v) => this._service?.setContext?.(v);
  // REMOVED: setContextPrefix
  setCustomInstructions = (v) => this._service?.setCustomInstructions?.(v); // NEW
  setMode = (v) => this._service?.setMode?.(v);
  setToolName = (v) => this._service?.setToolName?.(v);
  setToolArgs = (v) => this._service?.setToolArgs?.(v);

  // attachments (NEW)
  setAttachments = (arr) => this._service?.setAttachments?.(arr);
  addAttachments = (items) => this._service?.addAttachments?.(items);
  removeAttachmentAt = (idx) => this._service?.removeAttachmentAt?.(idx);
  clearAttachments = () => this._service?.clearAttachments?.();

  setAutoExecute = (b) => this._service?.setAutoExecute?.(b);
  setActiveTab = (id) => this._service?.setActiveTab?.(id);
  setAiEndpoint = (url) => this._service?.setAiEndpoint?.(url);
  setRpcBase = (url) => this._service?.setRpcBase?.(url);

  executeTool = (name, args, opts) =>
    this._service?.executeTool?.(name, args, opts);
  confirmToolRequest = (id) => this._service?.confirmToolRequest?.(id);
  rejectToolRequest = (id, reason) =>
    this._service?.rejectToolRequest?.(id, reason);

  syncMessages = (opts) => this._service?.syncMessages?.(opts);
  setConversationId = (id) => this._service?.setConversationId?.(id);
}
