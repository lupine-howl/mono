import { LitElement, html, css } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { EventController } from "../shared/EventController.js";

function fmtDate(ms){ try{ return new Date(ms).toLocaleString(); }catch{ return String(ms); } }

class CalendarView extends LitElement {
  static styles = css`
    :host { display: block; }
    form, .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    input, textarea, button, select { padding: 8px 10px; border-radius: 10px; border: 1px solid #2a2a30; background: #0b0b0c; color: inherit; font: inherit; }
    button { cursor: pointer; background: #1b1b1f; }
    .list { margin: 10px 0; display: grid; gap: 6px; }
    .item { display: grid; grid-template-columns: 1fr auto; gap: 8px; padding: 10px; border: 1px solid #1f1f22; border-radius: 10px; background: #0f0f12; }
    .title { font-weight: 600; }
    .meta { font-size: 12px; opacity: 0.8; }
    .bulk { width: 100%; min-height: 80px; }
  `;
  static properties = {
    _draftTitle: { state: true },
    _draftStart: { state: true },
    _draftEnd: { state: true },
    _draftAllDay: { state: true },
    _draftDesc: { state: true },
    _draftLoc: { state: true },
    _bulkJson: { state: true },
    _calendarId: { state: true },
  };
  constructor(){
    super();
    this.ctrl = new EventController(this, {});
    this._draftTitle = "";
    this._draftStart = ""; // ISO string input
    this._draftEnd = "";
    this._draftAllDay = false;
    this._draftDesc = "";
    this._draftLoc = "";
    this._bulkJson = "";
    this._calendarId = "";
  }

  get _items(){
    const items = this.ctrl.state.items ?? [];
    return [...items].sort((a,b)=> (a.start||0) - (b.start||0));
  }

  render(){
    const disableAdd = !(this._draftTitle || "").trim() || !(this._draftStart || "").trim();
    return html`
      <form @submit=${(e)=>{ e.preventDefault(); this._addOne(); }}>
        <input placeholder="Title" .value=${this._draftTitle} @input=${e=>this._draftTitle=e.target.value} />
        <input type="datetime-local" .value=${this._draftStart} @input=${e=>this._draftStart=e.target.value} />
        <input type="datetime-local" .value=${this._draftEnd} @input=${e=>this._draftEnd=e.target.value} />
        <label><input type="checkbox" .checked=${this._draftAllDay} @change=${e=>this._draftAllDay=e.target.checked} /> All day</label>
        <input placeholder="Location" .value=${this._draftLoc} @input=${e=>this._draftLoc=e.target.value} />
        <input placeholder="Calendar ID (optional)" .value=${this._calendarId} @input=${e=>this._calendarId=e.target.value} />
        <input placeholder="Description" .value=${this._draftDesc} @input=${e=>this._draftDesc=e.target.value} />
        <button ?disabled=${disableAdd}>Add event</button>
      </form>

      <details style="margin-top:10px;">
        <summary>Bulk add (paste JSON array of events)</summary>
        <textarea class="bulk" placeholder='[{"title":"Meeting","start":"2025-09-05T09:00"}]' .value=${this._bulkJson} @input=${e=>this._bulkJson=e.target.value}></textarea>
        <div class="row">
          <button @click=${this._addBulk}>Create events</button>
        </div>
      </details>

      <div class="list">
        ${repeat(this._items, it=>it.id, it=> html`
          <div class="item">
            <div>
              <div class="title">${it.title}</div>
              <div class="meta">${fmtDate(it.start)} ${it.end? html`– ${fmtDate(it.end)}`: ''} ${it.allDay? html`• All day`: ''} ${it.location? html`• ${it.location}`: ''}</div>
            </div>
            <div>
              <button title="Delete" @click=${()=>this.ctrl.remove(it.id)}>✕</button>
            </div>
          </div>
        `)}
      </div>
    `;
  }

  async _addOne(){
    await this.ctrl.createOne({
      title: this._draftTitle,
      start: this._draftStart,
      end: this._draftEnd || null,
      allDay: this._draftAllDay,
      description: this._draftDesc || null,
      location: this._draftLoc || null,
      calendarId: this._calendarId || null,
    });
    this._draftTitle = "";
    this._draftStart = "";
    this._draftEnd = "";
    this._draftAllDay = false;
    this._draftDesc = "";
    this._draftLoc = "";
  }

  async _addBulk(){
    try{
      const arr = JSON.parse(this._bulkJson || "[]");
      if (!Array.isArray(arr)) throw new Error("Bulk JSON must be an array");
      await this.ctrl.createMany(arr, { calendarId: this._calendarId || null });
      this._bulkJson = "";
    }catch(err){
      console.error(err);
      alert("Invalid JSON for bulk events");
    }
  }
}

if (!customElements.get("calendar-view"))
  customElements.define("calendar-view", CalendarView);
