import { db } from "./dbSqlService.js";

export function registerDbTools({ schemas = {}, primaryKey = "id" } = {}) {
  for (const [table, schema] of Object.entries(schemas || {})) {
    db.ensureTableFromJsonSchema(table, schema, { primaryKey });
  }
}
