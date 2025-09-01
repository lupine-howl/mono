// src/services/MiniHttpService.js
import { getGlobalSingleton } from "@loki/utilities";
import { createOpenApiRpcClient } from "./createOpenApiRpcClient.js";

const isBrowser = () =>
  typeof window !== "undefined" && typeof localStorage !== "undefined";

/**
 * Emits a single "change" event with detail:
 * { type, base, src, openapiUrl, method, tools, toolName, tool, schema, values,
 *   loadingTools, calling, result, error }
 */
class ToolsService extends EventTarget {
  constructor({
    storageKey = "minihttp.selectedTool",
    base = isBrowser() ? location.origin : "http://localhost:3000",
    src = "/rpc",
    openapiUrl = "/openapi.json",
    method = "POST",
  } = {}) {
    super();
    this.storageKey = storageKey;
    this.base = base;
    this.src = src;
    this.openapiUrl = openapiUrl;

    // state
    this.tools = []; // [{name, description?, parameters?}]
    this.toolName = ""; // active tool name
    this.tool = null; // active tool object
    this.schema = null; // JSON schema for args
    this.values = {}; // current args
    this.method = (method || "POST").toUpperCase();

    this.loadingTools = false;
    this.calling = false;
    this.result = null;
    this.error = null;

    this._rpc = null;
    this._ready = null;
  }

  // -------- public state helpers --------
  get() {
    return {
      base: this.base,
      src: this.src,
      openapiUrl: this.openapiUrl,
      method: this.method,
      tools: this.tools,
      toolName: this.toolName,
      tool: this.tool,
      schema: this.schema,
      values: this.values,
      loadingTools: this.loadingTools,
      calling: this.calling,
      result: this.result,
      error: this.error,
    };
  }
  subscribe(fn) {
    const h = (e) => fn(this.get(), e.detail);
    this.addEventListener("change", h);
    return () => this.removeEventListener("change", h);
  }

  // -------- lifecycle / hydrate --------
  async sync() {
    if (!this._ready) {
      const preferred = isBrowser()
        ? localStorage.getItem(this.storageKey) || ""
        : "";
      this._ready = this.refreshTools({ preferred })
        .then(() => {
          this._emit("init");
        })
        .catch((e) => {
          this._emit("error", { error: String(e?.message || e) });
        });
    }
    return this._ready;
  }

  // -------- events --------
  _emit(type, extra = {}) {
    const detail = {
      type,
      base: this.base,
      src: this.src,
      openapiUrl: this.openapiUrl,
      method: this.method,
      tools: this.tools,
      toolName: this.toolName,
      tool: this.tool,
      schema: this.schema,
      values: this.values,
      loadingTools: this.loadingTools,
      calling: this.calling,
      result: this.result,
      error: this.error,
      ...extra,
    };
    this.dispatchEvent(new CustomEvent("change", { detail }));
  }

  // -------- tools list --------
  async refreshTools({ preferred = "" } = {}) {
    this.loadingTools = true;
    this.error = null;
    this._emit("tools:loading");
    try {
      let tools = await this._fetchToolsList(`${this.src}/tools`);
      if (!tools) tools = await this._fetchNamesList(this.src);
      this.tools = this._normalizeTools(tools);

      const exists = preferred && this.tools.some((t) => t.name === preferred);
      const next = exists ? preferred : this.tools[0]?.name || "";
      await this.setTool(next, { fromRefresh: true });
      this._emit("tools");
    } catch (e) {
      this.error = e?.message || String(e);
      this.tools = [];
      this.toolName = "";
      this.tool = null;
      this.schema = null;
      this.values = {};
      this._emit("error", { error: this.error });
    } finally {
      this.loadingTools = false;
      this._emit("tools:loaded");
    }
  }

