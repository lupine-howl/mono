// ui/github-pluggable-app.js
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
  return {
    body: out.body ?? [],
    sidebar: out.sidebar ?? [],
    composer: out.composer ?? [],
    ...out,
  };
}
const toTabs = (arr) => arr.map(({ id, label }) => ({ id, label }));

export class GithubPluggableApp extends LitElement {
  static properties = {
    ui: { state: true },
    _drawerOpen: { state: true },
    storageKey: { type: String, attribute: "storage-key" },
    title: { type: String }, // branding text (row 1)
  };

  static styles = css`
    :host {
      /* Theme */
      --bg: #0b0b0c;
      --fg: #e7e7ea;
      --panel: #0f0f12;
      --border: #1f1f22;

      --appbar-h1: 48px; /* branding row height */
      --appbar-h2: 44px; /* tabs row height */
      --sec-side: 300px; /* secondary (inline) sidebar width */
      --main-max: 1200px; /* optional cap for inner content */

      display: block;
      color: var(--fg);
      background: var(--bg);
      height: 100%;
      min-height: 100vh;
    }

    /* ===== App Bar (two rows) ===== */
    .appbar {
      z-index: 40;
      background: var(--bg);
      border-bottom: 1px solid var(--border);
    }
    .brand-row {
      height: var(--appbar-h1);
      display: grid;
      grid-template-columns: 1fr max-content;
      align-items: center;
      padding: 0 14px;
      gap: 10px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 600;
      letter-spacing: 0.2px;
    }
    .brand .dot {
      width: 18px;
      height: 18px;
      border-radius: 4px;
      background: #8247ff;
      box-shadow: 0 0 0 2px #3a2a66 inset;
    }
    .app-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .icon-btn {
      appearance: none;
      border: 1px solid #232327;
      background: #151518;
      color: #cfcfd4;
      padding: 6px 10px;
      border-radius: 8px;
      cursor: pointer;
    }

    .tabs-row {
      display: flex;
      align-items: center;
      gap: 6px;
      border-bottom: 1px solid var(--border);
      position: sticky; /* sticks under brand row if it scrolls */
      top: var(--appbar-h1);
      background: var(--bg);
      z-index: 41;
      padding-bottom: 0;
      padding-left: 6px;
    }
    .tab {
      appearance: none;
      border: none;
      background: transparent;
      color: #cfcfd4;
      font: 0.9rem system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
        Roboto, "Helvetica Neue", Arial, sans-serif;
      border: 1px solid transparent;
      padding: 12px;
      cursor: pointer;
      opacity: 0.95;
      white-space: nowrap;
      padding-top: 0;
    }
    .tab[aria-selected="true"] {
      border-bottom: 2px solid #8247ff;
      font-weight: 600;
      color: #fff;
      opacity: 1;
    }
    .tabs-empty {
      font-size: 12px;
      opacity: 0.7;
      padding-left: 2px;
    }

    /* ===== Workspace ===== */
    .workspace {
      display: grid;
      grid-template-columns: var(--sec-side) minmax(0, 1fr);
      min-height: calc(100vh - var(--appbar-h1) - var(--appbar-h2));
    }
    .sec-sidebar {
      border-right: 1px solid var(--border);
      background: var(--panel);
      min-width: 0;
    }
    .sec-sidebar .placeholder {
      opacity: 0.5;
      font-size: 12px;
      padding: 10px;
    }

    .main {
      min-width: 0;
    }
    .main-inner {
      max-width: var(--main-max);
      margin: 0 auto;
      display: grid;
      gap: 12px;
    }
    .content {
      display: grid;
      gap: 12px;
      min-height: 40vh;
      padding: 16px;
    }
    h3 {
      margin: 0;
      font-weight: 600;
    }

    /* ===== Primary sidebar as off-canvas drawer ===== */
    .drawer-root {
      position: fixed;
      inset: 0;
      display: grid;
      grid-template-columns: 300px 1fr; /* drawer + scrim */
      z-index: 100;
      pointer-events: none; /* enable only when open */
    }
    .drawer-root.open {
      pointer-events: auto;
    }

    .drawer {
      background: var(--panel);
      border-right: 1px solid var(--border);
      height: 100%;
      overflow: auto;
      transform: translateX(-100%);
      transition: transform 180ms ease;
      will-change: transform;
    }
    .drawer-root.open .drawer {
      transform: translateX(0);
    }
    .scrim {
      background: rgba(0, 0, 0, 0.4);
      transition: opacity 180ms ease;
      opacity: 0;
    }
    .drawer-root.open .scrim {
      opacity: 1;
    }

    .sidebar-wrap {
      display: grid;
      grid-auto-rows: max-content;
      align-content: start;
      gap: 12px;
      padding: 12px;
    }
    .card {
      padding: 12px;
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

    /* Optional composer anchored to bottom of main column */
    .composer {
      position: fixed;
      left: var(--sec-side);
      right: 0;
      bottom: 0;
      background: linear-gradient(
        to top,
        rgba(0, 0, 0, 0.45),
        rgba(0, 0, 0, 0)
      );
      padding: 8px 0 0;
    }

    /* Responsive: collapse secondary sidebar on small screens */
    @media (max-width: 900px) {
      .composer {
        left: 0;
      }
      .main {
        position: absolute;
        left: 0;
        right: 0;
      }

      .sec-sidebar {
        display: none;
      }
    }
  `;

