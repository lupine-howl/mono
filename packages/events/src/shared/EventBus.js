// @loki/run-events — channel-agnostic event bus + SSE bridge + client

const noop = () => {};
const safe = (fn, a) => {
  try {
    fn(a);
  } catch {}
};

function _now() {
  return Date.now();
}
function _id() {
  return "ev_" + Math.random().toString(36).slice(2) + _now().toString(36);
}
function _isBrowser() {
  return typeof window !== "undefined";
}

// global singleton store (isomorphic)
function getGlobalSingleton(key, factory) {
  const g = globalThis;
  const bucket = (g.__LOKI_SINGLETONS__ ||= new Map());
  if (!bucket.has(key)) bucket.set(key, factory());
  return bucket.get(key);
}

// ----------------------------
// Event bus (in-proc, singleton) with de-dupe + reentrancy guard + keyed subs
// ----------------------------
export function createEventBus({ maxSeen = 20000 } = {}) {
  const listeners = new Set(); // Set<(ev)=>void>
  const keyed = new Map(); // Map<key, unsubscribe>
  const seen = new Set(); // Set<event.id>
  const order = []; // ring buffer of ids
  const q = []; // pending events FIFO
  let flushing = false;

  const _markSeen = (id) => {
    if (!id) return;
    if (seen.has(id)) return true;
    seen.add(id);
    order.push(id);
    if (order.length > maxSeen) seen.delete(order.shift());
    return false;
  };

  function emit(ev) {
    if (!ev || typeof ev !== "object") return; // normalize + de-dupe
    if (!ev.id) ev.id = _id();
    if (!("ts" in ev)) ev.ts = _now();
    if (_markSeen(ev.id)) return; // drop duplicates by id

    q.push(ev);
    if (flushing) return; // reentrancy guard: queue + flush loop

    flushing = true;
    try {
      while (q.length) {
        const next = q.shift();
        for (const fn of Array.from(listeners)) safe(fn, next);
      }
    } finally {
      flushing = false;
    }
  }

  const on = (fn) => (listeners.add(fn), () => listeners.delete(fn));

  // Ensure only one active listener per key (great for services / hot reload)
  function onKey(key, fn) {
    const old = keyed.get(key);
    if (old) safe(old);
    const off = on(fn);
    keyed.set(key, off);
    return () => {
      const cur = keyed.get(key);
      if (cur === off) keyed.delete(key);
      off();
    };
  }

  return {
    emit,
    on,
    onKey,
    off: (fn) => listeners.delete(fn),
    listenerCount: () => listeners.size,
    _debug: () => ({ listeners: listeners.size, keyed: [...keyed.keys()] }),
  };
}

export function getGlobalEventBus() {
  return getGlobalSingleton("@@loki/run-events:bus", () => createEventBus());
}
export const globalEventBus = getGlobalEventBus();