  async _fetchToolsList(url) {
    try {
      const r = await fetch(url, { headers: { Accept: "application/json" } });
      if (!r.ok) return null;
      const j = await r.json();
      const arr = Array.isArray(j?.tools) ? j.tools : null;
      if (!arr) return null;
      return arr.map((it) =>
        it?.function
          ? {
              name: it.function.name,
              description: it.function.description,
              parameters: it.function.parameters,
            }
          : it
      );
    } catch {
      return null;
    }
  }

  async _fetchNamesList(url) {
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    const j = await r.json();
    const names = Array.isArray(j?.tools) ? j.tools : [];
    return names.map((n) => ({ name: String(n) }));
  }

  _normalizeTools(list) {
    const out = [];
    const seen = new Set();
    for (const it of list || []) {
      const name = it?.name;
      if (!name || seen.has(name)) continue;
      seen.add(name);
      out.push({
        name,
        description: it?.description || "",
        parameters: it?.parameters || null,
      });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }

  // -------- selection / args --------
  async setTool(name, { fromRefresh = false } = {}) {
    if (!name || name === this.toolName) {
      if (fromRefresh) this._emit("select");
      return;
    }
    this.toolName = name;
    if (isBrowser()) localStorage.setItem(this.storageKey, name);
    this.tool = this.tools.find((t) => t.name === name) || null;
    this.schema = this.tool?.parameters || { type: "object", properties: {} };
    this.values = this._defaultValues(this.schema);
    this.result = null;
    this.error = null;
    this._emit("select");
  }

  setMethod(method = "POST") {
    this.method = (method || "POST").toUpperCase();
    this._emit("method");
  }

  setValues(next = {}) {
    this.values = { ...(this.values || {}), ...(next || {}) };
    this._emit("args");
  }

  setValue(key, value) {
    this.values = { ...(this.values || {}), [key]: value };
    this._emit("args");
  }

  clearResult() {
    this.result = null;
    this._emit("result:clear");
  }

  _defaultValues(schema, prev = {}) {
    const props = schema?.properties || {};
    const out = { ...(prev || {}) };
    for (const [k, v] of Object.entries(props)) {
      if (out[k] !== undefined) continue;
      if (v.default !== undefined) out[k] = v.default;
      else if (v.type === "boolean") out[k] = false;
      else out[k] = "";
    }
    return out;
  }

  // -------- RPC calls --------
  async _ensureRpc() {
    if (!this._rpc) {
      this._rpc = createOpenApiRpcClient({
        base: this.base,
        openapiUrl: this.openapiUrl,
      });
    }
    return this._rpc;
  }

  /** Uses the currently-selected tool + values; updates `result` in state. */
  async call() {
    if (!this.toolName) return;
    await this._ensureRpc();
    this.calling = true;
    this.result = null;
    this.error = null;
    this._emit("call:start");
    try {
      const body = await this._rpc[this.toolName](this.values, {
        method: this.method,
      });
      this.result = body;
      this._emit("result", { ok: true });
    } catch (e) {
      this.error = e?.message || String(e);
      this._emit("result", { ok: false });
    } finally {
      this.calling = false;
      this._emit("call:done");
    }
  }

  /**
   * One-off execution of an arbitrary tool with explicit args.
   * Does NOT mutate selection/values/result; does toggle `calling` while in-flight.
   */
  async invoke(name, args, { method } = {}) {
    if (!name) throw new Error("invoke: missing tool name");
    await this._ensureRpc();
    this.calling = true;
    this._emit("call:start", { invoked: name });
    try {
      const body = await this._rpc[name](args ?? {}, {
        method: (method || this.method || "POST").toUpperCase(),
      });
      this._emit("invoke:result", { ok: true });
      return body;
    } catch (e) {
      this._emit("invoke:result", {
        ok: false,
        error: String(e?.message || e),
      });
      throw e;
    } finally {
      this.calling = false;
      this._emit("call:done");
    }
  }
}

// ---- singleton helpers ----
export function getToolsService(opts = {}) {
  const KEY = Symbol.for("@loki/minihttp:service@1");
  return getGlobalSingleton(KEY, () => new ToolsService(opts));
}
export const toolsService = getToolsService();
