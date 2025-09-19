// src/registry/isomorphic-tool-registry.js
import { getGlobalSingleton } from "@loki/utilities";
import { validate } from "./validation.js";
import { isPlanTool, makePlan, runPlan } from "./plan-runner.js";

const isBrowser = () => typeof window !== "undefined";

export function createToolRegistry({
  title = "Tools",
  version = "0.1.0",
  serverUrl = isBrowser() ? location.origin : "/",
} = {}) {
  const tools = new Map();

  // ---------------- In-memory run manager ----------------
  const runs = new Map(); // runId -> { id, name, args, status, result?, error?, startedAt, endedAt? }
  const listeners = new Set(); // fn(event)

  function emit(event) {
    for (const fn of listeners) {
      try {
        fn(event);
      } catch {}
    }
  }
  function onRun(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
  function createRunId() {
    return (
      "run_" + Math.random().toString(36).slice(2) + Date.now().toString(36)
    );
  }

  async function resolveParameters(t, ctx) {
    let p = t?.parameters;
    if (typeof p === "function") p = p.length > 0 ? await p(ctx) : await p();
    return p || { type: "object", properties: {} };
  }

  // ---------------- Tool definition ----------------
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

  // ---------------- Shared async runner ----------------
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

  function startAsyncRun(t, name, args, ctx) {
    const id = createRunId();
    const record = { id, name, args, status: "running", startedAt: Date.now() };
    runs.set(id, record);
    emit({ type: "run:started", runId: id, name, args });

    (async () => {
      try {
        const result = await _runToolImpl(t, name, args, { ...ctx, runId: id });
        record.status = "done";
        record.result = result ?? {};
        record.endedAt = Date.now();
        emit({ type: "run:finished", runId: id, name, result: record.result });
      } catch (err) {
        record.status = "error";
        record.error = String(err?.message || err);
        record.endedAt = Date.now();
        emit({ type: "run:error", runId: id, name, error: record.error });
      }
    })();

    return id;
  }

  function getRun(id) {
    return runs.get(id) || null;
  }

  // ---------------- Browser SSE client & helpers (isomorphic safe) ----------------
  const _hasSSE = isBrowser() && "EventSource" in window;
  let _es = null;
  const _pending = new Map(); // runId -> { resolve, reject, promise }

  function _baseUrl(u) {
    const b = (serverUrl || "/").replace(/\/+$/, "");
    return `${b}${u}`;
  }

  function _ensureEventSource() {
    if (!_hasSSE || _es) return;
    _es = new EventSource(_baseUrl("/rpc/events"));
    _es.addEventListener("run:finished", (e) => {
      try {
        const ev = JSON.parse(e.data);
        const p = _pending.get(ev.runId);
        if (p) {
          p.resolve(ev.result);
          _pending.delete(ev.runId);
        }
      } catch {}
    });
    _es.addEventListener("run:error", (e) => {
      try {
        const ev = JSON.parse(e.data);
        const p = _pending.get(ev.runId);
        if (p) {
          p.reject(new Error(ev.error || "run error"));
          _pending.delete(ev.runId);
        }
      } catch {}
    });
    // optional: handle network errors silently; EventSource auto-reconnects
  }

  async function _pollRun(
    runId,
    { signal, interval = 600, max = 5000, timeout = 30000 } = {}
  ) {
    const t0 = Date.now();
    let delay = interval;
    while (true) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const res = await fetch(
        _baseUrl(`/rpc/runs/${encodeURIComponent(runId)}`),
        { signal }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json?.status === "done") return json.result;
      if (json?.status === "error") throw new Error(json.error || "run error");
      if (Date.now() - t0 > timeout)
        throw new Error("Timed out waiting for run");
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(max, Math.ceil(delay * 1.5));
    }
  }

  function _awaitFinal(runId) {
    // Prefer SSE; fall back to polling automatically
    if (_hasSSE) {
      _ensureEventSource();
      const existing = _pending.get(runId);
      if (existing) return existing.promise;
      let resolve, reject;
      const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });
      _pending.set(runId, { resolve, reject, promise });
      // Backstop with polling if SSE doesn't deliver within 35s (e.g., corporate proxy)
      const ctl = new AbortController();
      setTimeout(() => {
        if (_pending.has(runId)) {
          _pollRun(runId, { signal: ctl.signal })
            .then((r) => {
              const p = _pending.get(runId);
              if (p) {
                p.resolve(r);
                _pending.delete(runId);
              }
            })
            .catch((err) => {
              const p = _pending.get(runId);
              if (p) {
                p.reject(err);
                _pending.delete(runId);
              }
            });
        }
      }, 35000);
      return promise;
    }
    // No SSE available: pure polling
    return _pollRun(runId);
  }

  // ---------------- callLocal ----------------
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
      // Allow beforeRun to request async + optimistic
      if (typeof t.beforeRun === "function") {
        const hint = await t.beforeRun(args, ctx);
        if (hint && typeof hint === "object" && hint.async) {
          const runId = startAsyncRun(t, name, hint.runArgs ?? args, ctx);
          const out = {
            runId,
            status: "accepted",
            optimistic: hint.optimistic ?? null,
          };
          if (isBrowser()) {
            Object.defineProperty(out, "final", {
              enumerable: false,
              value: _awaitFinal(runId).then(
                (result) => result,
                (err) => ({ ok: false, error: String(err?.message || err) })
              ),
            });
          }
          return out;
        }
        if (hint && typeof hint === "object") args = hint; // transform args
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
        // In browser, prefer remote so server does the heavy work
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
        if (isBrowser()) {
          Object.defineProperty(out, "final", {
            enumerable: false,
            value: _awaitFinal(runId).then(
              (result) => result,
              (err) => ({ ok: false, error: String(err?.message || err) })
            ),
          });
        }
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

  // ---------------- callRemote (browser) ----------------
  async function callRemote(name, args = {}) {
    if (!isBrowser() || typeof fetch !== "function") {
      throw new Error("Remote calls not supported in this environment");
    }
    const url = new URL(_baseUrl(`/rpc/${name}`));
    const init = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args || {}),
    };
    const res = await fetch(url.toString(), init);
    const txt = await res.text();
    if (!res.ok)
      throw new Error(`HTTP ${res.status}: ${txt || res.statusText}`);

    const json = txt ? JSON.parse(txt) : null;
    if (json && typeof json === "object" && json.error)
      throw new Error(String(json.error));

    // If async accepted, attach .final promise automatically
    if (json && json.runId) {
      Object.defineProperty(json, "final", {
        enumerable: false,
        value: _awaitFinal(json.runId).then(
          (result) => result,
          (err) => ({ ok: false, error: String(err?.message || err) })
        ),
      });
    }
    return json;
  }

  // ---------------- Server attach (RPC + SSE + status) ----------------
  function attach(router, { prefix = "/rpc" } = {}) {
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

        // Plans
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

        // Single-step
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

    // Run status
    router.get(`${prefix}/runs/:id`, (args) => {
      const id = args?.params?.id || args?.id;
      const run = getRun(id);
      if (!run) return { status: 404, json: { error: "Not found" } };
      return { status: 200, json: run };
    });

    // SSE stream of run events
    router.get(`${prefix}/events`, (_args, ctx) => {
      const res = ctx?.res || ctx; // adapt to router
      // Required SSE headers
      res.writeHead?.(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      const write = (event, data) => {
        if (event) res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      // hello + heartbeat
      write("hello", { ok: true });
      const hb = setInterval(() => res.write(`:keepalive\n\n`), 15000);

      // forward onRun bus
      const off = onRun((ev) => write(ev.type, ev));

      const done = () => {
        clearInterval(hb);
        off();
        try {
          res.end();
        } catch {}
      };
      res.on?.("close", done);
      res.on?.("finish", done);

      // Tell router we're streaming; no auto JSON
      return { status: 200 };
    });
  }

  // ---------------- OpenAI / OpenAPI ----------------
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

  async function toOpenApi({ prefix = "/rpc" } = {}) {
    const paths = {};
    for (const t of tools.values()) {
      const p = `${prefix}/${t.name}`;
      const base = {
        operationId: t.name,
        summary: t.description,
        tags: t.tags?.length ? t.tags : undefined,
        responses: {
          200: { description: "OK" },
          202: { description: "Accepted (async)" },
        },
      };
      paths[p] ||= {};

      const paramSchema = await resolveParameters(t);

      paths[p].post = {
        ...base,
        requestBody: paramSchema
          ? {
              required: true,
              content: { "application/json": { schema: paramSchema } },
            }
          : undefined,
      };

      if (t.safe) {
        const params = paramSchema?.properties
          ? Object.entries(paramSchema.properties).map(([name, schema]) => ({
              name,
              in: "query",
              required: (paramSchema.required || []).includes(name),
              schema,
            }))
          : undefined;
        paths[p].get = { ...base, parameters: params };
      }
    }

    // run status
    paths[`${prefix}/runs/{id}`] = {
      get: {
        operationId: "getRunStatus",
        summary: "Get async run status/result",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: { description: "OK" },
          404: { description: "Not found" },
        },
      },
    };

    // events (SSE)
    paths[`${prefix}/events`] = {
      get: {
        operationId: "subscribeRunEvents",
        summary: "Server-Sent Events stream of run lifecycle events",
        responses: { 200: { description: "SSE stream" } },
      },
    };

    return {
      openapi: "3.0.3",
      info: { title, version },
      servers: [{ url: serverUrl }],
      paths,
    };
  }

  function mountOpenApi(
    router,
    path = "/openapi.json",
    { prefix = "/rpc" } = {}
  ) {
    router.get(path, async () => ({
      status: 200,
      json: await toOpenApi({ prefix }),
    }));
  }

  // ---------------- misc ----------------
  function list() {
    return Array.from(tools.values());
  }
  function find(name) {
    return tools.get(name) || null;
  }

  // convenience: await final result by id
  async function awaitFinal(runId) {
    return _awaitFinal(runId);
  }

  // convenience: auto-apply handler (optional for consumers)
  async function $auto(name, args, apply) {
    const r = await api.$call(name, args);
    const seed = r.ok ? r : r.optimistic;
    if (apply && seed?.ok) apply(seed);
    r.final?.then((fin) => fin?.ok && apply?.(fin));
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
    toOpenApi,
    mountOpenApi,
    runPlan: (steps, opts = {}) => runPlan(api, steps, opts),
    // Run manager surface
    onRun,
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
