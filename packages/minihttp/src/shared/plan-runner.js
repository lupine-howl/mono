// src/shared/plan-runner.js
// Pure plan execution utilities (no registry, no network)

const asBool = (v, ...args) => (typeof v === "function" ? !!v(...args) : !!v);
const asVal = (v, ...args) => (typeof v === "function" ? v(...args) : v);

// optimistic/final helpers (used by tool steps)
function isAsyncEnvelope(x) {
  return !!(x && typeof x === "object" && "runId" in x);
}
function pickOptimistic(x) {
  if (x && x.ok !== undefined) return x; // already final shape
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

// -------- public helpers for plans --------
export function resolveStepArgs(step, ctx, lastResult, initialArgs) {
  if ("input" in (step || {})) {
    return typeof step.input === "function"
      ? step.input(ctx, initialArgs)
      : step.input || {};
  }
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
    resumePath = null,
    resumeFrom = 0,
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

    // when/skip
    if (
      step.when !== undefined &&
      !asBool(step.when, outCtx, last, initialArgs)
    ) {
      onEvent?.({ type: "step:skip", index: i, step });
      continue;
    }

    // if/then/else
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

    // each
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

    // while/until
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
        count = Math.max(0, (resumePath[0].count | 0) - 1);
        innerLoopPath = resumePath.slice(1);
      }

      while (guard()) {
        if (count++ >= limit)
          throw new Error(`Loop limit exceeded at step ${i} (max=${limit})`);

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

    // early return
    if (typeof step.return === "function") {
      const value = await step.return(outCtx, last, initialArgs);
      return { outCtx, last: value, state: { done: true } };
    }

    // inline run
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

    // tool step
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

      const wantAwaitFinal = !!(step.awaitFinal || step.await === "final");
      const pauseOnAsync = !!step.pauseOnAsync;

      if (isAsyncEnvelope(res)) {
        if (wantAwaitFinal) {
          res = await ensureFinal(res);
        } else if (pauseOnAsync) {
          const preview = pickOptimistic(res);
          if (step.label) outCtx[step.label] = preview;
          last = preview;

          const checkpoint = makeCheckpoint(i, { ...step, reason: "async" });
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

    onEvent?.({ type: "step:no-op", index: i, step });
  }

  return { outCtx, last, state: { done: true } };
}

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
