// src/ui/persona-list.js
import { LitElement, html, css } from "lit";

export class PersonaList extends LitElement {
  static styles = css`
    :host {
      display: block;
    }
    .bar {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-bottom: 8px;
    }
    input,
    button {
      padding: 8px 10px;
      border-radius: 10px;
      border: 1px solid #2a2a30;
      background: #0b0b0c;
      color: inherit;
      font: inherit;
    }
    button {
      cursor: pointer;
      background: #1b1b1f;
    }
    ul {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      gap: 6px;
    }
    li {
      display: flex;
      gap: 8px;
      align-items: center;
      padding: 8px;
      border: 1px solid #1f1f22;
      border-radius: 10px;
      background: #0f0f12;
      cursor: pointer;
    }
    li.active {
      outline: 2px solid #3b82f6;
    }
    .title {
      flex: 1 1 auto;
    }
  `;

  static properties = {
    controller: { attribute: false }, // object prop; don't reflect
    _draftName: { state: true },
    _items: { state: true },
    _selectedId: { state: true },
  };

  constructor() {
    super();
    this.controller = null;
    this._draftName = "";
    this._items = [];
    this._selectedId = null;

    this._eventName = "personas:change";
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

    // initial populate (works before/after ready)
    if (Array.isArray(this.controller.items) && this.controller.items.length) {
      this._items = this.controller.items;
      this._selectedId = this.controller.selectedId ?? null;
    } else if (typeof this.controller.ready === "function") {
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

  _add() {
    const name = (this._draftName || "").trim();
    if (!name) return;
    this.controller?.add({ name });
    this._draftName = "";
  }

  render() {
    const pk = this.controller?.primaryKey || "id";

    return html`
      <div class="bar">
        <input
          placeholder="New persona name…"
          .value=${this._draftName}
          @input=${(e) => (this._draftName = e.target.value)}
          @keydown=${(e) => {
            if (e.key === "Enter") this._add();
          }}
        />
        <button
          @click=${this._add}
          ?disabled=${!(this._draftName || "").trim()}
        >
          Add
        </button>
      </div>

      <ul>
        ${this._items.map((t) => {
          const id = t?.[pk];
          const active = id === this._selectedId;
          return html`
            <li
              class=${active ? "active" : ""}
              @click=${() => this.controller?.select(id)}
            >
              <div class="title">${t?.name ?? "(unnamed)"}</div>
              <button
                @click=${(e) => {
                  e.stopPropagation();
                  this.controller?.remove(id);
                }}
                title="Remove"
              >
                ✕
              </button>
            </li>
          `;
        })}
      </ul>
    `;
  }
}

if (!customElements.get("persona-list")) {
  customElements.define("persona-list", PersonaList);
}
