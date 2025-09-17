import { db } from "@loki/db";

const noProps = {
  type: "object",
  properties: {},
  additionalProperties: false,
};

const pickType = (def) => {
  let t = def?.type;
  if (Array.isArray(t)) t = t.find((x) => x && x !== "null") ?? t[0];
  return (t && String(t).toLowerCase()) || "string";
};
const decodeRow = (table, row) => {
  try {
    const schema = schemas?.[table];
    if (!schema?.properties || !row) return row;
    const props = schema.properties;
    const out = { ...row };
    for (const [k, def] of Object.entries(props)) {
      const v = out[k];
      if (v === undefined || v === null) continue;
      const t = pickType(def);
      if (t === "boolean" || t === "bool") {
        // Normalize 0/1 (or "0"/"1") back to booleans
        if (v === 0 || v === 1) out[k] = !!v;
        else if (v === "0" || v === "1") out[k] = v === "1";
      } else if (t === "object" || t === "array" || t === "json") {
        if (typeof v === "string") {
          try {
            out[k] = JSON.parse(v);
          } catch {
            // leave as-is if not valid JSON
          }
        }
      }
    }
    return out;
  } catch {
    return row;
  }
};
const decodeRows = (table, rows) =>
  Array.isArray(rows) ? rows.map((r) => decodeRow(table, r)) : rows;

export const dbListTables = {
  name: "dbListTables",
  description: "List database tables",
  parameters: noProps,
  safe: true,
  handler: async () => {
    return { tables: db.listTables() };
  },
};

export const dbGetSchema = {
  name: "dbGetSchema",
  description: "Get PRAGMA table_info for a table",
  parameters: {
    type: "object",
    required: ["table"],
    properties: { table: { type: "string" } },
    additionalProperties: false,
  },
  safe: true,
  handler: async ({ table }) => {
    return { columns: db.pragmaTableInfo(table) };
  },
};

export const dbEnsureTable = {
  name: "dbEnsureTable",
  description: "Create or update table from JSON Schema",
  parameters: {
    type: "object",
    required: ["table", "schema"],
    properties: { table: { type: "string" }, schema: { type: "object" } },
    additionalProperties: false,
  },
  handler: async ({ table, schema }) => {
    return { created: db.ensureTableFromJsonSchema(table, schema) };
  },
};

export const dbInsert = {
  name: "dbInsert",
  description: "Insert a row",
  parameters: {
    type: "object",
    required: ["table", "values"],
    properties: { table: { type: "string" }, values: { type: "object" } },
    additionalProperties: false,
  },
  handler: async ({ table, values }) => {
    const item = db.insert(table, values);
    return { item: decodeRow(table, item) };
  },
};

export const dbUpdate = {
  name: "dbUpdate",
  description: "Patch a row by primary key",
  parameters: {
    type: "object",
    required: ["table", "id", "patch"],
    properties: {
      table: { type: "string" },
      id: { type: "string" },
      patch: { type: "object" },
    },
    additionalProperties: false,
  },
  handler: async ({ table, id, patch }) => {
    const item = db.update(table, id, patch);
    return { item: decodeRow(table, item) };
  },
};

export const dbDelete = {
  name: "dbDelete",
  description: "Delete a row by primary key",
  parameters: {
    type: "object",
    required: ["table", "id"],
    properties: { table: { type: "string" }, id: { type: "string" } },
    additionalProperties: false,
  },
  handler: async ({ table, id }) => {
    return db.delete(table, id);
  },
};

export const dbSelect = {
  name: "dbSelect",
  description: "Select rows with equality filters, order, limit/offset",
  parameters: {
    type: "object",
    required: ["table"],
    properties: {
      table: { type: "string" },
      where: { type: "object", default: {} },
      limit: { type: "integer", default: 100 },
      offset: { type: "integer", default: 0 },
      orderBy: { type: ["string", "null"], default: null },
    },
    additionalProperties: false,
  },
  safe: true,
  handler: async ({
    table,
    where = {},
    limit = 100,
    offset = 0,
    orderBy = null,
  }) => {
    const items = db.select(table, { where, limit, offset, orderBy });
    return { items: decodeRows(table, items) };
  },
};

export const dbRaw = {
  name: "dbRaw",
  description: "Read-only SQL (SELECT/PRAGMA)",
  parameters: {
    type: "object",
    required: ["sql"],
    properties: {
      sql: { type: "string" },
      params: { type: "object", default: {} },
    },
    additionalProperties: false,
  },
  safe: true,
  handler: async ({ sql, params = {} }) => {
    return db.raw(sql, params);
  },
};
