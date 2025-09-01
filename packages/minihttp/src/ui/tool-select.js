// src/ui/tool-select.js
import { LitElement, html, css } from "lit";
import "@loki/layout/ui/smart-select.js";
import { ToolsController } from "../shared/ToolsController.js";

export class ToolSelect extends LitElement {
  static styles = css`
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .btn,
    select,
    input {
      padding: 8px 10px;
      border-radius: 10px;
      border: 1px solid #2a2a30;
      background: #0b0b0c;
      color: inherit;
      font: inherit;
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
    _tools: { state: true },
    _value: { state: true },
    _loading: { state: true },
    _error: { state: true },
  };

  constructor() {
    super();
    this._tools = [];
    this._value = "";
    this._loading = false;
    this._error = null;

    this.controller = new ToolsController();

    // React to controller changes
    this._onChange = (e) => {
      const d = e.detail ?? {};
      if (Array.isArray(d.tools)) this._tools = d.tools;
      if (typeof d.toolName === "string") this._value = d.toolName;
      if (d.type === "tools:loading") this._loading = true;
      if (d.type === "tools:loaded") this._loading = false;
      if (d.error !== undefined) this._error = d.error;
      this.requestUpdate();
    };
    this.controller.addEventListener("tools:change", this._onChange);

    // Initial hydrate: kick sync, but also take any current state immediately
    if (this.controller.tools?.length) {
      this._tools = this.controller.tools;
      this._value = this.controller.toolName || this._tools[0]?.name || "";
    } else {
      this._loading = true;
      this.controller
        .ready()
        .then(() => {
          this._tools = this.controller.tools ?? [];
          this._value = this.controller.toolName || this._tools[0]?.name || "";
        })
        .catch((e) => {
          this._error = e?.message || String(e);
        })
        .finally(() => {
          this._loading = false;
          this.requestUpdate();
        });
    }
  }

  render() {
    const has = this._tools.length > 0;
    return html`
      ${has
        ? html`
            <smart-select
              .value=${this._value || this._tools[0].name}
              @change=${this._onSelect}
              ?disabled=${this._loading}
            >
              ${this._tools.map(
                (t) => html`
                  <option value=${t.name} title=${t.description || ""}>
                    ${t.name}
                  </option>
                `
              )}
            </smart-select>
          `
        : html`
            ${this._loading
              ? html`<span class="hint">Loading…</span>`
              : this._error
              ? html`<span class="hint" title=${this._error}>Error</span>
                  <button class="btn" @click=${this._refresh}>Retry</button>`
              : html`<button class="btn" @click=${this._refresh}>
                  Refresh
                </button>`}
          `}
    `;
  }

  _onSelect = (e) => {
    const name = e.target?.value || "";
    this._value = name;
    this.controller.setTool(name);
  };

  _refresh = () => this.controller.refreshTools();
}

if (!customElements.get("tool-select")) {
  customElements.define("tool-select", ToolSelect);
}
