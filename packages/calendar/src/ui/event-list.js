import { LitElement, html, css } from "lit";
import { EventController } from "../shared/EventController.js";
import { TabController } from "@loki/layout/util";

function fmtWhen(ev) {
  if (!ev?.start) return "";
  try {
    const d = new Date(ev.start);
    const date = d.toLocaleDateString(undefined, { dateStyle: "medium" });
    if (ev.allDay) return date;
    const time = d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${date} · ${time}`;
  } catch {
    return "";
  }
}

export class EventList extends LitElement {
  static styles = css`
    :host {
      display: block;
    }
    .toolbar {
      display: flex;
      gap: 6px;
      align-items: center;
      margin-bottom: 8px;
    }
    input,
    button {
      padding: 6px 8px;
      border-radius: 8px;
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
      margin: 0;
      padding: 0;
    }
    li {
      position: relative;
      padding: 8px;
      border: 1px solid #1f1f22;
      border-radius: 8px;
      margin-bottom: 6px;
      background: #0f0f12;
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 6px;
      align-items: center;
    }
    li.sel {
      outline: 1px solid #3a7afe;
    }
    .title {
      font-weight: 600;
      font-size: 0.95rem;
      line-height: 1.2;
    }
    .meta {
      color: #a0a0a8;
      font-size: 0.82rem;
    }
    .menuBtn {
      border: 1px solid #2a2a30;
      background: #151518;
      padding: 4px 6px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.8rem;
    }
    .menu {
      position: absolute;
      right: 8px;
      top: 36px;
      background: #141418;
      border: 1px solid #2a2a30;
      border-radius: 8px;
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4);
      z-index: 10;
      min-width: 140px;
      overflow: hidden;
    }
    .menu button {
      display: block;
      width: 100%;
      background: transparent;
      border: none;
      text-align: left;
      padding: 8px 10px;
    }
    .menu button:hover {
      background: #1b1b1f;
    }
  `;

  static properties = {
    q: { state: true },
    openMenuId: { state: true },
  };

  constructor() {
    super();
    this.ctrl = new EventController(this, {});
    this.tabController = new TabController();
    this.q = "";
    this.openMenuId = null;
    this.addEventListener("click", (e) => {
      // Close menus when clicking outside buttons/menus
      if (
        !e
          .composedPath()
          .some(
            (el) =>
              el?.classList?.contains?.("menu") ||
              el?.classList?.contains?.("menuBtn")
          )
      ) {
        this.openMenuId = null;
      }
    });
  }

  get _items() {
    const all = this.ctrl?.state?.items ?? [];
    const q = this.q.trim().toLowerCase();
    const filtered = q
      ? all.filter(
          (ev) =>
            (ev.title || "").toLowerCase().includes(q) ||
            (ev.description || "").toLowerCase().includes(q)
        )
      : all;
    return [...filtered].sort(
      (a, b) =>
        (a.start ?? 0) - (b.start ?? 0) ||
        (a.title || "").localeCompare(b.title || "")
    );
  }

  async _createQuick() {
    const title = prompt("New event title?");
    if (!title || !title.trim()) return;
    await this.ctrl.createOne({ title: title.trim(), start: Date.now() });
  }

  _openMenu(ev) {
    this.openMenuId = this.openMenuId === ev.id ? null : ev.id;
  }

  async _edit(ev) {
    this.ctrl.select(ev.id);
    this.tabController.setActive("calendar:event-view");
    this.openMenuId = null;
  }

  async _delete(ev) {
    this.openMenuId = null;
    if (confirm("Delete this event?")) await this.ctrl.remove(ev.id);
  }

  render() {
    const selectedId = this.ctrl?.state?.selectedId;
    return html`
      <div class="toolbar">
        <input
          placeholder="Search events"
          .value=${this.q}
          @input=${(e) => (this.q = e.target.value)}
        />
        <button @click=${() => this._createQuick()}>New</button>
      </div>
      <ul>
        ${this._items.map(
          (ev) => html` <li class=${ev.id === selectedId ? "sel" : ""}>
            <div
              @click=${() => this.ctrl.select(ev.id)}
              style="cursor: pointer;"
            >
              <div class="title">${ev.title || "Untitled"}</div>
              <div class="meta">
                ${fmtWhen(ev)}${ev.calendarId
                  ? html` · <code>${ev.calendarId}</code>`
                  : ""}
              </div>
            </div>
            <div>
              <button
                class="menuBtn"
                title="Menu"
                @click=${() => this._openMenu(ev)}
              >
                ⋮
              </button>
              ${this.openMenuId === ev.id
                ? html`
                    <div class="menu">
                      <button @click=${() => this._edit(ev)}>Edit</button>
                      <button @click=${() => this._delete(ev)}>Delete</button>
                    </div>
                  `
                : null}
            </div>
          </li>`
        )}
      </ul>
    `;
  }
}

if (!customElements.get("event-list"))
  customElements.define("event-list", EventList);
