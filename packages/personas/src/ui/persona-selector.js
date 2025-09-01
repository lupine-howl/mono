// src/ui/persona-selector.js
import { LitElement, html, css } from "lit";

export class PersonaSelector extends LitElement {
  static styles = css`
    :host {
      display: block;
    }
    select {
      width: 100%;
      padding: 8px 10px;
      border-radius: 10px;
      border: 1px solid #2a2a30;
      background: #0b0b0c;
      color: inherit;
      font: inherit;
    }
  `;

  static properties = {
    controller: { attribute: false }, // don't reflect; it's an object
    _items: { state: true },
    _selectedId: { state: true },
  };

  constructor() {
    super();
    this.controller = null;
    this._items = [];
    this._selectedId = null;

    this._eventName = "personas:change"; // default; will prefer controller.eventName if present
    this._onChangeEvt = (e) => {
      const { items, selectedId } = e.detail ?? {};
      if (!items) return;
      this._items = items;
      this._selectedId = selectedId ?? null;
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

  // If the host swaps in a different controller, rewire listeners.
  updated(changed) {
    if (changed.has("controller")) {
      this.#detach(changed.get("controller"));
      this.#attach();
    }
  }

  async #attach() {
    if (!this.controller) return;
    this._eventName = this.controller.eventName || this._eventName;
    this.controller.addEventListener(this._eventName, this._onChangeEvt);

    // initial state (works whether sync has finished or not)
    if (Array.isArray(this.controller.items) && this.controller.items.length) {
      this._items = this.controller.items;
      this._selectedId = this.controller.selectedId ?? null;
    } else if (this.controller.ready) {
      try {
        await this.controller.ready();
        this._items = this.controller.items ?? [];
        this._selectedId = this.controller.selectedId ?? null;
      } catch {
        /* ignore */
      }
    }
  }

  #detach(oldController = this.controller) {
    if (oldController) {
      const name = oldController.eventName || this._eventName;
      oldController.removeEventListener(name, this._onChangeEvt);
    }
  }

  render() {
    return html`
      <select
        .value=${this._selectedId ?? ""}
        @change=${(e) => this.controller?.select?.(e.target.value)}
      >
        ${this._items.map(
          (p) => html`<option value=${p.id}>${p.name}</option>`
        )}
      </select>
    `;
  }
}

if (!customElements.get("persona-selector")) {
  customElements.define("persona-selector", PersonaSelector);
}
