// ui/base-pluggable-app.js
import { LitElement, html, css } from "lit";
import "./app-layout.js";
import "./app-sidebar.js";
import "./app-main.js";
import "./app-content.js";
import "./app-tabs.js";
import { TabController } from "../shared/TabController.js";

/** Merge any number of {region: UIItem[]} packs, de-dupe by id, sort by order. */
function mergeComponents(...packs) {
  const out = Object.create(null);
  for (const pack of packs) {
    if (!pack) continue;
    for (const [region, list] of Object.entries(pack)) {
      const m = out[region]
        ? new Map(out[region].map((x) => [x.id, x]))
        : new Map();
      (list || []).forEach((it) => m.set(it.id, it)); // last wins
      out[region] = [...m.values()].sort(
        (a, b) => (a.order ?? 0) - (b.order ?? 0)
      );
    }
  }
  return { body: out.body ?? [], sidebar: out.sidebar ?? [], ...out };
}
const toTabs = (arr) => arr.map(({ id, label }) => ({ id, label }));

export class BasePluggableApp extends LitElement {
  static properties = {
    _activeTab: { state: true },
    ui: { state: true },
    storageKey: { type: String, attribute: "storage-key" },
  };

  static styles = css`
    :host {
      display: block;
      height: 100%;
    }
    .card {
      border: 1px solid var(--border, #1f1f22);
      border-radius: 12px;
      padding: 12px;
      background: var(--panel, #0f0f12);
    }
    .sidebar-section {
      padding: 9px;
      display: grid;
      gap: 12px;
    }
    h3 {
      margin: 0 0 8px 0;
      font-weight: 600;
    }
  `;

  constructor() {
    super();
    this.plugins = []; // [{ controllers, components, ready, dispose }]
    this.ui = { body: [], sidebar: [] };
    this.storageKey = "tabs.active";

    this.tabController = new TabController(this);

    // let subclass provide plugins (sync version; make async if needed)
    this.plugins = this.getPlugins?.() ?? [];

    // merge components
    this.ui = mergeComponents(...this.plugins);

    // initial tab
    this._activeTab =
      this.tabController.get().active || this.ui.body[0]?.id || "";
    this.tabController.setTabs(toTabs(this.ui.body));
  }

  // SUBCLASS: return an array of plugins
  getPlugins() {
    return [];
  }

  renderSidebar() {
    return html`
      <div class="sidebar-section">
        ${this.ui.sidebar.map(
          ({ label, render }) => html`
            <div class="card">
              <h3>${label}</h3>
              ${render({ controllers: this.controllers })}
            </div>
          `
        )}
      </div>
    `;
  }

  renderBody() {
    const activeTab = this.tabController.get().active;
    const body =
      this.ui.body.find((i) => i.id === activeTab) ?? this.ui.body[0];

    return html`
      <app-tabs slot="header"></app-tabs>
      <app-content slot="body">
        <div class="card">
          <h3>${body?.label ?? ""}</h3>
          ${body?.render
            ? body.render()
            : html`<div style="opacity:.7">No content.</div>`}
        </div>
      </app-content>
      <div slot="composer">${this.ui?.composer?.map((i) => i.render())}</div>
    `;
  }

  render() {
    return html`
      <app-layout>
        <app-sidebar slot="sidebar">${this.renderSidebar()}</app-sidebar>
        <div slot="gutter-left">
          <div style="padding: 9px;">
            ${this.ui?.gutterLeft?.map((i) => i.render())}
          </div>
        </div>
        <app-main slot="main">${this.renderBody()}</app-main>
        <div slot="gutter-right">
          <div style="padding: 9px;">
            ${this.ui?.gutterRight?.map((i) =>
              i.render({ controllers: this.controllers })
            )}
          </div>
        </div>
      </app-layout>
    `;
  }
}
customElements.define("base-pluggable-app", BasePluggableApp);
