// ui/base-pluggable-app.js
import { LitElement, html, css } from "lit";
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
  // Ensure all known regions exist so the layout always renders
  return {
    body: out.body ?? [],
    sidebar: out.sidebar ?? [],
    composer: out.composer ?? [],
    gutterLeft: out.gutterLeft ?? [],
    gutterRight: out.gutterRight ?? [],
    ...out,
  };
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
      /* Theme */
      --bg: #0b0b0c;
      --fg: #e7e7ea;
      --panel: #0f0f12;
      --border: #1f1f22;

      --side: 300px; /* left sidebar width */
      --main-max: 900px; /* main content cap */
      --tabs-h: 48px; /* sticky tabs height (keep in sync with .tabs) */

      display: block;
      color: var(--fg);
      background: var(--bg);
    }

    /* 4-column grid: sidebar | gutter-left | main (capped) | gutter-right */
    .layout {
      display: grid;
      grid-template-columns: var(--side) 1fr minmax(0, var(--main-max)) 1fr;
      gap: 0;
      align-items: start;
    }

    /* Sidebar: sticky, own scroll */
    .sidebar {
      position: sticky;
      top: 0;
      align-self: start;
      height: 100vh;
      overflow: auto;
      background: var(--panel);
      border-right: 1px solid var(--border);
    }
    .sidebar-wrap {
      display: grid;
      grid-auto-rows: max-content;
      align-content: start;
      gap: 12px;
      padding: 12px;
    }
    .sidebar-section {
      display: grid;
      gap: 12px;
    }
    .card {
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 12px;
      background: #101014;
    }
    .sidebar label {
      font-size: 12px;
      opacity: 0.8;
    }
    .sidebar .hint {
      font-size: 12px;
      opacity: 0.7;
    }
    .sidebar input,
    .sidebar select,
    .sidebar .textish {
      padding: 8px 10px;
      border-radius: 10px;
      border: 1px solid var(--border);
      background: #18181b;
      color: inherit;
      font: inherit;
      width: 100%;
      box-sizing: border-box;
      min-width: 0;
    }

    /* Gutters: contain optional components; stick below tabs for nice UX */
    .gutter {
      padding: 8px 10px;
    }
    .gutter-inner {
      position: sticky;
      top: var(--tabs-h);
      display: grid;
      gap: 10px;
    }
    .gutter .card {
      background: #0f0f12;
    }

    /* Main column */
    .main {
      min-width: 0;
      background: var(--bg);
    }
    .main-inner {
      max-width: var(--main-max);
      margin: 0 auto;
      padding: 0 12px 96px; /* bottom pad so content isn't hidden by composer */
    }

    /* Tabs: sticky at top of main column */
    .tabs {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      align-items: center;
      gap: 6px;
      height: var(--tabs-h);
      padding: 8px 0; /* contributes to --tabs-h */
      background: var(--bg);
      border-bottom: 1px solid var(--border);
      backdrop-filter: blur(4px);
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
      opacity: 0.95;
      white-space: nowrap;
    }
    .tab[aria-selected="true"] {
      border-color: #3b3b42;
      background: #16161a;
      opacity: 1;
    }
    .tabs-empty {
      font-size: 12px;
      opacity: 0.7;
      padding-left: 2px;
    }

    /* Body content */
    .content {
      display: grid;
      gap: 12px;
      padding-top: 10px;
      min-height: 40vh;
    }
    h3 {
      margin: 6px 0 0 0;
      font-weight: 600;
    }

    /* Composer: fixed to viewport bottom, offset by sidebar on wide screens */
    .composer {
      position: fixed;
      left: var(--side);
      right: 0;
      bottom: 0;
      z-index: 9;
      background: linear-gradient(
        to top,
        rgba(0, 0, 0, 0.45),
        rgba(0, 0, 0, 0)
      );
      padding: 8px 12px;
      pointer-events: none; /* container doesn't eat clicks */
    }
    .composer > .composer-inner {
      pointer-events: auto; /* actual UI inside is interactive */
      max-width: var(--main-max);
      margin: 0 auto;
    }

    /* Responsiveness */
    @media (max-width: 1400px) {
      .layout {
        grid-template-columns: var(--side) 1fr minmax(0, var(--main-max));
      }
      .gutter-right {
        display: none;
      }
    }
    @media (max-width: 1100px) {
      .layout {
        grid-template-columns: var(--side) minmax(0, 1fr);
      }
      .gutter-left {
        display: none;
      }
    }
    @media (max-width: 900px) {
      .layout {
        grid-template-columns: 1fr;
      }
      .sidebar {
        display: none;
      }
      .composer {
        left: 0;
      }
    }
  `;

  constructor() {
    super();
    this.plugins = []; // [{ controllers, components, ready, dispose }]
    this.ui = {
      body: [],
      sidebar: [],
      composer: [],
      gutterLeft: [],
      gutterRight: [],
    };
    this.storageKey = "tabs.active";

    this.tabController = new TabController(this);

    // let subclass provide plugins (sync version; make async if needed)
    this.plugins = this.getPlugins?.() ?? [];

    // merge components
    this.ui = mergeComponents(...this.plugins);
    console.log(this.ui);
    const tabs = toTabs(this.ui.body);
    console.log(tabs);

    // initial tab + tab list
    this._activeTab =
      this.tabController.get().active || this.ui.body[0]?.id || "";
    this.tabController.setTabs(toTabs(this.ui.body));
  }

  // SUBCLASS: return an array of plugins
  getPlugins() {
    return [];
  }

  render() {
    const { items = [], active = "" } = this.tabController.get() || {};
    const body = this.ui.body.find((i) => i.id === active) ?? this.ui.body[0];

    return html`
      <div class="layout">
        <!-- Sticky LEFT SIDEBAR -->
        <aside class="sidebar">
          <div class="sidebar-wrap">
            <div class="sidebar-section">
              ${this.ui.sidebar.map(
                ({ label, render, wrapperStyle }) => html`
                  <div class=${wrapperStyle || "card"}>
                    <h3>${label}</h3>
                    ${render?.({ controllers: this.controllers }) ??
                    html`<div style="opacity:.7">No content.</div>`}
                  </div>
                `
              )}
            </div>
          </div>
        </aside>

        <!-- LEFT GUTTER -->
        <div class="gutter gutter-left">
          <div class="gutter-inner">
            ${this.ui.gutterLeft?.map(
              (i) =>
                i.render?.({ controllers: this.controllers }) ?? i.render?.()
            )}
          </div>
        </div>

        <!-- MAIN COLUMN -->
        <main class="main">
          <div class="main-inner">
            <!-- Sticky TABS -->
            <div class="tabs" role="tablist" aria-label="Main content tabs">
              ${items?.length
                ? items.map(
                    (t) => html`
                      <button
                        class="tab"
                        role="tab"
                        aria-selected=${String(active === t.id)}
                        @click=${() => this.tabController.setActive(t.id)}
                      >
                        ${t.label}
                      </button>
                    `
                  )
                : html`<span class="tabs-empty">No tabs configured.</span>`}
            </div>

            <!-- BODY -->
            <section class="content ${body?.wrapperStyle || ""}">
              ${body?.label ? html`<h3>${body.label}</h3>` : ""}
              ${body?.render
                ? body.render({ controllers: this.controllers })
                : html`<div style="opacity:.7">No content.</div>`}
            </section>
          </div>
        </main>

        <!-- RIGHT GUTTER -->
        <div class="gutter gutter-right">
          <div class="gutter-inner">
            ${this.ui.gutterRight?.map(
              (i) =>
                i.render?.({ controllers: this.controllers }) ?? i.render?.()
            )}
          </div>
        </div>
      </div>

      <!-- Fixed COMPOSER (optional) -->
      ${this.ui?.composer?.length
        ? html`
            <div class="composer">
              <div class="composer-inner">
                ${this.ui.composer.map(
                  (i) =>
                    i.render?.({ controllers: this.controllers }) ??
                    i.render?.()
                )}
              </div>
            </div>
          `
        : html``}
    `;
  }
}

customElements.define("base-pluggable-app", BasePluggableApp);
