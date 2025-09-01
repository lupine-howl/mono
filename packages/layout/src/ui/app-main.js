import { LitElement, html, css } from "lit";

export class AppMain extends LitElement {
  static styles = css`
    :host {
      display: block;
      min-height: 0;
    }
    .col {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }
    .header {
      flex: 0 0 auto;
      position: fixed;
      z-index: 1;
    }
    .body {
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto; /* only the body scrolls */
      padding-top: 50px;
      padding-bottom: 110px;
    }
    .composer {
      flex: 0 0 auto; /* sticks to bottom */
      background: var(--bg);
      position: fixed;
      bottom: 0;
      width: 800px;
    }

    ::slotted([slot="header"]) {
      display: block;
    }
    ::slotted([slot="body"]) {
      display: block;
      min-height: 0;
    }
    ::slotted([slot="composer"]) {
      display: block;
      background: transparent;
    }
  `;

  render() {
    return html`
      <div class="col">
        <div class="header"><slot name="header"></slot></div>
        <div class="body"><slot name="body"></slot></div>
        <div class="composer"><slot name="composer"></slot></div>
      </div>
    `;
  }
}
customElements.define("app-main", AppMain);
