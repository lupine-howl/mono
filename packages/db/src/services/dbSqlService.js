// db-sql-service.js
import Database from "better-sqlite3";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getGlobalSingleton } from "@loki/utilities";

const uid = () => crypto.randomUUID();

// ---------- type helpers -----------------------------------------------------

function inferJsonType(def) {
  let t = def?.type;
  if (Array.isArray(t)) t = t.find((v) => v && v !== "null");
  if (typeof t === "string") return t.toLowerCase();

  if (Array.isArray(def?.enum) && def.enum.length) {
    const sample = def.enum.find((v) => v !== null && v !== undefined);
    const kind = typeof sample;
    if (kind === "number" && Number.isInteger(sample)) return "integer";
    if (kind) return kind;
  }
  return "string";
}

const isValidIdent = (s) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(s ?? "");

function mapType(def) {
  const t = inferJsonType(def);
  if (t === "integer" || t === "int") return "INTEGER";
  if (t === "number") return "REAL";
  if (t === "boolean" || t === "bool") return "INTEGER";
  if (t === "object" || t === "array" || t === "json") return "TEXT";
  return "TEXT";
}

function normValue(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}

// ---------- main service -----------------------------------------------------

export class DbSqlService {
  constructor({ dbPath = "./data/app.db" } = {}) {
    const dir = path.dirname(dbPath);
    fs.mkdirSync(dir, { recursive: true });
    this.dbPath = path.resolve(dbPath);
    this.db = new Database(this.dbPath);
  }

  pragmaTableInfo(table) {
    return this.db.prepare(`PRAGMA table_info("${table}")`).all();
  }

