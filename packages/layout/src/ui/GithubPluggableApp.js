import { LitElement, html, css } from "lit";
import { TabController } from "../shared/TabController.js";
import { FileBrowserController } from "@loki/file-browser/util";
import "@loki/minihttp/ui/ui-overlay-app.js";

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
const toTabs = (arr) =>
  arr.map(({ id, label, noTab }) => ({ id, label, noTab }));

export class GithubPluggableApp extends LitElement {
  static properties = {
    ui: { state: true },
    _drawerOpen: { state: true },
    _isNarrow: { state: true },
    storageKey: { type: String, attribute: "storage-key" },
  };

  static styles = css`
    :host {
      --bg: #0b0b0c;
      --fg: #e7e7ea;
      --panel: #0f0f12;
      --border: #1f1f22;

      /* Layout vars */
      --appbar-h: 48px;
      --sec-side: 300px; /* secondary (inline) sidebar width on desktop */
      --main-max: 1200px;
      --composer-h: 72px; /* approximate height of composer (padding uses this) */

      display: block;
      color: var(--fg);
      background: var(--bg);
      min-height: 100vh;
    }

    /* ===== App Bar (single row) ===== */
    .appbar {
      position: sticky;
      top: 0;
      z-index: 40;
      height: var(--appbar-h);
      background: var(--bg);
      border-bottom: 1px solid var(--border);
      display: grid;
      grid-template-columns: max-content minmax(0, 1fr);
      align-items: center;
      gap: 8px;
      padding: 0 10px;
      z-index: 100;
    }

    .icon-btn {
      appearance: none;
      border: 1px solid #232327;
      background: #151518;
      color: #cfcfd4;
      padding: 8px 10px; /* larger touch target */
      border-radius: 8px;
      cursor: pointer;
      line-height: 1;
    }

    /* Tabs (desktop): scrollable row of buttons */
    .tabs-scroll {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 6px;
      overflow-x: auto;
      scrollbar-width: thin;
      -webkit-overflow-scrolling: touch;
      padding: 0 2px;
    }
    .tab {
      appearance: none;
      border: none;
      background: transparent;
      color: #cfcfd4;
      font: 0.95rem system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
        Roboto, "Helvetica Neue", Arial, sans-serif;
      padding: 10px 12px;
      cursor: pointer;
      white-space: nowrap;
      opacity: 0.95;
      border-bottom: 2px solid transparent;
    }
    .tab[aria-selected="true"] {
      border-bottom-color: #8247ff;
      font-weight: 600;
      color: #fff;
      opacity: 1;
    }
    .tabs-empty {
      font-size: 12px;
      opacity: 0.7;
      padding-left: 2px;
    }

    /* Tabs (mobile): dropdown select */
    .tabs-select {
      width: 100%;
      background: #151518;
      color: #e7e7ea;
      border: 1px solid #232327;
      border-radius: 8px;
      padding: 8px 10px;
      font: inherit;
    }

    /* ===== Workspace ===== */
    .workspace {
    }
    .sec-sidebar {
      border-right: 1px solid var(--border);
      background: var(--panel);
      min-width: 0;
      position: fixed;
      top: var(--appbar-h);
      left: 0;
      width: var(--sec-side);
      bottom: 0;
      overflow-y: auto;
      overflow-x: hidden;
      scrollbar-width: thin;
      -webkit-overflow-scrolling: touch;
      z-index: 99;
    }
    .sec-wrap {
      padding: 12px;
      display: grid;
      grid-auto-rows: max-content;
      align-content: start;
      gap: 12px;
      grid-template-columns: 100%;
    }

    .main {
      min-width: 0;
      position: absolute;
      top: var(--appbar-h);
      left: var(--sec-side);
      right: 0;
      bottom: 0;
      overflow-y: auto;
      scrollbar-width: thin;
      -webkit-overflow-scrolling: touch;
    }
    .main-inner {
      max-width: var(--main-max);
      margin: 0 auto;
      display: grid;
      gap: 12px;
      padding: 16px;
      /* keep content above the fixed composer */
      padding-bottom: calc(
        var(--composer-h) + env(safe-area-inset-bottom, 0px) + 100px
      );
    }
    .content {
      display: grid;
      gap: 12px;
    }
    h3 {
      margin: 0;
      font-weight: 600;
    }

    /* ===== Primary sidebar as off-canvas drawer (also hosts secondary on mobile) ===== */
    .drawer-root {
      position: fixed;
      inset: 0;
      display: grid;
      grid-template-columns: calc(var(--sec-side) + 1px) 1fr; /* drawer + scrim */
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

    /* Fixed composer at bottom (always) */
    .composer {
      position: fixed;
      left: var(--sec-side);
      right: 0;
      bottom: 0;
      z-index: 50;
      background: linear-gradient(to top, rgba(0, 0, 0, 0.45), rgba(0, 0, 0, 0)),
        var(--bg);
      pointer-events: none; /* container */
      border-top: 1px solid var(--border);
    }
    .composer > .composer-inner {
      pointer-events: auto; /* actual UI is interactive */
      margin: 0 auto;
      width: min(100%, var(--main-max));
    }

    /* New: Alerts overlay on the right, anchored above composer, same width as left sidebar */
    .alerts {
      position: fixed;
      right: 3px;
      bottom: calc(var(--composer-h) + 12px);
      width: var(--sec-side - 20px);
      max-width: var(--sec-side);
      z-index: 60;
      display: grid;
      gap: 8px;
      padding: 8px;
      pointer-events: auto;
      font-size: 0.9em;
    }
    .alerts > * {
      /* children can render their own visuals */
    }

    @media (max-width: 900px) {
      .workspace {
        display: block;
      }
      .main {
        left: 0;
      }
      .sec-sidebar {
        display: none;
      }
      .composer {
        left: 0;
      }
      /* On small screens, align alerts with full width under app bar */
      .alerts {
        right: 0;
        left: 0;
        width: auto;
        max-width: none;
        margin: 0 8px;
      }
    }
  `;

