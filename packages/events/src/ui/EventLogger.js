// src/ui/event-logger.js
import { LitElement, html, css } from "lit";
import { createEventsClient } from "@loki/events/util";

const MAX_EVENTS = 500;

export class EventLoggerComponent extends LitElement {
  static styles = css`
    :host {
      display: block;
      color: #e7e7ea;
      font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .toolbar {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
      margin-bottom: 10px;
    }
    .toolbar .spacer {
      flex: 1 1 auto;
    }
    select,
    input {
      padding: 6px 10px;
      border-radius: 8px;
      border: 1px solid #2a2a30;
      background: #0b0b0c;
      color: inherit;
      font: inherit;
    }
    button {
      background: #0f0f12;
      border: 1px solid #2a2a30;
      color: #e7e7ea;
      padding: 6px 10px;
      border-radius: 8px;
      cursor: pointer;
    }
    button:hover {
      background: #131317;
    }
    .feed {
      display: grid;
      gap: 8px;
      max-height: 460px;
      overflow: auto;
      background: #0b0b0c;
      border: 1px solid #1f1f22;
      border-radius: 12px;
      padding: 10px;
    }
    .row {
      display: grid;
      gap: 6px;
      border: 1px solid #1f1f22;
      border-radius: 8px;
      padding: 8px;
      background: #111214;
    }
    .meta {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 2px 8px;
      border-radius: 999px;
      background: #131317;
      border: 1px solid #1f1f22;
      white-space: nowrap;
      font-size: 12px;
    }
    .ts {
      color: #9aa3b2;
      font-size: 12px;
    }
    pre {
      margin: 0;
      padding: 8px;
      background: #0b0b0c;
      border: 1px solid #1f1f22;
      border-radius: 6px;
      overflow: auto;
    }
    .empty {
      color: #9aa3b2;
      padding: 12px;
      text-align: center;
    }
  `;

  static properties = {
    _events: { state: true },
    _filterType: { state: true },
    _filterTool: { state: true },
    _filterRun: { state: true },
    _autoScroll: { state: true },
  };

  constructor() {
    super();
    this._events = [];
    this._filterType = "all";
    this._filterTool = "";
    this._filterRun = "";
    this._autoScroll = true;

    this._ev = null;
    this._off = [];
  }

  connectedCallback() {
    super.connectedCallback();
    try {
      this._ev = createEventsClient(); // hooks to SSE + local bus
      this._subscribeAll();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[event-logger] events client not available:", e);
    }
  }

  disconnectedCallback() {
    this._off.forEach((off) => {
      try {
        off && off();
      } catch {}
    });
    this._off = [];
    super.disconnectedCallback();
  }

  _subscribe(type, handler) {
    try {
      const off = this._ev.on(type, handler);
      this._off.push(off);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[event-logger] subscribe failed:", type, e);
    }
  }

  _subscribeAll() {
    // UI + plan/runner types we emit from the registry/runner bridge
    const types = [
      // ui stream
      "ui:loading",
      "ui:update",
      // plan step lifecycle
      "step:start",
      "step:result",
      "step:skip",
      "step:output:start",
      "step:output:result",
      "plan:pause",
      "branch:enter",
      "branch:exit",
      // run lifecycle (from emitRun)
      "run:started",
      "run:finished",
      "run:error",
    ];

    types.forEach((t) => this._subscribe(t, (ev) => this.#pushEvent(t, ev)));
  }

  #pushEvent(type, ev) {
    const now = ev?.ts || Date.now();
    const item = {
      ts: now,
      iso: new Date(now).toISOString(),
      type,
      // common envelope pieces per your registry:
      channel: ev?.channel || (type.startsWith("run:") ? "run" : "ui"),
      name: ev?.name || ev?.meta?.tool || "",
      runId: ev?.runId || ev?.payload?.runId || "",
      meta: ev?.meta || {},
      payload: ev?.payload ?? null,
    };

    // Prepend newest
    const next = [item, ...this._events];
    if (next.length > MAX_EVENTS) next.length = MAX_EVENTS;
    this._events = next;

    // Optional console trace for debugging
    try {
      // eslint-disable-next-line no-console
      console.debug("[bus]", item.type, {
        name: item.name,
        runId: item.runId,
        meta: item.meta,
        payload: item.payload,
      });
    } catch {}
  }

  updated(changed) {
    if (
      this._autoScroll &&
      (changed.has("_events") ||
        changed.has("_filterType") ||
        changed.has("_filterTool") ||
        changed.has("_filterRun"))
    ) {
      const feed = this.renderRoot?.querySelector?.(".feed");
      if (feed) feed.scrollTop = 0; // newest at top
    }
  }

  #filtered() {
    return this._events.filter((e) => {
      if (this._filterType !== "all" && e.type !== this._filterType)
        return false;
      if (this._filterTool && e.name !== this._filterTool) return false;
      if (this._filterRun && e.runId !== this._filterRun) return false;
      return true;
    });
  }

