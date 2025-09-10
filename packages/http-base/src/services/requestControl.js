// Lightweight in-memory caching + in-flight dedupe + optional throttling
// Usage:
//   router.get('/api/data', controlRequests(async (args, ctx) => {
//     // expensive work
//     return { value: await compute(args) };
//   }, { ttl: 3000 }));
//
// Notes:
// - Only caches GET responses and only plain JSON-like results
//   (objects) without streams. Streams and non-GETs bypass cache.
// - Dedupe coalesces concurrent requests with the same key.
// - Throttling is optional; defaults to off.

function defaultKeyFn(req) {
  const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  // Normalize query order for stable keys
  const params = [...u.searchParams.entries()]
    .sort((a, b) => (a[0] > b[0] ? 1 : a[0] < b[0] ? -1 : 0))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  const q = params ? `?${params}` : '';
  return `${req.method}:${u.pathname}${q}`;
}

function isCacheable(req, result) {
  if (req.method !== 'GET') return false;
  if (!result || typeof result !== 'object') return false;
  if ('stream' in result) return false; // don't cache streams
  return true; // { json, status } or plain object are fine
}

export function controlRequests(handler, {
  ttl = 2000, // ms
  max = 500,  // max cache entries
  dedupe = true,
  throttleMs = 0,
  keyFn = defaultKeyFn,
  canCache = isCacheable,
} = {}) {
  const cache = new Map(); // key -> { value, expiresAt }
  const inflight = new Map(); // key -> Promise
  const lastSeen = new Map(); // key -> ts

  const getCached = (key, now) => {
    const entry = cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt < now) {
      cache.delete(key);
      return null;
    }
    // shallow clone to reduce accidental mutation of cached object
    const val = entry.value;
    if (val && typeof val === 'object' && !('stream' in val)) {
      return Array.isArray(val) ? val.slice() : { ...val };
    }
    return val;
  };

  const setCached = (key, value, now) => {
    if (max <= 0 || ttl <= 0) return;
    // Maintain a bounded size (simple FIFO via Map insertion order)
    if (cache.size >= max) {
      const first = cache.keys().next().value;
      if (first !== undefined) cache.delete(first);
    }
    cache.set(key, { value, expiresAt: now + ttl });
  };

  return async function wrapped(args, ctx) {
    const { req } = ctx || {};
    const key = req ? keyFn(req) : '';
    const now = Date.now();

    // If we can return fresh cached value, do so quickly
    if (req) {
      const cached = getCached(key, now);
      if (cached != null) return cached;
    }

    // Throttle window (soft): if called too soon after last, prefer inflight or cached
    if (req && throttleMs > 0) {
      const last = lastSeen.get(key) || 0;
      if (now - last < throttleMs) {
        const p = inflight.get(key);
        if (p) return p; // wait for the ongoing one
        const cached = getCached(key, now);
        if (cached != null) return cached; // serve slightly stale if available (but we cleaned expired above)
        // else fall through: allow one request to proceed
      }
      lastSeen.set(key, now);
    }

    if (dedupe && req) {
      const existing = inflight.get(key);
      if (existing) return existing;
    }

    const p = Promise.resolve().then(async () => {
      const result = await handler(args, ctx);
      if (req && canCache(req, result)) setCached(key, result, Date.now());
      return result;
    }).finally(() => {
      if (req) inflight.delete(key);
    });

    if (dedupe && req) inflight.set(key, p);
    return p;
  };
}

// Convenience wrapper names
export const withCache = (handler, opts = {}) => controlRequests(handler, opts);
export const withCacheAndDedupe = (handler, opts = {}) => controlRequests(handler, { dedupe: true, ...opts });
export const withThrottle = (handler, throttleMs = 500, opts = {}) => controlRequests(handler, { throttleMs, ...opts });

// Export keyFn for advanced composition
export const keyFromRequest = defaultKeyFn;
export const defaultCanCache = isCacheable;
