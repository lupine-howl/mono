// tool-registry.js

const PRIMS = new Set(["string", "number", "integer", "boolean", "null"]);

/**
 * OpenAI-style tool registry -> HTTP routes + OpenAPI.
 *
 * Tool shape:
 * {
 *   name: "get_horoscope",
 *   description: "...",
 *   parameters: { type:"object", properties:{...}, required:[...] },
 *   handler: async (args, ctx) => any,
 *   safe?: boolean // if true also exposes GET /prefix/name
 *   tags?: string[]
 * }
 */
export function createToolRegistry({
  title = "MiniHTTP Tools",
  version = "0.1.0",
  serverUrl = "/",
} = {}) {
  const tools = new Map();
  let broadcast = null; // NEW: server->client announcer

  function define({
    name,
    description,
    parameters,
    handler,
    safe = false,
    tags = [],
  }) {
    if (!name) throw new Error("Tool name required");
    if (tools.has(name)) throw new Error(`Tool already defined: ${name}`);
    tools.set(name, { name, description, parameters, handler, safe, tags });
    return name;
  }

  // --- tiny validator + query coercion ---
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
      // string -> number/bool/JSON coercion for query
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
          (v.trim().startsWith("{") || v.trim().startsWith("["))
        ) {
          try {
            v = JSON.parse(v);
          } catch {}
        }
      }
      if (PRIMS.has(def.type)) {
        if (def.type === "integer" && !Number.isInteger(v))
          return { ok: false, error: `Expected integer: ${key}` };
        if (def.type === "number" && typeof v !== "number")
          return { ok: false, error: `Expected number: ${key}` };
        if (def.type === "boolean" && typeof v !== "boolean")
          return { ok: false, error: `Expected boolean: ${key}` };
        if (def.type === "string" && typeof v !== "string")
          return { ok: false, error: `Expected string: ${key}` };
      }
      out[key] = v;
    }
    return { ok: true, value: out };
  }

  // --- helpers your OpenAI bridge can use directly ---
  function list() {
    return Array.from(tools.values());
  }
  function find(name) {
    return tools.get(name) || null;
  }
  function toOpenAITools() {
    return list().map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description || "",
        parameters: t.parameters || {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
      },
    }));
  }

  function attach(router, { prefix = "/rpc" } = {}) {
    // Index: just tool names
    router.get(prefix, () => ({ tools: Array.from(tools.keys()) }));

    // OpenAI function-call style array
    router.get(`${prefix}/tools`, () => ({ tools: toOpenAITools() }));

    for (const t of tools.values()) {
      const url = `${prefix}/${t.name}`;

      // POST (primary)
      router.post(url, async (args, ctx) => {
        const v = validate(t.parameters, args || {});
        if (!v.ok) return { status: 400, json: { error: v.error } };
        const result = await t.handler(v.value, ctx);

        // NEW: announce after successful call
        if (typeof broadcast === "function") {
          try {
            broadcast({
              type: "tool:called",
              name: t.name,
              args: v.value,
              result,
              ok: true,
              at: Date.now(),
            });
          } catch {}
        }

        return { status: 200, json: result ?? {} };
      });

      // Optional GET for safe/idempotent tools
      if (t.safe) {
        router.get(url, async (args, ctx) => {
          const v = validate(t.parameters, args || {});
          if (!v.ok) return { status: 400, json: { error: v.error } };
          const result = await t.handler(v.value, ctx);

          // NEW: announce safe call as well
          if (typeof broadcast === "function") {
            try {
              broadcast({
                type: "tool:called",
                name: t.name,
                args: v.value,
                result,
                ok: true,
                at: Date.now(),
              });
            } catch {}
          }

          return { status: 200, json: result ?? {} };
        });
      }
    }
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

  // NEW: allow server to inject a broadcaster
  function setBroadcast(fn) {
    broadcast = typeof fn === "function" ? fn : null;
  }

  return {
    define,
    attach,
    mountOpenApi,
    toOpenApi,
    list,
    find,
    toOpenAITools,
    setBroadcast,
  };
}
