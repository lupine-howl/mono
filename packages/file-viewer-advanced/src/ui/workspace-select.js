import { LitElement, html, css } from "lit";
import "@loki/layout/ui/smart-select.js";

export class WorkspaceSelect extends LitElement {
  static styles = css`
    :host {
      display: block;
    }
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    label {
      font-size: 12px;
      opacity: 0.8;
    }
    select,
    .btn {
      padding: 8px 10px;
      border-radius: 10px;
      border: 1px solid #2a2a30;
      background: #0b0b0c;
      color: inherit;
      font: inherit;
    }
    select {
      width: 100%;
    }
    .btn {
      cursor: pointer;
    }
    .hint {
      font-size: 12px;
      opacity: 0.7;
    }
  `;

  static properties = {
    value: { type: String },
    _list: { state: true },
    _loading: { state: true },
    _error: { state: true },
  };

  constructor() {
    super();
    this.value = localStorage.getItem("ws:selected") || "";
    this._list = [];
    this._loading = false;
    this._error = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.refresh();
  }

  render() {
    // choose a safe selectedId that actually exists in the list
    const hasStored = this._list.some((w) => w.id === this.value);
    const selectedId = hasStored ? this.value : this._list[0]?.id || "";

    return html`
      ${this._list.length
        ? html`
            <!-- Do NOT set .value on <select>; instead mark <option selected> -->
            <smart-select @change=${this._onChange} ?disabled=${this._loading}>
              ${this._list.map(
                (w) => html`
                  <option
                    value=${w.id}
                    title=${w.path}
                    ?selected=${w.id === selectedId}
                  >
                    ${w.name}
                  </option>
                `
              )}
            </smart-select>
            <div class="hint">
              ${(this._list.find((w) => w.id === selectedId) || {}).path || ""}
            </div>
          `
        : html`<div class="hint">No workspaces configured.</div>`}
    `;
  }

  async refresh() {
    this._loading = true;
    this._error = null;
    try {
      const r = await fetch("/rpc/fsWorkspaces");
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const j = await r.json();
      this._list = Array.isArray(j?.workspaces) ? j.workspaces : [];

      const hasStored =
        this.value && this._list.some((w) => w.id === this.value);

      if (hasStored) {
        // Ensure parent hears the current selection after a refresh
        await this.updateComplete;
        this._emit(this.value, true);
      } else if (this._list[0]) {
        // Fall back to first option
        await this.updateComplete;
        this._emit(this._list[0].id, true);
      }
    } catch (e) {
      this._error = e?.message || String(e);
      this._list = [];
    } finally {
      this._loading = false;
    }
  }

  _onChange = (e) => this._emit(e.target.value, true);

  _emit(id, bubble) {
    this.value = id;
    localStorage.setItem("ws:selected", id);
    this.dispatchEvent(
      new CustomEvent("workspace-change", {
        detail: { id },
        bubbles: bubble,
        composed: true,
      })
    );
  }
}

customElements.define("workspace-select", WorkspaceSelect);
