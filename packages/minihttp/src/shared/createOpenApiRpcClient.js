import { getGlobalSingleton } from "@loki/utilities";

export function createOpenApiRpcClient({
  base = typeof location !== "undefined"
    ? location.origin
    : "http://localhost:3000",
  openapiUrl = "/openapi.json",
  nameFrom = (path, method, op) =>
    op.operationId ||
    path.split("/").filter(Boolean).pop() ||
    `${method}:${path}`,
  fetchImpl = fetch,
  eventsPath = "/rpc-events", // SSE endpoint
  cacheGETMs = 300, // cache GETs for N ms (0 = off)
  dedupeRequests = true, // coalesce identical in-flight requests
  maxCacheEntries = 200, // simple LRU cap
} = {}) {
  let spec = null;
  let ops = null; // { [name]: { method, url, paramDefs, bodySchema } }
  let ready = false;
  let loading = null;

  // ---- client stubs registry (toolName -> stubFn(args, { rpc, callRemote })) ----
  const stubs = new Map();
  function registerStub(name, fn) {
    if (typeof name === "string" && typeof fn === "function")
      stubs.set(name, fn);
  }
  function unregisterStub(name) {
    stubs.delete(name);
  }
  function clearStubs() {
    stubs.clear();
  }
  function hasStub(name) {
    return stubs.has(name);
  }

  // ---- anti-burst: in-flight dedupe + tiny TTL cache for GETs ----
  const inflight = new Map(); // key -> Promise
  const cache = new Map(); // key -> { value, expires }

  const now = () => Date.now();
  const lruBump = (key, val) => {
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
    if (hit.expires <= now()) {
      cache.delete(key);
      return undefined;
    }
    lruBump(key, hit);
    return hit.value;
  };
  const cacheSet = (key, value, ttlMs) => {
    if (ttlMs > 0) lruBump(key, { value, expires: now() + ttlMs });
  };
  const makeKey = (method, url, body) =>
    `${method} ${url}${body ? ` ${body}` : ""}`;

  // ---- client event handlers + SSE subscription ----
  const beforeHandlers = new Map(); // toolName -> fn({ name, args, ... })
  const resultHandlers = new Map(); // toolName -> fn({ name, result, args?, ... })
  const errorHandlers = new Map(); // toolName -> fn({ name, error,  args?, ... })

  let sse = null;
  let sseConnected = false;

  const toAbs = (url) => {
    if (/^https?:\/\//i.test(url)) return url;
    const server = spec?.servers?.[0]?.url || "";
    const root = server ? new URL(server, base).toString() : base;
    return new URL(url, root).toString();
  };

  function ensureSseSubscribed() {
    if (typeof window === "undefined" || typeof EventSource === "undefined")
      return false;
    if (sseConnected) return true;
    try {
      const url = toAbs(eventsPath);
      sse = new EventSource(url);
      sse.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data || "{}");
          const type = payload.type || "";
          const name = payload.name || payload.tool;
          if (!name) return;

          if (type === "tool:called") {
            const fn = beforeHandlers.get(name);
            if (typeof fn === "function") fn(payload);
            return;
          }
          if (type === "tool:result") {
            const fn = resultHandlers.get(name);
            if (typeof fn === "function") fn(payload);
            return;
          }
          if (type === "tool:error") {
            const fn = errorHandlers.get(name);
            if (typeof fn === "function") fn(payload);
            return;
          }

          // Back-compat: if a server only emits one generic type, try resultHandlers first
          const generic = resultHandlers.get(name) || beforeHandlers.get(name);
          if (typeof generic === "function") generic(payload);
        } catch {
          /* noop */
        }
      };
      sse.onerror = () => {
        /* browser will retry SSE automatically */
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
    else resultHandlers.set(name, fn);
    ensureSseSubscribed();
  }
  function onError(name, fn) {
    if (typeof name !== "string" || !name) return;
    if (typeof fn !== "function") errorHandlers.delete(name);
    else errorHandlers.set(name, fn);
    ensureSseSubscribed();
  }

  // Optional: manual control over events subscription
  function $events({ subscribe = true } = {}) {
    if (!subscribe) {
      try {
        sse?.close?.();
      } catch {}
      sse = null;
      sseConnected = false;
      return false;
    }
    return ensureSseSubscribed();
  }

  // ---- OpenAPI loading / indexing ----
  async function load() {
    const res = await fetchImpl(toAbs(openapiUrl), {
      headers: { Accept: "application/json" },
    });
    if (!res.ok)
      throw new Error(
        `Failed to fetch OpenAPI: ${res.status} ${await res.text()}`
      );
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

        // Prefer POST when duplicate names
        const existing = map[fnName];
        const score = method.toUpperCase() === "POST" ? 2 : 1;
        const existingScore =
          existing?.method === "POST" ? 2 : existing ? 1 : 0;
        if (score < existingScore) continue;

        const paramDefs = (op.parameters || []).map((p) => ({
          name: p.name,
          in: p.in || "query",
          required: !!p.required,
          schema: p.schema || {},
        }));
        const bodySchema =
          op.requestBody?.content?.["application/json"]?.schema || null;

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

  // ---- call plumbing ----
  function coerceQueryValue(v) {
    if (v == null) return "";
    const t = typeof v;
    if (t === "string" || t === "number" || t === "boolean") return String(v);
    return JSON.stringify(v);
  }
  function applyParams(url, args, paramDefs) {
    const u = new URL(url);
    let finalHref = u.href;

    // path params
    for (const p of paramDefs) {
      if (p.in === "path") {
        const val = args?.[p.name];
        if (val == null && p.required)
          throw new Error(`Missing required path param: ${p.name}`);
        if (val != null) {
          finalHref = finalHref.replace(
            new RegExp(`\\{${p.name}\\}`, "g"),
            encodeURIComponent(String(val))
          );
        }
      }
    }
    const fin = new URL(finalHref);

    // query params
    for (const p of paramDefs) {
      if (p.in === "query") {
        const val = args?.[p.name];
        if (val == null) {
          if (p.required)
            throw new Error(`Missing required query param: ${p.name}`);
          continue;
        }
        if (Array.isArray(val)) {
          for (const it of val)
            fin.searchParams.append(p.name, coerceQueryValue(it));
        } else {
          fin.searchParams.set(p.name, coerceQueryValue(val));
        }
      }
    }
    return fin.toString();
  }

  // Low-level remote call (bypasses stubs)
  async function doCallRemote(
    opName,
    args = {},
    { method, signal, headers, cacheMs, dedupe } = {}
  ) {
    const op = ops?.[opName];
    if (!op) throw new Error(`Unknown RPC: ${opName}`);
    const actualMethod = (method || op.method || "POST").toUpperCase();

    let url = toAbs(op.url);
    const init = {
      method: actualMethod,
      headers: { Accept: "application/json", ...(headers || {}) },
      signal,
    };

    if (actualMethod === "GET") {
      url = applyParams(url, args, op.paramDefs || []);
    } else {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(args || {});
      const hasQuery = (op.paramDefs || []).some((p) => p.in === "query");
      if (hasQuery) url = applyParams(url, args, op.paramDefs || []);
    }

    const key = makeKey(actualMethod, url, init.body);
    const effCacheMs = actualMethod === "GET" ? cacheMs ?? cacheGETMs : 0;
    const effDedupe = dedupe ?? dedupeRequests;

    // local before-hook (client-initiated symmetry with SSE)
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
        try {
          const fn = errorHandlers.get(opName);
          if (typeof fn === "function")
            fn({ name: opName, error: text || r.statusText, args });
        } catch {}
        throw new Error(text || r.statusText);
      }
      const data = text ? JSON.parse(text) : null;
      if (effCacheMs > 0) cacheSet(key, data, effCacheMs);
      try {
        const fn = resultHandlers.get(opName);
        if (typeof fn === "function") fn({ name: opName, result: data, args });
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

  // Preferred entry: use stub when available unless bypassed
  async function callWithStub(name, args = {}, opts = {}) {
    await ensure();
    if (!opts?.bypassStub) {
      const stub = stubs.get(name);
      if (typeof stub === "function") {
        const ctx = {
          rpc, // the client itself
          callRemote: (n, a, o) => doCallRemote(n, a, o), // server-only
        };
        return stub(args, ctx);
      }
    }
    return doCallRemote(name, args, opts);
  }

  // ---- public surface (Proxy) ----
  const specialProps = new Set([
    "then",
    "catch",
    "finally",
    "toJSON",
    "toString",
    "valueOf",
    Symbol.toStringTag,
  ]);

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
        return Object.keys(ops || {});
      },
      async $call(name, args, opts) {
        return callWithStub(name, args, opts);
      },
      async $callRemote(name, args, opts) {
        await ensure();
        return doCallRemote(name, args, opts);
      },
      async $spec() {
        await ensure();
        return spec;
      },
      onBeforeCall,
      onCall,
      onError,
      $events,
      registerStub,
      unregisterStub,
      clearStubs,
      hasStub,

      [Symbol.toStringTag]: "OpenApiRpcClient",
      toString() {
        return "[object OpenApiRpcClient]";
      },
      valueOf() {
        return 1;
      },
    },
    {
      get(target, prop, receiver) {
        if (specialProps.has(prop)) return target[prop];
        if (typeof prop !== "string" || prop.startsWith("$")) {
          return Reflect.get(target, prop, receiver);
        }
        // direct access to helpers
        if (prop === "onBeforeCall") return onBeforeCall;
        if (prop === "onCall") return onCall;
        if (prop === "onError") return onError;
        if (prop === "$events") return $events;
        if (prop === "registerStub") return registerStub;
        if (prop === "unregisterStub") return unregisterStub;
        if (prop === "clearStubs") return clearStubs;
        if (prop === "hasStub") return hasStub;

        // dynamic tool methods: rpc.createTask({ ... })
        return async (args, opts) => callWithStub(prop, args, opts);
      },
      has(_t, key) {
        if (specialProps.has(key)) return true;
        return true; // dynamic methods always "exist"
      },
      ownKeys() {
        return [
          "$refresh",
          "$list",
          "$call",
          "$callRemote",
          "$spec",
          "onBeforeCall",
          "onCall",
          "onError",
          "$events",
          "registerStub",
          "unregisterStub",
          "clearStubs",
          "hasStub",
        ];
      },
    }
  );

  return rpc; // singleton instance is created via getRpcClient below
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

// Back-compat alias: previous code used onToolCalled -> onCall (post-result)
export function onToolCalled(name, fn) {
  rpc.onCall(name, fn);
}
