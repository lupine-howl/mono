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

    .grid {
      display: grid;
      grid-template-columns: 180px 1fr;
      gap: 8px 12px;
      align-items: start;
    }
    .k {
      color: #9aa3b2;
      padding-top: 6px;
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
    static: { type: Boolean, reflect: true },
    base: { type: String },
    src: { type: String },
    openapiUrl: { type: String },

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

    this._normalizing = false;

    this._onChange = (e) => {
      const d = e.detail ?? {};
      let schemaChanged = false,
        valuesChanged = false;

      if ("tool" in d) this._tool = d.tool;
      if ("schema" in d) {
        this._schema = d.schema;
        schemaChanged = true;
      }
      if ("values" in d) {
        this._values = d.values;
        valuesChanged = true;
      }
      if ("method" in d) this._method = d.method;
      if ("calling" in d) this._calling = d.calling;
      if (d.type?.startsWith("result") || d.type === "call:done") {
        if ("result" in d) this._result = d.result;
        if ("error" in d) this._error = d.error;
      }

      // Normalize whenever schema or values change
      if (schemaChanged || valuesChanged) {
        this._normalizeAll();
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
      this._normalizeAll(); // <- ensure we don't carry "" into nullable props
      this.requestUpdate();
    };

    if (this.controller.tools?.length) init();
    else
      this.controller
        .ready?.()
        .then(init)
        .catch(() => {});
  }

  // ---------- type helpers ----------
  typeSet(def) {
    const t = def?.type;
    if (Array.isArray(t)) return new Set(t);
    if (typeof t === "string") return new Set([t]);
    return new Set();
  }
  allowsNull(def) {
    return this.typeSet(def).has("null");
  }
  wantsNumber(def) {
    const ts = this.typeSet(def);
    return ts.has("number") || ts.has("integer");
  }
  wantsObjectOrArray(def) {
    const ts = this.typeSet(def);
    return ts.has("object") || ts.has("array");
  }
  wantsString(def) {
    return this.typeSet(def).has("string");
  }
  isPureBoolean(def) {
    const ts = this.typeSet(def);
    if (!ts.has("boolean")) return false;
    if (ts.size === 1) return true;
    if (ts.size === 2 && ts.has("null")) return true;
    return false;
  }

  // ---------- normalization ----------
  _normalizeAll() {
    if (this._normalizing || !this._schema?.properties) return;
    if (this._isPlanPaused) return; // do not touch args while a flow is paused    this._normalizing = true;

    try {
      const props = this._schema.properties || {};
      const req = new Set(this._schema.required || []);
      for (const [k, def] of Object.entries(props)) {
        const cur = this._values?.[k];
        const next = this._normalizedValue(def, cur, req.has(k));
        if (next !== cur) {
          // Prevent event storms: only set when a change occurred
          this.controller.setValue(k, next);
        }
      }
    } finally {
      this._normalizing = false;
    }
  }

  _normalizedValue(def, val, isRequired) {
    // Treat undefined as-is unless required (UI still shows missing)
    if (val === undefined) return undefined;

    // Map explicit empty string to null if nullable; else leave undefined for non-required
    if (val === "") {
      return this.allowsNull(def) ? null : isRequired ? "" : undefined;
    }

    // If someone passed "null" string, normalize to null when nullable
    if (val === "null" && this.allowsNull(def)) return null;

    // Coerce numbers if schema allows number/integer
    if (this.wantsNumber(def) && typeof val === "string") {
      const n = Number(val);
      if (!Number.isNaN(n)) return n;
    }

    // Coerce object/array JSON-like strings
    if (this.wantsObjectOrArray(def) && typeof val === "string") {
      const s = val.trim();
      if (s.startsWith("{") || s.startsWith("[")) {
        try {
          return JSON.parse(s);
        } catch {}
      }
      // If empty-ish and nullable, prefer null
      if (s === "" && this.allowsNull(def)) return null;
    }

    return val;
  }

  // Keep private service in sync if attributes change after construction
  updated(changed) {
    if (
      changed.has("base") ||
      changed.has("src") ||
      changed.has("openapiUrl")
    ) {
      // hook for reactive rebuilds if needed
    }
  }

  get _missingRequired() {
    const req = this._schema?.required || [];
    const miss = [];
    for (const k of req) {
      const def = this._schema?.properties?.[k] || {};
      const v = this._values?.[k];
      const allowsNull = this.allowsNull(def);
      const stringOK = this.wantsString(def);

      if (v === undefined) {
        miss.push(k);
        continue;
      }
      if (v === null && !allowsNull) {
        miss.push(k);
        continue;
      }
      if (v === "" && !stringOK) {
        miss.push(k);
        continue;
      }
    }
    return miss;
  }

  _updateField(key, ev) {
    const def = this._schema?.properties?.[key] || {};
    const allowsNull = this.allowsNull(def);

    if (def.type === "boolean" || this.isPureBoolean(def)) {
      this.controller.setValue(key, !!ev.target.checked);
      return;
    }

    let raw = ev.target.value;

    // Convert blank to null when nullable; else omit (undefined)
    if (raw === "") {
      const val = allowsNull ? null : undefined;
      this.controller.setValue(key, val);
      return;
    }

    // Coercions
    if (this.wantsNumber(def)) {
      const n = Number(raw);
      if (Number.isNaN(n)) return; // ignore invalid type
      this.controller.setValue(key, n);
      return;
    }

    if (this.wantsObjectOrArray(def) && typeof raw === "string") {
      try {
        const obj = JSON.parse(raw);
        this.controller.setValue(key, obj);
      } catch {
        // keep previous value if JSON invalid
      }
      return;
    }

    // default: string or free-form
    this.controller.setValue(key, raw);
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

    // Enum select with nullable blank option
    if (def?.enum) {
      const allowsNull = this.allowsNull(def);
      const hasEmptyEnum = Array.isArray(def.enum) && def.enum.includes("");
      return html`
        ${label}
        <div class="v">
          <select
            id=${id}
            .value=${v == null ? "" : String(v)}
            @change=${(e) => this._updateField(k, e)}
          >
            ${allowsNull && !hasEmptyEnum
              ? html`<option value="">(none)</option>`
              : null}
            ${def.enum.map(
              (opt) =>
                html`<option value=${String(opt)}>${String(opt)}</option>`
            )}
          </select>
        </div>
      `;
    }

    // Pure boolean handled in toggles section
    if (this.isPureBoolean(def)) return null;

    const ts = this.typeSet(def);

    if (ts.has("number") || ts.has("integer")) {
      return html`
        ${label}
        <div class="v">
          <input
            id=${id}
            type="number"
            .value=${v == null ? "" : String(v)}
            @input=${(e) => this._updateField(k, e)}
          />
        </div>
      `;
    }

    if (ts.has("object") || ts.has("array")) {
      return html`
        ${label}
        <div class="v">
          <textarea
            id=${id}
            .value=${v == null
              ? ""
              : typeof v === "string"
              ? v
              : JSON.stringify(v, null, 2)}
            @input=${(e) => this._updateField(k, e)}
          ></textarea>
        </div>
      `;
    }

    // Default: string/free-form
    return html`
      ${label}
      <div class="v">
        <input
          id=${id}
          .value=${v == null ? "" : String(v)}
          @input=${(e) => this._updateField(k, e)}
        />
      </div>
    `;
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

    const entries = Object.entries(this._schema?.properties || {});
    const toggles = entries.filter(([, d]) => this.isPureBoolean(d));
    const fields = entries.filter(([, d]) => !this.isPureBoolean(d));

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
              <div class="grid">${fields.map((e) => this._fieldRow(e))}</div>

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
