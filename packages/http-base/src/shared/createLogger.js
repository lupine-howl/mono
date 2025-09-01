// logger.js (drop-in replacement)
export function createLogger({
  name = "app", // <— your identifier/prefix
  baseUrl = typeof location !== "undefined"
    ? location.origin
    : "http://localhost:3000",
  path = "/api/logs",
  level = "info", // "debug" | "info" | "warn" | "error"
  send = true, // set false to mute network sending (keeps console)
  headers = {},
  context = {}, // static fields included on every log (e.g. { service:"openai-images" })
} = {}) {
  const levels = { debug: 10, info: 20, warn: 30, error: 40 };
  let threshold = levels[level] ?? 20;

  const url =
    (baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl) +
    (path.startsWith("/") ? path : `/${path}`);

  const safeStringify = (obj) =>
    JSON.stringify(obj, (k, v) => {
      if (v instanceof Error) {
        return { name: v.name, message: v.message, stack: v.stack };
      }
      if (typeof v === "bigint") return v.toString();
      return v;
    });

  const makePayload = (lvl, args) => {
    let msg = "";
    let data = undefined;

    if (
      args.length === 1 &&
      typeof args[0] === "object" &&
      args[0] !== null &&
      !Array.isArray(args[0])
    ) {
      // createLogger().info({ event:"x", foo:1 })
      data = args[0];
    } else {
      // createLogger().info("x happened", { foo:1 })
      msg = String(args[0] ?? "");
      data = args[1];
    }

    const payload = {
      ts: new Date().toISOString(),
      name, // <— identifier / prefix
      level: lvl, // "info" etc
      msg, // short message string
      ...context, // static fields
      data, // arbitrary object (optional)
      // Back-compat: many receivers look at "message"
      message: data ?? msg,
    };

    // strip undefined
    for (const k of Object.keys(payload)) {
      if (payload[k] === undefined) delete payload[k];
    }
    return payload;
  };

  const post = (payload) => {
    if (!send) return;
    try {
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: safeStringify(payload),
        keepalive: true, // survive unloads
      }).catch(() => {});
    } catch {}
  };

  const emit = (lvl, ...args) => {
    if ((levels[lvl] ?? 100) < threshold) return;
    const payload = makePayload(lvl, args);

    // console mirror with prefix
    try {
      const c = globalThis.console || {};
      (c[lvl] || c.log || (() => {})).call(
        c,
        `[${name}] ${payload.msg || (payload.data?.event ?? "")}`,
        payload.data ?? null
      );
    } catch {}

    post(payload);
  };

  return {
    debug: (...a) => emit("debug", ...a),
    info: (...a) => emit("info", ...a),
    log: (...a) => emit("info", ...a), // alias
    warn: (...a) => emit("warn", ...a),
    error: (...a) => emit("error", ...a),

    // utilities
    setLevel(newLevel) {
      threshold = levels[newLevel] ?? threshold;
    },
    withContext(extra = {}) {
      return createLogger({
        name,
        baseUrl,
        path,
        level,
        send,
        headers,
        context: { ...context, ...extra },
      });
    },
  };
}