  constructor() {
    super();
    this.plugins = [];
    this.ui = { body: [], sidebar: [], composer: [] };
    this._drawerOpen = false;
    this._isNarrow = false;

    this.tabController = new TabController(this);
    this.fileController = new FileBrowserController(this);

    // let subclass provide plugins
    this.plugins = this.getPlugins?.() ?? [];

    // merge components
    this.ui = mergeComponents(...this.plugins);

    // tabs
    this.tabController.setTabs(toTabs(this.ui.body));
    const s = this.tabController.get();
    if (!s.active && s.items?.length)
      this.tabController.setActive(s.items[0].id);

    // responsive watcher for mobile breakpoint
    this._mediaQuery = window.matchMedia("(max-width: 900px)");
    this._onMQ = (e) => {
      this._isNarrow = e.matches;
    };
    this._isNarrow = this._mediaQuery.matches;
    this._mediaQuery.addEventListener?.("change", this._onMQ);
    // Fallback for older browsers
    this._mediaQuery.addListener?.(this._onMQ);

    // close drawer on Escape
    this._onKeyDown = (e) => {
      if (e.key === "Escape" && this._drawerOpen) this._drawerOpen = false;
    };
  }

  connectedCallback() {
    super.connectedCallback?.();
    window.addEventListener("keydown", this._onKeyDown);
  }
  disconnectedCallback() {
    window.removeEventListener("keydown", this._onKeyDown);
    this._mediaQuery.removeEventListener?.("change", this._onMQ);
    this._mediaQuery.removeListener?.(this._onMQ);
    super.disconnectedCallback?.();
  }

  // SUBCLASS: return an array of plugins
  getPlugins() {
    return [];
  }

  _toggleDrawer = () => (this._drawerOpen = !this._drawerOpen);
  _closeDrawer = () => (this._drawerOpen = false);

  /* Tabs renderer: desktop buttons or mobile select */
  renderTabs() {
    const { items = [], active = "" } = this.tabController.get() || {};
    if (!items?.length)
      return html`<span class="tabs-empty">No tabs configured.</span>`;

    if (this._isNarrow) {
      return html`
        <select
          class="tabs-select"
          aria-label="Select section"
          @change=${(e) => this.tabController.setActive(e.target.value)}
        >
          ${items.map(
            (t) =>
              html`<option value=${t.id} ?selected=${active === t.id}>
                ${t.label}
              </option>`
          )}
        </select>
      `;
    }

    return html`
      <div class="tabs-scroll" role="tablist" aria-label="Main content tabs">
        ${items.map((t) =>
          t.noTab
            ? ""
            : html`
                <button
                  class="tab"
                  role="tab"
                  aria-selected=${String(active === t.id)}
                  @click=${() => this.tabController.setActive(t.id)}
                >
                  ${t.label}
                </button>
              `
        )}
      </div>
    `;
  }

