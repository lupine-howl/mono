import { LitElement, html, css } from "lit";

export class AppContent extends LitElement {
  static styles = css`
    :host {
      display: block;
      min-height: 0;
    }
    .content {
      min-height: 0;
      overflow: hidden;
      display: grid;
    }
    ::slotted(*) {
      min-height: 0;
    }
  `;
  render() {
    return html`<div class="content"><slot></slot></div>`;
  }
}
customElements.define("app-content", AppContent);
