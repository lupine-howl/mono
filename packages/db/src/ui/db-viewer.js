// src/ui/db-viewer.js
import { LitElement, html, css } from "lit";
import { DbController } from "../shared/lib/DbController.js";

export class DbViewer extends LitElement {
  static styles = css`
    :host {
      display: block;
    }
    .tabs {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
    }
    .tab {
      padding: 6px 10px;
      border: 1px solid #2a2a30;
      border-radius: 999px;
      background: #111214;
      cursor: pointer;
    }
    .tab.active {
      outline: 2px solid #3b82f6;
    }
    .bar {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-bottom: 8px;
      flex-wrap: wrap;
    }
    input,
    button,
    select {
      padding: 8px 10px;
      border-radius: 10px;
      border: 1px solid #2a2a30;
      background: #0b0b0c;
      color: inherit;
      font: inherit;
    }
    button {
      cursor: pointer;
      background: #1b1b1f;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th,
    td {
      border: 1px solid #1f1f22;
      padding: 6px 8px;
      font-size: 12px;
    }
    th {
      text-align: left;
      background: #111214;
    }
    .hint {
      font-size: 12px;
      opacity: 0.7;
      padding: 6px 0;
    }
  `;

  static properties = {
    // local UI mirrors of controller state
    _tab: { state: true }, // "Browse" | "Schema"
    _table: { state: true },
    _columns: { state: true },
    _rows: { state: true },
    _limit: { state: true },
    _offset: { state: true },
    _filterKey: { state: true },
    _filterVal: { state: true },
    _order: { state: true },

    _loadingSchema: { state: true },
    _loadingRows: { state: true },
    _error: { state: true },
  };

  constructor() {
    super();

    // self-instantiate controller (rebroadcasts service "change" as "db:change")
    this.controller = new DbController();

    // initial local state
    this._tab = "Browse";
    this._table = "";
    this._columns = [];
    this._rows = [];
    this._limit = 50;
    this._offset = 0;
    this._filterKey = "";
    this._filterVal = "";
    this._order = null;

    this._loadingSchema = false;
    this._loadingRows = false;
    this._error = null;

    // react to controller changes
    this._onChange = (e) => {
      const d = e.detail || {};
      if (typeof d.table === "string") this._table = d.table;
      if (Array.isArray(d.schema)) this._columns = d.schema;
      if (Array.isArray(d.rows)) this._rows = d.rows;
      if (typeof d.limit === "number") this._limit = d.limit;
      if (typeof d.offset === "number") this._offset = d.offset;
      if ("filterKey" in d) this._filterKey = d.filterKey || "";
      if ("filterVal" in d) this._filterVal = d.filterVal ?? "";
      if ("order" in d) this._order = d.order || null;
      if ("loadingSchema" in d) this._loadingSchema = !!d.loadingSchema;
      if ("loadingRows" in d) this._loadingRows = !!d.loadingRows;
      if ("error" in d) this._error = d.error || null;
      this.requestUpdate();
    };
    this.controller.addEventListener("db:change", this._onChange);

    // hydrate now / after ready()
    const init = () => {
      this._table = this.controller.table || "";
      this._columns = this.controller.schema || [];
      this._rows = this.controller.rows || [];
      this._limit = this.controller.limit || 50;
      this._offset = this.controller.offset || 0;
      this._filterKey = this.controller.filterKey || "";
      this._filterVal = this.controller.filterVal ?? "";
      this._order = this.controller.order || null;
      this._loadingSchema = !!this.controller.loadingSchema;
      this._loadingRows = !!this.controller.loadingRows;
      this._error = this.controller.error || null;
      this.requestUpdate();
    };
    if (this.controller.table || this.controller.rows?.length) init();
    else
      this.controller
        .ready?.()
        .then(init)
        .catch(() => {});
  }

  // --- UI handlers -> controller ---
  _applyFilter() {
    this.controller.setFilter(this._filterKey, this._filterVal);
  }
  _insertDemo = async () => {
    await this.controller.insert({ title: "New row", createdAt: Date.now() });
  };
  _prev = () => this.controller.prevPage();
  _next = () => this.controller.nextPage();
  _changeOrder = (e) => {
    const col = e.target.value || "";
    this.controller.setOrder(col || null, this._order?.dir || "ASC");
  };
  _toggleDir = () => {
    const dir = this._order?.dir === "DESC" ? "ASC" : "DESC";
    this.controller.setOrder(this._order?.column || null, dir);
  };

  render() {
    if (!this._table) {
      return html`<div class="hint">Select a table to begin.</div>`;
    }
    return html`
      <div class="tabs">
        ${["Browse", "Schema"].map(
          (tab) => html`
            <div
              class="tab ${this._tab === tab ? "active" : ""}"
              @click=${() => (this._tab = tab)}
            >
              ${tab}
            </div>
          `
        )}
      </div>

      ${this._tab === "Schema"
        ? html`
            ${this._loadingSchema
              ? html`<div class="hint">Loading schema…</div>`
              : html`<pre>${JSON.stringify(this._columns, null, 2)}</pre>`}
          `
        : html`
            <div class="bar">
              <select
                .value=${this._filterKey}
                @change=${(e) => (this._filterKey = e.target.value)}
              >
                <option value="">(no filter)</option>
                ${this._columns.map(
                  (c) => html`<option value=${c.name}>${c.name}</option>`
                )}
              </select>
              <input
                placeholder="value"
                .value=${this._filterVal}
                @input=${(e) => (this._filterVal = e.target.value)}
              />
              <button @click=${this._applyFilter}>Apply</button>

              <span style="flex:1 1 auto"></span>

              <select
                .value=${this._order?.column || ""}
                @change=${this._changeOrder}
                title="Order by column"
              >
                <option value="">(no order)</option>
                ${this._columns.map(
                  (c) => html`<option value=${c.name}>${c.name}</option>`
                )}
              </select>
              <button @click=${this._toggleDir} title="Toggle ASC/DESC">
                ${this._order?.dir || "ASC"}
              </button>

              <button @click=${this._insertDemo}>Insert demo row</button>

              <button @click=${this._prev}>Prev</button>
              <button @click=${this._next}>Next</button>
            </div>

            ${this._loadingRows
              ? html`<div class="hint">Loading rows…</div>`
              : ""}

            <div style="overflow:auto">
              <table>
                <thead>
                  <tr>
                    ${(this._rows[0]
                      ? Object.keys(this._rows[0])
                      : this._columns.map((c) => c.name)
                    ).map((h) => html`<th>${h}</th>`)}
                  </tr>
                </thead>
                <tbody>
                  ${this._rows.map(
                    (r) => html`<tr>
                      ${Object.values(r).map((v) => {
                        const s =
                          v && typeof v === "object"
                            ? JSON.stringify(v)
                            : String(v ?? "");
                        return html`<td>${s}</td>`;
                      })}
                    </tr>`
                  )}
                </tbody>
              </table>
            </div>
          `}
    `;
  }
}

if (!customElements.get("db-viewer")) {
  customElements.define("db-viewer", DbViewer);
}
