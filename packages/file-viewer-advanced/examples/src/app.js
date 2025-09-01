import { LitElement, html, css } from "lit";
import "@loki/layout/ui/app-tabs.js";
import "@loki/layout/ui/app-layout.js";
import "@loki/layout/ui/app-sidebar.js";
import "@loki/layout/ui/app-main.js";
import "@loki/layout/ui/app-content.js";

import "@loki/file-browser/ui/file-browser.js";
import "@loki/file-browser/ui/file-viewer.js";
import "@loki/file-browser/ui/file-bundle-viewer.js";

export class App extends LitElement {
  static styles = css`
    :host {
      display: block;
      height: 100vh;
      overflow: hidden;
    }
  `;

  static properties = {
    workspace: { state: true },
    _selPath: { state: true },
    _selType: { state: true },
    _activeTab: { state: true },
  };

  constructor() {
    super();
    this.workspace = "";
    this._selPath = null;
    this._selType = null;
    this._activeTab = "viewer";
  }

  render() {
    return html`
      <app-layout
        style="
          --bg:#0b0b0c; --fg:#e7e7ea; --panel:#0f0f12; --border:#1f1f22;
        "
        @workspace-change=${this.onWorkspaceChange}
        @selection-change=${this.onSelectionChange}
        @cwd-change=${this.onCwdChange}
      >
        <app-sidebar slot="sidebar">
          <file-browser></file-browser>
        </app-sidebar>

        <app-main slot="main">
          <app-tabs
            slot="header"
            .items=${[
              { id: "viewer", label: "📄 File Viewer" },
              { id: "bundle", label: "📦 Bundle Viewer" },
            ]}
            .active=${this._activeTab}
            @tab-change=${(e) => (this._activeTab = e.detail.id)}
          ></app-tabs>

          <app-content slot="body">
            ${this._activeTab === "viewer"
              ? html`
                  <file-viewer
                    .ws=${this.workspace}
                    .path=${this._selPath}
                  ></file-viewer>
                `
              : html`
                  <file-bundle-viewer
                    .ws=${this.workspace}
                    .path=${this._selPath}
                    .type=${this._selType}
                  ></file-bundle-viewer>
                `}
          </app-content>
        </app-main>
      </app-layout>
    `;
  }

  onWorkspaceChange = (e) => {
    const { id } = e.detail ?? {};
    if (id !== undefined) {
      this.workspace = id;
      this._selPath = null;
      this._selType = null;
    }
  };

  onSelectionChange = (e) => {
    const { path, type } = e.detail ?? {};
    this._selPath = path || null;
    this._selType = type || null;
  };

  onCwdChange = () => {
    this._selPath = null;
    this._selType = null;
  };
}

customElements.define("app-root", App);
