// src/shared/ToolsService.js
// Minimal, drop-in compatible

import { getGlobalSingleton } from "@loki/utilities";
import { toolRegistry as rpc } from "./toolRegistry.js";

const isBrowser = () =>
  typeof window !== "undefined" && typeof localStorage !== "undefined";

export class ToolsService extends EventTarget {
  constructor({ storageKey = "minihttp.selectedTool", src = "/rpc" } = {}) {
    super();
    this.storageKey = storageKey;
    this.src = src;

    // state
    this.tools = []; // [{ name, description?, parameters? }]
    this.toolName = ""; // selected tool name
    this.tool = null; // selected tool object
    this.schema = null; // JSON schema for args
    this.values = {}; // current args
    this.calling = false;
    this.result = null;
    this.error = null;

    this._ready = null;
  }

  // ---------- basic state ----------
  get() {
    return {
      src: this.src,
      tools: this.tools,
      toolName: this.toolName,
      tool: this.tool,
      schema: this.schema,
      values: this.values,
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
  _emit(type, extra = {}) {
    this.dispatchEvent(
      new CustomEvent("change", { detail: { type, ...this.get(), ...extra } })
    );
  }

  // ---------- tools list ----------
  async sync() {
    if (!this._ready) this._ready = this.refreshTools();
    return this._ready;
  }

  async refreshTools() {
    this.error = null;
    this._emit("tools:loading");
    try {
      // try /rpc/tools (structured); else fallback to /rpc (names)
      let tools = await this._fetchToolsList(`${this.src}/tools`);
      if (!tools) tools = await this._fetchNamesList(this.src);
      this.tools = this._normalizeTools(tools);

      const stored = isBrowser()
        ? localStorage.getItem(this.storageKey) || ""
        : "";
      const choice =
        (stored && this.tools.find((t) => t.name === stored)?.name) ||
        this.tools[0]?.name ||
        "";
      await this.setTool(choice || "");
      this._emit("tools");
    } catch (e) {
      this.error = String(e?.message || e);
      this.tools = [];
      this.toolName = "";
      this.tool = null;
      this.schema = null;
      this.values = {};
      this._emit("error", { error: this.error });
    } finally {
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

  // ---------- selection & args ----------
  async setTool(name) {
    if (!name || name === this.toolName) {
      this._emit("select");
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

  _defaultValues(schema) {
    const props = schema?.properties || {};
    const out = {};
    for (const [k, v] of Object.entries(props)) {
      if (v.default !== undefined) out[k] = v.default;
      else if (v.type === "boolean") out[k] = false;
      else out[k] = "";
    }
    return out;
  }

  // ---------- calls ----------
  /** Uses currently selected tool + values; stores result/error. */
  async call() {
    if (!this.toolName) return;
    this.calling = true;
    this.result = null;
    this.error = null;
    this._emit("call:start");
    try {
      const body = await rpc.$call(this.toolName, this.values);
      this.result = body;
      this._emit("result", { ok: true });
    } catch (e) {
      this.error = String(e?.message || e);
      this._emit("result", { ok: false });
    } finally {
      this.calling = false;
      this._emit("call:done");
    }
  }

  /** One-off execution; does not mutate selection/result. */
  async invoke(name, args = {}) {
    if (!name) throw new Error("invoke: missing tool name");
    this.calling = true;
    this._emit("call:start", { invoked: name });
    try {
      const body = await rpc.$call(name, args);
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

  /** Remote-only execution bypassing stubs. */
  async invokeRemote(name, args = {}) {
    if (!name) throw new Error("invokeRemote: missing tool name");
    return rpc.$call(name, args);
  }
}
// ---- singleton helpers ----
export function getToolsService(opts = {}) {
  const KEY = Symbol.for("@loki/minihttp:service@minimal");
  return getGlobalSingleton(KEY, () => new ToolsService(opts));
}
export const toolsService = getToolsService();