  listTables() {
    return this.db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
      )
      .all()
      .map((r) => r.name);
  }

  ensureTableFromJsonSchema(
    table,
    schema = {},
    { primaryKey = "id", primaryType = "string" } = {}
  ) {
    const props = schema?.properties || {};
    const columns = Object.entries(props).map(([k, def]) => ({
      name: k,
      type: mapType(def),
    }));

    const exists = this.db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
      .get(table);

    if (!exists) {
      const pkType = mapType(
        schema?.properties?.[primaryKey] || { type: primaryType }
      );
      const colsSql = [
        `"${primaryKey}" ${pkType} PRIMARY KEY`,
        ...columns
          .filter((c) => c.name !== primaryKey)
          .map((c) => `"${c.name}" ${c.type}`),
      ].join(", ");
      this.db.prepare(`CREATE TABLE "${table}" (${colsSql})`).run();
      this.db
        .prepare(
          `CREATE INDEX IF NOT EXISTS "${primaryKey}_idx" ON "${table}"("${primaryKey}")`
        )
        .run();
      return true;
    }

    const currentInfo = this.pragmaTableInfo(table);
    const current = new Set(currentInfo.map((c) => c.name));

    for (const c of columns) {
      if (!current.has(c.name)) {
        const def = (schema.properties || {})[c.name] || {};
        const isRequired =
          Array.isArray(schema.required) && schema.required.includes(c.name);
        const hasDefault = Object.prototype.hasOwnProperty.call(def, "default");
        const defaultSql = hasDefault
          ? ` DEFAULT ${JSON.stringify(def.default)}`
          : "";
        const notNullSql = isRequired && hasDefault ? " NOT NULL" : "";
        const sql = `ALTER TABLE "${table}" ADD COLUMN "${c.name}" ${c.type}${notNullSql}${defaultSql}`;
        this.db.prepare(sql).run();
      }
    }
    return false;
  }

  insert(table, values, { primaryKey = "id" } = {}) {
    const row = { ...values };
    if (!(primaryKey in row)) row[primaryKey] = uid();
    const cols = Object.keys(row);
    const params = Object.fromEntries(cols.map((k) => [k, normValue(row[k])]));
    const placeholders = cols.map((k) => `@${k}`).join(", ");
    const sql = `INSERT INTO "${table}" (${cols
      .map((c) => `"${c}"`)
      .join(", ")}) VALUES (${placeholders})`;
    this.db.prepare(sql).run(params);
    return this.selectById(table, row[primaryKey], { primaryKey });
  }

  update(table, id, patch, { primaryKey = "id" } = {}) {
    const allEntries = Object.entries(patch || {});
    if (!allEntries.length) return this.selectById(table, id, { primaryKey });

    const currentCols = new Set(this.pragmaTableInfo(table).map((c) => c.name));
    const entries = allEntries.filter(
      ([k]) => k !== primaryKey && currentCols.has(k)
    );
    if (!entries.length) return this.selectById(table, id, { primaryKey });

    const assigns = entries.map(([k]) => `"${k}"=@${k}`).join(", ");
    const params = Object.fromEntries(
      entries.map(([k, v]) => [k, normValue(v)])
    );
    params.id = id;

    const sql = `UPDATE "${table}" SET ${assigns} WHERE "${primaryKey}"=@id`;
    const info = this.db.prepare(sql).run(params);
    if (info.changes === 0) return null;
    return this.selectById(table, id, { primaryKey });
  }

  delete(table, id, { primaryKey = "id" } = {}) {
    const info = this.db
      .prepare(`DELETE FROM "${table}" WHERE "${primaryKey}"=?`)
      .run(id);
    return { ok: true, removed: info.changes || 0 };
  }

  select(table, { where = {}, limit = 100, offset = 0, orderBy = null } = {}) {
    const tableName = String(table || "").trim();
    if (!isValidIdent(tableName)) {
      throw new Error(`DbSqlService.select: invalid table name "${table}"`);
    }

    const keys = Object.keys(where || {});
    const clauses = keys.map((k) => {
      if (!isValidIdent(k)) throw new Error(`Invalid column in where: "${k}"`);
      return `"${k}"=@${k}`;
    });
    const whereSql = clauses.length ? "WHERE " + clauses.join(" AND ") : "";

    let orderSql = "";
    if (typeof orderBy === "string") {
      const ob = orderBy.trim();
      if (ob && ob !== '""') orderSql = `ORDER BY ${ob}`;
    }

    const sql = `SELECT * FROM "${tableName}" ${whereSql} ${orderSql} LIMIT @limit OFFSET @offset`;
    const params = Object.fromEntries(
      keys.map((k) => [k, normValue(where[k])])
    );
    params.limit = Number(limit);
    params.offset = Number(offset);

    return this.db.prepare(sql).all(params);
  }

  selectById(table, id, { primaryKey = "id" } = {}) {
    return (
      this.db
        .prepare(`SELECT * FROM "${table}" WHERE "${primaryKey}"=? LIMIT 1`)
        .get(id) || null
    );
  }

  raw(sql, params = {}) {
    const head = String(sql).trim().slice(0, 6).toUpperCase();
    if (head !== "SELECT" && head !== "PRAGMA") {
      return { error: "Only SELECT/PRAGMA allowed" };
    }
    return this.db.prepare(sql).all(params);
  }
}

// ---------- singleton accessors ---------------------------------------------

export function getDbSqlService(opts = {}) {
  const abs = path.resolve(opts.dbPath ?? "./data/app.db");
  const key = Symbol.for(`@loki/db-sql:${abs}@1`);
  return getGlobalSingleton(key, () => new DbSqlService({ dbPath: abs }));
}

// default singleton instance
export const dbSqlService = getDbSqlService();

// ---------- convenience helpers using the default singleton -----------------

export const dbInsert = (table, values, opts) =>
  dbSqlService.insert(table, values, opts);

export const dbUpdate = (table, id, patch, opts) =>
  dbSqlService.update(table, id, patch, opts);

export const dbDelete = (table, id, opts) =>
  dbSqlService.delete(table, id, opts);

export const dbSelect = (table, opts) => dbSqlService.select(table, opts);

export const dbSelectById = (table, id, opts) =>
  dbSqlService.selectById(table, id, opts);

export const dbRaw = (sql, params) => dbSqlService.raw(sql, params);