  #typesSeen() {
    const s = new Set(this._events.map((e) => e.type));
    return ["all", ...Array.from(s).sort()];
  }

  render() {
    const rows = this.#filtered();

    return html`
      <div class="toolbar">
        <label
          >Type
          <select
            .value=${this._filterType}
            @change=${(e) => (this._filterType = e.target.value)}
          >
            ${this.#typesSeen().map(
              (t) => html`<option value=${t}>${t}</option>`
            )}
          </select>
        </label>
        <label
          >Tool
          <input
            placeholder="(any)"
            .value=${this._filterTool}
            @input=${(e) => (this._filterTool = e.target.value.trim())}
          />
        </label>
        <label
          >Run ID
          <input
            placeholder="(any)"
            .value=${this._filterRun}
            @input=${(e) => (this._filterRun = e.target.value.trim())}
          />
        </label>

        <div class="spacer"></div>

        <label style="display:flex; align-items:center; gap:6px;">
          <input
            type="checkbox"
            .checked=${this._autoScroll}
            @change=${(e) => (this._autoScroll = !!e.target.checked)}
          />
          Auto-scroll
        </label>
        <button @click=${() => (this._events = [])}>Clear</button>
      </div>

      <div class="feed">
        ${rows.length === 0
          ? html`<div class="empty">No events yet.</div>`
          : rows.map(
              (e) => html`
                <div class="row">
                  <div class="meta">
                    <span class="pill">${e.type}</span>
                    ${e.name
                      ? html`<span class="pill">tool: ${e.name}</span>`
                      : null}
                    ${e.runId
                      ? html`<span class="pill">run: ${e.runId}</span>`
                      : null}
                    ${e.channel
                      ? html`<span class="pill">ch: ${e.channel}</span>`
                      : null}
                    ${typeof e.meta?.index === "number"
                      ? html`<span class="pill">step# ${e.meta.index}</span>`
                      : null}
                    ${e.meta?.phase
                      ? html`<span class="pill">phase: ${e.meta.phase}</span>`
                      : null}
                    <span class="ts">${e.iso}</span>
                  </div>
                  ${e.payload != null
                    ? html`<pre>${safeStringify(e.payload)}</pre>`
                    : html`<pre>(no payload)</pre>`}
                </div>
              `
            )}
      </div>
    `;
  }
}

// Safe, pretty JSON without throwing on cycles
function safeStringify(v) {
  try {
    return JSON.stringify(v, replacer(), 2);
  } catch {
    return String(v);
  }
}
function replacer() {
  const seen = new WeakSet();
  return (_k, val) => {
    if (typeof val === "object" && val !== null) {
      if (seen.has(val)) return "[[Circular]]";
      seen.add(val);
    }
    return val;
  };
}

if (!customElements.get("event-logger"))
  customElements.define("event-logger", EventLoggerComponent);

export const EventLogger = {
  render: (props) => html`<event-logger ...=${props}></event-logger>`,
};
