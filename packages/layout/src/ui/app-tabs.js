// app-tabs.js
import { LitElement, html, css } from "lit";
import { TabController } from "../shared/TabController.js";

export class AppTabs extends LitElement {
  static styles = css`
    :host {
      display: block;
    }
    .tabs {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 0;
    }
    .tab {
      appearance: none;
      border: 1px solid #232327;
      background: #121214;
      color: #cfcfd4;
      font: inherit;
      padding: 6px 10px;
      border-radius: 8px;
      cursor: pointer;
      opacity: 0.9;
    }
    .tab[aria-selected="true"] {
      border-color: #3b3b42;
      background: #16161a;
      opacity: 1;
    }
  `;

  constructor() {
    super();
    this.controller = new TabController(this);
  }

  render() {
    const { items = [], active = "" } = this.controller.get() || {};
    return html`
      <div class="tabs" role="tablist" aria-label="Main content tabs">
        ${items.map(
          (t) => html`
            <button
              class="tab"
              role="tab"
              aria-selected=${String(active === t.id)}
              @click=${() => {
                this.controller.setActive(t.id);
              }}
            >
              ${t.label}
            </button>
          `
        )}
      </div>
    `;
  }
}

if (!customElements.get("app-tabs")) customElements.define("app-tabs", AppTabs);