  constructor() {
    super();
    this.plugins = [];
    this.ui = { body: [], sidebar: [], composer: [] };
    this.title = "Your App";
    this._drawerOpen = false;

    this.tabController = new TabController(this);

    // let subclass provide plugins
    this.plugins = this.getPlugins?.() ?? [];

    // merge components
    this.ui = mergeComponents(...this.plugins);

    // tabs
    this.tabController.setTabs(toTabs(this.ui.body));
    const s = this.tabController.get();
    if (!s.active && s.items?.length) {
      this.tabController.setActive(s.items[0].id);
    }

    // close drawer on Escape
    this._onKeyDown = (e) => {
      if (e.key === "Escape" && this._drawerOpen) {
        this._drawerOpen = false;
      }
    };
  }

  connectedCallback() {
    super.connectedCallback?.();
    window.addEventListener("keydown", this._onKeyDown);
  }
  disconnectedCallback() {
    window.removeEventListener("keydown", this._onKeyDown);
    super.disconnectedCallback?.();
  }

  // SUBCLASS: return an array of plugins
  getPlugins() {
    return [];
  }

  _toggleDrawer = () => (this._drawerOpen = !this._drawerOpen);
  _closeDrawer = () => (this._drawerOpen = false);

  renderTabs() {
    const { items = [], active = "" } = this.tabController.get() || {};
    if (!items?.length)
      return html`<span class="tabs-empty">No tabs configured.</span>`;
    return items.map(
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
    );
  }

  renderSidebar(sidebar) {
    return sidebar.map(
      ({ label, render, wrapperStyle }) => html`
        <div class=${wrapperStyle || "card"}>
          <h3>${label}</h3>
          ${render?.({ controllers: this.controllers }) ??
          html`<div style="opacity:.7">No content.</div>`}
        </div>
      `
    );
  }

  renderDrawer() {
    return html`
      <div
        class="drawer-root ${this._drawerOpen ? "open" : ""}"
        @click=${this._closeDrawer}
      >
        <aside class="drawer sidebar" @click=${(e) => e.stopPropagation()}>
          <div class="sidebar-wrap">${this.renderSidebar(this.ui.sidebar)}</div>
        </aside>
        <div class="scrim"></div>
      </div>
    `;
  }

  render() {
    const { active = "" } = this.tabController.get() || {};
    const body = this.ui.body.find((i) => i.id === active) ?? this.ui.body[0];
    let left = body?.left || [];

    return html`
      <!-- App Bar -->
      <header class="appbar">
        <div class="brand-row">
          <div class="brand">
            <button
              class="icon-btn"
              @click=${this._toggleDrawer}
              title="Toggle sidebar"
            >
              ☰
            </button>
            <span class="dot" aria-hidden="true"></span>
            <span>${this.title}</span>
          </div>
          <div class="app-actions"></div>
        </div>
        <div class="tabs-row" role="tablist" aria-label="Main content tabs">
          ${this.renderTabs()}
        </div>
      </header>

      <!-- Workspace -->
      <div class="workspace">
        <aside class="sec-sidebar">${this.renderSidebar(left)}</aside>

        <main class="main">
          <div class="main-inner">
            <section class="content ${body?.wrapperStyle || ""}">
              ${body?.label ? html`<h3>${body.label}</h3>` : ""}
              ${body?.render
                ? body.render({ controllers: this.controllers })
                : html`<div style="opacity:.7">No content.</div>`}
            </section>

            ${this.ui?.composer?.length
              ? html`
                  <div class="composer">
                    ${this.ui.composer.map(
                      (i) =>
                        i.render?.({ controllers: this.controllers }) ??
                        i.render?.()
                    )}
                  </div>
                `
              : html``}
          </div>
        </main>
      </div>

      ${this.renderDrawer()}
    `;
  }
}

customElements.define("github-pluggable-app", GithubPluggableApp);
