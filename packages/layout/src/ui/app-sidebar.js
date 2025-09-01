import { LitElement, html, css } from "lit";

export class AppSidebar extends LitElement {
  static styles = css`
    :host {
      position: fixed;
      inset: 0 auto 0 0; /* left edge, full height */
      width: var(--side, 280px); /* MUST match your layout column */
      box-sizing: border-box;
      overflow: hidden; /* contain horizontal overflow */
    }
    .wrap {
      display: grid;
      grid-auto-rows: max-content;
      align-content: start;
      gap: 12px;
      height: 100%;
      overflow: auto;
    }
    ::slotted(.field) {
      display: grid;
      gap: 6px;
    }
    ::slotted(label) {
      font-size: 12px;
      opacity: 0.8;
    }
    ::slotted(input),
    ::slotted(select),
    ::slotted(.textish) {
      padding: 8px 10px;
      border-radius: 10px;
      border: 1px solid var(--border, #2a2a30);
      background: var(--bg, #181818);
      color: inherit;
      font: inherit;
      width: 100%;
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
    }
    ::slotted(.hint) {
      font-size: 12px;
      opacity: 0.7;
    }
  `;
  render() {
    return html`<div class="wrap"><slot></slot></div>`;
  }
}
customElements.define("app-sidebar", AppSidebar);
