// src/ui/task-list.js
import { LitElement, html, css } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { TaskController } from "../shared/lib/TaskController.js";

export class TaskList extends LitElement {
  static styles = css`
    :host {
      display: block;
    }
    .bar {
      display: grid;
      grid-template-columns: 1fr minmax(140px, 0.6fr) minmax(140px, 0.6fr) auto;
      gap: 8px;
      align-items: center;
      margin-bottom: 8px;
    }
    .filters {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
      align-items: center;
      margin-bottom: 12px;
    }
    input,
    button {
      padding: 8px 10px;
      border-radius: 10px;
      border: 1px solid #2a2a30;
      background: #0b0b0c;
      color: inherit;
      font: inherit;
    }
    button {
      cursor: pointer;
      background: #1b1b1f;
    }
    ul {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      gap: 6px;
    }
    li {
      display: flex;
      gap: 8px;
      align-items: center;
      padding: 8px;
      border: 1px solid #1f1f22;
      border-radius: 10px;
      background: #0f0f12;
      cursor: pointer;
    }
    li.active {
      outline: 2px solid #3b82f6;
    }
    .title {
      flex: 1 1 auto;
    }
    .done {
      opacity: 0.6;
      text-decoration: line-through;
    }
    .meta {
      font-size: 12px;
      opacity: 0.7;
    }
  `;

  static properties = {
    _draftTitle: { state: true },
    _draftWorkspaceId: { state: true },
    _draftToolId: { state: true },
    _filterWorkspaceId: { state: true },
  };

  constructor() {
    super();
    // Per-host controller; it wires itself to this element & re-renders on changes
    this.tasks = new TaskController(this);
    this._draftTitle = "";
    this._draftWorkspaceId = "";
    this._draftToolId = "";
    this._filterWorkspaceId = localStorage.getItem("tasks:filterWorkspaceId") || "";
  }

  #add = () => {
    const title = (this._draftTitle || "").trim();
    if (!title) return;
    this.tasks.add({
      title,
      workspaceId: (this._draftWorkspaceId || "").trim(),
      toolId: (this._draftToolId || "").trim(),
    });
    this._draftTitle = "";
    this._draftWorkspaceId = "";
    this._draftToolId = "";
  };

  render() {
    const { tasks = [], selectedId = null } = this.tasks.state ?? {};
    const pk = this.tasks.service?.pk ?? "id";

    const filter = (this._filterWorkspaceId || "").trim();
    const visibleTasks = filter
      ? tasks.filter((t) => String(t?.workspaceId ?? "") === filter)
      : tasks;

    return html`
      <form
        class="bar"
        @submit=${(e) => {
          e.preventDefault();
          this.#add();
        }}
      >
        <input
          placeholder="New task title…"
          .value=${this._draftTitle}
          @input=${(e) => (this._draftTitle = e.target.value)}
        />
        <input
          placeholder="Workspace ID"
          .value=${this._draftWorkspaceId}
          @input=${(e) => (this._draftWorkspaceId = e.target.value)}
        />
        <input
          placeholder="Tool ID"
          .value=${this._draftToolId}
          @input=${(e) => (this._draftToolId = e.target.value)}
        />
        <button type="submit" ?disabled=${!(this._draftTitle || "").trim()}>
          Add
        </button>
      </form>

      <div class="filters">
        <input
          placeholder="Filter by workspaceId"
          .value=${this._filterWorkspaceId}
          @input=${(e) => {this._filterWorkspaceId = e.target.value;localStorage.setItem("tasks:filterWorkspaceId",this._filterWorkspaceId);}}
        />
        <button
          type="button"
          @click=${() => {this._filterWorkspaceId = "";localStorage.setItem("tasks:filterWorkspaceId","");}}
          ?disabled=${!(this._filterWorkspaceId || "").trim()}
          title="Clear workspace filter"
        >
          Clear
        </button>
      </div>

      <ul>
        ${repeat(
          visibleTasks,
          (t) => t?.[pk],
          (t) => html`
            <li
              class=${t?.[pk] === selectedId ? "active" : ""}
              @click=${() => this.tasks.select(t?.[pk])}
            >
              <input
                type="checkbox"
                .checked=${!!t?.done}
                @click=${(e) => e.stopPropagation()}
                @change=${() => this.tasks.toggle(t?.[pk])}
              />
              <div class="title ${t?.done ? "done" : ""}">
                ${t?.title ?? ""}
                <div class="meta">
                  ${t?.workspaceId ? `ws:${t.workspaceId}` : ""}
                  ${t?.toolId ? ` · tool:${t.toolId}` : ""}
                </div>
              </div>
              <button
                @click=${(e) => {
                  e.stopPropagation();
                  this.tasks.remove(t?.[pk]);
                }}
                title="Remove"
              >
                ✕
              </button>
            </li>
          `
        )}
      </ul>
    `;
  }
}

if (!customElements.get("task-list"))
  customElements.define("task-list", TaskList);
