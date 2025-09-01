// src/ui/db-browser.js
import { LitElement, html, css } from "lit";
import { DbController } from "../shared/lib/DbController.js";

export class DbBrowser extends LitElement {
  static styles = css`
    :host {
      display: block;
    }
    .bar {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-bottom: 8px;
    }
    input,
    button {
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
    ul {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      gap: 6px;
    }
    li {
      padding: 8px;
      border: 1px solid #1f1f22;
      border-radius: 10px;
      background: #0f0f12;
      cursor: pointer;
    }
    li.active {
      outline: 2px solid #3b82f6;
    }
    .hint {
      font-size: 12px;
      opacity: 0.7;
    }
  `;

  static properties = {
    _tables: { state: true },
    _selected: { state: true },
    _search: { state: true },
    _loading: { state: true },
    _error: { state: true },
  };

  constructor() {
    super();

    // internal state
    this._tables = [];
    this._selected = "";
    this._search = "";
    this._loading = false;
    this._error = null;

    // self-instantiate controller (rebroadcasts service "change" as "db:change")
    this.controller = new DbController();

    // react to controller changes
    this._onChange = (e) => {
      const { tables, table, loadingTables, error } = e.detail ?? {};
      if (Array.isArray(tables)) this._tables = tables;
      if (typeof table === "string") this._selected = table;
      if (typeof loadingTables === "boolean") this._loading = loadingTables;
      this._error = error ?? null;
      this.requestUpdate();
    };
    this.controller.addEventListener("db:change", this._onChange);

    // hydrate immediately / after ready
    const init = () => {
      this._tables = this.controller.tables ?? [];
      this._selected = this.controller.table ?? "";
      this._loading = !!this.controller.loadingTables;
      this._error = this.controller.error ?? null;
      this.requestUpdate();
    };
    if (this.controller.tables?.length || this.controller.table) init();
    else
      this.controller
        .ready?.()
        .then(init)
        .catch(() => {});
  }

  render() {
    const q = this._search.trim().toLowerCase();
    const list = q
      ? this._tables.filter((t) => String(t).toLowerCase().includes(q))
      : this._tables;

    return html`
      <div class="bar">
        <input
          placeholder="Search tables…"
          .value=${this._search}
          @input=${(e) => (this._search = e.target.value)}
        />
        <button @click=${() => this.controller.refreshTables()}>⟳</button>
      </div>

      ${this._error ? html`<div class="hint">Error: ${this._error}</div>` : ""}
      ${this._loading && !list.length
        ? html`<div class="hint">Loading…</div>`
        : ""}

      <ul>
        ${list.map(
          (t) => html`<li
            class=${t === this._selected ? "active" : ""}
            @click=${() => this.controller.setTable(String(t))}
            title=${String(t)}
          >
            ${t}
          </li>`
        )}
      </ul>
    `;
  }
}

if (!customElements.get("db-browser")) {
  customElements.define("db-browser", DbBrowser);
}
