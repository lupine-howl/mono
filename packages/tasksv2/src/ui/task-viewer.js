// src/ui/task-viewer.js
import { LitElement, html, css } from "lit";
import { TaskController } from "../shared/TaskController.js";

export class TaskViewer extends LitElement {
  static styles = css`
    :host {
      display: block;
    }
    .tabs {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
    }
    .tab {
      padding: 6px 10px;
      border: 1px solid #2a2a30;
      border-radius: 999px;
      background: #111214;
      cursor: pointer;
    }
    .tab.active {
      outline: 2px solid #3b82f6;
    }
    .form {
      display: grid;
      gap: 10px;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    }
    label {
      display: grid;
      gap: 6px;
      font-size: 12px;
    }
    input,
    textarea,
    select {
      padding: 8px 10px;
      border-radius: 10px;
      border: 1px solid #2a2a30;
      background: #0b0b0c;
      color: inherit;
      font: inherit;
    }
    textarea {
      min-height: 140px;
      grid-column: 1 / -1;
    }
    .hint {
      font-size: 12px;
      opacity: 0.7;
    }
    .notes {
      grid-column: 1 / -1;
    }
  `;

  static properties = {
    _tab: { state: true },
  };

  constructor() {
    super();
    this.tasks = new TaskController(this); // per-host controller; auto-reactive
    this._tab = "Details";
  }

  #pk() {
    return this.tasks.service?.pk ?? "id";
  }
  #selected() {
    return this.tasks.selected;
  }
  #patch(patch) {
    const t = this.#selected();
    if (!t) return;
    this.tasks.update(t[this.#pk()], patch);
  }
  #isoDate(v) {
    return v ? new Date(v).toISOString().slice(0, 10) : "";
  }

  render() {
    const t = this.#selected();
    if (!t) return html`<div class="hint">Select a task…</div>`;

    return html`
      <div class="tabs">
        ${["Details", "Activity"].map(
          (tab) => html`
            <div
              class="tab ${this._tab === tab ? "active" : ""}"
              @click=${() => (this._tab = tab)}
            >
              ${tab}
            </div>
          `
        )}
      </div>

      ${this._tab === "Details"
        ? html`
            <div class="form">
              <label
                >Title
                <input
                  .value=${t.title ?? ""}
                  @input=${(e) => this.#patch({ title: e.target.value })}
                />
              </label>

              <label
                >Status
                <select
                  .value=${t.done ? "done" : "open"}
                  @change=${(e) =>
                    this.#patch({ done: e.target.value === "done" })}
                >
                  <option value="open">Open</option>
                  <option value="done">Done</option>
                </select>
              </label>

              <label
                >Workspace ID
                <input
                  .value=${t.workspaceId ?? ""}
                  @input=${(e) => this.#patch({ workspaceId: e.target.value })}
                />
              </label>

              <label
                >Tool ID
                <input
                  .value=${t.toolId ?? ""}
                  @input=${(e) => this.#patch({ toolId: e.target.value })}
                />
              </label>

              <label
                >Due date
                <input
                  type="date"
                  .value=${this.#isoDate(t.due)}
                  @change=${(e) => {
                    const v = e.target.value;
                    this.#patch({ due: v ? new Date(v).toISOString() : null });
                  }}
                />
              </label>

              <label class="notes"
                >Notes
                <textarea
                  .value=${t.notes ?? ""}
                  @input=${(e) => this.#patch({ notes: e.target.value })}
                ></textarea>
              </label>
            </div>
          `
        : html`
            <div class="hint">
              Activity feed isn’t implemented in this prototype. (Future: show
              change history.)
            </div>
          `}
    `;
  }
}

if (!customElements.get("task-viewer"))
  customElements.define("task-viewer", TaskViewer);
