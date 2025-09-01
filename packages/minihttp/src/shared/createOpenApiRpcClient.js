// openapi-rpc-client.js
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
} = {}) {
  let spec = null;
  let ops = null; // { [name]: { method, url, paramDefs, bodySchema } }
  let ready = false;
  let loading = null; // in-flight promise to avoid duplicate fetches

  const toAbs = (url) => {
    if (/^https?:\/\//i.test(url)) return url;
    const server = spec?.servers?.[0]?.url || "";
    const root = server ? new URL(server, base).toString() : base;
    return new URL(url, root).toString();
  };

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
          method: method.toUpperCase(),
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
          finalHref = finalHref.replace(
            new RegExp(`\\{${p.name}\\}`, "g"),
            encodeURIComponent(String(val))
          );
        }
      }
    }
    const fin = new URL(finalHref);
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

  async function doCall(opName, args = {}, { method, signal, headers } = {}) {
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
      url = applyParams(url, args, op.paramDefs);
    } else {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(args || {});
      const hasQuery = op.paramDefs?.some((p) => p.in === "query");
      if (hasQuery) url = applyParams(url, args, op.paramDefs);
    }
    const r = await fetch(url, init);
    const text = await r.text();
    if (!r.ok) throw new Error(text || r.statusText);
    return text ? JSON.parse(text) : null;
  }

  const specialProps = new Set([
    "then",
    "catch",
    "finally", // promise detection
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
        // Don’t look like a thenable / preserve basics
        if (specialProps.has(prop)) return target[prop];
        if (typeof prop !== "string" || prop.startsWith("$")) {
          return Reflect.get(target, prop, receiver);
        }
        // Return callable that lazy-loads spec
        return async (args, opts) => {
          await ensure();
          return doCall(prop, args, opts);
        };
      },
      // Also avoid being mistaken for a promise by defining has/ownKeys behavior
      has(_t, key) {
        if (specialProps.has(key)) return true;
        return true; // dynamic methods
      },
      ownKeys() {
        // not strictly necessary, but handy
        return ["$refresh", "$list", "$call", "$spec"];
      },
    }
  );

  return rpc; // not a Promise; no await needed
}
