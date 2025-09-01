import { LitElement, html, css } from "lit";

export class AppLayout extends LitElement {
  static styles = css`
    :host {
      --bg: #0b0b0c;
      --fg: #e7e7ea;
      --panel: #0f0f12;
      --border: #1f1f22;
      --sidecol: #0f0f12;

      --side: 320px; /* fixed left sidebar */
      --main-max: 800px; /* cap for main content */

      display: block;
      color: var(--fg);
      overflow: hidden;
      min-height: 0;
    }

    .layout {
      display: grid;
      /* sidebar | gutter-left | main (capped) | gutter-right */
      grid-template-columns: var(--side) 1fr minmax(0, var(--main-max)) 1fr;
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      background: var(--bg);
      grid-template-rows: minmax(99dvh, auto);
    }

    .sidebar {
      //background: var(--sidecol);
      //border-right: 1px solid var(--border);
      min-width: 0;
      min-height: 100%;
    }
    .gutter-left,
    .gutter-right {
      /* gutters just pad space; keep background same as page */
      background: var(--bg);
      min-width: 0;
      min-height: 0;
    }

    /* Visual rails around the capped main */
    .gutter-left {
      //border-right: 1px solid var(--border);
    }
    .gutter-right {
      //border-left: 1px solid var(--border);
    }

    .main {
      background: var(--bg);
      min-width: 0;
      min-height: 100%;
    }

    .gutter-content {
      position: fixed;
    }

    ::slotted([slot="sidebar"]),
    ::slotted([slot="gutter-left"]),
    ::slotted([slot="gutter-right"]),
    ::slotted([slot="main"]) {
      height: 100%;
      display: block;
      min-height: 0;
    }

    /* --- Responsiveness --- */

    /* If space tight, drop right gutter first (sidebar + gutter-left + capped main) */
    @media (max-width: 1400px) {
      .layout {
        grid-template-columns: var(--side) 1fr minmax(0, var(--main-max));
      }
      .gutter-right {
        display: none;
      }
    }

    /* Tighter: drop both gutters (sidebar + main that can grow) */
    @media (max-width: 1100px) {
      .layout {
        grid-template-columns: var(--side) 1fr;
      }
      .gutter-left {
        display: none;
      }
      /* main no longer capped—use available space */
    }

    /* Mobile: main only */
    @media (max-width: 900px) {
      .layout {
        grid-template-columns: 1fr;
      }
      .sidebar {
        display: none;
      }
    }
  `;

  render() {
    return html`
      <div class="layout">
        <div class="sidebar"><slot name="sidebar"></slot></div>
        <div class="gutter-left">
          <div class="gutter-content"><slot name="gutter-left"></slot></div>
        </div>
        <div class="main"><slot name="main"></slot></div>
        <div class="gutter-right">
          <div class="gutter-content"><slot name="gutter-right"></slot></div>
        </div>
      </div>
    `;
  }
}
customElements.define("app-layout", AppLayout);
