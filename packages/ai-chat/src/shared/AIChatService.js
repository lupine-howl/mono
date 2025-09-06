// ai-chat-service.js
import { createLogger } from "@loki/http-base/util";
import { createOpenApiRpcClient } from "@loki/minihttp/util";
import { toolsService } from "@loki/minihttp/util"; // ensure this path resolves to your ToolsService export
import { getGlobalSingleton } from "@loki/utilities";
import { dbSelect, dbInsert, dbUpdate, dbDelete } from "@loki/db/util";

const MAX_TURNS = 40;
const PREFS_KEY = "aiChat.prefs.v1";
// Only persist model here; ToolsService persists tool selection itself.
const PREF_KEYS = ["model", "mode"];

const loadPrefs = () => {
  try {
    return typeof localStorage === "undefined"
      ? null
      : JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
  } catch {
    return null;
  }
};
const savePrefs = (state) => {
  try {
    if (typeof localStorage === "undefined") return;
    const out = {};
    for (const k of PREF_KEYS) out[k] = state[k];
    localStorage.setItem(PREFS_KEY, JSON.stringify(out));
  } catch {}
};

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

    this.rpc =
      opts.rpc ??
      (this.persist.enabled
        ? createOpenApiRpcClient({
            base: this.persist.base,
            openapiUrl: this.persist.openapiUrl,
          })
        : null);

    // ----- state -----
    this.state = {
      aiEndpoint: opts.aiEndpoint ?? "/api/ai",
      rpcBase: opts.rpcBase ?? "/rpc",

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
    if (patch && "model" in patch) savePrefs(this.state);
  }
  subscribe(fn) {
    const h = (e) => fn(this.state, e.detail);
    this.addEventListener("change", h);
    return () => this.removeEventListener("change", h);
  }
  emit(patch) {
    this.dispatchEvent(new CustomEvent("change", { detail: patch }));
  }

  // ===== helpers =====
  _nid() {
    return Math.random().toString(36).slice(2);
  }
  _safeParse(s) {
    if (!s || typeof s !== "string") return null;
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  }

  _buildChatMessages({ persona, customInstructions, history, context }) {
    const msgs = [];
    const p = (persona ?? "").trim();
    const ci = (customInstructions ?? "").trim();
    if (p) msgs.push({ role: "system", content: p });
    if (ci) msgs.push({ role: "system", content: ci });

    const H = Array.isArray(history) ? history : [];

    for (let i = 0; i < H.length; i++) {
      const m = H[i];
      if (
        m?.role === "user" ||
        m?.role === "assistant" ||
        m?.role === "system"
      ) {
        let content =
          typeof m.content === "string"
            ? m.content
            : m?.content?.toString?.() ?? "";

        msgs.push({ role: m.role, content });
      }
    }

    if (context && context.length) {
      const ctx =
        typeof context === "string"
          ? context
          : JSON.stringify(context, null, 2);
      //console.log("context", context);
      msgs.push({ role: "system", content: ctx });
    }
    return msgs;
  }

  async _call(name, params) {
    if (!this.persist.enabled || !this.rpc) return null;
    return this.rpc[name](params);
  }
  _findMessage(id) {
    return this.state.messages.find((m) => m.id === id);
  }

  _pushMessage(m) {
    const now = Date.now();
    const msg = {
      id: this._nid(),
      t: now,
      createdAt: now,
      updatedAt: now,
      conversationId: this.state.conversationId,
      ...m,
    };
    this.state.messages = [...this.state.messages, msg];
    this.emit({ messages: this.state.messages });

    if (this.persist.enabled) {
      dbInsert({ table: this.persist.table, values: msg })
        .then((r) => {
          if (r?.item) this._updateMessage(msg.id, r.item);
        })
        .catch((e) => this.log("persist insert failed", e));
    }
    return msg.id;
  }

  _updateMessage(id, patch) {
    let changed = false;
    this.state.messages = this.state.messages.map((m) => {
      if (m.id === id) {
        changed = true;
        return { ...m, ...patch };
      }
      return m;
    });
    if (changed) {
      this.emit({ messages: this.state.messages });
      if (this.persist.enabled) {
        dbUpdate({ table: this.persist.table, id, patch }).catch((e) =>
          this.log("persist update failed", e)
        );
      }
    }
    return changed;
  }

  // ===== DB sync (optional) =====
  async syncMessages({ limit = 1000 } = {}) {
    if (!this.persist.enabled) return;
    try {
      const r = await dbSelect({
        table: this.persist.table,
        where: { conversationId: this.state.conversationId },
        limit,
        offset: 0,
        orderBy: `"createdAt" ASC, "t" ASC`,
      });
      const rows = Array.isArray(r?.items) ? r.items : [];
      rows.sort(
        (a, b) => (a.createdAt ?? a.t ?? 0) - (b.createdAt ?? b.t ?? 0)
      );
      this.state.messages = rows.slice(-Math.max(MAX_TURNS * 2, 80));
      this.emit({ messages: this.state.messages });
    } catch (e) {
      this.log("syncMessages failed", e);
    }
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
    if (!name) {
      this.log("executeTool: missing name");
      return;
    }
    try {
      this.set({ callingTool: true });
      const out = await toolsService.invoke(name, args);
      let kind = "tool_result";
      if (out?.messageType) {
        kind = out.messageType;
      }
      console.log(out, kind);

      this._updateMessage(refId, {
        role: "tool",
        kind,
        name,
        result: out,
        ok: true,
        ref: refId,
      });
    } catch (e) {
      this._updateMessage(refId, {
        role: "tool",
        kind: "tool_rejected",
        rejectReason: `Tool error (${name}): ${e}`,
      });
    } finally {
      this.set({ callingTool: false });
    }
  }

  async confirmToolRequest(requestId) {
    const req = this._findMessage(requestId);
    this.log("confirmToolRequest", {
      requestId,
      found: !!req,
      kind: req?.kind,
    });
    if (!req || req.kind !== "tool_request") return;
    const data =
      typeof req.content === "string"
        ? this._safeParse(req.content)
        : req.content;
    const name =
      data?.called ||
      req.name ||
      this.state.toolName ||
      toolsService.get()?.toolName;
    const args =
      data?.args ??
      req.args ??
      this.state.toolArgs ??
      toolsService.get()?.values;
    this.log("confirmToolRequest → execute", { name, args });
    await this.executeTool(name, args, { refId: requestId });
  }

  rejectToolRequest(requestId, reason = "Rejected by user") {
    const req = this._findMessage(requestId);
    this.log("rejectToolRequest", {
      requestId,
      found: !!req,
      kind: req?.kind,
      reason,
    });
    if (!req || req.kind !== "tool_request") return;
    this._updateMessage(requestId, {
      kind: "tool_rejected",
      rejectReason: String(reason || ""),
    });
  }

  // ===== Core submit =====
  async submit(prompt) {
    const text = String(prompt || "").trim();
    if (!text) return;

    const ctx = [];
    console.log(typeof this.state.context, this.state.context);
    if (this.state.context) ctx.push(this.state.context);
    if (this.state.attachments?.length) ctx.push(...this.state.attachments);

    // 1) user message
    this._pushMessage({
      role: "user",
      content: text,
      kind: "chat",
      attachments: ctx,
    });

    // 2) UI intent
    this.set({ loading: true });

    try {
      const messages = this._buildChatMessages({
        persona: this.state.persona,
        customInstructions: this.state.customInstructions, // NEW
        history: this.state.messages,
        context: ctx,
      });

      const payload = { model: this.state.model || undefined, messages };
      if (this.state.mode === "off") payload.tool_choice = "none";
      else if (
        this.state.mode === "force" &&
        (this.state.toolName || toolsService.get()?.toolName)
      ) {
        payload.toolName = this.state.toolName || toolsService.get()?.toolName;
        payload.force = true;
      } else if (
        this.state.mode === "run" &&
        (this.state.toolName || toolsService.get()?.toolName)
      ) {
        payload.toolName = this.state.toolName || toolsService.get()?.toolName;
        payload.force = true;
        payload.execute = true;
      } else if (this.state.mode === "auto") payload.tool_choice = "auto";

      this.set({ lastPayload: payload });
      this.log("submit →", payload);

      const r = await fetch(this.state.aiEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const js = await r.json();
      this.log("submit ←", { ok: r.ok, status: r.status, js });
      if (!r.ok) throw new Error(js?.error || `${r.status} ${r.statusText}`);

      this.set({ aiResult: js });

      if (js.content)
        this._pushMessage({
          role: "assistant",
          content: js.content,
          kind: "chat",
        });

      const called = js?.tool_call?.function?.name || "";
      const args =
        js?.args ??
        (typeof js?.tool_call?.function?.arguments === "string"
          ? this._safeParse(js.tool_call.function.arguments)
          : js?.tool_call?.function?.arguments);

      if (called && args && this.state.mode !== "off") {
        // Update ToolsService (truth) + optional UI mirrors
        await toolsService.setTool(called);
        toolsService.setValues({ ...args });
        this.set({ toolName: called, toolArgs: { ...args } });

        const requestId = this._pushMessage({
          role: "system",
          content: JSON.stringify({ called, args }, null, 2),
          kind: "tool_request",
          name: called,
          args,
        });
        this.log("queued tool_request", { requestId, called, args });

        if (this.state.mode === "run") this.confirmToolRequest(requestId);

        if (Object.prototype.hasOwnProperty.call(js, "executed_result")) {
          this.log("server already executed tool", called);
        } else if (this.state.autoExecute) {
          await this.confirmToolRequest(requestId);
        }
      }
    } catch (e) {
      this.log("submit error", e);
      this._pushMessage({
        role: "assistant",
        content: `⚠️${e}`,
        kind: "chat",
      });
    } finally {
      this.set({ loading: false });
    }
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
    this.set({
      context: v,
    });
  }
  // REMOVED: setContextPrefix

  setCustomInstructions(v) {
    // NEW
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
    // NEW
    this.set({ attachments: Array.isArray(list) ? list : [] });
  }
  addAttachments(items) {
    // NEW
    const add = Array.isArray(items) ? items : [items];
    const next = [...(this.state.attachments || []), ...add];
    this.set({ attachments: next });
  }
  removeAttachmentAt(index) {
    // NEW
    const arr = Array.isArray(this.state.attachments)
      ? this.state.attachments.slice()
      : [];
    if (index >= 0 && index < arr.length) {
      arr.splice(index, 1);
      this.set({ attachments: arr });
    }
  }
  clearAttachments() {
    // NEW
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
  setRpcBase(url) {
    this.set({ rpcBase: String(url || "/rpc") });
  }
  // ===== deletions =====
  /**
   * Delete a single message by id.
   * Updates local state and, if enabled, deletes from the DB.
   */
  async deleteMessage(id) {
    if (!id) return false;

    // remove from local state
    const prevLen = this.state.messages.length;
    this.state.messages = this.state.messages.filter((m) => m.id !== id);
    const changed = this.state.messages.length !== prevLen;
    if (changed) this.emit({ messages: this.state.messages });

    // persist
    if (this.persist.enabled) {
      try {
        await dbDelete({ table: this.persist.table, id });
      } catch (e) {
        this.log("deleteMessage persist failed", e);
      }
    }
    return changed;
  }

  /**
   * Delete all messages for a given conversationId. Defaults to current.
   * Efficiently uses a single where-clause delete if supported,
   * otherwise falls back to per-id deletes.
   */
  async deleteByConversationId(conversationId = this.state.conversationId) {
    if (!conversationId) return { deleted: 0 };

    // figure out which ids to drop locally (safe regardless of DB)
    const ids = this.state.messages
      .filter((m) => m.conversationId === conversationId)
      .map((m) => m.id);

    // local state update
    if (ids.length) {
      this.state.messages = this.state.messages.filter(
        (m) => m.conversationId !== conversationId
      );
      this.emit({ messages: this.state.messages });
    }

    // persist
    if (this.persist.enabled) {
      try {
        // Try a single where-delete (if your dbDelete supports where)
        await dbDelete({
          table: this.persist.table,
          where: { conversationId },
        });
      } catch (e) {
        // Fallback: per-id delete (if where is unsupported)
        this.log("deleteByConversationId where-delete failed, falling back", e);
        for (const id of ids) {
          try {
            await dbDelete({ table: this.persist.table, id });
          } catch (e2) {
            this.log("deleteByConversationId per-id persist failed", e2);
          }
        }
      }
    }

    return { deleted: ids.length };
  }

  /**
   * Delete ALL messages in the table (⚠ irreversible).
   * Efficient when dbDelete supports where; otherwise deletes currently-loaded ids.
   */
  async deleteAllMessages() {
    const ids = this.state.messages.map((m) => m.id);

    // local state update
    const hadAny = ids.length > 0;
    if (hadAny) {
      this.state.messages = [];
      this.emit({ messages: this.state.messages });
    }

    if (this.persist.enabled) {
      try {
        // Prefer a table-wide delete if your adapter supports a blank/true where or a special flag.
        // Option A: explicit always-true where
        await dbDelete({ table: this.persist.table, where: {} });
      } catch (e) {
        // Fallback: delete whatever we know about by id (note: won’t remove rows not loaded in memory)
        this.log("deleteAllMessages table-wide delete failed, falling back", e);
        for (const id of ids) {
          try {
            await dbDelete({ table: this.persist.table, id });
          } catch (e2) {
            this.log("deleteAllMessages per-id persist failed", e2);
          }
        }
      }
    }

    return { deleted: ids.length };
  }

  /**
   * Convenience: bulk delete by an array of message ids.
   */
  async deleteMessagesByIds(ids = []) {
    const set = new Set(ids.filter(Boolean));
    if (!set.size) return { deleted: 0 };

    // local state update
    const before = this.state.messages.length;
    this.state.messages = this.state.messages.filter((m) => !set.has(m.id));
    const deletedCount = before - this.state.messages.length;
    if (deletedCount > 0) this.emit({ messages: this.state.messages });

    // persist
    if (this.persist.enabled) {
      // best effort per-id (portable across adapters)
      for (const id of set) {
        try {
          await dbDelete({ table: this.persist.table, id });
        } catch (e) {
          this.log("deleteMessagesByIds persist failed", e);
        }
      }
    }

    return { deleted: deletedCount };
  }

  async clearCurrentConversation() {
    return this.deleteByConversationId(this.state.conversationId);
  }
}

// ---- singleton helpers ----
export function getAIChatService(opts = {}) {
  const KEY = Symbol.for("@loki/ai-chat:service@1");
  return getGlobalSingleton(KEY, () => new AIChatService(opts));
}
export const aiChatService = getAIChatService({
  persist: { enabled: true, table: "Messages" },
  conversationId: "default",
});
