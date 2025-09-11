import { getGlobalSingleton } from "@loki/utilities";

export function createOpenApiRpcClient({
  base = typeof location !== "undefined" ? location.origin : "http://localhost:3000",
  openapiUrl = "/openapi.json",
  nameFrom = (path, method, op) =>
    op.operationId || path.split("/").filter(Boolean).pop() || `${method}:${path}`,
  fetchImpl = fetch,
  eventsPath = "/rpc-events", // default SSE endpoint
  // Lightweight cache + dedupe (anti-burst)
  cacheGETMs = 300, // cache GETs for N ms (0 to disable)
  dedupeRequests = true, // coalesce identical in-flight requests
  maxCacheEntries = 200, // simple LRU cap
} = {}) {
  let spec = null;
  let ops = null; // { [name]: { method, url, paramDefs, bodySchema } }
  let ready = false;
  let loading = null; // in-flight promise to avoid duplicate spec fetches

  // anti-burst: in-flight dedupe + tiny TTL cache for GETs
  const inflight = new Map(); // key -> Promise
  const cache = new Map(); // key -> { value, expires }

  const getNow = () => Date.now();
  const lruBump = (key, val) => {
    // Map preserves insertion order; delete+set to bump
    cache.delete(key);
    cache.set(key, val);
    if (cache.size > maxCacheEntries) {
      const first = cache.keys().next().value;
      cache.delete(first);
    }
  };
  const cacheGet = (key) => {
    const hit = cache.get(key);
    if (!hit) return undefined;
    if (hit.expires <= getNow()) {
      cache.delete(key);
      return undefined;
    }
    lruBump(key, hit);
    return hit.value;
  };
  const cacheSet = (key, value, ttlMs) => {
    if (ttlMs <= 0) return;
    lruBump(key, { value, expires: getNow() + ttlMs });
  };
  const makeKey = (method, url, body) => `${method} ${url}${body ? ` ${body}` : ""}`;

  // --- client event handlers + SSE subscription (lazy) ---
  // New, idiomatic semantics:
  //  - onBeforeCall(name, fn): receives incoming args BEFORE tool runs (SSE type "tool:called" or client-init tap)
  //  - onCall(name, fn): receives server RETURNED values AFTER tool completes (SSE type "tool:result" or client-init tap)
  //  - onError(name, fn): receives error payloads (SSE type "tool:error" or client-init tap)
  const beforeHandlers = new Map(); // toolName -> fn({ name, args, ... })
  const resultHandlers = new Map(); // toolName -> fn({ name, result, args?, ... })
  const errorHandlers = new Map(); // toolName -> fn({ name, error, args?, ... })

  let sse = null;
  let sseConnected = false;

  const toAbs = (url) => {
    if (/^https?:\/\//i.test(url)) return url;
    const server = spec?.servers?.[0]?.url || "";
    const root = server ? new URL(server, base).toString() : base;
    return new URL(url, root).toString();
  };

  function ensureSseSubscribed() {
    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      return false; // not a browser; noop
    }
    if (sseConnected) return true;
    try {
      const url = toAbs(eventsPath);
      sse = new EventSource(url);
      sse.onmessage = (e) => {
        //console.log(e);
        try {
          const payload = JSON.parse(e.data || "{}");
          const type = payload.type || "";
          const name = payload.name || payload.tool;
          if (!name) return;
          if (type === "tool:called") {
            const fn = resultHandlers.get(name);
            if (typeof fn === "function") fn(payload); // { name, result, args?, ... }
            return;
          }
          /*
          if (type === "tool:error") {
            const fn = errorHandlers.get(name);
            if (typeof fn === "function") fn(payload); // { name, error, args?, ... }
            return;
          }
          // Back-compat / generic “called” -> beforeCall
          const fn = beforeHandlers.get(name);
          if (typeof fn === "function") fn(payload); // { name, args, ... }
          */
        } catch {}
      };
      sse.onerror = () => {
        // Keep connection attempts quiet; browser auto-retries SSE
      };
      sseConnected = true;
      return true;
    } catch {
      return false;
    }
  }

  // Public: register handlers
  function onBeforeCall(name, fn) {
    if (typeof name !== "string" || !name) return;
    if (typeof fn !== "function") beforeHandlers.delete(name);
    else beforeHandlers.set(name, fn);
    ensureSseSubscribed();
  }
  function onCall(name, fn) {
    if (typeof name !== "string" || !name) return;
    if (typeof fn !== "function") resultHandlers.delete(name);
    else { resultHandlers.set(name, fn); /*console.log(resultHandlers);*/}
    ensureSseSubscribed();
  }
  function onError(name, fn) {
    if (typeof name !== "string" || !name) return;
    if (typeof fn !== "function") errorHandlers.delete(name);
    else errorHandlers.set(name, fn);
    ensureSseSubscribed();
  }

  // Optional: manual control over events subscription (rarely needed)
  function $events({ subscribe = true } = {}) {
    if (!subscribe) {
      try { sse?.close?.(); } catch {}
      sse = null;
      sseConnected = false;
      return false;
    }
    return ensureSseSubscribed();
  }

  async function load() {
    const res = await fetchImpl(toAbs(openapiUrl), { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`Failed to fetch OpenAPI: ${res.status} ${await res.text()}`);
    spec = await res.json();
    ops = indexSpec(spec);
    ready = true;
  }

  function ensure() {
    if (ready) return Promise.resolve();
    if (!loading) loading = load().finally(() => (loading = null));
    return loading;
  }

  function indexSpec(oas) {
    const map = Object.create(null);
    const paths = oas.paths || {};
    for (const [path, item] of Object.entries(paths)) {
      for (const method of Object.keys(item)) {
        const op = item[method];
        if (!op || typeof op !== "object") continue;
        const fnName = nameFrom(path, method.toUpperCase(), op);

        const existing = map[fnName];
        const score = method.toUpperCase() === "POST" ? 2 : 1;
        const existingScore = existing?.method === "POST" ? 2 : existing ? 1 : 0;
        if (score < existingScore) continue;

        const paramDefs = (op.parameters || []).map((p) => ({
          name: p.name,
          in: p.in || "query",
          required: !!p.required,
          schema: p.schema || {},
        }));
        const bodySchema = op.requestBody?.content?.["application/json"]?.schema || null;

        map[fnName] = {
          name: fnName,
          method: (method || "").toUpperCase(),
          path,
          url: path,
          paramDefs,
          bodySchema,
          summary: op.summary,
          tags: op.tags || [],
        };
      }
    }
    return map;
  }

  function coerceQueryValue(v) {
    if (v == null) return "";
    const t = typeof v;
    if (t === "string" || t === "number" || t === "boolean") return String(v);
    return JSON.stringify(v);
  }

  function applyParams(url, args, paramDefs) {
    const u = new URL(url);
    let finalHref = u.href;
    for (const p of paramDefs) {
      if (p.in === "path") {
        const val = args?.[p.name];
        if (val == null && p.required)
          throw new Error(`Missing required path param: ${p.name}`);
        if (val != null) {
          finalHref = finalHref.replace(new RegExp(`\\{${p.name}\\}`, "g"), encodeURIComponent(String(val)));
        }
      }
    }
    const fin = new URL(finalHref);
    for (const p of paramDefs) {
      if (p.in === "query") {
        const val = args?.[p.name];
        if (val == null) {
          if (p.required) throw new Error(`Missing required query param: ${p.name}`);
          continue;
        }
        if (Array.isArray(val)) {
          for (const it of val) fin.searchParams.append(p.name, coerceQueryValue(it));
        } else {
          fin.searchParams.set(p.name, coerceQueryValue(val));
        }
      }
    }
    return fin.toString();
  }

  async function doCall(opName, args = {}, { method, signal, headers, cacheMs, dedupe } = {}) {
    const op = ops?.[opName];
    if (!op) throw new Error(`Unknown RPC: ${opName}`);
    const actualMethod = (method || op.method || "POST").toUpperCase();

    let url = toAbs(op.url);
    const init = { method: actualMethod, headers: { Accept: "application/json", ...(headers || {}) }, signal };

    if (actualMethod === "GET") {
      url = applyParams(url, args, op.paramDefs);
    } else {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(args || {});
      const hasQuery = op.paramDefs?.some((p) => p.in === "query");
      if (hasQuery) url = applyParams(url, args, op.paramDefs);
    }

    const key = makeKey(actualMethod, url, init.body);
    const effCacheMs = actualMethod === "GET" ? (cacheMs ?? cacheGETMs) : 0;
    const effDedupe = dedupe ?? dedupeRequests;

    // Notify local before-handlers for client-initiated calls as well (symmetry with SSE)
    try {
      const fn = beforeHandlers.get(opName);
      if (typeof fn === "function") fn({ name: opName, args });
    } catch {}

    if (effCacheMs > 0) {
      const hit = cacheGet(key);
      if (hit !== undefined) return hit;
    }
    if (effDedupe && inflight.has(key)) {
      return inflight.get(key);
    }

    const p = (async () => {
      const r = await fetchImpl(url, init);
      const text = await r.text();
      if (!r.ok) {
        // notify onError locally
        try {
          const fn = errorHandlers.get(opName);
          if (typeof fn === "function") fn({ name: opName, error: text || r.statusText, args });
        } catch {}
        throw new Error(text || r.statusText);
      }
      const data = text ? JSON.parse(text) : null;
      if (effCacheMs > 0) cacheSet(key, data, effCacheMs);
      // notify onCall (result) locally
      try {
        const fn = resultHandlers.get(opName);
        if (typeof fn === "function") {console.log("Calling",opName);fn({ name: opName, result: data, args });}
      } catch {}
      return data;
    })();

    if (effDedupe) inflight.set(key, p);
    try {
      return await p;
    } finally {
      inflight.delete(key);
    }
  }

  const specialProps = new Set(["then", "catch", "finally", "toJSON", "toString", "valueOf", Symbol.toStringTag]);

  const rpc = new Proxy(
    {
      async $refresh() {
        ready = false;
        spec = null;
        ops = null;
        return ensure().then(() => rpc);
      },
      async $list() {
        await ensure();
        return Object.keys(ops);
      },
      async $call(name, args, opts) {
        await ensure();
        return doCall(name, args, opts);
      },
      async $spec() {
        await ensure();
        return spec;
      },
      // server->client event helpers
      onBeforeCall,
      onCall,
      onError,
      $events,

      [Symbol.toStringTag]: "OpenApiRpcClient",
      toString() { return "[object OpenApiRpcClient]"; },
      valueOf() { return 1; },
    },
    {
      get(target, prop, receiver) {
        if (specialProps.has(prop)) return target[prop];
        if (typeof prop !== "string" || prop.startsWith("$")) {
          return Reflect.get(target, prop, receiver);
        }
        // expose handlers as properties (e.g., rpc.onCall)
        if (prop === "onBeforeCall") return onBeforeCall;
        if (prop === "onCall") return onCall;
        if (prop === "onError") return onError;
        if (prop === "$events") return $events;
        // Return callable that lazy-loads spec
        return async (args, opts) => {
          await ensure();
          return doCall(prop, args, opts);
        };
      },
      has(_t, key) {
        if (specialProps.has(key)) return true;
        return true; // dynamic methods
      },
      ownKeys() {
        return ["$refresh", "$list", "$call", "$spec", "onBeforeCall", "onCall", "onError", "$events"];
      },
    }
  );

  return rpc; // not a Promise; no await needed
}

// ---- singleton helpers ----
export function getRpcClient(opts = {}) {
  const KEY = Symbol.for("@loki/minihttp:rpc-client");
  return getGlobalSingleton(KEY, () => createOpenApiRpcClient(opts));
}
export const rpc = getRpcClient();
export function callTool(name, args, opts) {
  return rpc.$call(name, args, opts);
}
// Back-compat alias: previous code used onToolCalled -> onCall (now means post-result)
export function onToolCalled(name, fn) {
  rpc.onCall(name, fn);
}
