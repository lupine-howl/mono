// Runner: public call() invoker, ctx binding for tools + ui, local/remote exec

import { toolRegistry } from "./toolRegistry.js";
import { validate } from "./validation.js";
import { createToolClient } from "./toolClient.js";
import { createUiClient } from "./uiClient.js";

// ---------- env helpers ----------
const isBrowser = () => typeof window !== "undefined";
const serverUrl = () =>
  isBrowser() ? location.origin : "http://localhost:3000";
const baseUrl = (u) => `${(serverUrl() || "/").replace(/\/+$/, "")}${u}`;

// ---------- ctx API ----------
export const CTX_API_KEYS = [
  "emitUI",
  "awaitUIResume",
  "ui",
  "$ui",
  "tools",
  "$tools",
  "$call",
  "$plan",
  "$run",
];

export function getCtxApi(ctx = {}) {
  const out = {};
  for (const k of CTX_API_KEYS) if (k in ctx) out[k] = ctx[k];
  return out;
}

function makeRunId() {
  return (
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).substring(2, 8) +
    Math.random().toString(36).substring(2, 8)
  );
}

/**
 * Build the ctx API (does not mutate input).
 * - Binds a ctx-scoped UI client as `ctx.ui` (and `$ui` alias)
 * - Binds a ctx-scoped Tools client as `ctx.tools` (and `$tools` alias)
 * - Keeps $call/$plan for back-compat where needed
 */
export function createCtxApi({ tool, runId }) {
  // ctx-bound UI client
  const ui = createUiClient({ tool, runId });

  // Emit wrapper (BC for older code that used emitUI)
  const emitUI = (evtOrView) => ui.emit(evtOrView);

  // ctx-bound Tools client prefers this ctx unless explicitly overridden
  const boundInvoker = (name, params, ctxOverride) =>
    call(name, params, ctxOverride || api);
  const tools = createToolClient(boundInvoker /* boundCtx */);

  const api = {
    emitUI,
    awaitUIResume: (opts) => ui.awaitResume(opts),

    ui,
    $ui: ui, // alias

    tools,
    $tools: tools, // alias

    // still expose these for any code that relies on them
    $call: (name, args, innerCtx) => call(name, args, innerCtx),

    $plan: async (toolName, planArgs, maybeCtx) => {
      // keep aiRequest BC; if you migrate to ai.request, add an alias in registry
      const res = await call(
        "aiRequest",
        { force: true, toolName, ...planArgs },
        maybeCtx || api
      );
      return res?.data?.tool_args ?? res;
    },

    $run: () => {},
  };

  return api;
}

/** Attach ctx API directly onto a ctx object and return it */
export function attachHelpersToCtx(ctx, ids) {
  const api = createCtxApi(ids);
  return Object.assign(ctx || {}, api);
}

// ---------- public tool invoker ----------
/** Public entry: invoke a tool by name (local or remote). */
export async function call(name, args = {}, ctx = {}) {
  const reg = toolRegistry;
  const primary = reg.find(name) ? name : null;
  // Not local? try remote
  if (!primary) {
    try {
      return callRemote(name, args, ctx);
    } catch (error) {
      return error;
    }
  }

  attachHelpersToCtx(ctx, { tool: primary, runId: makeRunId() });

  let steps;
  const tool = reg.find(primary);
  if (tool?.steps) {
    steps =
      typeof tool.steps === "function"
        ? await tool.steps(args, ctx)
        : tool.steps;
  } else {
    steps = [tool];
  }

  if (!Array.isArray(steps) || !steps.length) {
    throw new Error(`Tool "${primary}" has no steps to execute`);
  }

  let lastResult = null;
  for (const step of steps) {
    if (!step || typeof step !== "object") {
      throw new Error(`Invalid step in tool "${primary}"`);
    }
    // eslint-disable-next-line no-await-in-loop
    lastResult = await callLocal(step, args, ctx);
  }
  return lastResult;
}

// ---------- local/remote exec ----------
export async function callLocal(tool, args = {}, ctx = {}) {
  const reg = toolRegistry;
  const schema = await reg._resolveParameters(tool, ctx);

  let { stub, handler, beforeRun, afterRun, runServer, run } = tool;
  afterRun = afterRun || stub || null;
  runServer = runServer || handler || null;

  const v = validate(schema, args);
  if (!v.ok) throw new Error(v.error);

  let runArgs = args;
  if (typeof beforeRun === "function") {
    const hint = await beforeRun(v.value, ctx);
    runArgs = { ...runArgs, ...hint };
  }

  if (typeof run === "function") {
    return run(runArgs, ctx);
  }

  if (typeof runServer === "function") {
    const result = await callRemote(tool.name, runArgs, ctx);
    if (typeof afterRun === "function")
      return afterRun(runArgs, { ...ctx, result });
    return result;
  }

  if (typeof afterRun === "function") {
    return afterRun(runArgs, ctx);
  }

  if (typeof handler === "function") return handler(runArgs, ctx);
  if (typeof stub === "function") return stub(runArgs, ctx);

  throw new Error(
    `No executable handler for tool step "${tool.name || "(anonymous)"}"`
  );
}

const toWireName = (name) => String(name).replace(/[^a-zA-Z0-9_-]/g, "_");

export async function callRemote(name, args = {}, _ctx = {}) {
  const wire = toWireName(name);
  const url = new URL(`${baseUrl(`/rpc/${wire}`)}`);
  let res;
  try {
    res = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args || {}),
    });
  } catch (error) {
    throw new Error(`Network error: ${error.message || error}`);
  }
  if (!res) throw new Error("No response");
  const txt = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${txt || res.statusText}`);
  const json = txt ? JSON.parse(txt) : null;
  if (json && typeof json === "object" && json.error) {
    throw new Error(String(json.error));
  }
  return json;
}