// ----------------------------
// Server: SSE outbound
// ----------------------------
export function mountEventsSSE(router, { path = "/rpc/events", bus } = {}) {
  if (!router) throw new Error("mountEventsSSE: router required");
  bus ||= getGlobalEventBus();

  router.get(path, (_args, ctx) => {
    const res = ctx?.res || ctx;
    res.writeHead?.(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const write = (ev) => {
      if (!ev || !ev.type) return;
      try {
        res.write(`event: ${ev.type}\n`);
        res.write(`data: ${JSON.stringify(ev)}\n\n`);
      } catch {}
    };

    // hello + heartbeat
    write({ id: _id(), type: "hello", ok: true, ts: _now(), channel: "sys" });
    const hb = setInterval(() => res.write(`:keepalive\n\n`), 15000);

    const off = bus.on(write);
    const done = () => {
      clearInterval(hb);
      off();
      try {
        res.end();
      } catch {}
    };
    res.on?.("close", done);
    res.on?.("finish", done);

    return { status: 200 };
  });
}

// ----------------------------
// Server: event ingest (client -> server)
// ----------------------------
export function mountEventsIngest(
  router,
  { path = "/rpc/ui-events", bus, allow, transform } = {}
) {
  if (!router) throw new Error("mountEventsIngest: router required");
  bus ||= getGlobalEventBus();

  router.post(path, async (body = {}, ctx) => {
    const ev = {
      id: body.id || _id(),
      type: String(body.type || "").trim(),
      channel: body.channel || "ui",
      payload: body.payload ?? null,
      meta: body.meta ?? null,
      ts: body.ts || _now(),
      source: "client",
      ip: ctx?.req?.socket?.remoteAddress || undefined,
      user: ctx?.user || undefined,
    };
    if (!ev.type) return { status: 400, json: { error: "Missing event type" } };
    if (typeof allow === "function" && !allow(ev))
      return { status: 403, json: { error: "Forbidden" } };
    const out = typeof transform === "function" ? transform(ev) || ev : ev;
    bus.emit(out);
    return { status: 200, json: { ok: true, id: out.id } };
  });
}

// ----------------------------
// Browser: shared EventSource channel per URL
// ----------------------------
const _sharedByUrl = _isBrowser()
  ? (window.__LOKI_EVENTS_SHARED__ ||= new Map())
  : new Map();

function _getSharedChannel(eventsUrl) {
  let shared = _sharedByUrl.get(eventsUrl);
  if (shared) return shared;

  const anyListeners = new Set();
  const typeListeners = new Map(); // Map<type, Set<fn>>
  const fwdCache = new Map(); // Map<type, (MessageEvent)=>void>
  let es = null;
  let refCount = 0;

  const forward = (type) => {
    if (fwdCache.has(type)) return fwdCache.get(type);
    const fn = (e) => {
      let ev;
      try {
        ev = JSON.parse(e.data);
      } catch {
        return;
      }
      if (!ev.type) ev.type = type;
      const bucket = typeListeners.get(ev.type);
      if (bucket) for (const h of bucket) safe(h, ev);
      for (const h of anyListeners) safe(h, ev);
    };
    fwdCache.set(type, fn);
    return fn;
  };

  const ensureES = () => {
    if (es || !_isBrowser() || !window.EventSource) return;
    es = new EventSource(eventsUrl);

    const onType = (t) => es.addEventListener(t, forward(t));
    [
      "hello",
      "run:started",
      "run:finished",
      "run:error",
      "ui:loading",
      "ui:update",
    ].forEach(onType);
    es.addEventListener("message", forward("message")); // wildcard fallback

    // register any types that callers already subscribed to
    for (const t of typeListeners.keys()) safe(() => onType(t));
  };

  const addRef = () => {
    refCount++;
    ensureES();
  };
  const releaseRef = () => {
    refCount = Math.max(0, refCount - 1);
    if (refCount === 0 && es) {
      try {
        es.close();
      } catch {}
      es = null;
      anyListeners.clear();
      typeListeners.clear();
      fwdCache.clear();
      _sharedByUrl.delete(eventsUrl);
    }
  };

  shared = {
    addAny(fn) {
      addRef();
      anyListeners.add(fn);
      return () => {
        anyListeners.delete(fn);
        releaseRef();
      };
    },
    addType(type, fn) {
      addRef();
      if (!typeListeners.has(type)) typeListeners.set(type, new Set());
      typeListeners.get(type).add(fn);
      if (es) safe(() => es.addEventListener(type, forward(type)));
      else ensureES();
      return () => {
        const s = typeListeners.get(type);
        if (s) s.delete(fn);
        releaseRef();
      };
    },
  };

  _sharedByUrl.set(eventsUrl, shared);
  return shared;
}

// ----------------------------
// Browser: client API (subscribe + emit + awaitFinal)
// ----------------------------
export function createEventsClient({
  eventsUrl = "/rpc/events",
  ingestUrl = "/rpc/ui-events",
  fetchRunStatus,
  useBroadcast = true,
  broadcastChannelName = "loki-ui-events",
  backstopMs = 35000, // wait this long before polling
} = {}) {
  const shared = _isBrowser() ? _getSharedChannel(eventsUrl) : null;
  const bus = getGlobalEventBus();

  // Cross-tab broadcast
  const bc =
    _isBrowser() && useBroadcast && "BroadcastChannel" in window
      ? new BroadcastChannel(broadcastChannelName)
      : null;

  if (bc) {
    bc.onmessage = (msg) => {
      const ev = msg?.data;
      if (ev && ev.type) bus.emit({ ...ev, source: ev.source || "broadcast" });
    };
  }

  const matches = (ev, filter) => {
    if (!filter) return true;
    if (filter.channel && ev.channel !== filter.channel) return false;
    if (filter.type && ev.type !== filter.type) return false;
    if (filter.runId && ev.runId !== filter.runId) return false;
    if (filter.name && ev.name !== filter.name) return false;
    return true;
  };

  function onAny(fn) {
    const off1 = bus.on(fn);
    const off2 = _isBrowser() ? shared?.addAny(fn) : null;
    return () => {
      off1?.();
      off2?.();
    };
  }

  function on(type, handler, filter) {
    const localOff = bus.on((ev) => {
      if (ev.type === type && matches(ev, filter)) handler(ev);
    });
    const remoteOff = _isBrowser()
      ? shared?.addType(type, (ev) => matches(ev, filter) && handler(ev))
      : null;
    return () => {
      localOff?.();
      remoteOff?.();
    };
  }

  function subscribe(filter, handler) {
    if (filter?.type) return on(filter.type, handler, filter);
    return onAny((ev) => {
      if (matches(ev, filter)) handler(ev);
    });
  }

  async function emit({ type, channel = "ui", payload = null, meta = null }) {
    const ev = {
      id: _id(),
      type,
      channel,
      payload,
      meta,
      ts: _now(),
      source: "client",
    };
    bus.emit(ev);
    try {
      bc?.postMessage(ev);
    } catch {}
    if (_isBrowser() && ingestUrl) {
      try {
        await fetch(ingestUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(ev),
        });
      } catch {}
    }
    return ev.id;
  }

  async function poll(
    runId,
    { interval = 600, max = 5000, timeout = 30000 } = {}
  ) {
    if (!fetchRunStatus) throw new Error("poll: fetchRunStatus not provided");
    const t0 = Date.now();
    let delay = interval;
    for (;;) {
      const j = await fetchRunStatus(runId);
      if (j?.status === "done") return j.result;
      if (j?.status === "error") throw new Error(j.error || "run error");
      if (Date.now() - t0 > timeout)
        throw new Error("Timed out waiting for run");
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(max, Math.ceil(delay * 1.5));
    }
  }

  // pending map so multiple awaiters for the same runId share one promise
  const _pendingFinal = new Map(); // runId -> { promise, cancel }

  function awaitFinal(runId, { timeout = 30000, backstopMs = 35000 } = {}) {
    if (!runId) return Promise.reject(new Error("awaitFinal: missing runId"));

    const prev = _pendingFinal.get(runId);
    if (prev) return prev.promise;

    let resolve, reject;
    const promise = new Promise(
      (res, rej) => ((resolve = res), (reject = rej))
    );

    let cancelled = false;
    let timer;
    const cleanup = () => {
      offFin?.();
      offErr?.();
      if (timer) clearTimeout(timer);
      _pendingFinal.delete(runId);
    };
    const finish = (val, isErr) => {
      if (cancelled) return;
      cleanup();
      isErr ? reject(val) : resolve(val);
    };

    _pendingFinal.set(runId, {
      promise,
      cancel: () => {
        cancelled = true;
        cleanup();
        reject(new Error("awaitFinal: cancelled"));
      },
    });

    const offFin = on("run:finished", (ev) => {
      if (ev.runId === runId) finish(ev.result, false);
    });
    const offErr = on("run:error", (ev) => {
      if (ev.runId === runId) finish(new Error(ev.error || "run error"), true);
    });

    const startPoll = async () => {
      if (cancelled || !fetchRunStatus) return;
      try {
        const fin = await poll(runId, { timeout });
        finish(fin, false);
      } catch (err) {
        finish(err, true);
      }
    };

    if (_isBrowser() && window.EventSource)
      timer = setTimeout(startPoll, backstopMs);
    else startPoll(); // No SSE support: poll immediately

    return promise;
  }

  return { onAny, on, subscribe, emit, awaitFinal };
}
