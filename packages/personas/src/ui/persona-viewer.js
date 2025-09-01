// src/ui/persona-viewer.js
import { LitElement, html, css } from "lit";

export class PersonaViewer extends LitElement {
  static styles = css`
    :host {
      display: block;
    }
    .tabs {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
    }
    .tab {
      padding: 6px 10px;
      border: 1px solid #2a2a30;
      border-radius: 999px;
      background: #111214;
      cursor: pointer;
    }
    .tab.active {
      outline: 2px solid #3b82f6;
    }
    .form {
      display: grid;
      gap: 10px;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
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
      min-height: 160px;
      grid-column: 1 / -1;
    }
    .hint {
      font-size: 12px;
      opacity: 0.7;
    }
  `;

  static properties = {
    controller: { attribute: false }, // object-only; don't reflect
    _tab: { state: true },
    _item: { state: true },
  };

  constructor() {
    super();
    this.controller = null;
    this._tab = "Details";
    this._item = null;

    this._eventName = "personas:change";
    this._onChangeEvt = (e) => {
      // use controller.selected so we always reflect current PK/selection logic
      this._item = this.controller?.selected ?? null;
      this.requestUpdate();
    };
  }

  connectedCallback() {
    super.connectedCallback();
    this.#attach();
  }
  disconnectedCallback() {
    this.#detach();
    super.disconnectedCallback();
  }

  updated(changed) {
    if (changed.has("controller")) {
      this.#detach(changed.get("controller"));
      this.#attach();
    }
  }

  #attach() {
    if (!this.controller) return;
    // prefer controller’s configured event name
    this._eventName = this.controller.eventName || this._eventName;
    this.controller.addEventListener(this._eventName, this._onChangeEvt);

    // initial state (before/after ready)
    this._item = this.controller.selected ?? null;
    if (!this._item && typeof this.controller.ready === "function") {
      // populate once data arrives
      this.controller
        .ready()
        .then(() => {
          this._item = this.controller.selected ?? null;
          this.requestUpdate();
        })
        .catch(() => {});
    }
  }

  #detach(oldController = this.controller) {
    if (oldController) {
      const name = oldController.eventName || this._eventName;
      oldController.removeEventListener(name, this._onChangeEvt);
    }
  }

  _patch(patch) {
    if (!this._item || !this.controller?.update) return;
    const pk = this.controller.primaryKey || "id";
    const id = this._item[pk];
    if (id) this.controller.update(id, patch);
  }

  render() {
    if (!this._item) return html`<div class="hint">Select a persona…</div>`;

    return html`
      <div class="tabs">
        ${["Details", "Preview"].map(
          (tab) => html`
            <div
              class="tab ${this._tab === tab ? "active" : ""}"
              @click=${() => (this._tab = tab)}
            >
              ${tab}
            </div>
          `
        )}
      </div>

      ${this._tab === "Details"
        ? html`
            <div class="form">
              <label>
                Name
                <input
                  .value=${this._item.name ?? ""}
                  @input=${(e) => this._patch({ name: e.target.value })}
                />
              </label>

              <label>
                Default model
                <input
                  .value=${this._item.model ?? ""}
                  @input=${(e) => this._patch({ model: e.target.value })}
                />
              </label>

              <label style="grid-column:1 / -1">
                Description
                <textarea
                  .value=${this._item.description ?? ""}
                  @input=${(e) => this._patch({ description: e.target.value })}
                ></textarea>
              </label>

              <label style="grid-column:1 / -1">
                Persona (system prompt)
                <textarea
                  .value=${this._item.persona ?? ""}
                  @input=${(e) => this._patch({ persona: e.target.value })}
                ></textarea>
              </label>
            </div>
          `
        : html`
            <div class="hint">
              <strong>Preview:</strong>
              <div style="white-space:pre-wrap; padding-top:8px;">
                ${this._item.persona ?? ""}
              </div>
            </div>
          `}
    `;
  }
}

if (!customElements.get("persona-viewer")) {
  customElements.define("persona-viewer", PersonaViewer);
}
