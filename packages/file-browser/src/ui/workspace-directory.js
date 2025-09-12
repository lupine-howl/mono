// src/ui/workspace-directory.js
import { LitElement, html, css } from "lit";
import { FileBrowserController } from "../shared/FileBrowserController.js";
import { TabController } from "@loki/layout/util";

export class WorkspaceDirectory extends LitElement {
  static styles = css`
    :host { display: block; }
    .wrap { display: flex; flex-direction: column; gap: 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    thead th { text-align: left; padding: 6px 8px; border-bottom: 1px solid #24242a; opacity: 0.8; }
    tbody td { padding: 6px 8px; border-bottom: 1px solid #1a1a1f; }
    tr { cursor: pointer; }
    tr:hover { background: #141418; }
    tr.selected { background: #1b1b21; }
    .path { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; opacity: 0.9; }
    .muted { opacity: 0.7; }
    .menu {
      position: relative;
    }
    .menu-btn {
      border: 1px solid #2a2a30;
      background: #151519;
      color: inherit;
      font: inherit;
      padding: 4px 6px;
      border-radius: 8px;
      cursor: pointer;
      line-height: 1;
    }
    .menu-items {
      position: absolute;
      right: 0;
      top: 26px;
      background: #0f0f12;
      border: 1px solid #2a2a30;
      border-radius: 8px;
      min-width: 140px;
      z-index: 10;
      box-shadow: 0 6px 24px rgba(0,0,0,0.35);
    }
    .menu-items button {
      display: block;
      width: 100%;
      text-align: left;
      background: transparent;
      border: 0;
      color: inherit;
      font: inherit;
      padding: 8px 10px;
      cursor: pointer;
    }
    .menu-items button:hover { background: #16161b; }
  `;

  static properties = {
    _rows: { state: true },
    _selectedId: { state: true },
    _openMenuFor: { state: true },
  };

  constructor() {
    super();
    this.controller = new FileBrowserController({ eventName: "files:change" });
    this.tabController = new TabController();
    this._rows = [];
    this._selectedId = "";
    this._openMenuFor = null;

    this._onChange = (e) => {
      const { workspaces, ws } = e.detail ?? {};
      if (Array.isArray(workspaces)) this._rows = workspaces;
      if (typeof ws === "string") this._selectedId = ws;
      this.requestUpdate();
    };

    this.controller.addEventListener("files:change", this._onChange);

    // hydrate initially
    this._rows = this.controller.workspaces ?? [];
    this._selectedId = this.controller.ws ?? "";
  }

  render() {
    return html`
      <div class="wrap">
        ${this._rows?.length ? this._renderTable() : html`<div class="muted">No workspaces found.</div>`}
      </div>
    `;
  }

  _renderTable() {
    return html`
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Version</th>
            <th>Private</th>
            <th>Type</th>
            <th>Deps</th>
            <th>Dev</th>
            <th>Scripts</th>
            <th>Path</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${this._rows.map((w) => this._renderRow(w))}
        </tbody>
      </table>
    `;
  }

  _renderRow(w) {
    const m = w.meta || {};
    const selected = w.id === this._selectedId;
    return html`
      <tr class=${selected ? "selected" : ""} @click=${() => this._selectWorkspace(w)}>
        <td>${w.name || w.id}</td>
        <td class="muted">${m.version || "-"}</td>
        <td class="muted">${m.private ? "yes" : "no"}</td>
        <td class="muted">${m.type || "-"}</td>
        <td class="muted">${Number(m.dependencies ?? 0)}</td>
        <td class="muted">${Number(m.devDependencies ?? 0)}</td>
        <td class="muted">${Number(m.scripts ?? 0)}</td>
        <td class="path" title=${w.path}>${w.path}</td>
        <td class="menu" @click=${(e) => e.stopPropagation()}>
          <button class="menu-btn" @click=${() => this._toggleMenu(w.id)} title="Actions">⋮</button>
          ${this._openMenuFor === w.id
            ? html`<div class="menu-items" @mouseleave=${() => (this._openMenuFor = null)}>
                <button @click=${() => this._editPkg(w)}>Edit package.json</button>
                <button @click=${() => this._openFolder(w)}>Open folder</button>
              </div>`
            : null}
        </td>
      </tr>
    `;
  }

  _toggleMenu(id) {
    this._openMenuFor = this._openMenuFor === id ? null : id;
  }

  _selectWorkspace(w) {
    if (!w?.id) return;
    this.controller.setWorkspace(w.id);
  }

  async _editPkg(w) {
    this._openMenuFor = null;
    if (!w?.id) return;
    // ensure workspace, then select package.json and switch to code tab
    this.controller.setWorkspace(w.id);
    // slight microtask to allow state to propagate
    await Promise.resolve();
    this.controller.select("package.json", "file");
    this.tabController.setActive("code");
  }

  _openFolder(w) {
    this._openMenuFor = null;
    if (!w?.id) return;
    this.controller.setWorkspace(w.id);
  }
}

if (!customElements.get("workspace-directory")) {
  customElements.define("workspace-directory", WorkspaceDirectory);
}
