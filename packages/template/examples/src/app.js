import { LitElement, html, css } from "lit";

// import your components (adjust paths to where you put them)
import "@loki/layout/ui/app-layout.js";
import "@loki/layout/ui/app-sidebar.js";
import "@loki/layout/ui/app-main.js";
import "@loki/layout/ui/app-content.js";
import "@loki/layout/ui/app-tabs.js";

class DemoApp extends LitElement {
  static styles = css`
    :host {
      display: block;
      height: 100vh;
    }
  `;

  static properties = {
    activeTab: { state: true }, // "viewer" | "bundle"
  };

  constructor() {
    super();
    this.activeTab = "viewer";
  }

  render() {
    return html`
      <app-layout
        style="--bg:#0b0b0c; --fg:#e7e7ea; --panel:#0f0f12; --border:#1f1f22;"
        @tab-change=${(e) => (this.activeTab = e.detail.id)}
      >
        <app-sidebar slot="sidebar"> </app-sidebar>

        <app-main slot="main">
          <app-tabs
            slot="header"
            .items=${[
              { id: "tab-1", label: "📄 Tab 1" },
              { id: "tab-2", label: "📦 Tab 2" },
            ]}
            .active=${this.activeTab}
          ></app-tabs>

          <app-content slot="body">
            ${this.activeTab === "viewer"
              ? html`
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
                  </section>
                `
              : html`
                  <section class="card">
                    <h3 style="margin-top:0;">Bundle Summary</h3>
                    <ul style="margin:0; padding-left:18px; line-height:1.6;">
                      <li>Entrypoint: <code>src/index.js</code></li>
                      <li>Chunks: 5</li>
                      <li>Total size: 42 KB</li>
                      <li>Splitting: enabled</li>
                    </ul>
                  </section>
                `}
          </app-content>
        </app-main>
      </app-layout>
    `;
  }
}
customElements.define("demo-app", DemoApp);
