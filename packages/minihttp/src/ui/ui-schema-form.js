// src/ui/ui-schema-form.js
import { LitElement, html, css } from "lit";

export class UiSchemaForm extends LitElement {
  static styles = css`
    :host {
      display: block;
    }
    .grid {
      display: grid;
      grid-template-columns: 180px 1fr;
      gap: 10px 14px;
      align-items: start;
    }
    label.k {
      color: #9aa3b2;
      padding-top: 6px;
      font-size: 13px;
    }
    .note {
      color: #9aa3b2;
      font-size: 12px;
      margin-top: 4px;
    }
    input,
    select,
    textarea {
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid #2a2a30;
      background: #0b0b0c;
      color: #e9eaed;
      font: inherit;
      width: 100%;
      box-sizing: border-box;
    }
    textarea {
      min-height: 120px;
    }
    .checkbox {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 0;
    }
    .footer {
      display: flex;
      gap: 10px;
      justify-content: flex-end;
      margin-top: 16px;
    }
    button {
      background: #0f0f12;
      border: 1px solid #2a2a30;
      color: #e7e7ea;
      padding: 8px 12px;
      border-radius: 10px;
      cursor: pointer;
      font: inherit;
    }
    button:hover {
      background: #131317;
    }
    button[primary] {
      border-color: #3b82f6;
    }
  `;

  static properties = {
    schema: { type: Object },
    values: { type: Object },
    submitLabel: { type: String, attribute: "submit-label" },
    cancelLabel: { type: String, attribute: "cancel-label" },
    showCancel: { type: Boolean, attribute: "show-cancel" },
  };

  constructor() {
    super();
    this.schema = { type: "object", properties: {} };
    this.values = {};
    this.submitLabel = "Continue";
    this.cancelLabel = "Cancel";
    this.showCancel = true;
  }

  #typeSet(def) {
    const t = def?.type;
    if (Array.isArray(t)) return new Set(t);
    if (typeof t === "string") return new Set([t]);
    return new Set();
  }
  #allowsNull(def) {
    return Array.isArray(def?.type) && def.type.includes("null");
  }

  #updateField(key, ev, def) {
    const ts = this.#typeSet(def);
    let val = ev?.target?.value;
    if (ts.has("boolean")) {
      val = !!ev.target.checked;
    } else if (val === "" && this.#allowsNull(def)) {
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
    this.values = { ...(this.values || {}), [key]: val };
    this.dispatchEvent(
      new CustomEvent("change", { detail: { values: this.values } })
    );
  }

  #renderBody(schema, values) {
    const req = new Set(schema?.required || []);
    const props = schema?.properties || {};
    const rows = Object.entries(props).map(([k, def]) => {
      const ts = this.#typeSet(def);
      const v = values?.[k];

      const label = html`<label class="k" for=${k}>
        ${k}${req.has(k) ? " *" : ""}
        ${def?.description
          ? html`<div class="note">${def.description}</div>`
          : null}
      </label>`;

      if (def?.enum) {
        const allowsNull = this.#allowsNull(def);
        return html`${label}
          <div>
            <select
              id=${k}
              .value=${v == null ? "" : String(v)}
              @change=${(e) => this.#updateField(k, e, def)}
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
        return html`<div></div>
          <div>
            <label class="checkbox">
              <input
                type="checkbox"
                .checked=${!!v}
                @change=${(e) =>
                  this.#updateField(
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
          <div>
            <input
              id=${k}
              type="number"
              .value=${v ?? ""}
              @input=${(e) => this.#updateField(k, e, def)}
            />
          </div>`;
      }

      if (ts.has("object") || ts.has("array")) {
        return html`${label}
          <div>
            <textarea
              id=${k}
              .value=${v == null
                ? ""
                : typeof v === "string"
                ? v
                : JSON.stringify(v, null, 2)}
              @input=${(e) => this.#updateField(k, e, def)}
            ></textarea>
          </div>`;
      }

      return html`${label}
        <div>
          <input
            id=${k}
            .value=${v ?? ""}
            @input=${(e) => this.#updateField(k, e, def)}
          />
        </div>`;
    });

    return html`<div class="grid">${rows}</div>`;
  }

  #onSubmit(e) {
    e?.preventDefault?.();
    this.dispatchEvent(
      new CustomEvent("submit", { detail: { values: this.values } })
    );
  }
  #onCancel(e) {
    e?.preventDefault?.();
    this.dispatchEvent(new CustomEvent("cancel"));
  }

  render() {
    const form = this.schema?.type === "object";
    return html`
      <form @submit=${(e) => this.#onSubmit(e)}>
        ${form
          ? this.#renderBody(this.schema, this.values)
          : html`<div>No schema</div>`}
        <div class="footer">
          ${this.showCancel
            ? html`<button type="button" @click=${(e) => this.#onCancel(e)}>
                ${this.cancelLabel}
              </button>`
            : null}
          <button primary type="submit">${this.submitLabel}</button>
        </div>
      </form>
    `;
  }
}

if (!customElements.get("ui-schema-form")) {
  customElements.define("ui-schema-form", UiSchemaForm);
}

export const UiForm = {
  render: (props) => html`<ui-schema-form ...=${props}></ui-schema-form>`,
};
