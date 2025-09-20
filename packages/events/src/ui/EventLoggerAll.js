// src/ui/event-logger.js
import { LitElement, html, css } from "lit";
import { createEventsClient, getGlobalEventBus } from "@loki/events/util";

const MAX_EVENTS = 1000;

export class EventLoggerAllComponent extends LitElement {
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
    input,
    select {
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
      background: #0b0b0c;
      border: 1px solid #1f1f22;
      border-radius: 12px;
      padding: 10px;
      max-height: 60vh;
      overflow: auto;
      display: grid;
      gap: 8px;
    }
    .row {
      background: #111214;
      border: 1px solid #1f1f22;
      border-radius: 8px;
      padding: 8px;
      display: grid;
      gap: 6px;
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
      text-align: center;
      padding: 12px;
    }
  `;

  static properties = {
    _events: { state: true },
    _q: { state: true },
    _autoScroll: { state: true },
  };

  constructor() {
    super();
    this._events = [];
    this._q = "";
    this._autoScroll = true;

    this._bus = null;
    this._off = null;
    this._evClient = null; // keep SSE alive
  }

  connectedCallback() {
    super.connectedCallback();
    // 1) Ensure SSE client is connected (this forwards to the global bus)
    try {
      this._evClient = createEventsClient();
    } catch {}
    // 2) Subscribe to ALL events on the global bus
    try {
      this._bus = getGlobalEventBus();
      // The bus.on(fn) variant receives EVERY event object
      this._off = this._bus.onAny((evt) => this.#push(evt));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[event-logger] Failed to hook global bus:", e);
    }
  }

  disconnectedCallback() {
    try {
      this._off && this._off();
    } catch {}
    this._off = null;
    this._bus = null;
    this._evClient = null;
    super.disconnectedCallback();
  }

  #push(evt) {
    // Normalise but keep the raw payload
    const ts = evt?.ts || Date.now();
    const item = {
      ts,
      iso: new Date(ts).toISOString(),
      channel: evt?.channel || "(unknown)",
      type: evt?.type || "(no type)",
      name: evt?.name || evt?.tool || evt?.meta?.tool || "",
      runId: evt?.runId || evt?.payload?.runId || "",
      meta: evt?.meta ?? null,
      payload: evt?.payload ?? null,
      raw: evt,
    };
    const next = [item, ...this._events];
    if (next.length > MAX_EVENTS) next.length = MAX_EVENTS;
    this._events = next;

    // Optional console trace
    try {
      console.debug("[bus]", item.type, item);
    } catch {}
  }

  updated(changed) {
    if (this._autoScroll && changed.has("_events")) {
      const feed = this.renderRoot?.querySelector?.(".feed");
      if (feed) feed.scrollTop = 0; // newest at top
    }
  }

  #filtered() {
    const q = (this._q || "").toLowerCase();
    if (!q) return this._events;
    return this._events.filter((e) => {
      const hay = `${e.channel} ${e.type} ${e.name} ${e.runId} ${safeString(
        e.meta
      )} ${safeString(e.payload)}`.toLowerCase();
      return hay.includes(q);
    });
  }

  render() {
    const rows = this.#filtered();
    return html`
      <div class="toolbar">
        <input
          placeholder="Filter (matches channel/type/runId/tool/payload)…"
          .value=${this._q}
          @input=${(e) => (this._q = e.target.value)}
        />
        <div class="spacer"></div>
        <label style="display:flex;align-items:center;gap:6px;">
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
                    <span class="pill">ch: ${e.channel}</span>
                    <span class="pill">type: ${e.type}</span>
                    ${e.name
                      ? html`<span class="pill">tool: ${e.name}</span>`
                      : null}
                    ${e.runId
                      ? html`<span class="pill">run: ${e.runId}</span>`
                      : null}
                    <span class="ts">${e.iso}</span>
                  </div>
                  <pre>${pretty(e.raw)}</pre>
                </div>
              `
            )}
      </div>
    `;
  }
}

function pretty(v) {
  try {
    return JSON.stringify(v, replacer(), 2);
  } catch {
    return String(v);
  }
}
function safeString(v) {
  try {
    return JSON.stringify(v);
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

if (!customElements.get("event-logger-all")) {
  customElements.define("event-logger-all", EventLoggerAllComponent);
}

export const EventLoggerAll = {
  render: (props) => html`<event-logger-all ...=${props}></event-logger-all>`,
};
