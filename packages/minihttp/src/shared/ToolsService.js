// src/shared/ToolsService.js
// Service with DIAGNOSTIC LOGS + direct SSE listening + optimistic→final swap
import { getGlobalSingleton } from "@loki/utilities";
import { toolRegistry as rpc } from "./toolRegistry.js";

const isBrowser = typeof window !== "undefined";
const now = () => new Date().toISOString().slice(11, 23);
const log = (m, o) => {
  try {
    console.log(`[ToolsService ${now()}] ${m}`, o);
  } catch {}
};

const isRecord = (v) => v && typeof v === "object" && !Array.isArray(v);
const isAsyncEnvelope = (x) => !!(x && typeof x === "object" && "runId" in x);
const pickOptimistic = (x) => {
  if (x && x.ok !== undefined) return x; // already final
  if (x && x.optimistic && x.optimistic.ok !== undefined) return x.optimistic;
  if (x && x.__PLAN_PAUSED__) return x; // plan pause preview
  return x;
};

export class ToolsService extends EventTarget {
  constructor({ storageKey = "minihttp.selectedTool", src = "/rpc" } = {}) {
    super();
    this.storageKey = storageKey;
    this.src = src;

    // state
    this.tools = [];
    this.toolName = "";
    this.tool = null;
    this.schema = null;
    this.values = {};
    this.method = "POST";

    this.calling = false;
    this.result = null;
    this.error = null;

    // optimistic→final correlation
    this._resultRunId = null; // run currently shown in UI
    this._pendingRunIds = new Set(); // all runs we care about
    this._ready = null;

    // SSE
    this._es = null;
    this._sseBound = false;

    log("ctor", { src, storageKey });

    // Optional: local bus logs (NOTE: only fires for *local* runs, not server)
    try {
      rpc.onRun?.((ev) => log(`onRun:${ev.type}`, ev));
    } catch {}

    if (isBrowser) window.__toolsService = this;
    this._ensureSSE(); // connect right away
  }

