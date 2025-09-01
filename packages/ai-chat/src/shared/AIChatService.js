// ai-chat-service.js
import { createLogger } from "@loki/http-base/util";
import { createOpenApiRpcClient } from "@loki/minihttp/util";
import { toolsService } from "@loki/minihttp/util"; // ensure this path resolves to your ToolsService export
import { getGlobalSingleton } from "@loki/utilities";

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

  _buildChatMessages({ persona, customInstructions, history }) {
    const msgs = [];
    const p = (persona ?? "").trim();
    const ci = (customInstructions ?? "").trim();
    if (p) msgs.push({ role: "system", content: p });
    if (ci) msgs.push({ role: "system", content: ci });

    const H = Array.isArray(history) ? history : [];

    // CONFIG
    const KEEP_LATEST_ATTACHMENTS = 1; // keep last N attachments untruncated
    const ATTACH_TRUNC_LIMIT = 1000; // chars

    // Find indices of the last N attachment messages (anywhere in the history)
    const latestAttachmentIdx = new Set();
    if (KEEP_LATEST_ATTACHMENTS > 0) {
      let kept = 0;
      for (
        let i = H.length - 1;
        i >= 0 && kept < KEEP_LATEST_ATTACHMENTS;
        i--
      ) {
        if (H[i]?.kind === "attachment") {
          latestAttachmentIdx.add(i);
          kept++;
        }
      }
    }

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

        // Truncate only historical attachments (not the latest N)
        if (
          m?.kind === "attachment" &&
          !latestAttachmentIdx.has(i) &&
          content.length > ATTACH_TRUNC_LIMIT
        ) {
          const suffix = "… [truncated historical attachment]";
          content =
            content.slice(0, ATTACH_TRUNC_LIMIT - suffix.length) + suffix;
        }

        msgs.push({ role: m.role, content });
      }
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
      this._call("dbInsert", { table: this.persist.table, values: msg })
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
        this._call("dbUpdate", { table: this.persist.table, id, patch }).catch(
          (e) => this.log("persist update failed", e)
        );
      }
    }
    return changed;
  }

  // ===== DB sync (optional) =====
  async syncMessages({ limit = 1000 } = {}) {
    if (!this.persist.enabled) return;
    try {
      const r = await this._call("dbSelect", {
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

    // 1) user message
    this._pushMessage({ role: "user", content: text, kind: "chat" });

    // Include ad-hoc string context (if used)
    if (this.state.context) {
      this._pushMessage({
        role: "system",
        content: this.state.context,
        kind: "attachment",
      });
    }

    // Include attachments as system "attachment" messages (visible in ChatStream)
    const atts = Array.isArray(this.state.attachments)
      ? this.state.attachments
      : [];
    for (const a of atts) {
      // keep a copy so UI cards can render it
      const msg = {
        role: "system",
        kind: "attachment",
        name: a.name,
        mime: a.mime,
        type: a.type,
        lang: a.lang,
        url: a.url ?? null,
        // For text, place the content in 'content' as well for LLMs that parse plain text
        content:
          a.type === "text"
            ? String(a.data ?? "")
            : a.name || a.mime || a.type || "attachment",
        // For images or other types, keep the raw data URL in a separate field
        data: a.type === "image" ? a.data ?? null : null,
      };
      this._pushMessage(msg);
    }

    // 2) UI intent
    this.set({ loading: true });

    try {
      const messages = this._buildChatMessages({
        persona: this.state.persona,
        customInstructions: this.state.customInstructions, // NEW
        history: this.state.messages,
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
        content: `Error: ${e}`,
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
      context: typeof v === "string" ? v : JSON.stringify(v, null, 2),
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
