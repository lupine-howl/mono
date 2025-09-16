// src/ui/tool-viewer.js
// (drop-in replacement)

import { LitElement, html, css } from "lit";
import { ToolsController } from "../shared/ToolsController.js";

const slug = (s) =>
  String(s)
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/gi, "")
    .toLowerCase();

export class ToolViewer extends LitElement {
  static styles = css`
    :host {
      display: block;
      font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      color: #e7e7ea;
    }
    .wrap {
      padding: 12px;
      background: #0b0b0c;
      border: 1px solid #1f1f22;
      border-radius: 12px;
    }

    /* Header */
    .head {
      display: flex;
      gap: 8px 12px;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }
    .title {
      font-size: 14px;
      font-weight: 600;
      color: #e7e7ea;
    }
    .desc {
      color: #9aa3b2;
      margin-top: 2px;
      max-width: 900px;
    }
    .pills {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }
    .pill {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      background: #131317;
      border: 1px solid #1f1f22;
      white-space: nowrap;
    }

    /* Form grid */
    .grid {
      display: grid;
      grid-template-columns: 180px 1fr;
      gap: 8px 12px;
      align-items: start;
    }
    .k {
      color: #9aa3b2;
      padding-top: 6px; /* aligns with input padding */
    }
    .hint {
      color: #9aa3b2;
      font-size: 12px;
      margin-top: 4px;
    }
    .v {
      color: #e7e7ea;
      overflow: visible;
    }

    /* Inputs */
    input,
    textarea,
    select {
      padding: 8px 10px;
      border-radius: 8px;
      border: 1px solid #1f1f22;
      background: #131317;
      color: #e7e7ea;
      font: inherit;
      outline: none;
      width: 100%;
      box-sizing: border-box;
    }
    input:focus,
    textarea:focus,
    select:focus {
      border-color: #2a2a30;
      box-shadow: 0 0 0 2px #111214;
    }
    textarea {
      min-height: 110px;
      resize: vertical;
    }

    /* Buttons row */
    .row {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
      margin-top: 12px;
    }
    button,
    .btn-like {
      background: #0f0f12;
      border: 1px solid #2a2a30;
      color: #e7e7ea;
      padding: 6px 10px;
      border-radius: 8px;
      cursor: pointer;
      font: inherit;
    }
    button:hover,
    .btn-like:hover {
      background: #131317;
    }
    .btn-primary {
      border-color: #3a3a40;
      background: #1a1a1f;
    }
    .btn-primary[disabled] {
      opacity: 0.6;
      cursor: default;
    }

    /* Details / code blocks */
    code,
    pre {
      background: #131317;
      border: 1px solid #1f1f22;
      border-radius: 8px;
      padding: 8px;
      display: block;
      overflow: auto;
    }
    details {
      background: #0f0f12;
      border: 1px solid #1f1f22;
      border-radius: 8px;
      padding: 6px 8px;
    }
    details > summary {
      cursor: pointer;
      color: #c7d2fe;
    }

    /* Checkbox/toggles group */
    .toggles {
      display: grid;
      grid-template-columns: 180px 1fr;
      gap: 8px 12px;
      align-items: start;
      margin-top: 8px;
    }
    .toggle-list {
      display: grid;
      gap: 6px;
    }
    .checkbox {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: #0f0f12;
      border: 1px solid #1f1f22;
      padding: 6px 8px;
      border-radius: 8px;
      width: fit-content;
    }
    .checkbox input[type="checkbox"] {
      width: auto;
      padding: 0;
      border: 1px solid #2a2a30;
      background: #131317;
    }
  `;

  static properties = {
    // Optional endpoint overrides (rarely needed)
    static: { type: Boolean, reflect: true },
    base: { type: String },
    src: { type: String },
    openapiUrl: { type: String },

    // Initialize with a tool + args + method
    tool: { type: String },
    args: {
      attribute: "args",
      converter: {
        fromAttribute(v) {
          if (v == null) return null;
          try {
            return JSON.parse(v);
          } catch {
            return v;
          }
        },
      },
    },
    method: { type: String },

    _tool: { state: true },
    _schema: { state: true },
    _values: { state: true },
    _method: { state: true },
    _calling: { state: true },
    _result: { state: true },
    _error: { state: true },
  };

  constructor() {
    super();

    this.controller = new ToolsController();

    this._tool = null;
    this._schema = null;
    this._values = {};
    this._method = "POST";
    this._calling = false;
    this._result = null;
    this._error = null;

    this._onChange = (e) => {
      const d = e.detail ?? {};
      if ("tool" in d) this._tool = d.tool;
      if ("schema" in d) this._schema = d.schema;
      if ("values" in d) this._values = d.values;
      if ("method" in d) this._method = d.method;
      if ("calling" in d) this._calling = d.calling;
      if (d.type?.startsWith("result") || d.type === "call:done") {
        if ("result" in d) this._result = d.result;
        if ("error" in d) this._error = d.error;
      }
      this.requestUpdate();
    };
    this.controller.addEventListener("tools:change", this._onChange);

    const init = () => {
      this._tool = this.controller.tool;
      this._schema = this.controller.schema;
      this._values = this.controller.values;
      this._method = this.controller.method;
      this._calling = this.controller.calling;
      this._result = this.controller.result;
      this._error = this.controller.error;
      this.requestUpdate();
    };

    if (this.controller.tools?.length) init();
    else
      this.controller
        .ready?.()
        .then(init)
        .catch(() => {});
  }

  // Keep private service in sync if attributes change after construction
  updated(changed) {
    if (
      changed.has("base") ||
      changed.has("src") ||
      changed.has("openapiUrl")
    ) {
      // If you need to reactively rebuild the service when endpoints change,
      // you could do it here. Often not necessary in chat usage.
    }
  }

