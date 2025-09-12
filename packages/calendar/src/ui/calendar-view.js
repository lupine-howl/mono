import { LitElement, html, css } from "lit";
import { EventController } from "../shared/EventController.js";
import { TabController } from "@loki/layout/util";

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

function startOfDay(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function startOfWeek(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - day);
  return d.getTime();
}
function addDays(ms, n) {
  return ms + n * 86400000;
}
function addWeeks(ms, n) {
  return ms + n * 7 * 86400000;
}
function addMonths(ms, n) {
  const d = new Date(ms);
  const day = d.getDate();
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  if (day > lastDay) return null; // month has no such day
  d.setDate(day);
  return d.getTime()
}

function intersectsRange(ev, start, end) {
  const s = ev.start ?? 0;
  const e = ev.end ?? ev.start ?? 0;
  return s < end.getTime() && (e == null || e > start.getTime());
}

function expandRecurrence(ev, rangeStart, rangeEnd) {
  const r = ev.recurrence;
  if (!r || !r.freq) return [];
  const results = [];
  const baseStart = ev.start;
  const baseEnd = ev.end ?? ev.start;
  const duration = (baseEnd ?? baseStart) - baseStart;
  const until = Number.isFinite(r.until) ? r.until : Infinity;
  let remaining = Number.isFinite(r.count) ? r.count : Infinity;

  const rangeStartMs = rangeStart.getTime();
  const rangeEndMs = rangeEnd.getTime();

  // Keep the time-of-day from base
  const baseTime = new Date(baseStart);
  const hours = baseTime.getHours();
  const minutes = baseTime.getMinutes();
  const seconds = baseTime.getSeconds();
  const ms = baseTime.getMilliseconds();

  function makeOccurrence(baseDateMs) {
    const d = new Date(baseDateMs);
    d.setHours(hours, minutes, seconds, ms);
    const startMs = d.getTime();
    if (startMs < Math.max(rangeStartMs, baseStart)) return null;
    if (startMs > until) return null;
    if (startMs >= rangeEndMs) return null;
    const endMs = ev.end == null ? null : startMs + duration;
    return { start: startMs, end: endMs };
  }

  const interval = Math.max(1, Number(r.interval) || 1);

  if (r.freq === "daily") {
    const baseDay = startOfDay(baseStart);
    const target = Math.max(rangeStartMs, baseStart);
    let daysDiff = Math.floor((startOfDay(target) - baseDay) / 86400000);
    const mod = daysDiff % interval;
    if (mod !== 0) daysDiff += interval - mod;
    let curDay = addDays(baseDay, daysDiff);
    while (remaining > 0 && curDay < rangeEndMs && curDay <= until) {
      const occ = makeOccurrence(curDay);
      if (occ) {
        results.push(occ);
        remaining--;
      }
      curDay = addDays(curDay, interval);
    }
  } else if (r.freq === "weekly") {
    const by = (r.byWeekday && r.byWeekday.length ? r.byWeekday : [new Date(baseStart).getDay()]).sort((a,b)=>a-b);
    const baseW = startOfWeek(baseStart);
    const targetW = startOfWeek(Math.max(rangeStartMs, baseStart));
    let weekDiff = Math.round((targetW - baseW) / (7 * 86400000));
    const mod = weekDiff % interval;
    if (mod !== 0) weekDiff += interval - mod;
    let curW = addWeeks(baseW, weekDiff);
    while (remaining > 0 && curW < rangeEndMs) {
      for (const d of by) {
        if (remaining <= 0) break;
        const dayMs = addDays(curW, d);
        const occ = makeOccurrence(dayMs);
        if (occ) {
          results.push(occ);
          remaining--;
        }
      }
      curW = addWeeks(curW, interval);
      if (curW > until) break;
    }
  } else if (r.freq === "monthly") {
    const startMonthAnchor = new Date(baseStart);
    startMonthAnchor.setHours(0,0,0,0);
    const baseMonth = startMonthAnchor.getFullYear() * 12 + startMonthAnchor.getMonth();
    const t = new Date(Math.max(rangeStartMs, baseStart));
    t.setHours(0,0,0,0);
    let targetMonth = t.getFullYear() * 12 + t.getMonth();
    let monthDiff = targetMonth - baseMonth;
    const mod = monthDiff % interval;
    if (mod !== 0) monthDiff += interval - mod;
    let curMonthAnchor = addMonths(startMonthAnchor.getTime(), monthDiff);
    while (remaining > 0 && curMonthAnchor != null && curMonthAnchor < rangeEndMs) {
      const occ = makeOccurrence(curMonthAnchor);
      if (occ) {
        results.push(occ);
        remaining--;
      }
      const next = addMonths(curMonthAnchor, interval);
      if (next == null || next > until) break;
      curMonthAnchor = next;
    }
  }

  return results;
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
    this.tabController = new TabController();
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
          const raw = (this.ctrl?.state?.items ?? []).filter((ev) =>
            this._calendarId ? ev.calendarId === this._calendarId : true
          );

          const expanded = [];
          for (const ev of raw) {
            if (ev.recurrence && ev.recurrence.freq) {
              const occs = expandRecurrence(ev, fetchInfo.start, fetchInfo.end);
              for (const occ of occs) {
                expanded.push({
                  id: `${ev.id}__occ__${occ.start}`,
                  title: ev.title ?? "Untitled",
                  start: toISOms(occ.start),
                  end: toISOms(occ.end),
                  allDay: !!ev.allDay,
                  color: ev.color || undefined,
                  editable: false,
                  startEditable: false,
                  durationEditable: false,
                  extendedProps: {
                    originalId: ev.id,
                    recurring: true,
                    description: ev.description ?? null,
                    location: ev.location ?? null,
                    calendarId: ev.calendarId ?? null,
                  },
                });
              }
            } else if (intersectsRange(ev, fetchInfo.start, fetchInfo.end)) {
              expanded.push({
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
              });
            }
          }

          successCallback(expanded);
        } catch (err) {
          console.error(err);
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
        if (info.event.extendedProps?.recurring) {
          // Don't allow drag/drop edits for generated recurrences
          info.revert();
          this.ctrl.select(info.event.extendedProps?.originalId);
          this.tabController.setActive("calendar:event-view");
          return;
        }
        await this._updateFromEvent(info.event);
      },
      eventResize: async (info) => {
        if (info.event.extendedProps?.recurring) {
          info.revert();
          this.ctrl.select(info.event.extendedProps?.originalId);
          this.tabController.setActive("calendar:event-view");
          return;
        }
        await this._updateFromEvent(info.event);
      },
      eventClick: async (info) => {
        const id = info.event.extendedProps?.originalId ?? info.event.id;
        this.ctrl.select(id);
        this.tabController.setActive("calendar:event-view");
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