  // ---------- subscription ----------
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
      resultRunId: this._resultRunId,
    };
  }
  subscribe(fn) {
    const h = (e) => fn(this.get(), e.detail);
    this.addEventListener("change", h);
    return () => this.removeEventListener("change", h);
  }
  _emit(type, extra = {}) {
    const detail = { type, ...this.get(), ...extra };
    log(`emit:${type}`, { runId: this._resultRunId, extra });
    this.dispatchEvent(new CustomEvent("change", { detail }));
  }

  // ---------- SSE ----------
  _ensureSSE() {
    if (!isBrowser || typeof EventSource === "undefined") return;
    if (this._es) return;

    const url = new URL(
      (this.src || "/rpc").replace(/\/+$/, "") + "/events",
      location.origin
    );
    log("SSE:connect ->", { url: url.toString() });

    const es = new EventSource(url.toString());
    this._es = es;

    const onHello = (e) => log("SSE:hello", safeParse(e?.data));
    const onFinished = (e) => this._onSseFinished(e);
    const onErrorEv = (e) => this._onSseError(e);
    const onOpen = () => log("SSE:open", { readyState: es.readyState });
    const onErr = (ev) => log("SSE:error", ev);

    es.addEventListener("hello", onHello);
    es.addEventListener("run:finished", onFinished);
    es.addEventListener("run:error", onErrorEv);
    es.addEventListener("open", onOpen);
    es.addEventListener("error", onErr);

    this._sseBound = true;
  }

  async _onSseFinished(e) {
    const ev = safeParse(e?.data);
    log("SSE:run:finished <-", ev);

    const runId = ev?.runId || ev?.id;
    if (!runId) return;

    // Only care if we have pending interest in this run
    if (!this._pendingRunIds.has(runId)) {
      log("SSE:finished ignored (not pending)", { runId });
      return;
    }

    // Prefer the payload result if present; else pull from /runs/:id
    const final =
      ev.result || (await this._fetchRunResult(runId).catch(() => null));
    if (!final) {
      log("SSE:finished but no final result", { runId });
      return;
    }
    this._applyFinal(runId, final);
  }

  _onSseError(e) {
    const ev = safeParse(e?.data);
    const runId = ev?.runId || ev?.id;
    log("SSE:run:error <-", { ev });
    if (!runId) return;
    if (!this._pendingRunIds.has(runId)) return;

    const msg = ev?.error || "run error";
    // Only apply if this run is currently displayed
    if (this._resultRunId && runId === this._resultRunId) {
      this.error = msg;
      this._emit("result", { ok: false, final: true, runId });
      this._resultRunId = null;
    }
    this._pendingRunIds.delete(runId);
  }

  async _fetchRunResult(runId) {
    const base = (this.src || "/rpc").replace(/\/+$/, "");
    const url = `${base}/runs/${encodeURIComponent(runId)}`;
    log("fetchRunResult ->", { url });
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    return j?.result || null;
  }

  _applyFinal(runId, fin) {
    const willApply = !this._resultRunId || runId === this._resultRunId;
    log("applyFinal", {
      runId,
      willApply,
      hasOk: !!fin?.ok,
      paused: !!fin?.__PLAN_PAUSED__,
    });

    this._pendingRunIds.delete(runId);

    if (!willApply) {
      log("applyFinal:ignored (mismatch)", {
        runId,
        current: this._resultRunId,
      });
      return;
    }

    if (fin && (fin.ok || fin.__PLAN_PAUSED__)) {
      this.result = fin;
      this.error = null;
      this._resultRunId = null;
      this._emit("result", { ok: true, final: true, runId });
    } else {
      this.error = fin?.error || "Unknown error";
      this._resultRunId = null;
      this._emit("result", { ok: false, final: true, runId });
    }
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
      log("refreshTools:list", { count: (tools || []).length });
      this.tools = this._normalizeTools(tools);

      const stored = isBrowser
        ? localStorage.getItem(this.storageKey) || ""
        : "";
      const choice =
        (stored && this.tools.find((t) => t.name === stored)?.name) ||
        this.tools[0]?.name ||
        "";
      log("refreshTools:choice", { stored, choice });
      await this.setTool(choice || "");
      this._emit("tools");
    } catch (e) {
      this.error = String(e?.message || e);
      this.tools = [];
      this.toolName = "";
      this.tool = null;
      this.schema = null;
      this.values = {};
      log("refreshTools:error", { error: this.error });
      this._emit("error", { error: this.error });
    } finally {
      this._emit("tools:loaded");
    }
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
      log("setTool:noop", { name, current: this.toolName });
      this._emit("select");
      return;
    }
    log("setTool:start", { name });
    this.toolName = name;
    if (isBrowser) localStorage.setItem(this.storageKey, name);
    this.tool = this.tools.find((t) => t.name === name) || null;

    this.schema =
      typeof this.tool?.parameters === "function"
        ? await this.tool.parameters()
        : this.tool?.parameters || { type: "object", properties: {} };

    this.values = this._defaultValues(this.schema);
    this.result = null;
    this.error = null;
    this._resultRunId = null;

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
    this._resultRunId = null;
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

  // ---------- core calls ----------
  async call() {
    if (!this.toolName) return;
    this.calling = true;
    this.result = null;
    this.error = null;
    this._resultRunId = null;
    this._emit("call:start");

    // Ensure SSE is up before we start an async call
    this._ensureSSE();

    try {
      log("call:rpc.$call ->", { tool: this.toolName, args: this.values });
      const body = await rpc.$call(this.toolName, this.values);

      // If server accepted async but did not attach .final, synthesize it
      if (
        isAsyncEnvelope(body) &&
        (!body.final || typeof body.final.then !== "function")
      ) {
        try {
          const p = rpc.awaitFinal?.(body.runId);
          if (p && typeof p.then === "function") {
            Object.defineProperty(body, "final", {
              enumerable: false,
              configurable: true,
              value: p,
            });
          }
        } catch {}
      }

      const seed = pickOptimistic(body);
      this.result = seed;
      this.error = null;

      // Track run → we will accept SSE final only for pending ones
      const runId = isAsyncEnvelope(body) ? body.runId : null;
      this._resultRunId = runId;
      if (runId) this._pendingRunIds.add(runId);

      this._emit("result", {
        ok: !!seed?.ok || !!seed?.__PLAN_PAUSED__,
        optimistic: !!runId,
        runId: runId || undefined,
      });

      // Also attach the promise path as a fallback (proxy & devtools friendly)
      if (runId && body.final && typeof body.final.then === "function") {
        body.final.then(
          (fin) => this._applyFinal(runId, fin),
          (err) =>
            this._onSseError({
              data: JSON.stringify({
                runId,
                error: String(err?.message || err),
              }),
            })
        );
      }
    } catch (e) {
      this.error = String(e?.message || e);
      this._emit("result", { ok: false });
    } finally {
      this.calling = false;
      this._emit("call:done");
    }
  }

  async invoke(name, args = {}) {
    if (!name) throw new Error("invoke: missing tool name");
    this._ensureSSE();
    this._emit("call:start", { invoked: name });

    try {
      const body = await rpc.$call(name, args);
      if (
        isAsyncEnvelope(body) &&
        (!body.final || typeof body.final.then !== "function")
      ) {
        try {
          const p = rpc.awaitFinal?.(body.runId);
          if (p && typeof p.then === "function") {
            Object.defineProperty(body, "final", {
              enumerable: false,
              configurable: true,
              value: p,
            });
          }
        } catch {}
      }

      const optimistic = pickOptimistic(body);
      const runId = isAsyncEnvelope(body) ? body.runId : null;
      if (runId) this._pendingRunIds.add(runId);

      this._emit("invoke:result", {
        ok: !!optimistic?.ok || !!optimistic?.__PLAN_PAUSED__,
        optimistic: !!runId,
        runId,
        body: optimistic,
      });

      if (runId && body.final && typeof body.final.then === "function") {
        body.final.then(
          (fin) => this._applyFinal(runId, fin),
          (err) =>
            this._onSseError({
              data: JSON.stringify({
                runId,
                error: String(err?.message || err),
              }),
            })
        );
      }
      return body;
    } catch (e) {
      this._emit("invoke:result", {
        ok: false,
        error: String(e?.message || e),
      });
      throw e;
    } finally {
      this._emit("call:done");
    }
  }

  async callNamed(name, args = {}) {
    await this.setTool(name);
    this.setValues(args || {});
    await this.call();
  }
  async invokeNamed(name, args = {}) {
    return this.invoke(name, args);
  }

  // ---------- plan resume / cancel ----------
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
    const mergedCtx = {
      ...originalCtx,
      $input: mergedInput,
      form: { data: { form: { values: mergedInput } } },
    };
    const steps = t.plan(mergedInput, mergedCtx) || [];

    this.calling = true;
    this._emit("plan:resume:start", { checkpoint, toolName });

    try {
      const final = await rpc.runPlan(steps, {
        initialArgs: mergedInput,
        ctx: mergedCtx,
        parentTool: toolName,
        toolSpec: t,
        resumeFrom: (checkpoint.index ?? -1) + 1,
        resumePath: Array.isArray(checkpoint.path) ? checkpoint.path : null,
      });

      this.result = final;
      this.error = null;
      this._resultRunId = null;
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

  cancelPlan(checkpoint) {
    this._emit("plan:cancel", { checkpoint });
  }
}

// ---- utils ----
function safeParse(s) {
  try {
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

// ---- singleton ----
export function getToolsService(opts = {}) {
  const KEY = Symbol.for("@loki/minihttp:service@withSSE");
  return getGlobalSingleton(KEY, () => new ToolsService(opts));
}
export const toolsService = getToolsService();
