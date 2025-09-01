// src/shared/lib/DbService.js
import {
  dbListTables,
  dbGetSchema,
  dbSelect,
  dbInsert,
  dbUpdate,
  dbDelete,
} from "./dbClient.js";
import { getGlobalSingleton } from "@loki/utilities";

const isBrowser =
  typeof window !== "undefined" && typeof localStorage !== "undefined";

/**
 * Emits a single "change" event with detail:
 * { type, tables, table, schema, rows, limit, offset, filterKey, filterVal,
 *   order, loadingTables, loadingSchema, loadingRows, error }
 */
class DbService extends EventTarget {
  constructor({ storageKey = "db:selectedTable", defaultLimit = 50 } = {}) {
    super();

    this.storageKey = storageKey;

    // public-ish state
    this.tables = [];
    this.table = "";
    this.schema = null; // PRAGMA table_info rows
    this.rows = [];
    this.limit = defaultLimit;
    this.offset = 0;
    this.filterKey = "";
    this.filterVal = "";
    this.order = null; // { column, dir: 'ASC' | 'DESC' }

    // flags + errors
    this.loadingTables = false;
    this.loadingSchema = false;
    this.loadingRows = false;
    this.error = null;

    this._ready = null;
  }

  // ---------- lifecycle ----------
  async sync() {
    if (!this._ready) {
      this._ready = (async () => {
        const preferred = isBrowser
          ? localStorage.getItem(this.storageKey) || ""
          : "";
        await this.refreshTables({ preferred });
        if (!this.table && this.tables[0]) {
          await this.setTable(this.tables[0], { silentIfSame: true });
        }
        this._emit("init");
      })().catch((e) => {
        this.error = e?.message || String(e);
        this._emit("error", { error: this.error });
      });
    }
    return this._ready;
  }

  // ---------- events ----------
  _emit(type, extra = {}) {
    const detail = {
      type,
      tables: this.tables,
      table: this.table,
      schema: this.schema,
      rows: this.rows,
      limit: this.limit,
      offset: this.offset,
      filterKey: this.filterKey,
      filterVal: this.filterVal,
      order: this.order,
      loadingTables: this.loadingTables,
      loadingSchema: this.loadingSchema,
      loadingRows: this.loadingRows,
      error: this.error,
      ...extra,
    };
    this.dispatchEvent(new CustomEvent("change", { detail }));
  }

  // ---------- tables & selection ----------
  async refreshTables({ preferred = "" } = {}) {
    this.loadingTables = true;
    this.error = null;
    this._emit("tables:loading");
    try {
      const r = await dbListTables();
      this.tables = Array.isArray(r?.tables) ? r.tables : [];

      const hasPreferred =
        preferred && this.tables.some((t) => String(t) === preferred);
      if (hasPreferred && preferred !== this.table) {
        await this.setTable(preferred, { silentIfSame: true });
      } else if (!this.table && this.tables[0]) {
        await this.setTable(this.tables[0], { silentIfSame: true });
      } else {
        this._emit("tables");
      }
    } catch (e) {
      this.error = e?.message || String(e);
      this.tables = [];
      this._emit("error", { error: this.error });
    } finally {
      this.loadingTables = false;
      this._emit("tables:loaded");
    }
  }

  async setTable(name, { silentIfSame = false } = {}) {
    if (!name) return;
    if (name === this.table && silentIfSame) return;

    const changed = name !== this.table;
    this.table = name;
    if (isBrowser) {
      try {
        localStorage.setItem(this.storageKey, name);
      } catch {}
    }

    // reset paging & filters when switching tables
    if (changed) {
      this.offset = 0;
      this.filterKey = "";
      this.filterVal = "";
      this.order = null;
    }

    this._emit("table");
    await Promise.all([this.loadSchema(), this.loadRows()]);
  }

  // ---------- schema & rows ----------
  async loadSchema() {
    if (!this.table) return;
    this.loadingSchema = true;
    this._emit("schema:loading");
    try {
      const j = await dbGetSchema({ table: this.table });
      this.schema = Array.isArray(j?.columns) ? j.columns : [];
      this._emit("schema");
    } catch (e) {
      this.error = e?.message || String(e);
      this.schema = null;
      this._emit("error", { error: this.error });
    } finally {
      this.loadingSchema = false;
      this._emit("schema:loaded");
    }
  }

  async loadRows() {
    if (!this.table) return;
    this.loadingRows = true;
    this._emit("rows:loading");
    try {
      const where =
        this.filterKey && this.filterVal !== ""
          ? { [this.filterKey]: this.filterVal }
          : {};
      const orderBy = this.order?.column
        ? `"${this.order.column}" ${this.order.dir || "ASC"}`
        : null;

      const j = await dbSelect({
        table: this.table,
        where,
        limit: this.limit,
        offset: this.offset,
        orderBy,
      });
      this.rows = Array.isArray(j?.items) ? j.items : [];
      this._emit("rows");
    } catch (e) {
      this.error = e?.message || String(e);
      this.rows = [];
      this._emit("error", { error: this.error });
    } finally {
      this.loadingRows = false;
      this._emit("rows:loaded");
    }
  }

  // ---------- filters, paging, ordering ----------
  setFilter(key, val) {
    this.filterKey = key || "";
    this.filterVal = val ?? "";
    this.offset = 0;
    this._emit("filter");
    return this.loadRows();
  }

  setLimit(n) {
    const v = Number(n);
    if (!Number.isNaN(v) && v > 0) {
      this.limit = v;
      this.offset = 0;
      this._emit("limit");
      return this.loadRows();
    }
  }

  setOffset(n) {
    const v = Math.max(0, Number(n) || 0);
    this.offset = v;
    this._emit("offset");
    return this.loadRows();
  }

  nextPage() {
    this.offset = Math.max(0, this.offset + this.limit);
    this._emit("offset");
    return this.loadRows();
  }

  prevPage() {
    this.offset = Math.max(0, this.offset - this.limit);
    this._emit("offset");
    return this.loadRows();
  }

  setOrder(column, dir = "ASC") {
    this.order = column
      ? { column, dir: dir === "DESC" ? "DESC" : "ASC" }
      : null;
    this.offset = 0;
    this._emit("order");
    return this.loadRows();
  }

  // ---------- mutations ----------
  async insert(values) {
    if (!this.table) return null;
    const j = await dbInsert({ table: this.table, values });
    await this.loadRows();
    return j?.item ?? null;
  }

  async update(id, patch) {
    if (!this.table) return null;
    const j = await dbUpdate({ table: this.table, id, patch });
    await this.loadRows();
    return j?.item ?? null;
  }

  async remove(id) {
    if (!this.table) return null;
    const j = await dbDelete({ table: this.table, id });
    await this.loadRows();
    return j ?? null;
  }
}

// ---- singleton helpers ----
export function getDbService(opts = {}) {
  const KEY = Symbol.for("@loki/db:service@1");
  return getGlobalSingleton(KEY, () => new DbService(opts));
}
export const dbService = getDbService();
