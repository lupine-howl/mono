import { DbSqlService } from "./dbSqlService.js";
import { registerDbTableTools } from "./dbTableTools.js";

export function registerDbTools(
  tools,
  { dbPath = "./data/app.db", schemas = {}, primaryKey = "id" } = {}
) {
  registerDbTableTools(schemas, tools, { dbPath });

  const svc = new DbSqlService({ dbPath });
  for (const [table, schema] of Object.entries(schemas || {})) {
    svc.ensureTableFromJsonSchema(table, schema, { primaryKey });
  }
  const tag = ["DB"];
  const noProps = {
    type: "object",
    properties: {},
    additionalProperties: false,
  };

  // --- lightweight decoding using provided JSON Schemas ---
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
  const decodeRows = (table, rows) => Array.isArray(rows) ? rows.map((r) => decodeRow(table, r)) : rows;

  tools.define({
    name: "dbListTables",
    description: "List database tables",
    parameters: noProps,
    safe: true,
    handler: () => ({ tables: svc.listTables() }),
    tags: tag,
  });
  tools.define({
    name: "dbGetSchema",
    description: "Get PRAGMA table_info for a table",
    parameters: {
      type: "object",
      required: ["table"],
      properties: { table: { type: "string" } },
      additionalProperties: false,
    },
    safe: true,
    handler: ({ table }) => ({ columns: svc.pragmaTableInfo(table) }),
    tags: tag,
  });
  tools.define({
    name: "dbEnsureTable",
    description: "Create or update table from JSON Schema",
    parameters: {
      type: "object",
      required: ["table", "schema"],
      properties: { table: { type: "string" }, schema: { type: "object" } },
      additionalProperties: false,
    },
    handler: ({ table, schema }) => ({
      created: svc.ensureTableFromJsonSchema(table, schema),
    }),
    tags: tag,
  });
  tools.define({
    name: "dbInsert",
    description: "Insert a row",
    parameters: {
      type: "object",
      required: ["table", "values"],
      properties: { table: { type: "string" }, values: { type: "object" } },
      additionalProperties: false,
    },
    handler: ({ table, values }) => {
      const item = svc.insert(table, values);
      return { item: decodeRow(table, item) };
    },
    tags: tag,
  });
  tools.define({
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
    handler: ({ table, id, patch }) => {
      const item = svc.update(table, id, patch);
      return { item: decodeRow(table, item) };
    },
    tags: tag,
  });
  tools.define({
    name: "dbDelete",
    description: "Delete a row by primary key",
    parameters: {
      type: "object",
      required: ["table", "id"],
      properties: { table: { type: "string" }, id: { type: "string" } },
      additionalProperties: false,
    },
    handler: ({ table, id }) => svc.delete(table, id),
    tags: tag,
  });
  const dbSelect = tools.define({
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
    handler: ({
      table,
      where = {},
      limit = 100,
      offset = 0,
      orderBy = null,
    }) => {
      const items = svc.select(table, { where, limit, offset, orderBy });
      return { items: decodeRows(table, items) };
    },
    tags: tag,
  });
  tools.define({
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
    handler: ({ sql, params = {} }) => svc.raw(sql, params),
    tags: tag,
  });
}
