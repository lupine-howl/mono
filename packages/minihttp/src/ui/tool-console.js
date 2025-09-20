// src/ui/tool-console.js
import { LitElement, html, css } from "lit";
import { ToolsController } from "../shared/ToolsController.js";

const isRecord = (v) => v && typeof v === "object" && !Array.isArray(v);

export class ToolConsole extends LitElement {
  static styles = css`
    :host {
      display: block;
      color: #e7e7ea;
      font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .wrap {
      padding: 12px;
      background: #0b0b0c;
      border: 1px solid #1f1f22;
      border-radius: 12px;
    }
    .head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 10px;
      flex-wrap: wrap;
      align-items: center;
    }
    .title {
      font-weight: 600;
    }
    .note {
      color: #9aa3b2;
    }
    .pills {
      display: flex;
      gap: 8px;
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
    .row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin: 10px 0;
    }
    button {
      background: #0f0f12;
      border: 1px solid #2a2a30;
      color: #e7e7ea;
      padding: 6px 10px;
      border-radius: 8px;
      cursor: pointer;
    }
    button:hover {
      background: #131317;
    }
    button[disabled] {
      opacity: 0.6;
      cursor: default;
    }
    .bubble {
      background: #131317;
      border: 1px solid #1f1f22;
      border-radius: 8px;
      padding: 8px;
      margin: 6px 0;
      white-space: pre-wrap;
    }
    .bubble.assistant {
      border-color: #3a3a40;
    }
    .err {
      color: #fecaca;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th,
    td {
      border: 1px solid #1f1f22;
      padding: 6px;
      text-align: left;
    }
    img {
      max-width: 100%;
      border-radius: 8px;
      border: 1px solid #1f1f22;
      background: #0f0f12;
    }
    pre {
      background: #131317;
      border: 1px solid #1f1f22;
      border-radius: 8px;
      padding: 8px;
      overflow: auto;
    }
    textarea,
    input,
    select {
      padding: 8px 10px;
      border-radius: 8px;
      border: 1px solid #1f1f22;
      background: #131317;
      color: #e7e7ea;
      width: 100%;
      box-sizing: border-box;
      font: inherit;
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
    .checkbox {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .footer {
      display: flex;
      justify-content: flex-end;
      margin-top: 12px;
    }
  `;

  static properties = {
    _result: { state: true },
    _error: { state: true },
    _ui: { state: true },
    _tool: { state: true },
    _formSchema: { state: true },
    _formValues: { state: true },
  };

  constructor() {
    super();
    this.controller = new ToolsController();
    this._result = null;
    this._error = null;
    this._ui = null;
    this._tool = null;
    this._formSchema = null;
    this._formValues = null;

    this._onChange = (e) => {
      const d = e.detail ?? {};
      if ("tool" in d) this._tool = d.tool;

      if (
        "result" in d ||
        d.type?.startsWith("result") ||
        d.type === "call:done"
      ) {
        this._result = d.result ?? this.controller.result ?? null;
        this._error = d.error ?? this.controller.error ?? null;
        this._ui = this._pickUi(this._result, this._error);

        const snap =
          this._result?.data?.form || this._result?.preview?.data?.form;
        if (snap?.schema) {
          this._formSchema = snap.schema;
          this._formValues = { ...(snap.values || {}) };
        } else {
          this._formSchema = null;
          this._formValues = null;
        }
      }
      this.requestUpdate();
    };
  }

  async connectedCallback() {
    super.connectedCallback();
    this.controller.addEventListener("tools:change", this._onChange);
    try {
      await this.controller.ready();
    } catch {}
    this._tool = this.controller.tool;
    this._result = this.controller.result;
    this._error = this.controller.error;
    this._ui = this._pickUi(this._result, this._error);

    const snap = this._result?.data?.form;
    if (snap?.schema) {
      this._formSchema = snap.schema;
      this._formValues = { ...(snap.values || {}) };
    }
    this.requestUpdate();
  }

  disconnectedCallback() {
    this.controller.removeEventListener("tools:change", this._onChange);
    super.disconnectedCallback();
  }

