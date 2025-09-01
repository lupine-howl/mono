import { readJSON, sendJSON } from "./utils";
import { Readable } from "node:stream";

export class Router {
  #routes = [];
  get(p, h) {
    this.#add("GET", p, h);
  }
  post(p, h) {
    this.#add("POST", p, h);
  }
  put(p, h) {
    this.#add("PUT", p, h);
  }
  del(p, h) {
    this.#add("DELETE", p, h);
  }
  listRoutes() {
    return this.#routes.map((r) => ({ method: r.method, path: r.path }));
  }

  async handle(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const match = this.#find(req.method, url.pathname);
    if (!match) return false;

    const isGet = req.method === "GET" || req.method === "HEAD";
    const query = Object.fromEntries(url.searchParams.entries());
    const body = isGet ? null : await readJSON(req);
    const args = { ...(isGet ? query : body ?? {}), ...match.params };

    try {
      const result = await match.handler(args, {
        req,
        res,
        query,
        params: match.params,
      });

      if (
        result &&
        typeof result === "object" &&
        result.stream instanceof Readable
      ) {
        res.writeHead(result.status ?? 200, result.headers ?? {});
        result.stream.pipe(res);
        return true;
      }
      if (result && result.json && Number.isInteger(result.status)) {
        res.writeHead(result.status, {
          "Content-Type": "application/json; charset=utf-8",
          ...(result.headers || {}),
        });
        res.end(JSON.stringify(result.json));
        return true;
      }
      sendJSON(res, 200, result ?? {});
      return true;
    } catch (err) {
      console.error("[HTTP ERROR]", err);
      sendJSON(res, 500, { error: String(err?.message || err) });
      return true;
    }
  }

  /* internals */
  #add(method, pattern, handler) {
    const { regex, keys } = compile(pattern);
    this.#routes.push({ method, path: pattern, regex, keys, handler });
  }
  #find(method, pathname) {
    for (const r of this.#routes) {
      if (r.method !== method) continue;
      const m = r.regex.exec(pathname);
      if (!m) continue;
      const params = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return { handler: r.handler, params };
    }
    return null;
  }
}

function compile(pattern) {
  const keys = [];
  let p = pattern.replace(/([.+?^=!${}[\]|\\])/g, "\\$1"); // keep / * :
  p = p.replace(/\*/g, ".*");
  p = p.replace(/:(\w+)/g, (_, key) => {
    keys.push(key);
    return "([^/]+)";
  });
  return { regex: new RegExp(`^${p}$`), keys };
}
