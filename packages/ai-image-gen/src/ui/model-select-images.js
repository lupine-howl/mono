// src/ui/model-select.js
import { LitElement, html, css } from "lit";
import { AIChatController } from "@loki/ai-chat/util";
import "@loki/layout/ui/smart-select.js";

export class ModelSelect extends LitElement {
  static styles = css`
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
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
    // Optional external override; if provided, it wins over service model
    value: { type: String },
    // Where to fetch models from
    modelsEndpoint: { type: String },

    // internal mirrors
    _models: { state: true },
    _loading: { state: true },
    _error: { state: true },
    _stateModel: { state: true },
  };

  constructor() {
    super();
    // self-instantiate controller (singleton-backed)
    this.controller = new AIChatController();

    // inputs
    this.value = "";
    this.modelsEndpoint = "/api/models";

    // state
    this._models = [];
    this._loading = false;
    this._error = null;
    this._stateModel = this.controller.get()?.model || "";

    // react to service changes
    this.controller.subscribe((st, patch) => {
      if ("model" in patch) {
        this._stateModel = st.model || "";
        this.requestUpdate();
      }
    });
  }

  connectedCallback() {
    super.connectedCallback();
    this.refresh();
  }

  render() {
    const has = this._models.length > 0;
    const selected =
      this.value || this._stateModel || (has ? this._models[0] : "");

    return html`
      ${has
        ? html`
            <smart-select
              .value=${selected}
              @change=${(e) => this._applySelection(e.target.value)}
              ?disabled=${this._loading}
            >
              ${this._models.map((m) => html`<option value=${m}>${m}</option>`)}
            </smart-select>
          `
        : html`
            ${this._loading
              ? html`<span class="hint">Loading…</span>`
              : this._error
              ? html`<span class="hint" title=${this._error}>Error</span>
                  <button class="btn" @click=${this.refresh}>Retry</button>`
              : html`<button class="btn" @click=${this.refresh}>
                  Refresh
                </button>`}
          `}
    `;
  }

  async refresh() {
    this._loading = true;
    this._error = null;
    try {
      const r = await fetch(this.modelsEndpoint);
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const j = await r.json();
      this._models = Array.isArray(j?.models) ? j.models : [];

      // If neither external value nor state.model is set, seed to first option
      if (!this.value && !this._stateModel && this._models.length) {
        this._applySelection(this._models[0], /*emit*/ true);
      }
    } catch (e) {
      this._error = e?.message || String(e);
      this._models = [];
    } finally {
      this._loading = false;
    }
  }

  _applySelection(val, emit = true) {
    this.value = val;

    // 1) Update global chat state so chat uses this model
    this.controller.setModel(val);

    // 2) Let host UIs (e.g., project-viewer) persist to Project DB
    if (emit) {
      this.dispatchEvent(
        new CustomEvent("model-change", {
          detail: { value: val },
          bubbles: true,
          composed: true,
        })
      );
    }
  }
}

if (!customElements.get("model-select")) {
  customElements.define("model-select", ModelSelect);
}
