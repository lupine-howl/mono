// A chainable tool that lists models from the OpenAI API (or compatible baseUrl).
// - Returns { ok, data: { models, note? , raw? } }
// - Optional filters (include/exclude/prefix/suffix/limit), sorting, and "full" mode

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const KNOWN_MODELS = [
  "o4-mini-deep-research",
  "o4-mini",
  "o1-pro",
  "o1-mini",
  "o1",
  "gpt-5-nano",
  "gpt-5-mini",
  "gpt-5-chat-latest",
  "gpt-5",
  "gpt-4o-search-preview",
  "gpt-4o-realtime-preview",
  "gpt-4o-mini-tts",
  "gpt-4o-mini-transcribe",
  "gpt-4o-mini-search-preview",
  "gpt-4o-mini-realtime-preview",
  "gpt-4o-mini-audio-preview",
  "gpt-4o-mini",
  "gpt-4o-audio-preview",
  "gpt-4o",
  "gpt-4.1-nano",
  "gpt-4.1-mini",
  "gpt-4.1",
  "gpt-4-turbo-preview",
  "gpt-4-turbo",
  "gpt-4",
  "gpt-3.5-turbo",
  "davinci-002",
  "dall-e-3",
  "dall-e-2",
  "codex-mini-latest",
  "chatgpt-4o-latest",
];

function toPredicate(pattern) {
  if (!pattern) return () => true;
  if (typeof pattern !== "string") return () => true;

  if (pattern.startsWith("/") && pattern.lastIndexOf("/") > 0) {
    const i = pattern.lastIndexOf("/");
    const body = pattern.slice(1, i);
    const flags = pattern.slice(i + 1);
    try {
      const rx = new RegExp(body, flags);
      return (s) => rx.test(String(s));
    } catch {
      /* fall through */
    }
  }
  const needle = pattern.toLowerCase();
  return (s) => String(s).toLowerCase().includes(needle);
}

function buildFilter({
  include = [],
  exclude = [],
  prefix = [],
  suffix = [],
} = {}) {
  const inc = (Array.isArray(include) ? include : []).map(toPredicate);
  const exc = (Array.isArray(exclude) ? exclude : []).map(toPredicate);
  const pre = (Array.isArray(prefix) ? prefix : []).map(String);
  const suf = (Array.isArray(suffix) ? suffix : []).map(String);

  return (id) => {
    const s = String(id);
    if (inc.length > 0 && !inc.some((fn) => fn(s))) return false; // must match at least one include
    if (exc.some((fn) => fn(s))) return false;
    if (pre.length > 0 && !pre.some((p) => s.startsWith(p))) return false;
    if (suf.length > 0 && !suf.some((p) => s.endsWith(p))) return false;
    return true;
  };
}

const params = {
  type: "object",
  additionalProperties: false,
  properties: {
    baseUrl: { type: ["string", "null"], default: DEFAULT_BASE_URL },
    apiKey: { type: ["string", "null"] },

    include: { type: ["array", "null"], items: { type: "string" } },
    exclude: { type: ["array", "null"], items: { type: "string" } },
    prefix: { type: ["array", "null"], items: { type: "string" } },
    suffix: { type: ["array", "null"], items: { type: "string" } },

    sort: { type: "string", enum: ["asc", "desc", "none"], default: "desc" },
    limit: { type: ["integer", "null"], minimum: 1 },
    full: { type: "boolean", default: false },
    includeRaw: { type: "boolean", default: false },
  },
  required: [],
};

export const aiModelsList = {
  name: "aiModelsList",
  description:
    "List models from the OpenAI /models endpoint with optional filtering, sorting, and full output.",
  parameters: params,
  safe: true,

  async beforeRun() {
    return {
      async: true,
      optimistic: { ok: true, data: { models: KNOWN_MODELS } },
    };
  },

  async handler(values = {}) {
    const {
      baseUrl = DEFAULT_BASE_URL,
      apiKey,
      include,
      exclude,
      prefix,
      suffix,
      sort = "desc",
      limit,
      full = false,
      includeRaw = false,
    } = values;

    const key = apiKey || process.env.OPENAI_API_KEY || "";
    if (!key.trim()) {
      return { ok: true, data: { models: [], note: "No API key configured" } };
    }

    let data;
    try {
      const res = await fetch(`${baseUrl}/models`, {
        method: "GET",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${key}`,
        },
      });
      data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          ok: false,
          error: data?.error?.message || `OpenAI HTTP ${res.status}`,
          data: { models: [], ...(includeRaw ? { raw: data } : {}) },
        };
      }
    } catch (e) {
      return {
        ok: false,
        error: e?.message || String(e),
        data: { models: [] },
      };
    }

    let arr = Array.isArray(data?.data) ? data.data : [];
    const keep = buildFilter({ include, exclude, prefix, suffix });
    arr = arr.filter((m) => keep(m?.id));

    if (sort === "asc")
      arr.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    else if (sort === "desc")
      arr.sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));

    if (Number.isInteger(limit) && limit > 0) arr = arr.slice(0, limit);

    const models = full ? arr : arr.map((m) => m.id).filter(Boolean);

    return { ok: true, data: { models, ...(includeRaw ? { raw: data } : {}) } };
  },
};
