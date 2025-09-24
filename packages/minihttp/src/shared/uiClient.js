// UI client: emits overlay events and awaits resumes via the global event bus.

import { globalEventBus as bus } from "@loki/events/util";
import { getGlobalSingleton } from "@loki/utilities";

/** Low-level emitter used by the client (also exported if you need it). */
export function emitUIOnBus({ type, tool, runId, view = null, extra = null }) {
  bus.emit({
    ts: Date.now(),
    channel: "ui",
    type, // "ui:open" | "ui:update" | "ui:close" | "ui:loading" | "ui:resume"
    name: tool,
    runId,
    payload: {
      tool,
      runId,
      ...(view || {}),
      ...(extra || {}),
    },
  });
}

/** Wait for a matching ui:resume event. */
export function awaitUIResumeFromBus({
  runId,
  tool,
  timeoutMs = 0,
  predicate = null,
}) {
  return new Promise((resolve, reject) => {
    let timer = null;
    const off = bus.on((ev) => {
      if (ev?.channel !== "ui" || ev?.type !== "ui:resume") return;
      const r = ev.runId || ev?.payload?.runId;
      const t = ev.name || ev?.payload?.tool;
      if (runId && r !== runId) return;
      if (tool && t && t !== tool) return;
      if (predicate && !predicate(ev)) return;

      off && off();
      if (timer) clearTimeout(timer);
      resolve(ev.payload || {});
    });
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        off && off();
        reject(new Error("ui:resume timeout"));
      }, timeoutMs);
    }
  });
}

/**
 * Create a UI client. If `bound` contains { tool, runId }, all calls
 * will include them automatically. You can still pass per-call meta to override.
 */
export function createUiClient(bound = {}) {
  const metaOf = (meta = {}) => ({
    tool: meta.tool ?? bound.tool ?? null,
    runId: meta.runId ?? bound.runId ?? null,
  });

  const emit = (evtOrView, meta) => {
    const { tool, runId } = metaOf(meta);
    if (!evtOrView || typeof evtOrView !== "object") {
      throw new Error("ui.emit expects an event or a view object");
    }
    if (evtOrView.type?.startsWith?.("ui:")) {
      emitUIOnBus({
        type: evtOrView.type,
        tool,
        runId,
        view: evtOrView.view || null,
        extra: evtOrView.payload || null,
      });
    } else {
      // treat as a view update by default
      emitUIOnBus({ type: "ui:update", tool, runId, view: evtOrView });
    }
  };

  const open = (view, meta) =>
    emitUIOnBus({ type: "ui:open", ...metaOf(meta), view });
  const update = (view, meta) =>
    emitUIOnBus({ type: "ui:update", ...metaOf(meta), view });
  const loading = (view, meta) =>
    emitUIOnBus({ type: "ui:loading", ...metaOf(meta), view });
  const close = (meta) => emitUIOnBus({ type: "ui:close", ...metaOf(meta) });
  const clear = close;

  const awaitResume = (opts = {}) =>
    awaitUIResumeFromBus({
      ...metaOf(opts),
      timeoutMs: opts.timeoutMs,
      predicate: opts.predicate,
    });

  return { emit, open, update, loading, close, clear, awaitResume };
}

// Global UI client singleton (unbound).
export function getUi() {
  const KEY = Symbol.for("@loki/minihttp:ui-client");
  return getGlobalSingleton(KEY, () => createUiClient());
}

export const ui = getUi();
