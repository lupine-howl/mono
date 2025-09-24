// Server routes: attach RPC endpoints for tools (primary + optional legacy routes)
import { toolRegistry } from "./toolRegistry.js";
import { validate } from "./validation.js";
import { attachHelpersToCtx, call as callTool } from "./toolRunner.js"; // <-- add this

// --- wire-name helpers -------------------------------------------------------
const toWireName = (name) => String(name).replace(/[^a-zA-Z0-9_-]/g, "_");
const makeRunId = () =>
  Date.now().toString(36) +
  "-" +
  Math.random().toString(36).slice(2, 8) +
  Math.random().toString(36).slice(2, 8);

// Optional: cache special-casing for "aiRequest"
async function _maybeCachedExecute(t, args, ctx, execFn) {
  if (t.name === "aiRequest") {
    const { getSemanticCache } = await import("./ToolCache.js").then((m) => m);
    const semanticCache = getSemanticCache?.();
    if (semanticCache) {
      const res = await semanticCache.getOrCompute(
        { tool: t.name, value: args },
        async () => execFn(),
        { ttlMs: 30 * 60 * 1000, threshold: 0.999 }
      );
      return res.result;
    }
  }
  return execFn();
}

// Execute a single step object (supports run/handler/stub or delegating to another tool)
async function _execStep(step, args, ctx) {
  if (!step || typeof step !== "object") return {};
  if (typeof step.run === "function") return step.run(args, ctx);
  if (typeof step.handler === "function") return step.handler(args, ctx);
  if (typeof step.stub === "function") return step.stub(args, ctx);
  if (typeof step.afterRun === "function") return step.afterRun(args, ctx);
  if (typeof step.runServer === "function") return step.runServer(args, ctx);
  // Delegation pattern: { tool: "name", args?: {...} }
  if (typeof step.tool === "string") {
    const nextArgs = step.args ? { ...args, ...step.args } : args;
    return callTool(step.tool, nextArgs, ctx);
  }
  return {};
}

export function attachToolRoutes(
  router,
  {
    prefix = "/rpc",
    exposeLegacyRawNames = true, // e.g. /rpc/options.compose
  } = {}
) {
  const reg = toolRegistry;

  // List tools (wire names)
  router.get(prefix, () => ({
    tools: reg.list().map((t) => toWireName(t.name)),
  }));

  // OpenAI function-tools export (wire names)
  router.get(`${prefix}/tools`, async (_args, ctx) => {
    const specs = await Promise.all(
      reg.list().map(async (t) => {
        const parameters = await reg._resolveParameters(t, ctx);
        return {
          type: "function",
          function: {
            name: toWireName(t.name),
            description: t.description || "",
            parameters,
          },
        };
      })
    );
    return { tools: specs };
  });

  // Register primary routes (wire + optional legacy)
  for (const t of reg.list()) {
    const wire = toWireName(t.name);
    const rawUrl = `${prefix}/${t.name}`;
    const wireUrl = `${prefix}/${wire}`;

    const postHandler = async (args, ctx) => {
      const paramSchema = await reg._resolveParameters(t, ctx);
      const v = validate(paramSchema, args || {});
      if (!v.ok) return { status: 400, json: { error: v.error } };

      // Attach helper API to ctx so run/steps can use $plan/$call/$ui, etc.
      const serverCtx = attachHelpersToCtx(
        { ...(ctx || {}) },
        { tool: t.name, runId: makeRunId() }
      );

      const exec = async () => {
        // 1) run() takes precedence for flows
        if (typeof t.run === "function") {
          return t.run(v.value, serverCtx);
        }
        // 2) steps() plan (rare on server, but now supported)
        if (t.steps) {
          const steps =
            typeof t.steps === "function"
              ? await t.steps(v.value, serverCtx)
              : t.steps;
          if (!Array.isArray(steps) || steps.length === 0) return {};
          let last = null;
          for (const step of steps) {
            // eslint-disable-next-line no-await-in-loop
            last = await _execStep(step, v.value, serverCtx);
          }
          return last ?? {};
        }
        // 3) classic one-shot handlers
        const fn = t.handler || t.stub || t.runServer || t.afterRun;
        if (typeof fn !== "function") return {};
        return fn(v.value, serverCtx);
      };

      try {
        const result = await _maybeCachedExecute(t, v.value, serverCtx, exec);
        return { status: 200, json: result ?? {} };
      } catch (err) {
        return { status: 500, json: { error: String(err?.message || err) } };
      }
    };

    const getHandler = async (args, ctx) => {
      const schema = await reg._resolveParameters(t, ctx);
      const v = validate(schema, args || {});
      if (!v.ok) return { status: 400, json: { error: v.error } };
      try {
        // Safe endpoints should be pure/read-only (prefer handler/stub)
        const fn = t.handler || t.stub;
        if (typeof fn !== "function")
          return { status: 404, json: { error: "No handler" } };
        // Attach helpers just in case handler wants UI or subcalls
        const serverCtx = attachHelpersToCtx(
          { ...(ctx || {}) },
          { tool: t.name, runId: makeRunId() }
        );
        const result = await fn(v.value, serverCtx);
        return { status: 200, json: result ?? {} };
      } catch (err) {
        return { status: 500, json: { error: String(err?.message || err) } };
      }
    };

    // Wire (underscore) routes — primary external surface
    router.post(wireUrl, postHandler);
    if (t.safe) router.get(wireUrl, getHandler);

    // Optional raw-name routes (with dots) for backwards-compatibility
    if (exposeLegacyRawNames && rawUrl !== wireUrl) {
      router.post(rawUrl, postHandler);
      if (t.safe) router.get(rawUrl, getHandler);
    }
  }
}
