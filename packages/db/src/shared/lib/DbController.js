// src/shared/lib/DbController.js
import { dbService } from "./DbService.js";

/**
 * Thin controller:
 *  - kicks service.sync()
 *  - re-broadcasts service "change" as `eventName` (default "db:change")
 *  - exposes pass-through getters & actions for UI
 */
export class DbController extends EventTarget {
  constructor({ service = dbService, eventName = "db:change" } = {}) {
    super();
    this.svc = service;
    this.eventName = eventName;

    this._onSvc = (e) => {
      this.dispatchEvent(
        new CustomEvent(this.eventName, {
          detail: e.detail,
          bubbles: true,
          composed: true,
        })
      );
    };
    this.svc.addEventListener("change", this._onSvc);

    this._ready = this.svc.sync();
  }

  ready() {
    return this._ready;
  }
  disconnect() {
    this.svc.removeEventListener("change", this._onSvc);
  }

  // ----- pass-through state -----
  get tables() {
    return this.svc.tables;
  }
  get table() {
    return this.svc.table;
  }
  get schema() {
    return this.svc.schema;
  }
  get rows() {
    return this.svc.rows;
  }
  get limit() {
    return this.svc.limit;
  }
  get offset() {
    return this.svc.offset;
  }
  get filterKey() {
    return this.svc.filterKey;
  }
  get filterVal() {
    return this.svc.filterVal;
  }
  get order() {
    return this.svc.order;
  }
  get loadingTables() {
    return this.svc.loadingTables;
  }
  get loadingSchema() {
    return this.svc.loadingSchema;
  }
  get loadingRows() {
    return this.svc.loadingRows;
  }
  get error() {
    return this.svc.error;
  }

  // ----- pass-through actions -----
  refreshTables(opts) {
    return this.svc.refreshTables(opts);
  }
  setTable(name, opts) {
    return this.svc.setTable(name, opts);
  }
  loadSchema() {
    return this.svc.loadSchema();
  }
  loadRows() {
    return this.svc.loadRows();
  }

  setFilter(key, val) {
    return this.svc.setFilter(key, val);
  }
  setLimit(n) {
    return this.svc.setLimit(n);
  }
  setOffset(n) {
    return this.svc.setOffset(n);
  }
  nextPage() {
    return this.svc.nextPage();
  }
  prevPage() {
    return this.svc.prevPage();
  }
  setOrder(column, dir = "ASC") {
    return this.svc.setOrder(column, dir);
  }

  insert(values) {
    return this.svc.insert(values);
  }
  update(id, patch) {
    return this.svc.update(id, patch);
  }
  remove(id) {
    return this.svc.remove(id);
  }
}
