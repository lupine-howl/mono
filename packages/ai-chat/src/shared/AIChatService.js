// src/shared/services/ai-chat/AIChatService.js
import { createLogger } from "@loki/http-base/util";
import { toolsService } from "@loki/minihttp/util";
import { loadPrefs, savePrefs } from "./prefs.js";
import { getGlobalSingleton } from "@loki/utilities";

import { syncMessages as syncMessagesFn } from "./persistence.js";
import * as del from "./deletions.js";
import * as tools from "./tools.js";
import { submit as submitFn } from "./submit.js";

export class AIChatService extends EventTarget {
  constructor(opts = {}) {
    super();

    // ----- logger -----
    const logger = opts.logger ?? createLogger();
    this.log = (...a) =>
      (logger?.log ? logger.log : console.log).call(logger, "[ai]", ...a);

    // ----- persistence config (optional) -----
    this.persist = {
      enabled: !!opts.persist?.enabled,
      table: opts.persist?.table || "Messages",
      primaryKey: opts.persist?.primaryKey || "id",
      openapiUrl: opts.persist?.openapiUrl || "/openapi.json",
      base:
        opts.persist?.base ||
        (typeof location !== "undefined" ? location.origin : ""),
    };

    // ----- state -----
    this.state = {
      aiEndpoint: opts.aiEndpoint ?? "/api/ai",

      model: "o4-mini",
      persona: "You are a helpful assistant.",
      customInstructions: "", // NEW

      mode: "off", // "off" | "force" | "run" | "auto"

      // Optional mirrors purely for UI; truth lives in ToolsService
      toolName: toolsService.get()?.toolName || "",
      toolArgs: toolsService.get()?.values || {},

      attachments: [], // NEW

      autoExecute: false,
      activeTab: "chat",
      loading: false,
      callingTool: false,

      aiResult: null,

      conversationId: opts.conversationId || "default",
      messages: [], // [{id,t,role,content,kind?,name?,args?,result?,ok?,ref?}]
      lastPayload: null,
    };

    // hydrate prefs
    const saved = loadPrefs();
    if (saved?.model) this.state.model = saved.model;

    // optional initial sync
    if (this.persist.enabled) this.syncMessages().catch(() => {});

    // keep mirrors fresh if ToolsService changes
    toolsService.subscribe((st) => {
      const p = {};
      if (st.toolName !== this.state.toolName) p.toolName = st.toolName || "";
      if (st.values !== this.state.toolArgs) p.toolArgs = st.values || {};
      if (Object.keys(p).length) this.set(p);
    });
  }

  // ===== pub/sub =====
  get() {
    return this.state;
  }
  set(patch) {
    Object.assign(this.state, patch);
    this.emit(patch);
    if (patch && Object.prototype.hasOwnProperty.call(patch, "model")) {
      savePrefs(this.state);
    }
  }
  subscribe(fn) {
    const h = (e) => fn(this.state, e.detail);
    this.addEventListener("change", h);
    return () => this.removeEventListener("change", h);
  }
  emit(patch) {
    this.dispatchEvent(new CustomEvent("change", { detail: patch }));
  }

  // ===== DB sync (optional) =====
  async syncMessages(opts = {}) {
    return syncMessagesFn(this, opts);
  }
  setConversationId(id) {
    if (id && id !== this.state.conversationId) {
      this.state.conversationId = id;
      this.emit({ conversationId: id });
      if (this.persist.enabled) this.syncMessages().catch(() => {});
    }
  }

  // ===== Tool execution (delegates to ToolsService) =====
  async executeTool(name, args, { refId } = {}) {
    return tools.executeTool(this, name, args, { refId });
  }
  async confirmToolRequest(requestId) {
    return tools.confirmToolRequest(this, requestId);
  }
  rejectToolRequest(requestId, reason = "Rejected by user") {
    return tools.rejectToolRequest(this, requestId, reason);
  }

  // ===== Core submit =====
  async submit(prompt) {
    return submitFn(this, prompt);
  }

  // ===== setters / config =====
  setModel(v) {
    this.set({ model: v });
  }
  setPersona(v) {
    this.set({
      persona: typeof v === "string" ? v : JSON.stringify(v, null, 2),
    });
  }
  setContext(v) {
    //console.log("setContext", v);
    this.set({ context: v });
  }
  setCustomInstructions(v) {
    this.set({ customInstructions: String(v ?? "").trim() });
  }
  setMode(v) {
    this.set({ autoExecute: v === "run" });
    this.set({ mode: v });
  }

  // ---- pass-throughs to ToolsService (kept for UI compatibility) ----
  setToolName(v) {
    toolsService.setTool(v);
    this.set({ toolName: v });
  }
  setToolArgs(v) {
    toolsService.setValues(v || {});
    this.set({ toolArgs: v || {} });
  }

  // ---- attachments helpers (used by AttachmentPicker) ----
  setAttachments(list) {
    this.set({ attachments: Array.isArray(list) ? list : [] });
  }
  addAttachments(items) {
    const add = Array.isArray(items) ? items : [items];
    const next = [...(this.state.attachments || []), ...add];
    this.set({ attachments: next });
  }
  removeAttachmentAt(index) {
    const arr = Array.isArray(this.state.attachments)
      ? this.state.attachments.slice()
      : [];
    if (index >= 0 && index < arr.length) {
      arr.splice(index, 1);
      this.set({ attachments: arr });
    }
  }
  clearAttachments() {
    this.set({ attachments: [] });
  }

  setAutoExecute(b) {
    this.set({ autoExecute: !!b });
  }
  setActiveTab(id) {
    this.set({ activeTab: id });
  }
  setAiEndpoint(url) {
    this.set({ aiEndpoint: String(url || "/api/ai") });
  }

  // ===== deletions (thin wrappers) =====
  deleteMessage(id) {
    return del.deleteMessage(this, id);
  }
  deleteByConversationId(conversationId) {
    return del.deleteByConversationId(this, conversationId);
  }
  deleteAllMessages() {
    return del.deleteAllMessages(this);
  }
  deleteMessagesByIds(ids) {
    return del.deleteMessagesByIds(this, ids);
  }
  clearCurrentConversation() {
    return this.deleteByConversationId(this.state.conversationId);
  }
}
export function getAIChatService(opts = {}) {
  const KEY = Symbol.for("@loki/ai-chat:service@1");
  return getGlobalSingleton(KEY, () => new AIChatService(opts));
}

export const aiChatService = getAIChatService({
  persist: { enabled: true, table: "Messages" },
  conversationId: "default",
});