  // ---------- UI routing ----------
  _pickUi(result, error) {
    if (error) return { kind: "error", title: "Error" };
    if (result?.__PLAN_PAUSED__) {
      const pk = result?.preview?.ui?.kind;
      return pk ? result.preview.ui : { kind: "paused", title: "Plan paused" };
    }
    const ui = result?.ui || {};
    if (ui?.kind) return ui;

    const d = result?.data;
    if (isRecord(d)) {
      if (Array.isArray(d.messages))
        return { kind: "chat", title: ui.title || "Assistant" };
      if (d?.form?.schema) return { kind: "form", title: ui.title || "Input" };
      if (d?.image?.url || /^image\//.test(String(d?.mime || "")))
        return { kind: "image", title: ui.title || "Image" };
      if (Array.isArray(d) && d.every(isRecord))
        return { kind: "table", title: ui.title || "Table" };
      if (Array.isArray(d?.rows) && isRecord(d?.rows[0]))
        return { kind: "table", title: ui.title || "Table" };
      if (d?.html) return { kind: "html", title: ui.title || "Preview" };
      if (d?.code) return { kind: "code", title: ui.title || "Code" };
      if (d?.path || d?.file)
        return { kind: "file", title: ui.title || "File" };
    }
    return { kind: "empty", title: "Console" };
  }

  // ---------- actions ----------
  _onActionClick(action) {
    if (!action) return;

    if (action.tool === "__resume__") {
      const cp = this._result?.checkpoint;
      // ✅ merge button args with any live form edits (if any)
      const merged = { ...(this._formValues || {}), ...(action.args || {}) };
      if (cp) this._doResume(cp, merged);
      return;
    }

    if (action.tool) {
      if (typeof this.controller.callNamed === "function") {
        this.controller.callNamed(action.tool, action.args || {});
      } else {
        this.controller.setTool(action.tool);
        if (action.args) this.controller.setValues(action.args);
        this.controller.call();
      }
      return;
    }

    this.dispatchEvent(
      new CustomEvent("tool-console:action", { detail: action })
    );
  }

  async _doResume(cp, payload = {}) {
    // keep service values in sync (handy for consumers that read service.values)
    this.controller.setValues(payload);
    await this.controller.resumePlan(cp, payload);
  }

  // ---------- form utils ----------
  _typeSet(def) {
    const t = def?.type;
    if (Array.isArray(t)) return new Set(t);
    if (typeof t === "string") return new Set([t]);
    return new Set();
  }
  _allowsNull(def) {
    return Array.isArray(def?.type) && def.type.includes("null");
  }
  _requiredMissing(schema, values) {
    const req = new Set(schema?.required || []);
    const props = schema?.properties || {};
    for (const k of req) {
      const def = props[k] || {};
      const v = values?.[k];
      const ts = this._typeSet(def);
      const isStringy = ts.has("string") || (!ts.size && typeof v === "string");
      if (v === undefined) return true;
      if (v === null && !this._allowsNull(def)) return true;
      if (v === "" && !isStringy) return true;
    }
    return false;
  }
  _updateFormField(key, ev, def) {
    const ts = this._typeSet(def);
    let val = ev?.target?.value;
    if (ts.has("boolean")) {
      val = !!ev.target.checked;
    } else if (val === "" && this._allowsNull(def)) {
      val = null;
    } else if (ts.has("number") || ts.has("integer")) {
      const n = Number(val);
      if (!Number.isNaN(n)) val = ts.has("integer") ? Math.trunc(n) : n;
    } else if (
      (ts.has("object") || ts.has("array")) &&
      typeof val === "string"
    ) {
      try {
        val = JSON.parse(val);
      } catch {}
    }
    this._formValues = { ...(this._formValues || {}), [key]: val };
    this.requestUpdate();
  }

  // ---------- head / start ----------
  _renderHead(extraRight = null) {
    const title = this._ui?.title || (this._tool?.name ?? "Console");
    const note = this._ui?.note || "";
    const pills = html` <div class="pills">
      ${this._tool?.name
        ? html`<span class="pill">tool: ${this._tool.name}</span>`
        : null}
      ${this.controller.calling
        ? html`<span class="pill">calling…</span>`
        : null}
    </div>`;
    return html` <div class="head">
      <div>
        <div class="title">${title}</div>
        ${note ? html`<div class="note">${note}</div>` : null}
      </div>
      <div style="display:flex; gap:8px; align-items:center;">
        ${pills} ${extraRight}
      </div>
    </div>`;
  }

  _renderStart() {
    const startBtn = html` <button
      @click=${() => this.controller.call()}
      ?disabled=${!this._tool}
    >
      ${this.controller.calling
        ? "Running…"
        : this._tool
        ? `Start ${this._tool.name}`
        : "Start"}
    </button>`;
    return html` <div class="wrap">
      ${this._renderHead(startBtn)}
      <div class="note">
        ${this._tool
          ? "Click Start to run the selected tool. If it’s a flow, you’ll see steps here."
          : "Select a tool in the form below to begin."}
      </div>
    </div>`;
  }

  // ---------- renderers ----------
  _renderActions() {
    const actions = this._ui?.actions || [];
    if (!actions.length) return null;
    return html` <div class="row">
      ${actions.map(
        (a) =>
          html`<button @click=${() => this._onActionClick(a)}>
            ${a.label}
          </button>`
      )}
    </div>`;
  }

  _renderError() {
    return html`<div class="wrap">
      ${this._renderHead()}
      <div class="err">${String(this._error || "Unknown error")}</div>
    </div>`;
  }

  // BODY ONLY form renderer (used by paused + normal)
  _renderFormBody(schema, values) {
    const req = new Set(schema?.required || []);
    const rows = Object.entries(schema?.properties || {}).map(([k, def]) => {
      const ts = this._typeSet(def);
      const v = values[k];
      const label = html`<label class="k" for=${k}
        >${k}${req.has(k) ? " *" : ""}${def?.description
          ? html`<div class="note">${def.description}</div>`
          : null}</label
      >`;
      if (def?.enum) {
        const allowsNull = this._allowsNull(def);
        return html`${label}
          <div class="v">
            <select
              id=${k}
              .value=${v == null ? "" : String(v)}
              @change=${(e) => this._updateFormField(k, e, def)}
            >
              ${allowsNull ? html`<option value="">(none)</option>` : null}
              ${def.enum.map(
                (opt) =>
                  html`<option value=${String(opt)}>${String(opt)}</option>`
              )}
            </select>
          </div>`;
      }
      if (ts.has("boolean") && ts.size <= 2) {
        return html`<div class="k"></div>
          <div class="v">
            <label class="checkbox">
              <input
                type="checkbox"
                .checked=${!!v}
                @change=${(e) =>
                  this._updateFormField(
                    k,
                    {
                      target: {
                        value: e.target.checked,
                        checked: e.target.checked,
                      },
                    },
                    { type: "boolean" }
                  )}
              />
              <span>${k}${req.has(k) ? " *" : ""}</span>
            </label>
          </div>`;
      }
      if (ts.has("number") || ts.has("integer")) {
        return html`${label}
          <div class="v">
            <input
              id=${k}
              type="number"
              .value=${v ?? ""}
              @input=${(e) => this._updateFormField(k, e, def)}
            />
          </div>`;
      }
      if (ts.has("object") || ts.has("array")) {
        return html`${label}
          <div class="v">
            <textarea
              id=${k}
              .value=${v == null
                ? ""
                : typeof v === "string"
                ? v
                : JSON.stringify(v, null, 2)}
              @input=${(e) => this._updateFormField(k, e, def)}
            ></textarea>
          </div>`;
      }
      return html`${label}
        <div class="v">
          <input
            id=${k}
            .value=${v ?? ""}
            @input=${(e) => this._updateFormField(k, e, def)}
          />
        </div>`;
    });
    return html`<div class="grid">${rows}</div>`;
  }
  // Render a one-off payload (like pause preview) using existing renderers.
  _renderPreview(payload) {
    if (!payload) return null;
    const ui = payload.ui?.kind ? payload.ui : this._pickUi(payload, null);

    // Temp swap so we can reuse the existing renderers without duplication
    const save = { r: this._result, u: this._ui };
    this._result = payload;
    this._ui = ui;

    let out;
    const kind = ui.kind;
    if (kind === "form") {
      const form = payload?.data?.form || {};
      const schema = form.schema || {};
      const values = form.values || {};
      out = html`<div class="wrap">
        ${this._renderHead()} ${this._renderFormBody(schema, values)}
        <div class="footer">${this.continueBtn}</div>
        ${this._renderActions()}
      </div>`;
    }
    //if (kind === "form") out = this._renderForm();
    else if (kind === "chat") out = this._renderChat();
    else if (kind === "image") out = this._renderImage();
    else if (kind === "table") out = this._renderTable();
    else if (kind === "file") out = this._renderFile();
    else if (kind === "code") out = this._renderCode();
    else if (kind === "html") out = this._renderHtml();
    else out = this._renderJson();

    this._result = save.r;
    this._ui = save.u;
    return out;
  }

  continueBtn = html`
    <button
      @click=${() =>
        this._doResume(this._result?.checkpoint, this._formValues || {})}
    >
      Continue
    </button>
  `;

  _renderPaused() {
    const preview = this._result?.preview;

    return html` <div>
      ${preview
        ? this._renderPreview(preview)
        : html`<div class="note">The plan paused and is awaiting input.</div>`}
      <details style="margin-top:8px;">
        <summary>Checkpoint</summary>
        <pre>${JSON.stringify(this._result?.checkpoint, null, 2)}</pre>
      </details>
    </div>`;
  }

  _renderForm() {
    const form = this._result?.data?.form || {};
    // Prefer the schema/values that arrived with THIS result; only fall back to cached edits
    const schema = form.schema || this._formSchema || {};
    const values =
      (this._formValues !== null && this._formValues !== undefined
        ? this._formValues
        : form.values) || {};
    const disabled = this._requiredMissing(schema, values);
    return html` <div class="wrap">
      ${this._renderHead()} ${this._renderFormBody(schema, values)}
      <div class="footer">${this.continueBtn}</div>
      ${this._renderActions()}
    </div>`;
  }

  _renderChat() {
    const msgs = this._result?.data?.messages || [];
    return html` <div class="wrap">
      ${this._renderHead()}
      ${msgs.map(
        (m) => html`<div class="bubble ${m.role}">${m.content || ""}</div>`
      )}
      ${this._renderActions()}
    </div>`;
  }

  _renderImage() {
    const d = this._result?.data || {};
    const url = d?.image?.url || d?.url || d?.path;
    return html` <div class="wrap">
      ${this._renderHead()}
      ${url
        ? html`<img src=${url} alt="image result" />`
        : html`<div class="note">No image URL provided</div>`}
      ${this._renderActions()}
    </div>`;
  }

  _renderTable() {
    const d = this._result?.data;
    const rows = Array.isArray(d) ? d : d?.rows || [];
    if (!rows.length) {
      return html`<div class="wrap">
        ${this._renderHead()}
        <div class="note">No rows</div>
      </div>`;
    }
    const cols = Object.keys(rows[0] || {});
    return html` <div class="wrap">
      ${this._renderHead()}
      <table>
        <thead>
          <tr>
            ${cols.map((c) => html`<th>${c}</th>`)}
          </tr>
        </thead>
        <tbody>
          ${rows.map(
            (r) =>
              html`<tr>
                ${cols.map((c) => html`<td>${String(r[c])}</td>`)}
              </tr>`
          )}
        </tbody>
      </table>
      ${this._renderActions()}
    </div>`;
  }

  _renderFile() {
    const d = this._result?.data || {};
    const name = d?.file?.name || d?.name || d?.path || "download";
    const href = d?.file?.url || d?.url || d?.path || "#";
    return html` <div class="wrap">
      ${this._renderHead()}
      <div class="row">
        <a href=${href} download class="button"
          ><button>Download ${name}</button></a
        >
      </div>
      ${this._renderActions()}
    </div>`;
  }

  _renderCode() {
    const d = this._result?.data || {};
    const lang = d?.lang || "";
    const code = d?.code || "";
    return html` <div class="wrap">
      ${this._renderHead()}
      <pre><code>${lang ? `// ${lang}\n` : ""}${code}</code></pre>
      ${this._renderActions()}
    </div>`;
  }

  _renderHtml() {
    const d = this._result?.data || {};
    const htmlStr = d?.html || "";
    return html` <div class="wrap">
      ${this._renderHead()}
      <div class="bubble" .innerHTML=${htmlStr}></div>
      ${this._renderActions()}
    </div>`;
  }

  _renderJson() {
    const d = this._result?.data ?? this._result ?? {};
    return html`<div class="wrap">
      ${this._renderHead()}
      <pre>${JSON.stringify(d, null, 2)}</pre>
      ${this._renderActions()}
    </div>`;
  }

  render() {
    if (this._error) return this._renderError();
    if (!this._result && this._tool) return this._renderStart();

    const kind = this._ui?.kind;
    if (this._result?.__PLAN_PAUSED__) return this._renderPaused();
    if (kind === "form") return this._renderForm();
    if (kind === "chat") return this._renderChat();
    if (kind === "image") return this._renderImage();
    if (kind === "table") return this._renderTable();
    if (kind === "file") return this._renderFile();
    if (kind === "code") return this._renderCode();
    if (kind === "html") return this._renderHtml();
    if (kind === "json") return this._renderJson();

    return html`<tool-viewer></tool-viewer>`;
  }
}

if (!customElements.get("tool-console")) {
  customElements.define("tool-console", ToolConsole);
}
