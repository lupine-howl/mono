// Core registry (tool defs, local/remote calls, async runs, RPC + OpenAPI)
// Uses plan-runner (pure) and @loki/events/util (singleton bus + SSE + client)

import { getGlobalSingleton } from "@loki/utilities";
import { validate } from "./validation.js";
import { isPlanTool, makePlan, runPlan } from "./plan-runner.js";
import {
  getGlobalEventBus,
  mountEventsSSE,
  mountEventsIngest,
  createEventsClient,
} from "@loki/events/util";

const isBrowser = () => typeof window !== "undefined";

export function createToolRegistry({
  title = "Tools",
  version = "0.1.0",
  serverUrl = isBrowser() ? location.origin : "/",
  eventsPath = "/rpc/events",
  uiEventsPath = "/rpc/ui-events",
} = {}) {
  const tools = new Map();

  // ---- run manager ----
  const runs = new Map(); // id -> { id, name, args, status, result?, error?, startedAt, endedAt? }
  const bus = getGlobalEventBus(); // singleton (server app; per-tab on client)

  function onRun(fn) {
    return bus.on(fn);
  }

  function onRunKeyed(key, fn) {
    return bus.onKey(`run:${key}`, fn);
  }

  function emitRun(event) {
    // normalized envelope
    bus.emit({
      ts: Date.now(),
      channel: "run",
      ...event,
    });
  }

  function createRunId() {
    return (
      "run_" + Math.random().toString(36).slice(2) + Date.now().toString(36)
    );
  }
  function getRun(id) {
    return runs.get(id) || null;
  }

  function startAsyncRun(t, name, args, ctx) {
    const id = createRunId();
    const record = { id, name, args, status: "running", startedAt: Date.now() };
    runs.set(id, record);
    emitRun({ type: "run:started", runId: id, name, args });

    (async () => {
      try {
        const result = await _runToolImpl(t, name, args, { ...ctx, runId: id });
        record.status = "done";
        record.result = result ?? {};
        record.endedAt = Date.now();
        emitRun({
          type: "run:finished",
          runId: id,
          name,
          result: record.result,
        });
      } catch (err) {
        record.status = "error";
        record.error = String(err?.message || err);
        record.endedAt = Date.now();
        emitRun({ type: "run:error", runId: id, name, error: record.error });
      }
    })();

    return id;
  }

  // ---- plan + single-step common impl ----
  async function _runToolImpl(t, name, args, ctx) {
    if (isPlanTool(t)) {
      const plan = makePlan(t, args, ctx);
      return await runPlan(api, plan, {
        initialArgs: args,
        ctx,
        parentTool: name,
        toolSpec: t,
      });
    }
    const runServer = t.runServer || t.handler || t.afterRun || t.stub;
    return await runServer(args, ctx);
  }

  // ---- parameters helper (supports function schema) ----
  async function resolveParameters(t, ctx) {
    let p = t?.parameters;
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
      safe = false,
      tags = [],
      plan = null,
      output = null,
    } = spec || {};
    if (!name) throw new Error("Tool name required");

    const hasExec =
      typeof handler === "function" ||
      typeof stub === "function" ||
      typeof beforeRun === "function" ||
      typeof afterRun === "function" ||
      typeof runServer === "function" ||
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

  // ---- browser events client (SSE + poll + UI emit) ----
  const baseUrl = (u) => `${(serverUrl || "/").replace(/\/+$/, "")}${u}`;
  const eventsClient = isBrowser()
    ? createEventsClient({
        eventsUrl: baseUrl(eventsPath),
        ingestUrl: baseUrl(uiEventsPath),
        fetchRunStatus: async (runId) => {
          const res = await fetch(
            baseUrl(`/rpc/runs/${encodeURIComponent(runId)}`),
            {
              headers: { Accept: "application/json" },
            }
          );
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        },
      })
    : null;

  async function waitForLocalFinal(runId) {
    return new Promise((resolve, reject) => {
      const current = getRun(runId);
      if (current) {
        if (current.status === "done") return resolve(current.result ?? {});
        if (current.status === "error")
          return reject(new Error(current.error || "run error"));
      }
      const off = onRun((ev) => {
        if (ev.runId !== runId) return;
        if (ev.type === "run:finished") {
          off();
          resolve(ev.result ?? {});
        } else if (ev.type === "run:error") {
          off();
          reject(new Error(ev.error || "run error"));
        }
      });
    });
  }

  // ---- remote call helper (browser) ----
  async function callRemote(name, args = {}) {
    if (!isBrowser() || typeof fetch !== "function") {
      throw new Error("Remote calls not supported in this environment");
    }
    const url = new URL(baseUrl(`/rpc/${name}`));
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args || {}),
    });
    const txt = await res.text();
    if (!res.ok)
      throw new Error(`HTTP ${res.status}: ${txt || res.statusText}`);

    const json = txt ? JSON.parse(txt) : null;
    if (json && typeof json === "object" && json.error)
      throw new Error(String(json.error));

    // Attach .final for async accepts
    if (json && json.runId) {
      Object.defineProperty(json, "final", {
        enumerable: false,
        value: eventsClient
          ? eventsClient.awaitFinal(json.runId).then(
              (result) => result,
              (err) => ({ ok: false, error: String(err?.message || err) })
            )
          : Promise.resolve({ ok: false, error: "No events client" }),
      });
    }
    return json;
  }

  // ---- core callLocal (single-step + plan) ----
  async function callLocal(name, args = {}, ctx = {}) {
    const t = tools.get(name);
    if (!t) {
      try {
        return callRemote(name, args, ctx);
      } catch (error) {
        return error;
      }
    }

    // Plan tools
    if (isPlanTool(t)) {
      if (typeof t.beforeRun === "function") {
        const hint = await t.beforeRun(args, ctx);
        if (hint && typeof hint === "object" && hint.async) {
          if (isBrowser()) {
            return callRemote(
              name,
              {
                ...(hint.runArgs ?? args),
                __async: true,
                __optimistic: hint.optimistic ?? null,
              },
              ctx
            );
          }
          const runId = startAsyncRun(t, name, hint.runArgs ?? args, ctx);
          const out = {
            runId,
            status: "accepted",
            optimistic: hint.optimistic ?? null,
          };
          Object.defineProperty(out, "final", {
            enumerable: false,
            value: waitForLocalFinal(runId).catch((err) => ({
              ok: false,
              error: String(err?.message || err),
            })),
          });
          return out;
        }
        if (hint && typeof hint === "object") args = hint;
      }

      const plan = makePlan(t, args, ctx);
      const final = await runPlan(api, plan, {
        initialArgs: args,
        ctx,
        parentTool: name,
        toolSpec: t,
      });
      return final;
    }

    // Single-step tools (validate)
    const schema = await resolveParameters(t, ctx);
    let { stub, handler, beforeRun, afterRun, runServer } = t;
    afterRun = afterRun || stub || null;
    runServer = runServer || handler || null;

    const v = validate(schema, args);
    if (!v.ok) throw new Error(v.error);

    if (typeof beforeRun === "function") {
      const hint = await beforeRun(v.value, ctx);
      if (hint && typeof hint === "object" && hint.async) {
        if (isBrowser() && typeof runServer === "function") {
          return callRemote(
            name,
            {
              ...(hint.runArgs ?? v.value),
              __async: true,
              __optimistic: hint.optimistic ?? null,
            },
            ctx
          );
        }
        const runId = startAsyncRun(t, name, hint.runArgs ?? v.value, ctx);
        const out = {
          runId,
          status: "accepted",
          optimistic: hint.optimistic ?? null,
        };
        Object.defineProperty(out, "final", {
          enumerable: false,
          value: isBrowser()
            ? eventsClient
              ? eventsClient.awaitFinal(runId).then(
                  (result) => result,
                  (err) => ({ ok: false, error: String(err?.message || err) })
                )
              : Promise.resolve({ ok: false, error: "No events client" })
            : waitForLocalFinal(runId).catch((err) => ({
                ok: false,
                error: String(err?.message || err),
              })),
        });
        return out;
      }
      if (hint && typeof hint === "object") args = hint;
    }

    if (isBrowser()) {
      let runArgs = args;
      if (typeof runServer === "function") {
        return callRemote(name, runArgs, ctx).then((result) => {
          if (typeof afterRun === "function")
            return afterRun(runArgs, { ...ctx, result });
          return result;
        });
      } else if (typeof afterRun === "function") {
        return afterRun(runArgs, ctx);
      }
    } else if (typeof runServer === "function") {
      return runServer(args, ctx);
    }
  }

  // ---- RPC + OpenAPI attach ----
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
        const paramSchema = await resolveParameters(t, ctx);
        const v = validate(paramSchema, args || {});
        if (!v.ok) return { status: 400, json: { error: v.error } };

        const wantsAsync = !!args?.__async;

        if (isPlanTool(t)) {
          try {
            if (wantsAsync) {
              let runArgs = v.value;
              let optimistic = args?.__optimistic ?? null;
              if (typeof t.beforeRun === "function") {
                const hint = await t.beforeRun(runArgs, ctx);
                if (hint && typeof hint === "object") {
                  if (hint.runArgs) runArgs = hint.runArgs;
                  if ("optimistic" in hint && optimistic == null)
                    optimistic = hint.optimistic;
                }
              }
              const runId = startAsyncRun(t, t.name, runArgs, ctx);
              return { status: 202, json: { runId, optimistic } };
            }
            const plan = makePlan(t, v.value, ctx);
            const final = await runPlan(api, plan, {
              initialArgs: v.value,
              ctx,
              parentTool: t.name,
              toolSpec: t,
            });
            return { status: 200, json: final ?? {} };
          } catch (err) {
            return {
              status: 500,
              json: { error: String(err?.message || err) },
            };
          }
        }

        if (wantsAsync) {
          let runArgs = v.value;
          let optimistic = args?.__optimistic ?? null;
          if (typeof t.beforeRun === "function") {
            const hint = await t.beforeRun?.(runArgs, ctx); // ✅ correct reference
            if (hint && typeof hint === "object") {
              if (hint.runArgs) runArgs = hint.runArgs;
              if ("optimistic" in hint && optimistic == null)
                optimistic = hint.optimistic;
            }
          }
          const runId = startAsyncRun(t, t.name, runArgs, ctx);
          return { status: 202, json: { runId, optimistic } };
        }

        const result = await (t.handler || t.stub || t.runServer || t.afterRun)(
          v.value,
          ctx
        );
        return { status: 200, json: result ?? {} };
      });

      if (t.safe) {
        router.get(url, async (args, ctx) => {
          const schema = await resolveParameters(t, ctx);
          const v = validate(schema, args || {});
          if (!v.ok) return { status: 400, json: { error: v.error } };

          if (isPlanTool(t)) {
            try {
              const plan = makePlan(t, v.value, ctx);
              const final = await runPlan(api, plan, {
                initialArgs: v.value,
                ctx,
                parentTool: t.name,
                toolSpec: t,
              });
              return { status: 200, json: final ?? {} };
            } catch (err) {
              return {
                status: 500,
                json: { error: String(err?.message || err) },
              };
            }
          }

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

    if (events) mountEventsSSE(router, { path: eventsPath, bus });
    if (uiIngest) mountEventsIngest(router, { path: uiEventsPath, bus });
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

  async function awaitFinal(runId) {
    if (isBrowser()) return eventsClient?.awaitFinal(runId);
    return waitForLocalFinal(runId);
  }

  async function $auto(name, args, apply) {
    const r = await api.$call(name, args);
    // apply optimistic first if present
    if (apply && r && r.optimistic) {
      try {
        apply(r.optimistic);
      } catch {}
    }
    // apply immediate final (sync cases)
    if (apply && r && r.ok) {
      try {
        apply(r);
      } catch {}
    }
    // later: apply true final
    r?.final?.then((fin) => {
      try {
        if (fin?.ok || fin?.data) apply?.(fin);
      } catch {}
    });
    return r;
  }

  const api = {
    define,
    defineMany,
    list,
    find,
    callLocal,
    $call: callLocal,
    attach,
    toOpenAITools,
    runPlan: (steps, opts = {}) => runPlan(api, steps, opts),
    onRun,
    onRunKeyed,
    getRun,
    awaitFinal,
    $auto,
  };
  return api;
}

// ---------- singleton helpers ----------
export function getToolRegistry(opts = {}) {
  const KEY = Symbol.for("@loki/minihttp:tool-registry");
  return getGlobalSingleton(KEY, () => createToolRegistry(opts));
}
export const toolRegistry = getToolRegistry();
