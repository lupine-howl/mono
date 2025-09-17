// isomorphic-tool-registry.js
import { getGlobalSingleton } from "@loki/utilities";

const PRIMS = new Set(["string", "number", "integer", "boolean", "null"]);
const isBrowser = () => typeof window !== "undefined";

export function createToolRegistry({
  title = "Tools",
  version = "0.1.0",
  serverUrl = isBrowser() ? location.origin : "/",
} = {}) {
  const tools = new Map();

  // ---------- define ----------
  function define(spec) {
    const {
      name,
      description = "",
      parameters = null,
      handler,
      stub = null,
      safe = false,
      tags = [],
      // plan support
      plan = null, // (args, ctx) => Step[]
      steps = null, // Step[]
      chain = null, // function | Step[] (legacy)
      output = null, // async (ctx, lastResult) => any (tool-level finaliser)
    } = spec || {};
    if (!name) throw new Error("Tool name required");

    const hasExec =
      typeof handler === "function" ||
      typeof stub === "function" ||
      typeof plan === "function" ||
      Array.isArray(steps) ||
      typeof chain === "function" ||
      Array.isArray(chain);

    if (!hasExec) {
      throw new Error(
        `Tool "${name}" requires a handler/stub or a plan/steps/chain`
      );
    }
    if (tools.has(name)) throw new Error(`Tool already defined: ${name}`);

    tools.set(name, {
      name,
      description,
      parameters,
      handler,
      stub,
      safe,
      tags,
      plan,
      steps,
      chain,
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

  // ---------- validation ----------
  function validate(schema, source) {
    if (!schema || schema.type !== "object")
      return { ok: true, value: source || {} };

    const props = schema.properties || {};
    const req = new Set(schema.required || []);
    const out = {};

    for (const key of Object.keys(props)) {
      const def = props[key] || {};
      let v = source?.[key];

      if (v === undefined) {
        if (req.has(key))
          return { ok: false, error: `Missing required: ${key}` };
        continue;
      }

      // Coerce common query-string-ish values
      if (typeof v === "string") {
        if (def.type === "number" || def.type === "integer") {
          const n = Number(v);
          if (Number.isNaN(n))
            return { ok: false, error: `Invalid number: ${key}` };
          v = n;
        } else if (def.type === "boolean") {
          const s = v.toLowerCase();
          if (s === "true" || s === "1") v = true;
          else if (s === "false" || s === "0") v = false;
        } else if (
          (def.type === "object" || def.type === "array") &&
          /^[{\[]/.test(v.trim())
        ) {
          try {
            v = JSON.parse(v);
          } catch {}
        }
      }

      // Union with null: type: ["string","null"]
      if (Array.isArray(def.type)) {
        const allowsNull = def.type.includes("null");
        if (v === null && allowsNull) {
          out[key] = v;
          continue;
        }
        const primary = def.type.find((t) => t !== "null") || def.type[0];
        if (!checkPrim(primary, v))
          return { ok: false, error: `Expected ${primary}: ${key}` };
        out[key] = v;
        continue;
      }

      if (PRIMS.has(def.type)) {
        if (!checkPrim(def.type, v))
          return { ok: false, error: `Expected ${def.type}: ${key}` };
      }
      out[key] = v;
    }
    return { ok: true, value: out };
  }

  function checkPrim(type, v) {
    if (type === "null") return v === null;
    if (type === "integer") return Number.isInteger(v);
    if (type === "number") return typeof v === "number" && Number.isFinite(v);
    if (type === "boolean") return typeof v === "boolean";
    if (type === "string") return typeof v === "string";
    return true; // object/array/etc. not deeply validated here
  }

  // ---------- plan runner helpers ----------
  function isPlanTool(t) {
    return !!(t?.plan || t?.steps || t?.chain);
  }

  // Normalise a tool's plan into Step[]
  function makePlan(t, args, ctx) {
    if (typeof t?.plan === "function") return t.plan(args, ctx) || [];
    if (Array.isArray(t?.steps)) return t.steps;
    if (typeof t?.chain === "function") return t.chain(args, ctx) || [];
    if (Array.isArray(t?.chain)) return t.chain;
    return [];
  }

  /**
   * Resolve args for a step from the following (in priority order):
   *  1) step.input (object | (ctx, initialArgs) => object)
   *  2) step.with   (object | (ctx, initialArgs) => object)  // alias
   *  3) step.args   (static object)
   *  4) step.argTransform(prevResult, ctx, initialArgs)      // legacy
   */
  function resolveStepArgs(step, ctx, lastResult, initialArgs) {
    if ("input" in (step || {})) {
      return typeof step.input === "function"
        ? step.input(ctx, initialArgs)
        : step.input || {};
    }
    if ("with" in (step || {})) {
      return typeof step.with === "function"
        ? step.with(ctx, initialArgs)
        : step.with || {};
    }
    if (step?.args) return step.args;
    if (typeof step?.argTransform === "function") {
      return step.argTransform(lastResult, ctx, initialArgs) || {};
    }
    return {};
  }

  /**
   * Execute a plan locally. Final return precedence (all awaited):
   *   1) toolSpec.output(ctx, lastResult)
   *   2) lastStep.output(ctx, lastResult)
   *   3) lastResult
   * If you need the full context, put it inside your own return shape.
   */
  async function runPlan(
    registry,
    steps,
    { initialArgs = {}, ctx = {}, parentTool = "", toolSpec = null } = {}
  ) {
    const outCtx = { ...ctx, $input: initialArgs, $results: [] };
    let last = null;

    for (const step of steps || []) {
      const toolName = step?.tool;
      if (!toolName || typeof toolName !== "string") {
        throw new Error(`Invalid plan step in "${parentTool}": missing "tool"`);
      }

      const stepArgs = resolveStepArgs(step, outCtx, last, initialArgs);
      const stepCtx = { ...outCtx, step, planParent: parentTool };

      const res = await registry.callLocal(toolName, stepArgs, stepCtx);

      if (step?.label) outCtx[step.label] = res;
      outCtx.$results.push({ tool: toolName, label: step?.label, result: res });
      last = res;

      if (res && typeof res === "object" && "ok" in res && !res.ok) {
        const msg = res.error || `Step "${toolName}" failed`;
        const e = new Error(msg);
        e.step = step;
        e.result = res;
        throw e;
      }
    }

    // Decide the final value (allow async)
    const lastStep = steps?.[steps.length - 1];
    let finalVal = last;

    if (toolSpec?.output && typeof toolSpec.output === "function") {
      finalVal = await toolSpec.output(outCtx, last);
    } else if (lastStep?.output && typeof lastStep.output === "function") {
      finalVal = await lastStep.output(outCtx, last);
    }

    return finalVal ?? outCtx;
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
      const plan = makePlan(t, args, ctx);
      const final = await runPlan(api, plan, {
        initialArgs: args,
        ctx,
        parentTool: name,
        toolSpec: t,
      });
      return final;
    }

    // Single-step tools
    const { parameters, stub, handler } = t;
    const v = validate(parameters, args);
    if (!v.ok) throw new Error(v.error);

    if (isBrowser()) {
      if (typeof handler === "function") {
        return callRemote(name, v.value, ctx).then((result) => {
          if (typeof stub === "function")
            return stub(v.value, { ...ctx, result });
          return result;
        });
      }
      if (typeof stub === "function") return stub(v.value, ctx);
    } else if (typeof handler === "function") {
      return handler(v.value, ctx);
    }
    // No viable path -> undefined (same as original semantics)
  }

  // ---------- callRemote ----------
  async function callRemote(name, args = {}) {
    if (!isBrowser() || typeof fetch !== "function") {
      throw new Error("Remote calls not supported in this environment");
    }

    const known = tools.get(name) || null;
    const safe = !!known?.safe;

    const base = (serverUrl || "/").replace(/\/+$/, "");
    const url = new URL(`${base}/rpc/${name}`);

    // Keep original behavior: always POST JSON
    const init = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args || {}),
    };

    // If you later want GET for safe tools:
    // if (safe) { init.method = "GET"; init.headers = {}; for (const [k, v] of Object.entries(args || {})) { if (v != null) url.searchParams.set(k, String(v)); } delete init.body; }

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

  // ---------- server attach / OpenAPI ----------
  function attach(router, { prefix = "/rpc" } = {}) {
    router.get(prefix, () => ({ tools: Array.from(tools.keys()) }));
    router.get(`${prefix}/tools`, () => ({ tools: toOpenAITools() }));

    for (const t of tools.values()) {
      const url = `${prefix}/${t.name}`;
      router.post(url, async (args, ctx) => {
        const v = validate(t.parameters, args || {});
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

      if (t.safe) {
        router.get(url, async (args, ctx) => {
          const v = validate(t.parameters, args || {});
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

  function toOpenAITools() {
    return list().map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description || "",
        parameters: t.parameters || { type: "object", properties: {} },
      },
    }));
  }

  function toOpenApi({ prefix = "/rpc" } = {}) {
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
      paths[p].post = {
        ...base,
        requestBody: t.parameters
          ? {
              required: true,
              content: { "application/json": { schema: t.parameters } },
            }
          : undefined,
      };
      if (t.safe) {
        const params = t.parameters?.properties
          ? Object.entries(t.parameters.properties).map(([name, schema]) => ({
              name,
              in: "query",
              required: (t.parameters.required || []).includes(name),
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
    router.get(path, () => ({ status: 200, json: toOpenApi({ prefix }) }));
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
    validate,
    callLocal,
    $call: callLocal,
    attach,
    toOpenAITools,
    toOpenApi,
    mountOpenApi,
    runPlan, // exported for testing / manual use
  };
  return api;
}

// ---------- singleton helpers ----------
export function getToolRegistry(opts = {}) {
  const KEY = Symbol.for("@loki/minihttp:tool-registry");
  return getGlobalSingleton(KEY, () => createToolRegistry(opts));
}
export const toolRegistry = getToolRegistry();
