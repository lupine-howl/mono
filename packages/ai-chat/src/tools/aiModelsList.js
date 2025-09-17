// src/tools/aiModelsList.js
// A chainable tool that lists models from the OpenAI API (or compatible baseUrl).
// - No router mounting required
// - Returns { ok, data: { models, note? , raw? } }
// - Optional filters (include/exclude/prefix/suffix/limit), sorting, and "full" mode

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

/** Convert a filter string to a predicate:
 *  - "/regex/flags" => RegExp
 *  - otherwise => substring match
 */
function toPredicate(pattern) {
  if (!pattern) return () => true;
  if (typeof pattern !== "string") return () => true;

  // Regex form: /.../flags
  if (pattern.startsWith("/") && pattern.lastIndexOf("/") > 0) {
    const i = pattern.lastIndexOf("/");
    const body = pattern.slice(1, i);
    const flags = pattern.slice(i + 1);
    try {
      const rx = new RegExp(body, flags);
      return (s) => rx.test(String(s));
    } catch {
      // fall through to substring
    }
  }

  // Substring fallback
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
  const pre = (Array.isArray(prefix) ? prefix : []).map((p) => String(p));
  const suf = (Array.isArray(suffix) ? suffix : []).map((p) => String(p));

  return (id) => {
    const s = String(id);

    // include: if provided, at least one must match
    if (inc.length > 0 && !inc.some((fn) => fn(s))) return false;

    // exclude: none may match
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

    // Filtering options (all optional)
    include: {
      type: ["array", "null"],
      items: { type: "string" },
      description:
        "Substrings or /regex/flags that MUST match. If present, at least one must match.",
    },
    exclude: {
      type: ["array", "null"],
      items: { type: "string" },
      description: "Substrings or /regex/flags that must NOT match.",
    },
    prefix: {
      type: ["array", "null"],
      items: { type: "string" },
      description: "Only keep ids that start with any of these prefixes.",
    },
    suffix: {
      type: ["array", "null"],
      items: { type: "string" },
      description: "Only keep ids that end with any of these suffixes.",
    },

    // Sorting & shaping
    sort: {
      type: "string",
      enum: ["asc", "desc", "none"],
      default: "desc",
      description: "Lexicographic sort order for ids (default desc).",
    },
    limit: { type: ["integer", "null"], minimum: 1 },
    full: {
      type: "boolean",
      default: false,
      description: "If true, return full model objects instead of just ids.",
    },
    includeRaw: {
      type: "boolean",
      default: false,
      description: "If true, include the raw OpenAI response under data.raw.",
    },
  },
  required: [],
};

export const aiModelsList = {
  name: "aiModelsList",
  description:
    "List models from the OpenAI /models endpoint with optional filtering, sorting, and full output.",
  parameters: params,
  safe: true, // read-only

  async handler(values /*, ctx */) {
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
    } = values || {};

    const key = apiKey || process.env.OPENAI_API_KEY || "";
    if (!key.trim()) {
      return {
        ok: true,
        data: { models: [], note: "No API key configured" },
      };
    }

    // Fetch models
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
          data: { models: [], raw: includeRaw ? data : undefined },
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
    // Filter
    const keep = buildFilter({ include, exclude, prefix, suffix });
    arr = arr.filter((m) => keep(m?.id));

    // Sort (by id)
    if (sort === "asc")
      arr.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    else if (sort === "desc")
      arr.sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));

    // Limit
    if (Number.isInteger(limit) && limit > 0) arr = arr.slice(0, limit);

    const models = full ? arr : arr.map((m) => m.id).filter(Boolean);

    return {
      ok: true,
      data: {
        models,
        ...(includeRaw ? { raw: data } : {}),
      },
    };
  },
};
