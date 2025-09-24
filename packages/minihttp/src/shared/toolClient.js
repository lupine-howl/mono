import { getGlobalSingleton } from "@loki/utilities";
import { call } from "./toolRunner.js";

// Tools client: turns tools.ns.verb(params, [ctx]) → rpcCall("ns.verb", params, ctx)

export function createToolClient(rpcCall = call, opts = {}) {
  const rawSep = opts.separator;
  const separator =
    typeof rawSep === "string" &&
    rawSep.length &&
    rawSep !== "null" &&
    rawSep !== "undefined"
      ? rawSep
      : "_"; // <-- safe default

  const path = [];
  const make = () =>
    new Proxy(() => {}, {
      get(_t, prop) {
        path.push(String(prop));
        return make();
      },
      apply(_t, _this, args) {
        const [params = {}, ctx] = args;
        const name = path.filter(Boolean).join(separator);
        path.length = 0;
        return rpcCall(name, params, ctx);
      },
    });

  return make();
}

export function allowlistedTools(allowed, rpcCall, boundCtx = null) {
  const set = new Set(allowed);
  return createToolsClient((name, params, ctx) => {
    if (!set.has(name)) throw new Error(`Disallowed tool: ${name}`);
    return rpcCall(name, params, ctx);
  }, boundCtx);
}

export function getTools() {
  const KEY = Symbol.for("@loki/minihttp:tools-client");
  return getGlobalSingleton(KEY, () =>
    createToolClient((name, params, ctx) => call(name, params, ctx))
  );
}

export const tools = getTools();
