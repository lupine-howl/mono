import { LitElement, html, css } from "lit";
import { EventController } from "../shared/EventController.js";
import { TabController } from "@loki/layout/util";

function toLocalISO(ms) {
  if (!ms) return "";
  try {
    const d = new Date(ms);
    const tzOff = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tzOff).toISOString().slice(0, 16);
  } catch {
    return "";
  }
}
function fromLocalISO(v) {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

export class EventViewer extends LitElement {
  static styles = css`
    :host {
      display: block;
    }
    .wrap {
      display: grid;
      gap: 12px;
    }
    .row {
      display: grid;
      gap: 8px;
    }
    .two {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    label {
      font-size: 0.85rem;
      color: #a0a0a8;
    }
    input,
    textarea,
    select,
    button {
      padding: 8px 10px;
      border-radius: 10px;
      border: 1px solid #2a2a30;
      background: #0b0b0c;
      color: inherit;
      font: inherit;
    }
    textarea {
      min-height: 90px;
      resize: vertical;
    }
    button {
      cursor: pointer;
      background: #1b1b1f;
    }
    .toolbar {
      display: flex;
      gap: 8px;
      align-items: center;
      justify-content: space-between;
    }
    .row-inline {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    fieldset {
      border: 1px solid #1f1f22;
      border-radius: 10px;
      padding: 8px 10px;
    }
    legend {
      padding: 0 6px;
      color: #a0a0a8;
      font-size: 0.85rem;
    }
    .wk {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .wk label {
      display: inline-flex;
      gap: 4px;
      align-items: center;
      background: #151518;
      padding: 4px 6px;
      border: 1px solid #2a2a30;
      border-radius: 8px;
    }
  `;

  static properties = {
    f: { state: true },
  };

  constructor() {
    super();
    this.ctrl = new EventController(this, {});
    this.tabController = new TabController();
    this.f = this._defaultForm();
    this._lastLoadedId = undefined;
    this._lastPersisted = null;
    this._debounce = null;
  }

  _defaultForm() {
    const now = Date.now();
    return {
      id: null,
      title: "",
      description: "",
      location: "",
      allDay: false,
      start: now,
      end: null,
      calendarId: "",
      color: "#1976d2",
      recurrence: null,
    };
  }

  updated() {
    const sel = this.ctrl.selected;
    const selId = sel?.id ?? null;
    if (selId !== this._lastLoadedId) {
      this._loadFromSelected(sel);
      this._lastLoadedId = selId;
    }
  }

  _loadFromSelected(sel) {
    if (!sel) {
      this.f = this._defaultForm();
      this._lastPersisted = null;
      clearTimeout(this._debounce);
      this._debounce = null;
      return;
    }
    this.f = {
      id: sel.id,
      title: sel.title || "",
      description: sel.description || "",
      location: sel.location || "",
      allDay: !!sel.allDay,
      start: sel.start ?? Date.now(),
      end: sel.end ?? null,
      calendarId: sel.calendarId || "",
      color: sel.color || "#1976d2",
      recurrence: sel.recurrence ?? null,
    };
    // Track the last persisted snapshot for diffing
    this._lastPersisted = { ...this.f };
    clearTimeout(this._debounce);
    this._debounce = null;
  }

  async _save() {
    const { id, ...rest } = this.f;
    const patch = {
      ...rest,
      start: this.f.start,
      end: this.f.end,
      calendarId: this.f.calendarId || null,
      color: this.f.color || null,
      recurrence: this._normalizeRecurrence(this.f.recurrence),
    };
    if (id) {
      await this.ctrl.update(id, patch);
      this._lastPersisted = { ...this.f, recurrence: patch.recurrence };
    } else {
      const newId = await this.ctrl.createOne({
        title: this.f.title || "Untitled",
        ...patch,
      });
      this.ctrl.select(newId);
    }
  }

  _normalizeRecurrence(r) {
    if (!r) return null;
    const freq = r.freq || "none";
    if (freq === "none") return null;
    const norm = { freq, interval: Math.max(1, Number(r.interval) || 1) };
    if (freq === "weekly")
      norm.byWeekday = (r.byWeekday || [])
        .map((n) => Number(n))
        .filter((n) => n >= 0 && n <= 6);
    if (r.endMode === "count") norm.count = Math.max(1, Number(r.count) || 1);
    if (r.endMode === "until") norm.until = r.until || null;
    return norm;
  }

  _set(path, value) {
    this.f = { ...this.f, [path]: value };
    this._queueAutoSave();
  }

  _setRecurrence(part, value) {
    const r = this.f.recurrence || { freq: "none", interval: 1 };
    const next = { ...r, [part]: value };
    this._set("recurrence", next);
  }

  _toggleWeekday(day) {
    const r = this.f.recurrence || {
      freq: "weekly",
      interval: 1,
      byWeekday: [],
    };
    const set = new Set(r.byWeekday || []);
    if (set.has(day)) set.delete(day);
    else set.add(day);
    this._setRecurrence(
      "byWeekday",
      Array.from(set).sort((a, b) => a - b)
    );
  }

  _queueAutoSave() {
    // Only autosave existing events; new events still use Save
    if (!this.f.id) return;
    clearTimeout(this._debounce);
    this._debounce = setTimeout(() => this._persistChanges(), 600);
  }

  async _persistChanges() {
    if (!this.f.id || !this._lastPersisted) return;
    const patch = {};
    const keys = [
      "title",
      "description",
      "location",
      "allDay",
      "start",
      "end",
      "calendarId",
      "color",
      "recurrence",
    ];
    const current = { ...this.f, recurrence: this._normalizeRecurrence(this.f.recurrence) };
    const previous = this._lastPersisted;

    for (const k of keys) {
      const a = current[k];
      const b = previous[k];
      const changed = k === "recurrence" ? JSON.stringify(a) !== JSON.stringify(b) : a !== b;
      if (changed) patch[k] = a;
    }
    if (Object.keys(patch).length === 0) return;
    try {
      await this.ctrl.update(this.f.id, patch);
      this._lastPersisted = { ...previous, ...patch };
    } catch (err) {
      console.error("Autosave failed", err);
    }
  }

  render() {
    const r = this.f.recurrence || { freq: "none", interval: 1 };
    const endMode =
      r.endMode || (r.until ? "until" : r.count ? "count" : "never");

    return html`
      <div class="toolbar">
        <div class="row-inline">
          <button
            @click=${() => {
              this.f = this._defaultForm();
              this._lastPersisted = null;
            }}
          >
            New
          </button>
          <button @click=${() => this._save()}>Save</button>
        </div>
        ${this.f.id
          ? html`<button
              @click=${async () => {
                if (confirm("Delete this event?")) {
                  await this.ctrl.remove(this.f.id);
                  this.f = this._defaultForm();
                  this._lastPersisted = null;
                  this.tabController.setActive("calendar:view");
                }
              }}
            >
              Delete
            </button>`
          : null}
      </div>

      <div class="wrap">
        <div class="row">
          <label>Title</label>
          <input
            .value=${this.f.title}
            @input=${(e) => this._set("title", e.target.value)}
            placeholder="Event title"
          />
        </div>

        <div class="row two">
          <div>
            <label>Starts</label>
            <input
              type="datetime-local"
              .value=${toLocalISO(this.f.start)}
              @input=${(e) => this._set("start", fromLocalISO(e.target.value))}
            />
          </div>
          <div>
            <label>Ends</label>
            <input
              type="datetime-local"
              .value=${toLocalISO(this.f.end)}
              @input=${(e) => this._set("end", fromLocalISO(e.target.value))}
            />
          </div>
        </div>

        <div class="row-inline">
          <label
            ><input
              type="checkbox"
              .checked=${this.f.allDay}
              @change=${(e) => this._set("allDay", e.target.checked)}
            />
            All day</label
          >
          <label>Calendar</label>
          <input
            style="max-width: 240px;"
            .value=${this.f.calendarId}
            @input=${(e) => this._set("calendarId", e.target.value)}
            placeholder="calendar id"
          />
          <label>Color</label>
          <input
            type="color"
            .value=${this.f.color || "#1976d2"}
            @input=${(e) => this._set("color", e.target.value)}
          />
        </div>

        <div class="row">
          <label>Location</label>
          <input
            .value=${this.f.location}
            @input=${(e) => this._set("location", e.target.value)}
            placeholder="Where"
          />
        </div>

        <div class="row">
          <label>Description</label>
          <textarea
            .value=${this.f.description}
            @input=${(e) => this._set("description", e.target.value)}
            placeholder="Details"
          ></textarea>
        </div>

        <fieldset>
          <legend>Recurrence</legend>
          <div class="row two">
            <div>
              <label>Frequency</label>
              <select
                .value=${r.freq}
                @change=${(e) => this._setRecurrence("freq", e.target.value)}
              >
                <option value="none">Does not repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div>
              <label>Interval</label>
              <input
                type="number"
                min="1"
                .value=${r.interval || 1}
                @input=${(e) =>
                  this._setRecurrence(
                    "interval",
                    Math.max(1, Number(e.target.value) || 1)
                  )}
              />
            </div>
          </div>

          ${r.freq === "weekly"
            ? html`
                <div class="row">
                  <label>Days of week</label>
                  <div class="wk">
                    ${[0, 1, 2, 3, 4, 5, 6].map(
                      (d) =>
                        html`<label
                          ><input
                            type="checkbox"
                            .checked=${(r.byWeekday || []).includes(d)}
                            @change=${() => this._toggleWeekday(d)}
                          />${["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"][
                            d
                          ]}</label
                        >`
                    )}
                  </div>
                </div>
              `
            : null}

          <div class="row two">
            <div>
              <label>Ends</label>
              <select
                .value=${endMode}
                @change=${(e) => this._setRecurrence("endMode", e.target.value)}
              >
                <option value="never">Never</option>
                <option value="count">After count</option>
                <option value="until">Until date</option>
              </select>
            </div>
            <div>
              ${endMode === "count"
                ? html`
                    <div>
                      <label>Count</label>
                      <input
                        type="number"
                        min="1"
                        .value=${r.count || 1}
                        @input=${(e) =>
                          this._setRecurrence(
                            "count",
                            Math.max(1, Number(e.target.value) || 1)
                          )}
                      />
                    </div>
                  `
                : endMode === "until"
                ? html`
                    <div>
                      <label>Until</label>
                      <input
                        type="date"
                        .value=${r.until
                          ? new Date(r.until).toISOString().slice(0, 10)
                          : ""}
                        @input=${(e) => {
                          const t = e.target.value
                            ? Date.parse(e.target.value + "T23:59:59")
                            : null;
                          this._setRecurrence(
                            "until",
                            Number.isFinite(t) ? t : null
                          );
                        }}
                      />
                    </div>
                  `
                : html`<div></div>`}
            </div>
          </div>
        </fieldset>
      </div>
    `;
  }
}

if (!customElements.get("event-viewer"))
  customElements.define("event-viewer", EventViewer);
