// toolRegistry.js (keep it simple, no aliases)

import { getGlobalSingleton } from "@loki/utilities";

const _tools = new Map();

// If parameters is a function, call it with ctx (can be async)
async function resolveParameters(tool, ctx) {
  let p = tool?.parameters;
  if (typeof p === "function") p = p.length > 0 ? await p(ctx) : await p();
  return p || { type: "object", properties: {} };
}

function canonicalName({ name, namespace, verb }) {
  if (name) return String(name);
  if (namespace && verb) return `${namespace}_${verb}`; // <-- underscore, not dot
  throw new Error("Tool name or (namespace + verb) is required");
}

function createRegistry() {
  function define(spec = {}) {
    const {
      // preferred fields
      namespace,
      verb,
      // classic fields (kept for BC)
      name: rawName,
      description = "",
      parameters = null,
      handler,
      stub = null,
      beforeRun = null,
      afterRun = null,
      runServer = null,
      run = null,
      safe = false,
      tags = [],
      plan = null,
      steps = null,
      output = null,
      label = null,
      version = null,
      deprecated = false,
    } = spec;

    const name = canonicalName({ name: rawName, namespace, verb });

    const hasExec =
      typeof handler === "function" ||
      typeof stub === "function" ||
      typeof beforeRun === "function" ||
      typeof afterRun === "function" ||
      typeof runServer === "function" ||
      typeof run === "function" ||
      typeof steps === "function" ||
      typeof plan === "function";

    if (!hasExec)
      throw new Error(`Tool "${name}" requires a handler/stub or a plan`);
    if (_tools.has(name)) throw new Error(`Tool already defined: ${name}`);

    _tools.set(name, {
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
      run,
      steps,
      output,
      label,
      version,
      deprecated,
    });

    return name;
  }

  function defineMany(dict) {
    if (!dict || typeof dict !== "object" || Array.isArray(dict)) {
      throw new Error("defineMany expects an object { name|<ns/verb>: spec }");
    }
    return Object.entries(dict).map(([name, spec]) =>
      define({ name, ...(spec || {}) })
    );
  }

  function list() {
    return Array.from(_tools.values());
  }

  function find(name) {
    return _tools.get(name) || null; // no alias indirection
  }

  async function toOpenAITools(ctx = {}) {
    const specs = await Promise.all(
      list().map(async (t) => {
        const parameters = await resolveParameters(t, ctx);
        return {
          type: "function",
          function: {
            name: t.name, // already safe: no dots
            description: t.description || "",
            parameters,
          },
        };
      })
    );
    return specs;
  }

  return {
    define,
    defineMany,
    list,
    find,
    toOpenAITools,
    _tools, // optional introspection
    _resolveParameters: resolveParameters,
  };
}

export function getToolRegistry() {
  const KEY = Symbol.for("@loki/minihttp:tool-registry");
  return getGlobalSingleton(KEY, () => createRegistry());
}
export const toolRegistry = getToolRegistry();
