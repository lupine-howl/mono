import { LitElement, html, css } from "lit";
import { EventController } from "../shared/EventController.js";

function fmtWhen(ev) {
  if (!ev?.start) return "";
  try {
    const d = new Date(ev.start);
    const date = d.toLocaleDateString(undefined, { dateStyle: "medium" });
    if (ev.allDay) return date;
    const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return `${date} · ${time}`;
  } catch {
    return "";
  }
}

export class EventList extends LitElement {
  static styles = css`
    :host { display: block; }
    .toolbar { display: flex; gap: 6px; align-items: center; margin-bottom: 8px; }
    input, button { padding: 6px 8px; border-radius: 8px; border: 1px solid #2a2a30; background: #0b0b0c; color: inherit; font: inherit; }
    button { cursor: pointer; background: #1b1b1f; }
    ul { list-style: none; margin: 0; padding: 0; }
    li { padding: 8px; border: 1px solid #1f1f22; border-radius: 8px; margin-bottom: 6px; background: #0f0f12; display: grid; grid-template-columns: 1fr auto; gap: 6px; align-items: center; }
    li.sel { outline: 1px solid #3a7afe; }
    .title { font-weight: 600; font-size: 0.95rem; line-height: 1.2; }
    .meta { color: #a0a0a8; font-size: 0.82rem; }
    .actions { display: flex; gap: 4px; }
    .action { border: 1px solid #2a2a30; background: #151518; padding: 4px 6px; border-radius: 6px; cursor: pointer; font-size: 0.8rem; }
  `;

  static properties = {
    q: { state: true },
  };

  constructor() {
    super();
    this.ctrl = new EventController(this, {});
    this.q = "";
  }

  get _items() {
    const all = this.ctrl?.state?.items ?? [];
    const q = this.q.trim().toLowerCase();
    const filtered = q
      ? all.filter((ev) =>
          (ev.title || "").toLowerCase().includes(q) ||
          (ev.description || "").toLowerCase().includes(q)
        )
      : all;
    return [...filtered].sort((a, b) => (a.start ?? 0) - (b.start ?? 0) || (a.title || "").localeCompare(b.title || ""));
  }

  async _createQuick() {
    const title = prompt("New event title?");
    if (!title || !title.trim()) return;
    await this.ctrl.createOne({ title: title.trim(), start: Date.now() });
  }

  async _edit(ev) {
    const current = ev.title || "";
    const next = prompt("Edit title:", current);
    if (next != null && next !== current) {
      await this.ctrl.update(ev.id, { title: String(next).trim() });
    }
  }

  async _delete(ev) {
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
          (ev) => html`
            <li class=${ev.id === selectedId ? "sel" : ""}>
              <div @click=${() => this.ctrl.select(ev.id)} style="cursor: pointer;">
                <div class="title">${ev.title || "Untitled"}</div>
                <div class="meta">${fmtWhen(ev)}${ev.calendarId ? html` · <code>${ev.calendarId}</code>` : ""}</div>
              </div>
              <div class="actions">
                <button class="action" title="Edit" @click=${() => this._edit(ev)}>Edit</button>
                <button class="action" title="Delete" @click=${() => this._delete(ev)}>Del</button>
              </div>
            </li>`
        )}
      </ul>
    `;
  }
}

if (!customElements.get("event-list")) customElements.define("event-list", EventList);
