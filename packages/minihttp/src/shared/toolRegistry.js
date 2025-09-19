// src/registry/isomorphic-tool-registry.js
import { getGlobalSingleton } from "@loki/utilities";
import { validate } from "./validation.js";

const isBrowser = () => typeof window !== "undefined";

// ---------------- helpers to evaluate booleans/funcs/values ----------------
const asBool = (v, ...args) => (typeof v === "function" ? !!v(...args) : !!v);
const asVal = (v, ...args) => (typeof v === "function" ? v(...args) : v);

// NEW: optimistic/final helpers
function isAsyncEnvelope(x) {
  return !!(x && typeof x === "object" && "runId" in x);
}
function pickOptimistic(x) {
  // prefer final “ok/data” shape if already resolved; else optimistic
  if (x && x.ok !== undefined) return x; // already final
  if (x && x.optimistic && x.optimistic.ok !== undefined) return x.optimistic;
  return x;
}
async function ensureFinal(x) {
  if (!isAsyncEnvelope(x)) return x;
  if (x.final && typeof x.final.then === "function") {
    try {
      const fin = await x.final;
      return fin ?? x.optimistic ?? x;
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  }
  return x.optimistic ?? x;
}

// Resolve args for a step from the following (in priority order):
//  1) step.input (object | (ctx, initialArgs) => object)
export function resolveStepArgs(step, ctx, lastResult, initialArgs) {
  if ("input" in (step || {})) {
    return typeof step.input === "function"
      ? step.input(ctx, initialArgs)
      : step.input || {};
  }
  // Default fallback: pass the previous result forward if nothing specified
  return lastResult || {};
}

export function isPlanTool(t) {
  return !!(t?.plan && typeof t.plan === "function");
}

export function makePlan(t, args, ctx) {
  if (typeof t?.plan === "function") return t.plan(args, ctx) || [];
  return [];
}

const pushPath = (ck, frame) => {
  const prev = ck?.path && Array.isArray(ck.path) ? ck.path : [];
  return { ...ck, path: [...prev, frame] };
};

/**
 * Execute a list of steps with control flow.
 * Returns { outCtx, last, state }
 *  - outCtx: final plan context (labels merged)
 *  - last:   last step's value (for final output)
 *  - state:  { done?:true, paused?:true, checkpoint? }
 */
export async function executeSteps(
  registry,
  steps,
  {
    initialArgs = {},
    outCtx,
    startIndex = 0,
    parentTool = "",
    onEvent = null,
    // Resume plumbing
    resumePath = null, // array of frames describing nested location
    resumeFrom = 0, // inner index within the inner steps array
  } = {}
) {
  let last = null;

  const makeCheckpoint = (i, step) => ({
    parentTool,
    index: i,
    ctx: outCtx,
    reason: step.await || step.reason || "paused",
    meta: step.meta || null,
  });

  for (let i = startIndex; i < (steps?.length || 0); i++) {
    const step = steps[i] || {};

    // Skip via simple condition
    if (
      step.when !== undefined &&
      !asBool(step.when, outCtx, last, initialArgs)
    ) {
      onEvent?.({ type: "step:skip", index: i, step });
      continue;
    }

    // ----- Branch -----
    if (typeof step.if !== "undefined") {
      const branch = asBool(step.if, outCtx, last, initialArgs)
        ? step.then || []
        : step.else || [];
      onEvent?.({
        type: "branch:enter",
        index: i,
        step,
        chosen: branch === (step.then || []) ? "then" : "else",
      });

      // If resuming and this frame matches, dive into inner with resume info
      let innerStart = 0,
        innerPath = null;
      if (
        Array.isArray(resumePath) &&
        resumePath[0]?.kind === "branch" &&
        resumePath[0].index === i
      ) {
        const f = resumePath[0];
        const expect = f.which === "then" ? step.then || [] : step.else || [];
        if (expect === branch) {
          innerStart = resumeFrom;
          innerPath = resumePath.slice(1);
        }
      }

      const sub = await executeSteps(registry, branch, {
        initialArgs,
        outCtx,
        startIndex: innerStart,
        parentTool: `${parentTool}#branch@${i}`,
        onEvent,
        resumePath: innerPath,
        resumeFrom,
      });

      if (sub.state?.paused) {
        const frame = {
          kind: "branch",
          index: i,
          which: branch === (step.then || []) ? "then" : "else",
        };
        const ck = pushPath(sub.state.checkpoint, frame);
        return {
          outCtx: sub.outCtx,
          last: sub.last,
          state: { paused: true, checkpoint: ck },
        };
      }

      outCtx = sub.outCtx;
      last = sub.last;
      onEvent?.({ type: "branch:exit", index: i, step, last });
      continue;
    }

    // ----- each loop -----
    if (step.each) {
      const items = asVal(step.each, outCtx, last, initialArgs) || [];
      const bucket = [];

      let kStart = 0,
        innerEachPath = null;
      if (
        Array.isArray(resumePath) &&
        resumePath[0]?.kind === "each" &&
        resumePath[0].index === i
      ) {
        kStart = resumePath[0].k ?? 0;
        innerEachPath = resumePath.slice(1);
      }

      for (let k = kStart; k < items.length; k++) {
        const item = items[k];
        const loopCtx = Object.assign(outCtx, {
          $loop: { item, index: k, length: items.length },
        });

        const sub = await executeSteps(registry, step.body || [], {
          initialArgs,
          outCtx: loopCtx,
          startIndex: innerEachPath && k === kStart ? resumeFrom : 0,
          parentTool: `${parentTool}#each@${i}[${k}]`,
          onEvent,
          resumePath: innerEachPath && k === kStart ? innerEachPath : null,
          resumeFrom,
        });

        if (sub.state?.paused) {
          const frame = { kind: "each", index: i, k, length: items.length };
          const ck = pushPath(sub.state.checkpoint, frame);
          return {
            outCtx: sub.outCtx,
            last: sub.last,
            state: { paused: true, checkpoint: ck },
          };
        }

        outCtx = sub.outCtx;
        bucket.push(sub.last);
        last = sub.last;
      }

      if (step.collect && step.label) outCtx[step.label] = bucket;
      else if (step.collect) outCtx[step.collect] = bucket;
      continue;
    }

    // ----- while/until loop -----
    if (step.while || step.until) {
      let guard = () => true;
      if (step.while)
        guard = () => asBool(step.while, outCtx, last, initialArgs);
      if (step.until)
        guard = () => !asBool(step.until, outCtx, last, initialArgs);

      const limit = Number.isFinite(step.max) ? step.max : 1e3;
      let count = 0;

      let innerLoopPath = null;
      let innerResumeFrom = resumeFrom;
      if (
        Array.isArray(resumePath) &&
        resumePath[0]?.kind === "loop" &&
        resumePath[0].index === i
      ) {
        // We paused during iteration `count`; set count so that after count++ we re-enter that same iteration.
        count = Math.max(0, (resumePath[0].count | 0) - 1);
        innerLoopPath = resumePath.slice(1);
      }

      while (guard()) {
        if (count++ >= limit)
          throw new Error(`Loop limit exceeded at step ${i} (max=${limit})`);

        // Use resume (inner index/path) only once — for the first resumed iteration.
        const useResumeThisIter = !!innerLoopPath;
        const sub = await executeSteps(registry, step.body || [], {
          initialArgs,
          outCtx,
          startIndex: useResumeThisIter ? innerResumeFrom : 0,
          parentTool: `${parentTool}#loop@${i}#${count}`,
          onEvent,
          resumePath: useResumeThisIter ? innerLoopPath : null,
          resumeFrom: useResumeThisIter ? innerResumeFrom : 0,
        });

        if (sub.state?.paused) {
          const frame = { kind: "loop", index: i, count };
          const ck = pushPath(sub.state.checkpoint, frame);
          return {
            outCtx: sub.outCtx,
            last: sub.last,
            state: { paused: true, checkpoint: ck },
          };
        }

        outCtx = sub.outCtx;
        last = sub.last;
        if (useResumeThisIter) {
          innerLoopPath = null;
          innerResumeFrom = 0;
        }
      }
      continue;
    }

    // ----- Early return -----
    if (typeof step.return === "function") {
      const value = await step.return(outCtx, last, initialArgs);
      return { outCtx, last: value, state: { done: true } };
    }

    // --- inline run (compute, then possibly pause) ---
    if (typeof step.run === "function") {
      onEvent?.({ type: "step:start", index: i, step });
      const res = await step.run(outCtx, last, initialArgs);
      if (step.label) outCtx[step.label] = res;
      last = res;
      onEvent?.({ type: "step:result", index: i, step, result: res });

      if (step.pause || step.await) {
        const checkpoint = makeCheckpoint(i, step);
        onEvent?.({ type: "plan:pause", index: i, step, checkpoint });
        return { outCtx, last, state: { paused: true, checkpoint } };
      }
      continue;
    }

    // --- tool step (compute, then possibly pause/await-final) ---
    if (step.tool) {
      const toolName = step.tool;
      const stepArgs = resolveStepArgs(step, outCtx, last, initialArgs);
      const stepCtx = { ...outCtx, step, planParent: parentTool };
      onEvent?.({
        type: "step:start",
        index: i,
        step,
        tool: toolName,
        args: stepArgs,
      });

      let res = await registry.callLocal(toolName, stepArgs, stepCtx);

      // Prefer optimistic now unless told to await final or pause on async.
      const wantAwaitFinal = !!(step.awaitFinal || step.await === "final");
      const pauseOnAsync = !!step.pauseOnAsync;

      if (isAsyncEnvelope(res)) {
        if (wantAwaitFinal) {
          res = await ensureFinal(res);
        } else if (pauseOnAsync) {
          // Keep optimistic for preview, but pause so resume can proceed with final later.
          const preview = pickOptimistic(res);
          if (step.label) outCtx[step.label] = preview;
          last = preview;

          const checkpoint = makeCheckpoint(i, { ...step, reason: "async" });
          // Carry runId in checkpoint meta to help UIs correlate if needed
          checkpoint.meta = {
            ...(checkpoint.meta || {}),
            runId: res.runId,
            tool: toolName,
          };
          onEvent?.({ type: "plan:pause", index: i, step, checkpoint });
          return { outCtx, last, state: { paused: true, checkpoint } };
        } else {
          res = pickOptimistic(res);
        }
      }

      if (step.label) outCtx[step.label] = res;
      last = res;
      onEvent?.({ type: "step:result", index: i, step, result: res });

      if (typeof step.output === "function") {
        onEvent?.({ type: "step:output:start", index: i, step });
        const r2 = await step.output(last, outCtx, initialArgs);
        if (step.label) outCtx[step.label] = r2;
        last = r2;
        onEvent?.({ type: "step:output:result", index: i, step, result: r2 });
      }

      if (step.pause || step.await) {
        const checkpoint = makeCheckpoint(i, step);
        onEvent?.({ type: "plan:pause", index: i, step, checkpoint });
        return { outCtx, last, state: { paused: true, checkpoint } };
      }
      continue;
    }

    // No-op
    onEvent?.({ type: "step:no-op", index: i, step });
  }

  return { outCtx, last, state: { done: true } };
}

/**
 * Public plan runner with finalisation (awaits tool-level / last-step output).
 */
export async function runPlan(
  registry,
  steps,
  {
    initialArgs = {},
    ctx = {},
    parentTool = "",
    toolSpec = null,
    onEvent = null,
    resumeFrom = 0,
    resumePath = null,
  } = {}
) {
  const baseCtx = { ...ctx, $input: initialArgs, $results: [] };

  // If resuming into a nested flow, jump outer cursor to that frame's index
  // so earlier top-level steps aren't re-run.
  const startIndex =
    Array.isArray(resumePath) && resumePath.length
      ? Math.max(0, Number(resumePath[0]?.index ?? 0))
      : resumeFrom;
  const { outCtx, last, state } = await executeSteps(registry, steps, {
    initialArgs,
    outCtx: baseCtx,
    startIndex,
    parentTool,
    onEvent,
    resumePath,
    resumeFrom,
  });

  if (state?.paused) {
    return {
      __PLAN_PAUSED__: true,
      checkpoint: { tool: parentTool, ...state.checkpoint },
      preview: last ?? null,
    };
  }
  if (!state?.done) throw new Error("Plan ended in unknown state");

  const lastStep = steps?.[steps.length - 1];
  let finalVal = last;

  if (toolSpec?.finalise && typeof toolSpec.finalise === "function") {
    finalVal = await toolSpec.finalise(outCtx, last);
  } else if (lastStep?.finalise && typeof lastStep.finalise === "function") {
    finalVal = await lastStep.finalise(outCtx, last);
  }

  return finalVal ?? outCtx;
}

/**
 * Resume a paused plan from a checkpoint.
 * Provide the original plan (or recompute from tool.plan(initialArgs)).
 */
export async function resumePlan(
  registry,
  steps,
  checkpoint,
  { toolSpec = null, onEvent = null } = {}
) {
  const { ctx, index, parentTool } = checkpoint || {};
  if (index == null || !ctx) throw new Error("Invalid checkpoint");
  return runPlan(registry, steps, {
    initialArgs: ctx.$input ?? {},
    ctx,
    parentTool,
    toolSpec,
    onEvent,
    resumeFrom: index + 1,
    resumePath: Array.isArray(checkpoint.path) ? checkpoint.path : null,
  });
}

// ---------------- REGISTRY CORE ----------------
export function createToolRegistry({
  title = "Tools",
  version = "0.1.0",
  serverUrl = isBrowser() ? location.origin : "/",
} = {}) {
  const tools = new Map();

  // ---------------- In-memory run manager ----------------
  const runs = new Map(); // runId -> { id, name, args, status, result?, error?, startedAt, endedAt? }
  const listeners = new Set(); // fn(event)

  function emit(event) {
    for (const fn of listeners) {
      try {
        fn(event);
      } catch {}
    }
  }
  function onRun(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
  function createRunId() {
    return (
      "run_" + Math.random().toString(36).slice(2) + Date.now().toString(36)
    );
  }

  async function resolveParameters(t, ctx) {
    let p = t?.parameters;
    if (typeof p === "function") p = p.length > 0 ? await p(ctx) : await p();
    return p || { type: "object", properties: {} };
  }

  // ---------------- Tool definition ----------------
  function define(spec) {
    const {
      name,
      description = "",
      parameters = null,
      handler,
      stub = null,
      beforeRun = null,
      afterRun = null,
      runServer = null,
      safe = false,
      tags = [],
      plan = null,
      output = null,
    } = spec || {};
    if (!name) throw new Error("Tool name required");

    const hasExec =
      typeof handler === "function" ||
      typeof stub === "function" ||
      typeof beforeRun === "function" ||
      typeof afterRun === "function" ||
      typeof runServer === "function" ||
      typeof plan === "function";

    if (!hasExec)
      throw new Error(`Tool "${name}" requires a handler/stub or a plan`);
    if (tools.has(name)) throw new Error(`Tool already defined: ${name}`);

    tools.set(name, {
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

  // ---------------- Shared async runner ----------------
  async function _runToolImpl(t, name, args, ctx) {
    if (isPlanTool(t)) {
      const plan = makePlan(t, args, ctx);
      return await runPlan(api, plan, {
        initialArgs: args,
        ctx,
        parentTool: name,
        toolSpec: t,
      });
    }
    const runServer = t.runServer || t.handler || t.afterRun || t.stub;
    return await runServer(args, ctx);
  }

  function startAsyncRun(t, name, args, ctx) {
    const id = createRunId();
    const record = { id, name, args, status: "running", startedAt: Date.now() };
    runs.set(id, record);
    emit({ type: "run:started", runId: id, name, args });

    (async () => {
      try {
        const result = await _runToolImpl(t, name, args, { ...ctx, runId: id });
        record.status = "done";
        record.result = result ?? {};
        record.endedAt = Date.now();
        emit({ type: "run:finished", runId: id, name, result: record.result });
      } catch (err) {
        record.status = "error";
        record.error = String(err?.message || err);
        record.endedAt = Date.now();
        emit({ type: "run:error", runId: id, name, error: record.error });
      }
    })();

    return id;
  }

  function getRun(id) {
    return runs.get(id) || null;
  }

  // NEW: wait for a locally-started run to finish (no network)
  function waitForLocalFinal(runId) {
    return new Promise((resolve, reject) => {
      const current = getRun(runId);
      if (current) {
        if (current.status === "done") return resolve(current.result ?? {});
        if (current.status === "error")
          return reject(new Error(current.error || "run error"));
      }
      const off = onRun((ev) => {
        if (ev.runId !== runId) return;
        if (ev.type === "run:finished") {
          off();
          resolve(ev.result ?? {});
        } else if (ev.type === "run:error") {
          off();
          reject(new Error(ev.error || "run error"));
        }
      });
    });
  }

  // ---------------- Browser SSE client & helpers (isomorphic safe) ----------------
  const _hasSSE = isBrowser() && "EventSource" in window;
  let _es = null;
  const _pending = new Map(); // runId -> { resolve, reject, promise }

  function _baseUrl(u) {
    const b = (serverUrl || "/").replace(/\/+$/, "");
    return `${b}${u}`;
  }

  function _ensureEventSource() {
    if (!_hasSSE || _es) return;
    _es = new EventSource(_baseUrl("/rpc/events"));
    _es.addEventListener("run:finished", (e) => {
      try {
        const ev = JSON.parse(e.data);
        const p = _pending.get(ev.runId);
        if (p) {
          p.resolve(ev.result);
          _pending.delete(ev.runId);
        }
      } catch {}
    });
    _es.addEventListener("run:error", (e) => {
      try {
        const ev = JSON.parse(e.data);
        const p = _pending.get(ev.runId);
        if (p) {
          p.reject(new Error(ev.error || "run error"));
          _pending.delete(ev.runId);
        }
      } catch {}
    });
    // optional: handle network errors silently; EventSource auto-reconnects
  }

  async function _pollRun(
    runId,
    { signal, interval = 600, max = 5000, timeout = 30000 } = {}
  ) {
    const t0 = Date.now();
    let delay = interval;
    while (true) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const res = await fetch(
        _baseUrl(`/rpc/runs/${encodeURIComponent(runId)}`),
        { signal }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json?.status === "done") return json.result;
      if (json?.status === "error") throw new Error(json.error || "run error");
      if (Date.now() - t0 > timeout)
        throw new Error("Timed out waiting for run");
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(max, Math.ceil(delay * 1.5));
    }
  }

  function _awaitFinal(runId) {
    // Prefer SSE; fall back to polling automatically
    if (_hasSSE) {
      _ensureEventSource();
      const existing = _pending.get(runId);
      if (existing) return existing.promise;
      let resolve, reject;
      const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });
      _pending.set(runId, { resolve, reject, promise });
      // Backstop with polling if SSE doesn't deliver within 35s (e.g., corporate proxy)
      const ctl = new AbortController();
      setTimeout(() => {
        if (_pending.has(runId)) {
          _pollRun(runId, { signal: ctl.signal })
            .then((r) => {
              const p = _pending.get(runId);
              if (p) {
                p.resolve(r);
                _pending.delete(runId);
              }
            })
            .catch((err) => {
              const p = _pending.get(runId);
              if (p) {
                p.reject(err);
                _pending.delete(runId);
              }
            });
        }
      }, 35000);
      return promise;
    }
    // No SSE available: pure polling
    return _pollRun(runId);
  }

  // ---------------- callLocal ----------------
  async function callLocal(name, args = {}, ctx = {}) {
    const t = tools.get(name);
    if (!t) {
      try {
        return callRemote(name, args, ctx);
      } catch (error) {
        return error;
      }
    }

    // Plan tools
    if (isPlanTool(t)) {
      // Allow beforeRun to request async + optimistic
      if (typeof t.beforeRun === "function") {
        const hint = await t.beforeRun(args, ctx);
        if (hint && typeof hint === "object" && hint.async) {
          // IMPORTANT: in the browser, offload async PLAN runs to the SERVER
          if (isBrowser()) {
            return callRemote(
              name,
              {
                ...(hint.runArgs ?? args),
                __async: true,
                __optimistic: hint.optimistic ?? null,
              },
              ctx
            );
          }
          // Server-side: start local run manager and attach .final
          const runId = startAsyncRun(t, name, hint.runArgs ?? args, ctx);
          const out = {
            runId,
            status: "accepted",
            optimistic: hint.optimistic ?? null,
          };
          Object.defineProperty(out, "final", {
            enumerable: false,
            value: waitForLocalFinal(runId).catch((err) => ({
              ok: false,
              error: String(err?.message || err),
            })),
          });
          return out;
        }
        if (hint && typeof hint === "object") args = hint; // transform args
      }

      const plan = makePlan(t, args, ctx);
      const final = await runPlan(api, plan, {
        initialArgs: args,
        ctx,
        parentTool: name,
        toolSpec: t,
      });
      return final;
    }

    // Single-step tools (validate)
    const schema = await resolveParameters(t, ctx);
    let { stub, handler, beforeRun, afterRun, runServer } = t;
    afterRun = afterRun || stub || null;
    runServer = runServer || handler || null;

    const v = validate(schema, args);
    if (!v.ok) throw new Error(v.error);

    if (typeof beforeRun === "function") {
      const hint = await beforeRun(v.value, ctx);
      if (hint && typeof hint === "object" && hint.async) {
        // In browser, prefer remote so server does the heavy work
        if (isBrowser() && typeof runServer === "function") {
          return callRemote(
            name,
            {
              ...(hint.runArgs ?? v.value),
              __async: true,
              __optimistic: hint.optimistic ?? null,
            },
            ctx
          );
        }
        const runId = startAsyncRun(t, name, hint.runArgs ?? v.value, ctx);
        const out = {
          runId,
          status: "accepted",
          optimistic: hint.optimistic ?? null,
        };
        // Attach .final both server & browser so awaitFinal in plans actually awaits
        Object.defineProperty(out, "final", {
          enumerable: false,
          value: isBrowser()
            ? _awaitFinal(runId).then(
                (result) => result,
                (err) => ({ ok: false, error: String(err?.message || err) })
              )
            : waitForLocalFinal(runId).catch((err) => ({
                ok: false,
                error: String(err?.message || err),
              })),
        });
        return out;
      }
      if (hint && typeof hint === "object") args = hint;
    }

    if (isBrowser()) {
      let runArgs = args;
      if (typeof runServer === "function") {
        return callRemote(name, runArgs, ctx).then((result) => {
          if (typeof afterRun === "function")
            return afterRun(runArgs, { ...ctx, result });
          return result;
        });
      } else if (typeof afterRun === "function") {
        return afterRun(runArgs, ctx);
      }
    } else if (typeof runServer === "function") {
      return runServer(args, ctx);
    }
  }

  // ---------------- callRemote (browser) ----------------
  async function callRemote(name, args = {}) {
    if (!isBrowser() || typeof fetch !== "function") {
      throw new Error("Remote calls not supported in this environment");
    }
    const url = new URL(_baseUrl(`/rpc/${name}`));
    const init = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args || {}),
    };
    const res = await fetch(url.toString(), init);
    const txt = await res.text();
    if (!res.ok)
      throw new Error(`HTTP ${res.status}: ${txt || res.statusText}`);

    const json = txt ? JSON.parse(txt) : null;
    if (json && typeof json === "object" && json.error)
      throw new Error(String(json.error));

    // If async accepted, attach .final promise automatically (browser path)
    if (json && json.runId) {
      Object.defineProperty(json, "final", {
        enumerable: false,
        value: _awaitFinal(json.runId).then(
          (result) => result,
          (err) => ({ ok: false, error: String(err?.message || err) })
        ),
      });
    }
    return json;
  }

  // ---------------- Server attach (RPC + SSE + status) ----------------
  function attach(router, { prefix = "/rpc" } = {}) {
    router.get(prefix, () => ({ tools: Array.from(tools.keys()) }));

    router.get(`${prefix}/tools`, async (_args, ctx) => ({
      tools: await toOpenAITools(ctx),
    }));

    for (const t of tools.values()) {
      const url = `${prefix}/${t.name}`;

      router.post(url, async (args, ctx) => {
        const paramSchema = await resolveParameters(t, ctx);
        const v = validate(paramSchema, args || {});
        if (!v.ok) return { status: 400, json: { error: v.error } };

        const wantsAsync = !!args?.__async;

        // Plans
        if (isPlanTool(t)) {
          try {
            if (wantsAsync) {
              let runArgs = v.value;
              let optimistic = args?.__optimistic ?? null;
              if (typeof t.beforeRun === "function") {
                const hint = await t.beforeRun(runArgs, ctx);
                if (hint && typeof hint === "object") {
                  if (hint.runArgs) runArgs = hint.runArgs;
                  if ("optimistic" in hint && optimistic == null)
                    optimistic = hint.optimistic;
                }
              }
              const runId = startAsyncRun(t, t.name, runArgs, ctx);
              return { status: 202, json: { runId, optimistic } };
            }
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

        // Single-step
        if (wantsAsync) {
          let runArgs = v.value;
          let optimistic = args?.__optimistic ?? null;
          if (typeof t.beforeRun === "function") {
            const hint = await t.beforeRun(runArgs, ctx);
            if (hint && typeof hint === "object") {
              if (hint.runArgs) runArgs = hint.runArgs;
              if ("optimistic" in hint && optimistic == null)
                optimistic = hint.optimistic;
            }
          }
          const runId = startAsyncRun(t, t.name, runArgs, ctx);
          return { status: 202, json: { runId, optimistic } };
        }

        const result = await (t.handler || t.stub || t.runServer || t.afterRun)(
          v.value,
          ctx
        );
        return { status: 200, json: result ?? {} };
      });

      if (t.safe) {
        router.get(url, async (args, ctx) => {
          const schema = await resolveParameters(t, ctx);
          const v = validate(schema, args || {});
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

    // Run status
    router.get(`${prefix}/runs/:id`, (args) => {
      const id = args?.params?.id || args?.id;
      const run = getRun(id);
      if (!run) return { status: 404, json: { error: "Not found" } };
      return { status: 200, json: run };
    });

    // SSE stream of run events
    router.get(`${prefix}/events`, (_args, ctx) => {
      const res = ctx?.res || ctx; // adapt to router
      // Required SSE headers
      res.writeHead?.(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      const write = (event, data) => {
        if (event) res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      // hello + heartbeat
      write("hello", { ok: true });
      const hb = setInterval(() => res.write(`:keepalive\n\n`), 15000);

      // forward onRun bus
      const off = onRun((ev) => write(ev.type, ev));

      const done = () => {
        clearInterval(hb);
        off();
        try {
          res.end();
        } catch {}
      };
      res.on?.("close", done);
      res.on?.("finish", done);

      // Tell router we're streaming; no auto JSON
      return { status: 200 };
    });
  }

  // ---------------- OpenAI / OpenAPI ----------------
  async function toOpenAITools(ctx = {}) {
    const specs = await Promise.all(
      list().map(async (t) => {
        const parameters = await resolveParameters(t, ctx);
        return {
          type: "function",
          function: {
            name: t.name,
            description: t.description || "",
            parameters,
          },
        };
      })
    );
    return specs;
  }

  async function toOpenApi({ prefix = "/rpc" } = {}) {
    const paths = {};
    for (const t of tools.values()) {
      const p = `${prefix}/${t.name}`;
      const base = {
        operationId: t.name,
        summary: t.description,
        tags: t.tags?.length ? t.tags : undefined,
        responses: {
          200: { description: "OK" },
          202: { description: "Accepted (async)" },
        },
      };
      paths[p] ||= {};

      const paramSchema = await resolveParameters(t);

      paths[p].post = {
        ...base,
        requestBody: paramSchema
          ? {
              required: true,
              content: { "application/json": { schema: paramSchema } },
            }
          : undefined,
      };

      if (t.safe) {
        const params = paramSchema?.properties
          ? Object.entries(paramSchema.properties).map(([name, schema]) => ({
              name,
              in: "query",
              required: (paramSchema.required || []).includes(name),
              schema,
            }))
          : undefined;
        paths[p].get = { ...base, parameters: params };
      }
    }

    // run status
    paths[`${prefix}/runs/{id}`] = {
      get: {
        operationId: "getRunStatus",
        summary: "Get async run status/result",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: { description: "OK" },
          404: { description: "Not found" },
        },
      },
    };

    // events (SSE)
    paths[`${prefix}/events`] = {
      get: {
        operationId: "subscribeRunEvents",
        summary: "Server-Sent Events stream of run lifecycle events",
        responses: { 200: { description: "SSE stream" } },
      },
    };

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
    router.get(path, async () => ({
      status: 200,
      json: await toOpenApi({ prefix }),
    }));
  }

  // ---------------- misc ----------------
  function list() {
    return Array.from(tools.values());
  }
  function find(name) {
    return tools.get(name) || null;
  }

  // convenience: await final result by id
  async function awaitFinal(runId) {
    return _awaitFinal(runId);
  }

  // convenience: auto-apply handler (optional for consumers)
  async function $auto(name, args, apply) {
    const r = await api.$call(name, args);
    const seed = r.ok ? r : r.optimistic;
    if (apply && seed?.ok) apply(seed);
    r.final?.then((fin) => fin?.ok && apply?.(fin));
    return r;
  }

  const api = {
    define,
    defineMany,
    list,
    find,
    callLocal,
    $call: callLocal,
    attach,
    toOpenAITools,
    toOpenApi,
    mountOpenApi,
    runPlan: (steps, opts = {}) => runPlan(api, steps, opts),
    // Run manager surface
    onRun,
    getRun,
    awaitFinal,
    $auto,
  };
  return api;
}

// ---------- singleton helpers ----------
export function getToolRegistry(opts = {}) {
  const KEY = Symbol.for("@loki/minihttp:tool-registry");
  return getGlobalSingleton(KEY, () => createToolRegistry(opts));
}
export const toolRegistry = getToolRegistry();
