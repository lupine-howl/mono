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

  // ---- parameters resolver (object or (async) function, optional ctx) ----
  async function resolveParameters(t, ctx) {
    let p = t?.parameters;
    if (typeof p === "function") {
      // If the function accepts an argument, pass ctx; otherwise call with no args
      p = p.length > 0 ? await p(ctx) : await p();
    }
    return p || { type: "object", properties: {} };
  }

  // ---------- define ----------
  function define(spec) {
    const {
      name,
      description = "",
      parameters = null, // object or (async) (ctx)=>object
      handler,
      stub = null,
      beforeRun = null,
      afterRun = null,
      runServer = null,
      safe = false,
      tags = [],
      plan = null, // (args, ctx) => Step[]
      output = null, // async (ctx, lastResult) => any
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

  // ---------- callLocal ----------
  async function callLocal(name, args = {}, ctx = {}) {
    const t = tools.get(name);
    if (!t) {
      try {
        return callRemote(name, args, ctx);
      } catch (error) {
        return error; // preserve original behavior
      }
    }

    // Plan tools
    if (isPlanTool(t)) {
      // (Optionally validate plan args too — uncomment next 3 lines if desired)
      // const schema = await resolveParameters(t, ctx);
      // const vv = validate(schema, args || {});
      // if (!vv.ok) throw new Error(vv.error);

      const plan = makePlan(t, args, ctx);
      const final = await runPlan(api, plan, {
        initialArgs: args,
        ctx,
        parentTool: name,
        toolSpec: t,
      });
      return final;
    }

    // Single-step tools (validate against resolved schema)
    const schema = await resolveParameters(t, ctx);
    let { stub, handler, beforeRun, afterRun, runServer } = t;
    afterRun = afterRun || stub || null;
    runServer = runServer || handler || null;
    const v = validate(schema, args);
    if (!v.ok) throw new Error(v.error);

    if (isBrowser()) {
      let runArgs = v.value;
      if (typeof beforeRun === "function") {
        const mod = await beforeRun(v.value, ctx);
        if (mod && typeof mod === "object") runArgs = mod;
      }
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
      return runServer(v.value, ctx);
    }
  }

  // ---------- callRemote ----------
  async function callRemote(name, args = {}) {
    if (!isBrowser() || typeof fetch !== "function") {
      throw new Error("Remote calls not supported in this environment");
    }

    const base = (serverUrl || "/").replace(/\/+$/, "");
    const url = new URL(`${base}/rpc/${name}`);

    // Always POST JSON
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
    if (json && typeof json === "object" && json.error) {
      throw new Error(String(json.error));
    }
    return json;
  }

  // ---------- server attach / OpenAI / OpenAPI ----------
  function attach(router, { prefix = "/rpc" } = {}) {
    router.get(prefix, () => ({ tools: Array.from(tools.keys()) }));

    // tools listing (OpenAI tools) must be async now
    router.get(`${prefix}/tools`, async (_args, ctx) => ({
      tools: await toOpenAITools(ctx),
    }));

    for (const t of tools.values()) {
      const url = `${prefix}/${t.name}`;

      router.post(url, async (args, ctx) => {
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
  }

  // now async — returns Promise<OpenAI.Tool[]>
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

  // now async — resolves parameter schemas for OpenAPI too
  async function toOpenApi({ prefix = "/rpc" } = {}) {
    const paths = {};
    for (const t of tools.values()) {
      const p = `${prefix}/${t.name}`;
      const base = {
        operationId: t.name,
        summary: t.description,
        tags: t.tags?.length ? t.tags : undefined,
        responses: { 200: { description: "OK" } },
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

  // ---------- misc ----------
  function list() {
    return Array.from(tools.values());
  }
  function find(name) {
    return tools.get(name) || null;
  }

  const api = {
    define,
    defineMany,
    list,
    find,
    callLocal,
    $call: callLocal,
    attach,
    toOpenAITools, // async
    toOpenApi, // async
    mountOpenApi,
    // Pass-throughs for advanced usage/testing:
    runPlan: (steps, opts = {}) => runPlan(api, steps, opts),
  };
  return api;
}

// ---------- singleton helpers ----------
export function getToolRegistry(opts = {}) {
  const KEY = Symbol.for("@loki/minihttp:tool-registry");
  return getGlobalSingleton(KEY, () => createToolRegistry(opts));
}
export const toolRegistry = getToolRegistry();
