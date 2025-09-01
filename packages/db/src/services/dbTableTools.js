// register-db-table-tools.js
import { DbSqlService } from "./dbSqlService.js";

/**
 * Create per-table CRUD tools optimized for LLM tool calling.
 *
 * Usage:
 *   registerDbTableTools(
 *     { Messages: messagesSchema, Tasks: tasksSchema },
 *     tools,
 *     { dbPath: "./data/app.db", primaryKey: "id" }
 *   );
 */
export function registerDbTableTools(
  tableSchemas = {}, // { [tableName]: jsonSchema }
  tools,
  { dbPath = "./data/app.db", primaryKey = "id", tag = "DB" } = {}
) {
  const svc = new DbSqlService({ dbPath });

  // Make (or evolve) tables ahead of time
  for (const [table, schema] of Object.entries(tableSchemas || {})) {
    svc.ensureTableFromJsonSchema(table, schema, { primaryKey });
  }

  const TAGS = Array.isArray(tag) ? tag : [tag];

  // Helpers to keep schemas strict and concise
  const normType = (t) => {
    // Accept JSON Schema unions and pick a stable, non-null primitive; default string.
    if (Array.isArray(t)) t = t.find((x) => x !== "null") ?? t[0];
    if (!t) return "string";
    const m = String(t).toLowerCase();
    return m === "integer" || m === "int"
      ? "integer"
      : m === "number"
      ? "number"
      : m === "boolean" || m === "bool"
      ? "boolean"
      : "string";
  };

  const buildPropsFromSchema = (schema, { exclude = [] } = {}) => {
    const props = {};
    const defs = (schema && schema.properties) || {};
    for (const [k, def] of Object.entries(defs)) {
      if (exclude.includes(k)) continue;
      // Keep it simple: type + optional enum/description if present.
      const p = { type: normType(def?.type) };
      if (Array.isArray(def?.enum) && def.enum.length) p.enum = def.enum;
      if (def?.description) p.description = def.description;
      props[k] = p;
    }
    return props;
  };

  const requiredFromSchema = (schema, { exclude = [] } = {}) => {
    const req = Array.isArray(schema?.required) ? schema.required.slice() : [];
    return req.filter((k) => !exclude.includes(k));
  };

  // Define tools per table
  for (const [table, schema] of Object.entries(tableSchemas || {})) {
    const props = buildPropsFromSchema(schema);
    const required = requiredFromSchema(schema);
    const cols = Object.keys(props);
    const pk = primaryKey;

    // ---------- INSERT ----------
    tools.define({
      name: `db${table}Insert`,
      description: `Insert a row into ${table}.`,
      tags: [...TAGS, table],
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["values"],
        properties: {
          values: {
            type: "object",
            additionalProperties: false,
            // Make the insert payload easy for the model: mirror table props.
            properties: props,
            // Optional: hint required columns; leave actual DB defaults to DB.
            // required: required, // you can enforce required if desired
          },
        },
      },
      handler: ({ values }) => ({
        item: svc.insert(table, values, { primaryKey: pk }),
      }),
    });

    // ---------- UPDATE ----------
    tools.define({
      name: `db${table}Update`,
      description: `Patch a row in ${table} by ${pk}.`,
      tags: [...TAGS, table],
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["id", "patch"],
        properties: {
          id: { type: "string", description: `${table}.${pk} value to update` },
          patch: {
            type: "object",
            additionalProperties: false,
            properties: props, // allow any column to be patched
          },
        },
      },
      handler: ({ id, patch }) => ({
        item: svc.update(table, id, patch, { primaryKey: pk }),
      }),
    });

    // ---------- DELETE ----------
    tools.define({
      name: `db${table}Delete`,
      description: `Delete a row in ${table} by ${pk}.`,
      tags: [...TAGS, table],
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["id"],
        properties: {
          id: { type: "string", description: `${table}.${pk} value to delete` },
        },
      },
      handler: ({ id }) => svc.delete(table, id, { primaryKey: pk }),
    });

    // ---------- SELECT ----------
    // Keep "where" as a simple equality map (LLMs do fine with this).
    tools.define({
      name: `db${table}Select`,
      description: `Select rows from ${table} with optional equality filters, ordering, and paging.`,
      tags: [...TAGS, table],
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          where: {
            type: "object",
            additionalProperties: false,
            properties: props, // equality filters by column
            description:
              "Equality filters: set any subset of columns to match exact values.",
          },
          order: {
            type: "object",
            additionalProperties: false,
            properties: {
              column: {
                type: "string",
                enum: cols,
                description: "Column to sort by",
              },
              dir: { type: "string", enum: ["ASC", "DESC"], default: "ASC" },
            },
          },
          limit: { type: "integer", minimum: 1, default: 100 },
          offset: { type: "integer", minimum: 0, default: 0 },
        },
      },
      safe: true,
      handler: ({ where = {}, order = null, limit = 100, offset = 0 }) => {
        const orderBy = order?.column
          ? `"${order.column}" ${order.dir || "ASC"}`
          : null;
        return { items: svc.select(table, { where, limit, offset, orderBy }) };
      },
    });

    // ---------- GET BY ID (nice-to-have for tools) ----------
    tools.define({
      name: `db${table}GetById`,
      description: `Fetch a single ${table} row by ${pk}.`,
      tags: [...TAGS, table],
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["id"],
        properties: {
          id: { type: "string", description: `${table}.${pk} value to fetch` },
        },
      },
      safe: true,
      handler: ({ id }) => ({
        item: svc.selectById(table, id, { primaryKey: pk }),
      }),
    });
  }
}
