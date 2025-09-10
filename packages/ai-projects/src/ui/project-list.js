// src/ui/project-list.js
import { LitElement, html, css } from "lit";
import "@loki/layout/ui/smart-select.js";
import { sideWidgetStyles } from "./sideWidgetStyles";
import { AIProjectController } from "../shared/AIProjectController.js";
import { TabController } from "@loki/layout/util";

export class ProjectList extends LitElement {
  static styles = sideWidgetStyles;

  static properties = {
    // Internal reactive state only
    _items: { state: true },
    _selectedId: { state: true },
    _editingId: { state: true },
    _newName: { state: true },
    _menuValues: { state: true },
  };

  constructor() {
    super();
    // self-owned controller (singleton-backed service under the hood)
    this.controller = new AIProjectController(this);
    this.tabController = new TabController(this);

    // local UI state
    const st = this.controller.get?.() || {};
    this._items = st.projects || [];
    this._selectedId = st.selectedId ?? null;
    this._editingId = null;
    this._newName = "";
    this._menuValues = {};

    // keep local mirror in sync
    this._unsub = this.controller.subscribe((st) => {
      this._items = st.projects || [];
      this._selectedId = st.selectedId ?? null;
      this.requestUpdate();
    });
  }

  disconnectedCallback() {
    this._unsub?.();
    this._unsub = null;
    super.disconnectedCallback();
  }

  render() {
    return html`
      <div class="wrap">
        <div class="header">
          <div class="title">Projects</div>
          <button class="btn" @click=${this._create}>＋ New</button>
        </div>
        <div class="list">
          ${this._items.map((p) =>
            this._renderItem(p, p.id === this._selectedId)
          )}
        </div>
      </div>
    `;
  }

  _renderItem(proj, isActive) {
    const editing = this._editingId === proj.id;
    const menuVal = this._menuValues[proj.id] ?? "";
    const displayName = proj.name || "Untitled";
    return html`
      <div
        class="item ${isActive ? "active" : ""}"
        @click=${() => this._select(proj.id)}
        title=${displayName}
      >
        <div>
          ${editing
            ? html`
                <input
                  type="text"
                  .value=${this._newName || displayName}
                  @click=${(e) => e.stopPropagation()}
                  @keydown=${(e) => this._onEditKey(e, proj.id)}
                  @input=${(e) => (this._newName = e.target.value)}
                />
              `
            : html`<div class="name">${displayName}</div>`}
        </div>

        ${editing
          ? html``
          : html`
              <smart-select
                class="menu"
                mode="menu"
                .name=${`menu-${proj.id}`}
                .value=${menuVal}
                @click=${(e) => e.stopPropagation()}
                @change=${(e) => this._onMenu(proj.id, e)}
              >
                <option value="" selected>⋯</option>
                <option value="rename">Rename</option>
                <option value="clear">Clear</option>
                <option value="archive">
                  ${proj.archived ? "Unarchive" : "Archive"}
                </option>
                <option value="delete">Delete</option>
                <option value="edit">Edit</option>
              </smart-select>
            `}
      </div>
    `;
  }

  // interactions
  _select(id) {
    this.controller.select(id);
    // legacy compat event
    this.dispatchEvent(
      new CustomEvent("project-change", {
        detail: { id },
        bubbles: true,
        composed: true,
      })
    );
  }

  _edit(id, name) {
    this._editingId = id;
    this._newName = name || "";
    this.requestUpdate();
  }
  _cancelEdit = () => {
    this._editingId = null;
    this._newName = "";
  };
  async _save(id) {
    const name = (this._newName || "").trim();
    if (name) await this.controller.rename(id, name);
    this._cancelEdit();
  }
  _onEditKey(e, id) {
    if (e.key === "Enter") {
      e.preventDefault();
      this._save(id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      this._cancelEdit();
    }
  }

  _create = async () => {
    const id = await this.controller.create("New project");
    this._editingId = id || this.controller.get()?.selectedId || null;
    this._newName = "New project";
  };

  async _onMenu(id, e) {
    const val = e.target?.value || "";
    this._menuValues = { ...this._menuValues, [id]: "" }; // reset label

    if (val === "rename") {
      const current = this._items.find((p) => p.id === id)?.name || "";
      this._edit(id, current);
      return;
    }
    if (val === "clear") {
      if (confirm("Clear all conversations & messages in this project?")) {
        await this.controller.clearProject(id);
      }
      return;
    }
    if (val === "archive") {
      const p = this._items.find((x) => x.id === id);
      await this.controller.archive(id, !p?.archived);
      return;
    }
    if (val === "delete") {
      if (confirm("Delete this project and all its data?")) {
        await this.controller.remove(id, { cascade: true });
        if (this._editingId === id) this._cancelEdit();
      }
      return;
    }
    if (val === "edit") {
      this.tabController.setActive("chat-project:project");
    }
  }
}

if (!customElements.get("project-list")) {
  customElements.define("project-list", ProjectList);
}
