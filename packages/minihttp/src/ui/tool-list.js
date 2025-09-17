// src/ui/tool-list.js
import { LitElement, html, css } from "lit";
import { ToolsController } from "../shared/ToolsController.js";
import { setActiveTab } from "@loki/layout/util";

export class ToolList extends LitElement {
  static styles = css`
    :host {
      display: block;
      color: #e7e7ea;
      font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .wrap {
      padding: 8px;
      background: #0b0b0c;
      border: 1px solid #1f1f22;
      border-radius: 12px;
    }
    .search {
      margin-bottom: 8px;
    }
    input[type="search"] {
      width: 100%;
      padding: 8px 10px;
      border-radius: 10px;
      border: 1px solid #2a2a30;
      background: #0f0f12;
      color: inherit;
      font: inherit;
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 4px;
    }
    li {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 6px 8px;
      border-radius: 8px;
      background: #0f0f12;
      border: 1px solid #1f1f22;
      cursor: pointer;
    }
    li:hover {
      background: #131317;
    }
    li.active {
      background: #15151b;
      border-color: #2a2a30;
    }
    .name {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .label {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .menu-btn {
      background: transparent;
      border: none;
      color: inherit;
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 6px;
    }
    .menu-btn:hover {
      background: #191a1f;
    }
    .menu {
      position: relative;
    }
    .dropdown {
      position: absolute;
      right: 0;
      top: 24px;
      background: #0f0f12;
      border: 1px solid #2a2a30;
      border-radius: 8px;
      min-width: 140px;
      z-index: 10;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    }
    .dropdown button {
      display: block;
      width: 100%;
      text-align: left;
      background: transparent;
      border: none;
      color: #e7e7ea;
      padding: 8px 10px;
      cursor: pointer;
      font: inherit;
    }
    .dropdown button:hover {
      background: #131317;
    }
    .muted {
      color: #9aa3b2;
      font-size: 12px;
    }
    .empty {
      padding: 8px;
      color: #9aa3b2;
    }
  `;

  static properties = {
    _tools: { state: true },
    _value: { state: true },
    _loading: { state: true },
    _error: { state: true },
    _q: { state: true },
    _menuFor: { state: true },
  };

  constructor() {
    super();
    this._tools = [];
    this._value = "";
    this._loading = false;
    this._error = null;
    this._q = "";
    this._menuFor = null;

    this.controller = new ToolsController();

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
        .catch((e) => (this._error = e?.message || String(e)))
        .finally(() => {
          this._loading = false;
          this.requestUpdate();
        });
    }

    this._onDocClick = (e) => {
      if (!this._menuFor) return;
      const path = e.composedPath?.() || [];
      const inside = path.some((n) => n === this);
      if (!inside) this._menuFor = null;
    };
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("click", this._onDocClick);
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("click", this._onDocClick);
    this.controller?.removeEventListener("tools:change", this._onChange);
  }

  _filtered() {
    const q = (this._q || "").trim().toLowerCase();
    if (!q) return this._tools;
    return this._tools.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.description || "").toLowerCase().includes(q)
    );
  }

  _select(name, ev) {
    ev?.stopPropagation?.();
    this.controller.setTool(name);
    this._menuFor = null;
    console.log(this.controller.tool);
    //if (this.controller.tool.isPlan) {
    //  setActiveTab("tool-console");
    //} else {
    setActiveTab("tool-viewer");
    //}
  }

  _toggleMenu(name, ev) {
    ev.stopPropagation();
    this._menuFor = this._menuFor === name ? null : name;
  }

  _edit(name, ev) {
    ev?.stopPropagation?.();
    this.controller.setTool(name);
    this._menuFor = null;
    try {
      setActiveTab("tool-viewer");
    } catch {}
  }

  render() {
    if (this._loading) return html`<div class="wrap">Loading…</div>`;
    if (this._error) return html`<div class="wrap">Error: ${this._error}</div>`;
    const list = this._filtered();

    return html`
      <div class="wrap">
        <div class="search">
          <input
            type="search"
            placeholder="Search tools…"
            .value=${this._q}
            @input=${(e) => (this._q = e.target.value)}
          />
        </div>
        ${list.length === 0
          ? html`<div class="empty">No tools found</div>`
          : html`<ul>
              ${list.map((t) => {
                const active = t.name === this._value;
                const open = this._menuFor === t.name;
                return html` <li
                  class=${active ? "active" : ""}
                  @click=${() => this._select(t.name)}
                >
                  <div class="name">
                    <span class="label">${t.name}</span>
                  </div>
                  <div class="menu">
                    <button
                      class="menu-btn"
                      title="Menu"
                      @click=${(e) => this._toggleMenu(t.name, e)}
                    >
                      ⋮
                    </button>
                    ${open
                      ? html`<div
                          class="dropdown"
                          @click=${(e) => e.stopPropagation()}
                        >
                          <button @click=${(e) => this._edit(t.name, e)}>
                            Edit
                          </button>
                        </div>`
                      : null}
                  </div>
                </li>`;
              })}
            </ul>`}
      </div>
    `;
  }
}

if (!customElements.get("tool-list")) {
  customElements.define("tool-list", ToolList);
}
