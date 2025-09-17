// src/shared/ToolsService.js
// Minimal, drop-in compatible + plan resume helpers

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
    this.method = "POST";

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
      method: this.method,
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
      const tools = await rpc.list();
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
        isPlan: typeof it?.plan === "function",
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
    // parameters can be a function (sync/async)
    this.schema =
      typeof this.tool?.parameters === "function"
        ? await this.tool.parameters()
        : this.tool?.parameters || { type: "object", properties: {} };
    this.values = this._defaultValues(this.schema);
    this.result = null;
    this.error = null;
    this._emit("select");
  }

  setMethod(method = "POST") {
    this.method = String(method || "POST").toUpperCase();
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

  /** Alias (clearer API for UI) */
  async invokeNamed(name, args = {}) {
    return this.invoke(name, args);
  }

  /** Select a tool, set args, call it, and keep result in state. */
  async callNamed(name, args = {}) {
    if (!name) throw new Error("callNamed: missing tool name");
    await this.setTool(name);
    this.setValues(args || {});
    await this.call();
  }

  /** Remote-only execution bypassing stubs. (kept for parity; same as $call here) */
  async invokeRemote(name, args = {}) {
    if (!name) throw new Error("invokeRemote: missing tool name");
    return rpc.$call(name, args);
  }

  // src/shared/ToolsService.js
  // ...
  async resumePlan(checkpoint, payload = {}) {
    if (!checkpoint || (!checkpoint.tool && !checkpoint.parentTool)) {
      throw new Error("resumePlan: invalid checkpoint");
    }
    const toolName = checkpoint.tool || checkpoint.parentTool;
    const t = rpc.find(toolName);
    if (!t || typeof t.plan !== "function") {
      throw new Error(`resumePlan: tool "${toolName}" is not a plan tool`);
    }

    const originalCtx = checkpoint.ctx || {};
    const mergedInput = { ...(originalCtx.$input || {}), ...(payload || {}) };

    // Also expose payload in the "form" shape to satisfy flows that read form values.
    const mergedCtx = {
      ...originalCtx,
      $input: mergedInput,
      form: { data: { form: { values: mergedInput } } },
    };

    // Recompute steps using merged initial args
    const steps = t.plan(mergedInput, mergedCtx) || [];

    this.calling = true;
    this._emit("plan:resume:start", { checkpoint, toolName });

    try {
      const final = await rpc.runPlan(steps, {
        initialArgs: mergedInput,
        ctx: mergedCtx,
        parentTool: toolName,
        toolSpec: t,
        // resume AFTER the paused step
        resumeFrom: (checkpoint.index ?? -1) + 1,
        resumePath: Array.isArray(checkpoint.path) ? checkpoint.path : null,
      });
      this.result = final;
      this.error = null;
      this._emit("result", { ok: true, resumed: true });
      return final;
    } catch (e) {
      const msg = String(e?.message || e);
      this.error = msg;
      this._emit("result", { ok: false, resumed: true, error: msg });
      throw e;
    } finally {
      this.calling = false;
      this._emit("call:done");
    }
  }
  // ...

  /**
   * UI-level cancel (no registry state to clear) — clears current result and emits an event.
   * You can extend this to call a dedicated cancel tool if you later add one.
   */
  cancelPlan(checkpoint) {
    this._emit("plan:cancel", { checkpoint });
    // leave last result visible or clear it, your call:
    // this.clearResult();
  }
}

// ---- singleton helpers ----
export function getToolsService(opts = {}) {
  const KEY = Symbol.for("@loki/minihttp:service@minimal");
  return getGlobalSingleton(KEY, () => new ToolsService(opts));
}
export const toolsService = getToolsService();
