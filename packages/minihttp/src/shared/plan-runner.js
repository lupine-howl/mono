// src/registry/plan-runner.js

// --- helpers to evaluate booleans/funcs/values
const asBool = (v, ...args) => (typeof v === "function" ? !!v(...args) : !!v);
const asVal = (v, ...args) => (typeof v === "function" ? v(...args) : v);

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
    // console.debug?.("STEP", { i, step, resumePath, resumeFrom });

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
        // After the first resumed iteration, consume the resume info so subsequent
        // iterations start from inner step 0 and run the whole loop body again.
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

    // --- tool step (compute, then possibly pause) ---
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

      const res = await registry.callLocal(toolName, stepArgs, stepCtx);
      console.log?.("Tool result", { toolName, res });
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