  get _missingRequired() {
    const req = this._schema?.required || [];
    const miss = [];
    for (const k of req) {
      const v = this._values?.[k];
      if (v === undefined || v === "") miss.push(k);
    }
    return miss;
  }

  _updateField(key, ev) {
    const def = this._schema?.properties?.[key] || {};
    let val;
    if (def.type === "boolean") {
      val = ev.target.checked;
    } else {
      val = ev.target.value;
      if ((def.type === "number" || def.type === "integer") && val !== "") {
        const n = Number(val);
        if (!Number.isNaN(n)) val = n;
      } else if (
        (def.type === "object" || def.type === "array") &&
        typeof val === "string"
      ) {
        try {
          val = JSON.parse(val);
        } catch {}
      }
    }
    this.controller.setValue(key, val);
  }

  _fieldRow([k, def]) {
    const id = `f-${slug(k)}`;
    const v = this._values?.[k];
    const req = (this._schema?.required || []).includes(k);

    const label = html`
      <label class="k" for=${id}>
        ${k}${req ? " *" : ""}
        ${def?.description
          ? html`<div class="hint">${def.description}</div>`
          : ""}
      </label>
    `;

    if (def?.enum) {
      return html`
        ${label}
        <div class="v">
          <select
            id=${id}
            .value=${v ?? ""}
            @change=${(e) => this._updateField(k, e)}
          >
            ${def.enum.map((opt) => html`<option value=${opt}>${opt}</option>`)}
          </select>
        </div>
      `;
    }

    switch (def?.type) {
      case "number":
      case "integer":
        return html`
          ${label}
          <div class="v">
            <input
              id=${id}
              type="number"
              .value=${v ?? ""}
              @input=${(e) => this._updateField(k, e)}
            />
          </div>
        `;
      case "array":
      case "object":
        return html`
          ${label}
          <div class="v">
            <textarea
              id=${id}
              .value=${typeof v === "string"
                ? v
                : v
                ? JSON.stringify(v, null, 2)
                : ""}
              @input=${(e) => this._updateField(k, e)}
            ></textarea>
          </div>
        `;
      case "boolean":
        return null; // handled in Toggles
      default:
        return html`
          ${label}
          <div class="v">
            <input
              id=${id}
              .value=${v ?? ""}
              @input=${(e) => this._updateField(k, e)}
            />
          </div>
        `;
    }
  }

  _checkboxRow([k, def]) {
    const id = `f-${slug(k)}`;
    const v = !!this._values?.[k];
    const req = (this._schema?.required || []).includes(k);

    return html`
      <label class="checkbox">
        <input
          id=${id}
          type="checkbox"
          .checked=${v}
          @change=${(e) => this._updateField(k, e)}
        />
        <span>${k}${req ? " *" : ""}</span>
      </label>
      ${def?.description
        ? html`<div class="hint" style="grid-column: 2 / -1;">
            ${def.description}
          </div>`
        : null}
    `;
  }

  render() {
    const t = this._tool;
    const ready = !this._missingRequired.length;

    // Partition fields into non-boolean and boolean (toggles)
    const entries = Object.entries(this._schema?.properties || {});
    const fields = entries.filter(([, d]) => d?.type !== "boolean");
    const toggles = entries.filter(([, d]) => d?.type === "boolean");

    return html`
      <div class="wrap">
        <div class="head">
          <div>
            <div class="title">${t ? t.name : "No tool selected"}</div>
            ${t?.description
              ? html`<div class="desc">${t.description}</div>`
              : null}
          </div>
          <div class="pills">
            <span class="pill">method: ${this._method}</span>
            <span class="pill">calling: ${!!this._calling}</span>
            <span class="pill"
              >${ready
                ? "ready"
                : `missing: ${this._missingRequired.join(", ")}`}</span
            >
          </div>
        </div>

        ${this._schema
          ? html`
              <!-- Non-boolean fields in two-column grid -->
              <div class="grid">${fields.map((e) => this._fieldRow(e))}</div>

              <!-- Toggles group at the end if any -->
              ${toggles.length
                ? html`
                    <div class="toggles">
                      <div class="k">Toggles</div>
                      <div class="v toggle-list">
                        ${toggles.map((e) => this._checkboxRow(e))}
                      </div>
                    </div>
                  `
                : null}

              <!-- Actions (left-aligned) -->
              <div class="row">
                <button
                  class="btn-primary"
                  @click=${() => this.controller.call()}
                  ?disabled=${this._calling || !t}
                  title="Execute the tool with current parameters"
                >
                  ${this._calling ? "Calling…" : "Call tool"}
                </button>

                <label
                  class="k"
                  style="display:flex;align-items:center;gap:6px;"
                >
                  Method
                  <select
                    class="btn-like"
                    @change=${(e) => this.controller.setMethod(e.target.value)}
                    .value=${this._method}
                    title="HTTP method"
                  >
                    <option>POST</option>
                    <option>GET</option>
                  </select>
                </label>
              </div>

              ${this._result != null || this._error
                ? html`
                    <details open style="margin-top:12px;">
                      <summary>Result ${this._error ? "(error)" : ""}</summary>
                      <pre>
${JSON.stringify(
                          this._error ? { error: this._error } : this._result,
                          null,
                          2
                        )}</pre
                      >
                    </details>
                  `
                : null}
            `
          : html`<div class="desc">Select a tool to begin.</div>`}
      </div>
    `;
  }
}

if (!customElements.get("tool-viewer")) {
  customElements.define("tool-viewer", ToolViewer);
}
