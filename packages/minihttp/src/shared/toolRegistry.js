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

  function define(spec) {
    const {
      name,
      description = "",
      parameters = null,
      handler,
      stub = null,
      safe = false,
      tags = [],
    } = spec || {};
    if (!name) throw new Error("Tool name required");
    if (typeof handler !== "function" && typeof stub !== "function") {
      throw new Error(`Tool "${name}" requires a handler or a stub`);
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

  // ---- minimal validation / coercion (flat) ----
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

      // Coerce common query-stringy values
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

      // Allow simple union with null: type: ["string","null"]
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

  // ---- call locally (client or server) ----
  async function callLocal(name, args = {}, ctx = {}) {
    const t = tools.get(name);
    if (!t) {
      try {
        return await callRemote(name, args, ctx);
      } catch (error) {
        console.error(`Error calling remote tool "${name}":`, error);
      }
      //throw new Error(`Unknown tool: ${name}`);
    }
    const { parameters, stub, handler } = t;

    const v = validate(parameters, args);
    if (!v.ok) throw new Error(v.error);

    // Prefer stub in browser (optimistic) if present, else handler
    if (isBrowser()) {
      if (typeof handler === "function") {
        return await callRemote(name, v.value, ctx).then((result) => {
          if (typeof stub === "function")
            return stub(v.value, { ...ctx, result });
          // Could do more sophisticated reconciliation here if needed
          // (e.g. update local cache/store with any server-changed fields)
          return result;
        });
      }
      if (typeof stub === "function") return stub(v.value, ctx);
    } else if (typeof handler === "function") return handler(v.value, ctx);
    //throw new Error(`Tool "${name}" has no callable implementation`);
  }

  async function callRemote(name, args = {}) {
    if (!isBrowser() || typeof fetch !== "function") {
      throw new Error("Remote calls not supported in this environment");
    }

    // If we know the tool, use its .safe to pick GET; unknown -> POST
    const known = tools.get(name) || null;
    const safe = !!known?.safe;

    const base = (serverUrl || "/").replace(/\/+$/, "");
    const url = new URL(`${base}/rpc/${name}`);

    const init = { method: "POST", headers: {} };
    if (init.method === "GET") {
      for (const [k, v] of Object.entries(args || {})) {
        if (v === undefined || v === null) continue;
        url.searchParams.set(k, String(v));
      }
    } else {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(args || {});
    }

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
  // ---- server attach (expects a simple router with get/post(path, handler)) ----
  function attach(router, { prefix = "/rpc" } = {}) {
    router.get(prefix, () => ({ tools: Array.from(tools.keys()) }));
    router.get(`${prefix}/tools`, () => ({ tools: toOpenAITools() }));

    for (const t of tools.values()) {
      const url = `${prefix}/${t.name}`;
      router.post(url, async (args, ctx) => {
        const v = validate(t.parameters, args || {});
        if (!v.ok) return { status: 400, json: { error: v.error } };
        const result = await (t.handler || t.stub)(v.value, ctx);
        return { status: 200, json: result ?? {} };
      });
      if (t.safe) {
        router.get(url, async (args, ctx) => {
          const v = validate(t.parameters, args || {});
          if (!v.ok) return { status: 400, json: { error: v.error } };
          const result = await (t.handler || t.stub)(v.value, ctx);
          return { status: 200, json: result ?? {} };
        });
      }
    }
  }

  // ---- exports for AI / OpenAPI ----
  function toOpenAITools() {
    return list().map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description || "",
        // keep as-is; if you need OpenAI-safe loosening, run an adapter outside
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

  // ---- tiny utils ----
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
    validate, // exported for convenience
    callLocal,
    $call: callLocal, // alternate name
    attach, // server-only router binding
    toOpenAITools,
    toOpenApi,
    mountOpenApi, // server-only OpenAPI endpoint
  };
  return api;
}

// ---- singleton helpers ----
export function getToolRegistry(opts = {}) {
  const KEY = Symbol.for("@loki/minihttp:tool-registry");
  return getGlobalSingleton(KEY, () => createToolRegistry(opts));
}
export const toolRegistry = getToolRegistry();
