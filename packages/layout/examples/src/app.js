import { LitElement, html, css } from "lit";

// layout + UI
import "@loki/layout/ui/app-layout.js";
import "@loki/layout/ui/app-sidebar.js";
import "@loki/layout/ui/app-main.js";
import "@loki/layout/ui/app-content.js";
import "@loki/layout/ui/app-tabs.js";
import "@loki/layout/ui/smart-select.js";
import "@loki/layout/ui/shimmer-effect.js";

class DemoApp extends LitElement {
  static styles = css`
    :host {
      display: block;
      height: 100vh;
    }
    .pill {
      display: inline-block;
      padding: 2px 8px;
      border: 1px solid #2a2a30;
      border-radius: 999px;
      font-size: 12px;
      opacity: 0.85;
    }
    .card {
      border: 1px solid #1f1f22;
      border-radius: 10px;
      padding: 12px;
      background: #0f0f12;
    }
    .grid {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      align-content: start;
    }
  `;

  static properties = {
    activeTab: { state: true }, // "viewer" | "bundle"
  };

  constructor() {
    super();
    this.activeTab = "viewer";
  }

  get items() {
    return [
      {
        id: "viewer",
        label: "📄 Viewer",
        render: () => html`
          <section class="grid">
            ${["alpha.js", "beta.js", "gamma.json", "delta.md"].map(
              (name) => html`
                <div class="card">
                  <div style="font-weight:600">${name}</div>
                  <div style="opacity:.8; font-size:12px;">
                    Click to open. Preview only.
                  </div>
                </div>
              `
            )}
            <shimmer-effect mode="text" angle="90" announce
              >Thinking…</shimmer-effect
            >
            <shimmer-effect
              mode="block"
              style="width:220px; height:14px;"
            ></shimmer-effect>
            <shimmer-effect
              mode="block"
              style="width:220px; height:14px;"
            ></shimmer-effect>
            <shimmer-effect
              mode="text"
              style="--shimmer-base: rgba(0,255,34,1); --shimmer-peak: rgba(4,0,255,1);"
            >
              Loading…
            </shimmer-effect>
          </section>
        `,
      },
      {
        id: "bundle",
        label: "📦 Bundle",
        render: () => html`
          <section class="card">
            <h3 style="margin-top:0;">Bundle Summary</h3>
            <ul style="margin:0; padding-left:18px; line-height:1.6;">
              <li>Entrypoint: <code>src/index.js</code></li>
              <li>Chunks: 5</li>
              <li>Total size: 42 KB</li>
              <li>Splitting: enabled</li>
            </ul>
          </section>
        `,
      },
    ];
  }

  #onTabChange = (e) => {
    this.activeTab = e.detail.id;
  };

  render() {
    const items = this.items;
    const active = items.find((i) => i.id === this.activeTab) ?? items[0];

    return html`
      <app-layout
        style="--bg:#0b0b0c; --fg:#e7e7ea; --panel:#0f0f12; --border:#1f1f22;"
      >
        <app-sidebar slot="sidebar">
          <h3 style="margin:0 0 6px 0;">Demo Sidebar</h3>
          <div class="pill">Themed</div>
          <div class="pill">Reusable</div>
          <hr
            style="border:none;border-top:1px solid var(--border, #2a2a30);margin:10px 0;"
          />
          <div class="card">
            <strong>Filters</strong>
            <div style="margin-top:8px; display:grid; gap:6px;">
              <label>Search <input placeholder="Type to filter…" /></label>
              <label
                >Type
                <smart-select>
                  <option>All</option>
                  <option>Files</option>
                  <option>Dirs</option>
                </smart-select>
              </label>
              <label
                >Type
                <smart-select mode="button">
                  <option>All</option>
                  <option>Files</option>
                  <option>Dirs</option>
                </smart-select>
              </label>
            </div>
          </div>
        </app-sidebar>

        <app-main slot="main">
          <app-tabs
            slot="header"
            .items=${items.map(({ id, label }) => ({ id, label }))}
            .active=${this.activeTab}
            @tab-change=${this.#onTabChange}
          ></app-tabs>

          <app-content slot="body">
            ${active?.render
              ? active.render()
              : html`<div style="opacity:.7">No tabs to display.</div>`}
          </app-content>
        </app-main>
      </app-layout>
    `;
  }
}
customElements.define("demo-app", DemoApp);
