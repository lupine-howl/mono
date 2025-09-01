// src/ui/tool-viewer.js
import { LitElement, html, css } from "lit";
import { ToolsController } from "../shared/ToolsController.js";

export class ToolViewer extends LitElement {
  static styles = css`
    :host {
      display: block;
      padding: 16px;
      color: #e7e7ea;
    }
    h2 {
      margin: 0 0 6px 0;
      font-size: 18px;
    }
    .desc {
      opacity: 0.8;
      margin-bottom: 16px;
    }
    .form {
      display: grid;
      gap: 10px;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    }
    label {
      display: grid;
      gap: 6px;
      font-size: 12px;
    }
    input,
    textarea,
    select {
      padding: 8px 10px;
      border-radius: 10px;
      border: 1px solid #2a2a30;
      background: #0b0b0c;
      color: inherit;
      font: inherit;
    }
    textarea {
      min-height: 92px;
    }
    .hint {
      font-size: 12px;
      opacity: 0.7;
    }
    .bar {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-top: 12px;
      flex-wrap: wrap;
    }
    .pill {
      border: 1px solid #2a2a30;
      padding: 6px 10px;
      border-radius: 999px;
      background: #111214;
    }
    .btn {
      padding: 8px 12px;
      border-radius: 10px;
      border: 1px solid #2a2a30;
      background: #1b1b1f;
      color: inherit;
      cursor: pointer;
    }
    pre {
      background: #0f0f12;
      border: 1px solid #1f1f22;
      padding: 12px;
      border-radius: 10px;
      overflow: auto;
    }
  `;

  static properties = {
    // internal mirrors of controller state
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

    // self-instantiated controller (rebroadcasts service "change" as "tools:change")
    this.controller = new ToolsController();

    // internal state
    this._tool = null;
    this._schema = null;
    this._values = {};
    this._method = "POST";
    this._calling = false;
    this._result = null;
    this._error = null;

    // reactively mirror controller state
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

    // hydrate immediately / after ready
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

  _renderField([k, def]) {
    const req = (this._schema?.required || []).includes(k);
    const label = html`<div>
      ${k}${req ? " *" : ""}${def?.description
        ? html`<div class="hint">${def.description}</div>`
        : ""}
    </div>`;
    const v = this._values?.[k];

    if (def?.enum) {
      return html`<label>
        ${label}
        <select .value=${v ?? ""} @change=${(e) => this._updateField(k, e)}>
          ${def.enum.map((opt) => html`<option value=${opt}>${opt}</option>`)}
        </select>
      </label>`;
    }
    switch (def?.type) {
      case "boolean":
        return html`<label>
          ${label}
          <input
            type="checkbox"
            .checked=${!!v}
            @change=${(e) => this._updateField(k, e)}
          />
        </label>`;
      case "number":
      case "integer":
        return html`<label>
          ${label}
          <input
            type="number"
            .value=${v ?? ""}
            @input=${(e) => this._updateField(k, e)}
          />
        </label>`;
      case "array":
      case "object":
        return html`<label>
          ${label}
          <textarea
            .value=${typeof v === "string"
              ? v
              : v
              ? JSON.stringify(v, null, 2)
              : ""}
            @input=${(e) => this._updateField(k, e)}
          ></textarea>
        </label>`;
      default:
        return html`<label>
          ${label}
          <input .value=${v ?? ""} @input=${(e) => this._updateField(k, e)} />
        </label>`;
    }
  }

  render() {
    const t = this._tool;
    return html`
      ${t
        ? html`
            <h2>${t.name}</h2>
            ${t.description
              ? html`<div class="desc">${t.description}</div>`
              : ""}
          `
        : html`<div class="hint">Select a tool to begin.</div>`}
      ${this._schema
        ? html`
            <div class="form">
              ${Object.entries(this._schema.properties || {}).map((entry) =>
                this._renderField(entry)
              )}
            </div>

            <div class="bar">
              ${this._missingRequired.length
                ? html`<span class="pill"
                    >Missing: ${this._missingRequired.join(", ")}</span
                  >`
                : html`<span class="pill">Ready</span>`}

              <button
                class="btn"
                @click=${() => this.controller.call()}
                ?disabled=${this._calling || !t}
              >
                ${this._calling ? "Calling…" : "Call tool"}
              </button>

              <select
                @change=${(e) => this.controller.setMethod(e.target.value)}
                .value=${this._method}
                title="HTTP method"
              >
                <option>POST</option>
                <option>GET</option>
              </select>
              <span class="hint">Method</span>
            </div>

            ${this._result != null || this._error
              ? html` <div style="margin-top:12px">
                  <div class="hint">Result</div>
                  <pre>
${JSON.stringify(
                      this._error ? { error: this._error } : this._result,
                      null,
                      2
                    )}</pre
                  >
                </div>`
              : ""}
          `
        : ""}
    `;
  }
}

if (!customElements.get("tool-viewer")) {
  customElements.define("tool-viewer", ToolViewer);
}
