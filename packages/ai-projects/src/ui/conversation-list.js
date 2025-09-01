// src/ui/conversation-list.js
import { LitElement, html } from "lit";
import "@loki/layout/ui/smart-select.js";
import { sideWidgetStyles } from "./sideWidgetStyles";
import { AIConversationController } from "../shared/AIConversationController.js";

export class ChatConversationList extends LitElement {
  static styles = sideWidgetStyles;

  static properties = {
    // Optional: external controller may be passed; otherwise we create our own.
    controller: { attribute: false },

    // local UI state
    _editingId: { state: true },
    _newName: { state: true },
    _menuValues: { state: true },
  };

  constructor() {
    super();
    // Self-instantiate controller (singleton-backed service) and bind to this host.
    this.controller ??= new AIConversationController(this);

    this._editingId = null;
    this._newName = "";
    this._menuValues = {};
  }

  render() {
    const st = this.controller?.get?.() || {};
    const items = st.conversations || [];
    const selectedId = st.selectedId ?? null;

    return html`
      <div class="wrap">
        <div class="header">
          <div class="title">Chats</div>
          <button class="btn" @click=${this._create}>＋ New</button>
        </div>
        <div class="list">
          ${items.map((c) => this._renderItem(c, c.id === selectedId))}
        </div>
      </div>
    `;
  }

  _renderItem(conv, isActive) {
    const editing = this._editingId === conv.id;
    const menuVal = this._menuValues[conv.id] ?? "";
    const displayName = conv.name || "Untitled";

    return html`
      <div
        class="item ${isActive ? "active" : ""}"
        @click=${() => this._select(conv.id)}
        title=${displayName}
      >
        <div>
          ${editing
            ? html`
                <input
                  type="text"
                  .value=${this._newName || displayName}
                  @click=${(e) => e.stopPropagation()}
                  @keydown=${(e) => this._onEditKey(e, conv.id)}
                  @input=${(e) => (this._newName = e.target.value)}
                />
              `
            : html`<div class="name">${displayName}</div>`}
        </div>

        ${editing
          ? null
          : html`
              <smart-select
                class="menu"
                mode="menu"
                .name=${`menu-${conv.id}`}
                .value=${menuVal}
                @click=${(e) => e.stopPropagation()}
                @change=${(e) => this._onMenu(conv.id, e)}
              >
                <option value="" selected>⋯</option>
                <option value="rename">Rename</option>
                <option value="clear">Clear</option>
                <option value="delete">Delete</option>
              </smart-select>
            `}
      </div>
    `;
  }

  // interactions (ALL via controller)
  async _select(id) {
    await this.controller?.select?.(id);
    // legacy bubble event for external listeners
    this.dispatchEvent(
      new CustomEvent("conversation-change", {
        detail: { id },
        bubbles: true,
        composed: true,
      })
    );
  }

  _edit(id, name) {
    this._editingId = id;
    this._newName = name || "";
  }
  _cancelEdit = () => {
    this._editingId = null;
    this._newName = "";
  };
  async _save(id) {
    const name = (this._newName || "").trim();
    if (name) await this.controller?.rename?.(id, name);
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
    await this.controller?.create?.("New chat");
    const st = this.controller?.get?.() || {};
    this._editingId = st.selectedId || null;
    this._newName = "New chat";
  };

  async _onMenu(id, e) {
    const val = e.target?.value || "";
    // reset menu label immediately
    this._menuValues = { ...this._menuValues, [id]: "" };

    if (val === "rename") {
      const st = this.controller?.get?.() || {};
      const current =
        (st.conversations || []).find((c) => c.id === id)?.name || "";
      this._edit(id, current);
      return;
    }
    if (val === "clear") {
      if (confirm("Clear all messages in this chat?")) {
        await this.controller?.clearMessages?.(id);
      }
      return;
    }
    if (val === "delete") {
      if (confirm("Delete this chat?")) {
        await this.controller?.remove?.(id);
        if (this._editingId === id) this._cancelEdit();
      }
      return;
    }
  }
}

if (!customElements.get("chat-conversation-list")) {
  customElements.define("chat-conversation-list", ChatConversationList);
}