  renderSidebarBlocks(blocks) {
    return blocks.map(
      ({ label, render, wrapperStyle, ws, path, component }) => html`
        <div class=${wrapperStyle || "card"}>
          ${label
            ? html`<h3
                @click=${() => {
                  if (ws && path) {
                    this.fileController.setWorkspace(ws);
                    this.fileController.select(path);
                    this.tabController.setActive("git:code");
                  }
                }}
              >
                ${label}
              </h3>`
            : ""}
          ${component?.render?.() ||
          render?.() ||
          html`<div style="opacity:.7">No content.</div>`}
        </div>
      `
    );
  }

  /* Drawer contains:
     - Primary sidebar (ui.sidebar)
     - PLUS secondary sidebar blocks when narrow (body.left) */
  renderDrawer(leftBlocksWhenNarrow) {
    const leftBlocks = this._isNarrow ? leftBlocksWhenNarrow : [];
    return html`
      <div
        class="drawer-root ${this._drawerOpen ? "open" : ""}"
        @click=${this._closeDrawer}
      >
        <aside class="drawer sidebar" @click=${(e) => e.stopPropagation()}>
          <div class="sidebar-wrap">
            ${this.renderSidebarBlocks(this.ui.sidebar)}
            ${leftBlocks?.length
              ? html`<hr class="card" style="opacity:.3" />`
              : ""}
            ${leftBlocks?.length ? this.renderSidebarBlocks(leftBlocks) : ""}
          </div>
        </aside>
        <div class="scrim"></div>
      </div>
    `;
  }

  render() {
    const { active = "" } = this.tabController.get() || {};
    const body = this.ui.body.find((i) => i.id === active) ?? this.ui.body[0];
    const left = body?.left || []; // secondary sidebar blocks for this tab

    return html`
      <!-- App Bar: hamburger + tabs -->
      <ui-overlay-app></ui-overlay-app>
      <header class="appbar">
        <button
          class="icon-btn"
          @click=${this._toggleDrawer}
          title="Open menu"
          aria-label="Open menu"
        >
          ☰
        </button>
        ${this.renderTabs()}
      </header>

      <!-- Workspace -->
      <div class="workspace">
        <!-- Secondary sidebar (desktop only; moves to drawer on mobile) -->
        <aside class="sec-sidebar">
          <div class="sec-wrap">${this.renderSidebarBlocks(left)}</div>
        </aside>

        <main class="main">
          <div class="main-inner">
            <section class="content ${body?.wrapperStyle || ""}">
              ${body?.label
                ? html`<h3
                    @click=${() => {
                      if (body?.ws && body?.path) {
                        this.fileController.setWorkspace(body.ws);
                        this.fileController.select(body.path);
                        this.tabController.setActive("git:code");
                      }
                    }}
                  >
                    ${body.label}
                  </h3>`
                : ""}
              ${body?.component?.render?.() ||
              body?.render?.() ||
              html`<div style="opacity:.7">No content.</div>`}
            </section>
          </div>
        </main>
      </div>

      <!-- Fixed Composer -->
      ${this.ui?.composer?.length
        ? html`
            <div class="composer">
              <div class="composer-inner">
                ${this.ui.composer.map(
                  (i) => i?.component?.render?.() || i?.render?.()
                )}
              </div>
            </div>
          `
        : html``}
      ${this.ui?.alerts?.length
        ? html`
            <div class="alerts" aria-label="Alerts">
              ${this.ui.alerts.map(
                (i) => i?.component?.render?.() || i?.render?.()
              )}
            </div>
          `
        : html``}
      ${this.renderDrawer(left)}
    `;
  }
}

customElements.define("github-pluggable-app", GithubPluggableApp);
