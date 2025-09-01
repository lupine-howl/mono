// src/ui/chat-cards/render-utils.js
export const parseMaybeJSON = (v) => {
  if (!v || typeof v !== "string") return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};
export const trunc = (v, n = 200) => {
  const s = String(v ?? "");
  return s.length > n ? s.slice(0, n) + "…" : s;
};
export const isPlain = (o) => o && typeof o === "object" && !Array.isArray(o);
export const fileMeta = (obj = {}) => {
  const path = obj.path || obj.name || "Attachment";
  const file = path.split("/").pop();
  const ext = (file.includes(".") ? file.split(".").pop() : "").toLowerCase();
  const lang = obj.language || obj.mime || (ext ? ext.toUpperCase() : "");
  return { file, ext, lang, path };
};
export const pickColumns = (row) => {
  const pref = [
    "name",
    "title",
    "path",
    "type",
    "kind",
    "size",
    "bytes",
    "modified",
    "mtime",
    "created",
  ];
  const keys = Object.keys(row);
  const ordered = [
    ...pref.filter((k) => keys.includes(k)),
    ...keys.filter((k) => !pref.includes(k)),
  ];
  return ordered.slice(0, 6);
};
export const fmtCell = (v, max = 50) => {
  if (v == null) return "";
  if (typeof v === "object") {
    if (Array.isArray(v)) return `Array(${v.length})`;
    const s = v.name ?? v.title ?? JSON.stringify(v);
    return trunc(s, max);
  }
  return trunc(v, max);
};

export const previewForResult = (res) => {
  if (isPlain(res) && Array.isArray(res.items)) {
    const arr = res.items;
    if (arr.length && isPlain(arr[0])) {
      const cols = pickColumns(arr[0]);
      return {
        view: "table",
        rows: arr.slice(0, 20),
        cols,
        more: Math.max(0, arr.length - 20),
        subtitle: res.path ? `Path: ${res.path}` : undefined,
      };
    }
    return {
      view: "list",
      items: arr.slice(0, 20).map((x) => trunc(x, 120)),
      more: Math.max(0, arr.length - 20),
      subtitle: res.path ? `Path: ${res.path}` : undefined,
    };
  }
  if (isPlain(res) && Array.isArray(res.rows)) {
    const rows = res.rows;
    if (rows.length && isPlain(rows[0])) {
      const cols = pickColumns(rows[0]);
      return {
        view: "table",
        rows: rows.slice(0, 20),
        cols,
        more: Math.max(0, rows.length - 20),
      };
    }
  }
  if (Array.isArray(res) && res.length) {
    if (isPlain(res[0])) {
      const cols = pickColumns(res[0]);
      return {
        view: "table",
        rows: res.slice(0, 20),
        cols,
        more: Math.max(0, res.length - 20),
      };
    }
    return {
      view: "list",
      items: res.slice(0, 20).map((x) => trunc(x, 120)),
      more: Math.max(0, res.length - 20),
    };
  }
  if (isPlain(res)) {
    const arrayFields = Object.entries(res).filter(([, v]) => Array.isArray(v));
    const preferred = [
      "items",
      "rows",
      "tables",
      "columns",
      "data",
      "results",
      "list",
    ];
    let chosen =
      arrayFields.find(([k]) => preferred.includes(k)) || arrayFields[0];
    if (chosen) {
      const [key, arr] = chosen;
      if (arr.length && isPlain(arr[0])) {
        const cols = pickColumns(arr[0]);
        return {
          view: "table",
          rows: arr.slice(0, 20),
          cols,
          more: Math.max(0, arr.length - 20),
          subtitle: key,
        };
      }
      return {
        view: "list",
        items: arr.slice(0, 20).map((x) => trunc(x, 120)),
        more: Math.max(0, arr.length - 20),
        subtitle: key,
      };
    }
    const entries = Object.entries(res)
      .slice(0, 8)
      .map(([k, v]) => [
        k,
        Array.isArray(v)
          ? `Array(${v.length})`
          : typeof v === "object"
          ? trunc(JSON.stringify(v), 120)
          : v,
      ]);
    return {
      view: "kv",
      entries,
      more: Math.max(0, Object.keys(res).length - 8),
    };
  }
  if (typeof res === "string") return { view: "text", text: trunc(res, 1000) };
  return { view: "json", json: res };
};
