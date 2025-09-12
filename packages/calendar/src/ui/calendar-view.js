import { LitElement, html, css } from "lit";
import { EventController } from "../shared/EventController.js";

// FullCalendar imports
import { Calendar } from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";

const FC_CSS = [
  "https://cdn.jsdelivr.net/npm/@fullcalendar/common@6.1.15/index.css",
  "https://cdn.jsdelivr.net/npm/@fullcalendar/daygrid@6.1.15/index.css",
  "https://cdn.jsdelivr.net/npm/@fullcalendar/timegrid@6.1.15/index.css",
  "https://cdn.jsdelivr.net/npm/@fullcalendar/list@6.1.15/index.css",
];

function ensureStyles(shadowRoot) {
  if (!shadowRoot) return;
  const marker = shadowRoot.querySelector("link[data-fc]");
  if (marker) return; // already added
  for (const href of FC_CSS) {
    const link = document.createElement("link");
    link.setAttribute("rel", "stylesheet");
    link.setAttribute("href", href);
    link.setAttribute("data-fc", "");
    shadowRoot.appendChild(link);
  }
}

function toISOms(ms) {
  if (ms == null) return null;
  try {
    return new Date(ms).toISOString();
  } catch {
    return null;
  }
}

function intersectsRange(ev, start, end) {
  const s = ev.start ?? 0;
  const e = ev.end ?? ev.start ?? 0;
  return s < end.getTime() && (e == null || e > start.getTime());
}

export class CalendarView extends LitElement {
  static styles = css`
    :host {
      display: block;
      min-height: 600px;
    }
    .toolbar {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-bottom: 8px;
      flex-wrap: wrap;
    }
    input,
    button,
    select {
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
    .cal {
      border: 1px solid #1f1f22;
      border-radius: 10px;
      overflow: hidden;
      background: #0f0f12;
    }
  `;

  static properties = {
    _calendarId: { state: true },
  };

  constructor() {
    super();
    this.ctrl = new EventController(this, {});
    this._calendarId = "";
    this._calendar = null;
    this._calEl = null;
  }

  firstUpdated() {
    ensureStyles(this.renderRoot);
    this._calEl = this.renderRoot?.querySelector("#cal");
    this._calendar = new Calendar(this._calEl, {
      plugins: [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin],
      initialView: "dayGridMonth",
      headerToolbar: {
        left: "prev,next today",
        center: "title",
        right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek",
      },
      navLinks: true,
      nowIndicator: true,
      selectable: true,
      selectMirror: true,
      editable: true,
      eventTimeFormat: { hour: "2-digit", minute: "2-digit", meridiem: false },
      events: (fetchInfo, successCallback, failureCallback) => {
        try {
          const items = (this.ctrl?.state?.items ?? [])
            .filter((ev) =>
              this._calendarId ? ev.calendarId === this._calendarId : true
            )
            .filter((ev) =>
              intersectsRange(ev, fetchInfo.start, fetchInfo.end)
            );
          const mapped = items.map((ev) => ({
            id: ev.id,
            title: ev.title ?? "Untitled",
            start: toISOms(ev.start),
            end: toISOms(ev.end),
            allDay: !!ev.allDay,
            color: ev.color || undefined,
            extendedProps: {
              description: ev.description ?? null,
              location: ev.location ?? null,
              calendarId: ev.calendarId ?? null,
            },
          }));
          successCallback(mapped);
        } catch (err) {
          failureCallback?.(err);
        }
      },
      select: async (info) => {
        const title = prompt("Event title?");
        if (title && title.trim()) {
          await this.ctrl.createOne({
            title: title.trim(),
            start: info.startStr,
            end: info.endStr,
            allDay: info.allDay,
            calendarId: this._calendarId || null,
          });
        }
        this._calendar.unselect();
      },
      eventDrop: async (info) => {
        await this._updateFromEvent(info.event);
      },
      eventResize: async (info) => {
        await this._updateFromEvent(info.event);
      },
      eventClick: async (info) => {
        const current = info.event.title || "";
        const next = prompt(
          "Edit title (leave unchanged or cancel to skip):",
          current
        );
        if (next != null && next !== current) {
          await this.ctrl.update(info.event.id, { title: String(next).trim() });
          return;
        }
        // optional delete
        if (confirm("Delete this event?")) {
          await this.ctrl.remove(info.event.id);
        }
      },
    });
    this._calendar.render();
  }

  disconnectedCallback() {
    super.disconnectedCallback?.();
    this._calendar?.destroy();
    this._calendar = null;
  }

  async _updateFromEvent(fcEvent) {
    const patch = {
      title: fcEvent.title ?? undefined,
      start: fcEvent.start ? fcEvent.start.getTime() : undefined,
      end: fcEvent.end ? fcEvent.end.getTime() : null,
      allDay: !!fcEvent.allDay,
      calendarId:
        (fcEvent.extendedProps?.calendarId ?? this._calendarId) || null,
      color: fcEvent.backgroundColor || fcEvent.borderColor || undefined,
    };
    await this.ctrl.update(fcEvent.id, patch);
  }

  updated(changed) {
    // whenever store or filter changes, refetch
    if (this._calendar) this._calendar.refetchEvents();
  }

  render() {
    return html`
      <div class="toolbar">
        <input
          placeholder="Filter by calendarId"
          .value=${this._calendarId}
          @input=${(e) => {
            this._calendarId = e.target.value;
            this.ctrl.list({ calendarId: this._calendarId || undefined });
          }}
        />
        <button
          @click=${() =>
            this.ctrl.list({ calendarId: this._calendarId || undefined })}
        >
          Reload
        </button>
      </div>
      <div id="cal" class="cal"></div>
    `;
  }
}

if (!customElements.get("calendar-view"))
  customElements.define("calendar-view", CalendarView);
