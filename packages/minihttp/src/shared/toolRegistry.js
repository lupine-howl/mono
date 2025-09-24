// Core registry (tool defs, local/remote calls, async runs, RPC + OpenAPI)
// Uses plan-runner (pure) and @loki/events/util (singleton bus + SSE + client)

import { getGlobalSingleton } from "@loki/utilities";
import { validate } from "./validation.js";
import { globalEventBus as bus } from "@loki/events/util";
const isBrowser = () => typeof window !== "undefined";
const serverUrl = isBrowser() ? location.origin : "http://localhost:3000";
const baseUrl = (u) => `${(serverUrl || "/").replace(/\/+$/, "")}${u}`;

export function createToolRegistry({} = {}) {
  const tools = new Map();

  async function resolveParameters(t, ctx) {
    let p = t?.parameters;
    // If parameters is a function, call it with the context
    if (typeof p === "function") p = p.length > 0 ? await p(ctx) : await p();
    return p || { type: "object", properties: {} };
  }

  // ---- define tools ----
  function define(spec) {
    const {
      name,
      description = "",
      parameters = null,
      handler,
      stub = null,
      beforeRun = null,
      afterRun = null,
      runServer = null,
      run = null,
      safe = false,
      tags = [],
      plan = null,
      steps = null,
      output = null,
    } = spec || {};
    if (!name) throw new Error("Tool name required");

    const hasExec =
      typeof handler === "function" ||
      typeof stub === "function" ||
      typeof beforeRun === "function" ||
      typeof afterRun === "function" ||
      typeof runServer === "function" ||
      typeof run === "function" ||
      typeof steps === "function" ||
      typeof plan === "function";

    if (!hasExec)
      throw new Error(`Tool "${name}" requires a handler/stub or a plan`);
    if (tools.has(name)) throw new Error(`Tool already defined: ${name}`);

    tools.set(name, {
      name,
      description,
      parameters,
      handler,
      stub,
      beforeRun,
      afterRun,
      runServer,
      safe,
      tags,
      plan,
      run,
      steps,
      output,
    });
    return name;
  }

  function defineMany(dict) {
    if (!dict || typeof dict !== "object" || Array.isArray(dict)) {
      throw new Error("defineMany expects an object { name: spec }");
    }
    return Object.entries(dict).map(([name, spec]) =>
      define({ name, ...(spec || {}) })
    );
  }

  async function toOpenAITools(ctx = {}) {
    const specs = await Promise.all(
      list().map(async (t) => {
        const parameters = await resolveParameters(t, ctx);
        return {
          type: "function",
          function: {
            name: t.name,
            description: t.description || "",
            parameters,
          },
        };
      })
    );
    return specs;
  }

  function list() {
    return Array.from(tools.values());
  }
  function find(name) {
    return tools.get(name) || null;
  }

  function emitUIOnBus({ type, tool, runId, view = null, extra = null }) {
    bus.emit({
      ts: Date.now(),
      channel: "ui",
      type, // "ui:open" | "ui:update" | "ui:close" | "ui:loading" | ...
      name: tool,
      runId,
      payload: {
        tool,
        runId,
        ...(view || {}),
        ...(extra || {}),
      },
    });
  }

  function awaitUIResumeFromBus({
    runId,
    tool,
    timeoutMs = 0,
    predicate = null,
  }) {
    return new Promise((resolve, reject) => {
      let timer = null;
      const off = bus.on((ev) => {
        if (ev?.channel !== "ui" || ev?.type !== "ui:resume") return;
        const r = ev.runId || ev?.payload?.runId;
        const t = ev.name || ev?.payload?.tool;
        if (runId && r !== runId) return;
        if (tool && t && t !== tool) return;
        if (predicate && !predicate(ev)) return;

        off && off();

        if (timer) clearTimeout(timer);
        resolve(ev.payload || {});
      });
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          off && off();
          reject(new Error("ui:resume timeout"));
        }, timeoutMs);
      }
    });
  }

  function attachHelpersToCtx(ctx, { tool, runId }) {
    const emitUI = (evtOrView) => {
      // support both raw events and simple "view" objects
      if (
        evtOrView &&
        typeof evtOrView === "object" &&
        evtOrView.type?.startsWith?.("ui:")
      ) {
        emitUIOnBus({
          type: evtOrView.type,
          tool,
          runId,
          view: evtOrView.view || null,
          extra: evtOrView.payload || null,
        });
      } else {
        // treat as a view update by default
        emitUIOnBus({
          type: "ui:update",
          tool,
          runId,
          view: evtOrView || null,
        });
      }
    };

    // ergonomic helpers
    const $ui = {
      open: (view) => emitUIOnBus({ type: "ui:open", tool, runId, view }),
      update: (view) => emitUIOnBus({ type: "ui:update", tool, runId, view }),
      loading: (view) => emitUIOnBus({ type: "ui:loading", tool, runId, view }),
      close: () => emitUIOnBus({ type: "ui:close", tool, runId }),
      clear: () => emitUIOnBus({ type: "ui:close", tool, runId }),
      awaitResume: () => awaitUIResumeFromBus({ runId, tool }),
    };

    return Object.assign(ctx || {}, {
      emitUI,
      awaitUIResume: () => awaitUIResumeFromBus({ runId, tool }),
      $ui,
      $call: (name, args, ctx) => callSteps(name, args, ctx),
      $plan: async (toolName, planArgs, toolArgs) => {
        const res = await ctx.$call(
          "aiRequest",
          { force: true, toolName, ...planArgs },
          toolArgs
        );
        const response = res?.data?.tool_args;
        //console.log(items);
        return response;
      },
      $run: () => {},
    });
  }

  function makeRunId() {
    return (
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).substring(2, 8) +
      Math.random().toString(36).substring(2, 8)
    );
  }

  async function callSteps(name, args = {}, ctx = {}) {
    attachHelpersToCtx(ctx, { tool: name, runId: makeRunId() });
    // Try to find locally; if not found, try remote
    let steps;
    const tool = tools.get(name);
    if (!tool) {
      try {
        return callRemote(name, args, ctx);
      } catch (error) {
        return error;
      }
    }
    if (tool.steps) {
      steps =
        typeof tool.steps === "function"
          ? await tool.steps(args, ctx)
          : tool.steps;
    } else {
      const tool = tools.get(name);
      steps = [tool];
    }
    //console.log(steps);
    // execute steps sequentially and return a promise of the final result
    if (!steps || !Array.isArray(steps) || steps.length === 0)
      throw new Error(`Tool "${name}" has no steps to execute`);
    let lastResult = null;
    for (const step of steps) {
      if (!step || typeof step !== "object")
        throw new Error(`Invalid step in tool "${name}"`);
      // Each step gets the original args + the last result as input
      //const stepArgs = { ...args, ...(lastResult || {}) };
      // Each step gets a fresh runId for UI correlation
      //attachHelpersToCtx(ctx, { tool: step.name, runId: makeRunId() });
      //console.log("call step", step.name, stepArgs, ctx);
      //console.log(step);
      await callLocal(step, args, ctx).then((res) => {
        lastResult = res;
        return res;
      });
      //console.log("step result", lastResult);
    }
    return lastResult;
  }

  // high quality function with detailed idiomatic comments
  async function callLocal(tool, args = {}, ctx = {}) {
    // Found locally; validate args, run plan or handler as needed
    const schema = await resolveParameters(tool, ctx);
    let { stub, handler, beforeRun, afterRun, runServer, run } = tool;
    afterRun = afterRun || stub || null;
    runServer = runServer || handler || null;

    // If a plan is defined, run it instead of the normal flow
    const v = validate(schema, args);
    if (!v.ok) throw new Error(v.error);

    // If no plan, just run the handler/stub/beforeRun/afterRun as appropriate
    // beforeRun can return { async: true, runArgs: {...} } to indicate remote run
    let runArgs = args;
    if (typeof beforeRun === "function") {
      const hint = await beforeRun(v.value, ctx);
      runArgs = { ...runArgs, ...hint };
    }

    // If a execution function is defined, run it instead of the normal flow
    if (typeof run === "function") {
      //console.log("tool.run", tool.name, runArgs, ctx);
      return run(runArgs, ctx);
    }

    // If afterRun is defined, it takes precedence over local handler/stub
    if (typeof runServer === "function") {
      return callRemote(tool.name, runArgs, ctx).then((result) => {
        // Prefer server-supplied clean args/meta; strip _meta if needed
        if (typeof afterRun === "function")
          return afterRun(runArgs, { ...ctx, result });
        return result;
      });
      // If no server handler, just run afterRun locally with original args
    } else if (typeof afterRun === "function") {
      return afterRun(runArgs, ctx);
    }
  }

  async function callOptimistic(name, args = {}, ctx = {}) {
    const t = tools.get(name);
    if (!t) {
      try {
        return callRemote(name, args, ctx);
      } catch (error) {
        return error;
      }
    }
    // Found locally; validate args, run plan or handler as needed
    const schema = await resolveParameters(t, ctx);
    let { stub, handler, beforeRun, afterRun, runServer } = t;
    afterRun = afterRun || stub || null;
    runServer = runServer || handler || null;
    // If a plan is defined, run it instead of the normal flow
    const v = validate(schema, args);
    if (!v.ok) throw new Error(v.error);
    const optimistic = await beforeRun?.(v.value, ctx);
    const final = callRemote(name, args, ctx);
    return { ...optimistic, final };
  }

  // high quality function with detailed idiomatic comments
  async function callRemote(name, args = {}) {
    const urlString = `${baseUrl(`/rpc/${name}`)}`;
    const url = new URL(urlString);
    let res;
    try {
      res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args || {}),
        // keepalive: true, // for use in service workers and page unload
      });
    } catch (error) {
      throw new Error(`Network error: ${error.message || error}`);
    }
    if (!res) throw new Error("No response");
    const txt = await res.text();
    if (!res.ok)
      throw new Error(`HTTP ${res.status}: ${txt || res.statusText}`);

    const json = txt ? JSON.parse(txt) : null;
    if (json && typeof json === "object" && json.error)
      throw new Error(String(json.error));

    return json;
  }

  function attach(
    router,
    { prefix = "/rpc", events = true, uiIngest = true } = {}
  ) {
    router.get(prefix, () => ({ tools: Array.from(tools.keys()) }));

    router.get(`${prefix}/tools`, async (_args, ctx) => ({
      tools: await toOpenAITools(ctx),
    }));

    for (const t of tools.values()) {
      const url = `${prefix}/${t.name}`;

      router.post(url, async (args, ctx) => {
        const semanticCache = await import("./ToolCache.js").then((m) =>
          m.getSemanticCache()
        );
        const paramSchema = await resolveParameters(t, ctx);
        const v = validate(paramSchema, args || {});
        if (!v.ok) return { status: 400, json: { error: v.error } };
        let result;
        if (t.useSemanticCache || true) {
          const res = await semanticCache.getOrCompute(
            { tool: t.name, value: v.value },
            async () => {
              //console.log("Tool exec", t.name, v.value);
              // your slow logic here (LLM call, external API, DB)
              return await (t.handler || t.stub || t.runServer || t.afterRun)(
                v.value,
                ctx
              );
            },
            { ttlMs: 30 * 60 * 1000, threshold: 0.999 }
          );
          result = res.result;
        } else {
          result = await (t.handler || t.stub || t.runServer || t.afterRun)(
            v.value,
            ctx
          );
        }
        return { status: 200, json: result ?? {} };
      });
      if (t.safe) {
        router.get(url, async (args, ctx) => {
          const schema = await resolveParameters(t, ctx);
          const v = validate(schema, args || {});
          if (!v.ok) return { status: 400, json: { error: v.error } };

          const result = await (t.handler || t.stub)(v.value, ctx);
          return { status: 200, json: result ?? {} };
        });
      }
    }

    // Run status (used by awaiter polling)
    router.get(`${prefix}/runs/:id`, (args) => {
      const id = args?.params?.id || args?.id;
      const run = getRun(id);
      if (!run) return { status: 404, json: { error: "Not found" } };
      return { status: 200, json: run };
    });
  }

  const api = {
    define,
    defineMany,
    list,
    find,
    callLocal,
    $call: callSteps,
    $optimistic: callOptimistic,
    attach,
    toOpenAITools,
  };
  return api;
}

// ---------- singleton helpers ----------
export function getToolRegistry(opts = {}) {
  const KEY = Symbol.for("@loki/minihttp:tool-registry");
  return getGlobalSingleton(KEY, () => createToolRegistry(opts));
}
export const toolRegistry = getToolRegistry();
