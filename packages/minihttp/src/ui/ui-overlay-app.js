// src/ui/ui-overlay.js
import { LitElement, html, css } from "lit";
import { createEventsClient, getGlobalEventBus } from "@loki/events/util";
import "./ui-schema-form.js"; // <-- import the form component
import "./ui-choice.js"; // <-- import the choice component

const MAX_LOG = 200;

export class UiOverlayApp extends LitElement {
  static styles = css`
    :host {
      display: contents;
    }
    .overlay {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      background: radial-gradient(
        1200px 800px at 50% 30%,
        #131317 10%,
        #0b0b0c 65%
      );
      color: #e9eaed;
      font: 18px/1.4 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Inter,
        Roboto, Arial;
      display: none;
    }
    .overlay[open] {
      display: grid;
      place-items: center;
      animation: fadeIn 0.15s ease-out;
    }
    @keyframes fadeIn {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }

    .chrome {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    .close {
      position: absolute;
      top: 18px;
      right: 18px;
      pointer-events: auto;
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: #15161a;
      border: 1px solid #272830;
      color: #e9eaed;
      display: grid;
      place-items: center;
      cursor: pointer;
      transition: background 0.15s ease, transform 0.06s ease;
      font-size: 20px;
      line-height: 1;
    }
    .close:hover {
      background: #1b1c21;
    }
    .close:active {
      transform: scale(0.98);
    }

    .shell {
      width: min(1000px, 92vw);
      min-height: 280px;
      margin: 6vh auto 10vh;
      background: rgba(19, 19, 23, 0.7);
      backdrop-filter: blur(6px);
      border: 1px solid #292a32;
      border-radius: 18px;
      box-shadow: 0 30px 80px rgba(0, 0, 0, 0.45);
      padding: 28px 28px 22px;
      display: grid;
      grid-template-rows: auto 1fr;
      gap: 16px;
      pointer-events: auto;
    }
    .title {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
    }
    .title h1 {
      margin: 0;
      font-weight: 700;
      letter-spacing: 0.2px;
      font-size: clamp(22px, 2.5vw, 28px);
    }
    .hint {
      color: #9aa3b2;
      font-size: 13px;
    }

    .body {
      display: grid;
      align-content: start;
      padding: 8px;
      border-radius: 12px;
      background: #0f1014;
      border: 1px solid #24252c;
      min-height: 220px;
      gap: 12px;
    }

    /* Loading */
    .loading {
      display: grid;
      place-items: center;
      gap: 10px;
      padding: 40px 10px;
    }
    .spinner {
      width: 48px;
      height: 48px;
      border: 3px solid #2a2a30;
      border-top-color: #e7e7ea;
      border-radius: 50%;
      animation: spin 0.9s linear infinite;
      display: inline-block;
    }
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }

    /* Debug log */
    .log {
      max-height: 30vh;
      overflow: auto;
      width: 100%;
    }
    .event {
      margin: 10px auto;
      width: min(840px, 86%);
      background: #111216;
      border: 1px solid #272830;
      border-radius: 12px;
      padding: 14px;
    }
    .meta {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
      margin-bottom: 8px;
      font-size: 12px;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 2px 10px;
      border-radius: 999px;
      background: #16171c;
      border: 1px solid #2a2b35;
      white-space: nowrap;
    }
    pre {
      margin: 0;
      padding: 10px;
      background: #0b0c10;
      border: 1px solid #23242c;
      border-radius: 8px;
      color: #dfe1e6;
      font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      overflow: auto;
    }
    .empty {
      opacity: 0.75;
      text-align: center;
      font-size: clamp(18px, 2.4vw, 22px);
      padding: 20px 0;
    }
  `;

  static properties = {
    open: { type: Boolean, reflect: true },

    // current "view" pushed by the plan: { ui: { kind, title, ... }, data: {...} }
    _view: { state: true },

    // last tool & run for resume
    _tool: { state: true },
    _runId: { state: true },

    // debug log
    _log: { state: true },

    // optional filters
    filterTool: { type: String, attribute: "filter-tool" },
    filterRun: { type: String, attribute: "filter-run" },
  };

  constructor() {
    super();
    this.open = false;
    this._view = null;
    this._tool = "";
    this._runId = "";
    this._log = [];
    this.filterTool = "";
    this.filterRun = "";

    this._bus = null;
    this._off = null;
    this._evClient = null;
    this._onKey = (e) => {
      if (e.key === "Escape" && this.open) this.#close();
    };
  }

  connectedCallback() {
    super.connectedCallback();
    try {
      this._evClient = createEventsClient();
    } catch {}
    try {
      this._bus = getGlobalEventBus();
      this._off = this._bus.on((evt) => this.#handleEvent(evt));
    } catch (e) {
      console.warn("[ui-overlay] failed to connect bus:", e);
    }
    window.addEventListener("keydown", this._onKey);
  }

  disconnectedCallback() {
    try {
      this._off && this._off();
    } catch {}
    this._off = null;
    this._bus = null;
    this._evClient = null;
    window.removeEventListener("keydown", this._onKey);
    super.disconnectedCallback();
  }

  // ---------- event handling ----------
  #matches(evt) {
    const tool = evt.name || evt.tool || evt?.meta?.tool || evt?.payload?.tool;
    const run = evt.runId || evt?.payload?.runId || evt?.meta?.runId;
    if (this.filterTool && tool !== this.filterTool) return false;
    if (this.filterRun && run !== this.filterRun) return false;
    return true;
  }

  #handleEvent(evt) {
    //console.log(evt);
    if (!evt?.type?.startsWith?.("ui:")) return;
    if (!this.#matches(evt)) return;

    const tool = evt.name || evt.tool || evt?.payload?.tool || this._tool || "";
    const runId = evt.runId || evt?.payload?.runId || this._runId || "";

    // The plan sends { payload: { view } } for open/update/loading
    const view =
      evt?.payload?.view || evt?.payload?.ui
        ? { ui: evt.payload.ui, data: evt.payload.data }
        : null;

    if (evt.type === "ui:open") {
      this.open = true;
      this._log = [];
      this._tool = tool;
      this._runId = runId;
      if (view) this._view = view;
      this.#push(evt);
      return;
    }

    if (evt.type === "ui:update" || evt.type === "ui:loading") {
      this._tool = tool;
      this._runId = runId;
      if (view) this._view = view;
      this.#push(evt);
      return;
    }

    if (evt.type === "ui:close") {
      this.#push(evt);
      this.#close();
      return;
    }

    // unknown ui:* → log only
    this.#push(evt);
  }

  #push(evt) {
    const ts = evt?.ts || Date.now();
    const item = {
      ts,
      iso: new Date(ts).toISOString(),
      type: evt?.type || "(ui)",
      channel: evt?.channel || "ui",
      name: evt?.name || evt?.tool || evt?.meta?.tool || "",
      runId: evt?.runId || evt?.payload?.runId || "",
      raw: evt,
    };
    const next = [item, ...this._log];
    if (next.length > MAX_LOG) next.length = MAX_LOG;
    this._log = next;
  }

  #close() {
    this.open = false;
    this._view = null;
    this.dispatchEvent(new CustomEvent("ui-overlay:closed"));
  }

  // ---------- emit resume ----------
  #emitUI(type, payload = {}, meta = {}) {
    // Prefer server ingest (SSE client) if present, else local bus
    try {
      this._bus.emit({
        ts: Date.now(),
        channel: "ui",
        type,
        payload,
        ...meta,
      });
    } catch (e) {
      console.warn("[ui-overlay] emit failed:", e);
    }
  }

  #resume(values) {
    const tool = this._tool;
    const runId = this._runId;
    this.#emitUI("ui:resume", { tool, runId, values });
  }

  // ---------- view rendering ----------
  _renderLoading(ui) {
    const title = ui?.title || "Loading…";
    const sub = ui?.subtitle || ui?.note || "";
    return html`
      <div class="loading" role="status" aria-live="polite" aria-busy="true">
        <span class="spinner" aria-hidden="true"></span>
        <div class="loading-title">${title}</div>
        ${sub ? html`<div class="hint">${sub}</div>` : null}
      </div>
    `;
  }

  _renderForm(view) {
    const form = view?.data?.form || {};
    const schema = form?.schema || {};
    const values = form?.values || {};
    return html`
      <ui-schema-form
        .schema=${schema}
        .values=${values}
        submit-label="Continue"
        @submit=${(e) => this.#resume(e.detail?.values || {})}
        @cancel=${() =>
          this.#emitUI("ui:close", { tool: this._tool, runId: this._runId })}
      ></ui-schema-form>
    `;
  }

  _renderView() {
    const v = this._view;
    if (!v) {
      return html`<div class="empty">Waiting for <b>ui:open</b>…</div>`;
    }
    const ui = v.ui || {};
    const title = ui.title || "Interactive UI";

    let body;
    switch (ui.kind) {
      case "loading":
        body = this._renderLoading(ui);
        break;
      case "form":
        body = this._renderForm(v);
        break;
      // future: "chat", "image", "table", "html", "code", …
      case "choice":
        const actions =
          Array.isArray(v?.ui?.actions) && v.ui.actions.length
            ? v.ui.actions
            : Array.isArray(v?.data?.options)
            ? v.data.options.map((opt, idx) => ({
                label: opt,
                args: { choice: opt, choiceIndex: idx },
              }))
            : [];

        body = html`
          <ui-choice
            .message=${v?.ui?.message ?? v?.data?.message ?? ""}
            .actions=${actions}
            @choose=${(e) => this.#resume(e.detail)}
          ></ui-choice>
        `;
        break;
      default:
        body = html`
          <div class="empty">
            Unsupported UI kind: <b>${String(ui.kind || "unknown")}</b>
          </div>
          <pre>${pretty(v)}</pre>
        `;
    }

    return html`
      <div class="title">
        <h1>${title}</h1>
        <div class="hint">
          Tool: ${this._tool || "?"}
          ${this._runId ? html`· Run: ${this._runId}` : ""}
        </div>
      </div>
      <div class="body">
        ${body}
        <!-- Debug log below main view -->
        ${this._log.length
          ? html`
              <div class="log" aria-live="polite">
                ${this._log.map(
                  (e) => html`
                    <div class="event">
                      <div class="meta">
                        <span class="pill">type: ${e.type}</span>
                        ${e.name
                          ? html`<span class="pill">tool: ${e.name}</span>`
                          : null}
                        ${e.runId
                          ? html`<span class="pill">run: ${e.runId}</span>`
                          : null}
                        <span class="pill">ts: ${e.iso}</span>
                      </div>
                      <pre>${pretty(e.raw)}</pre>
                    </div>
                  `
                )}
              </div>
            `
          : null}
      </div>
    `;
  }

  render() {
    return html`
      <div
        class="overlay"
        ?open=${this.open}
        @click=${(e) => {
          const t = e.composedPath()[0];
          const inShell = t.closest?.(".shell");
          const isClose = t.closest?.(".close");
          if (!inShell && !isClose) e.stopPropagation();
        }}
      >
        <div class="chrome">
          <button
            class="close"
            title="Close (Esc)"
            @click=${() => this.#close()}
          >
            ✕
          </button>
        </div>
        <div
          class="shell"
          role="dialog"
          aria-modal="true"
          aria-label="Interactive UI"
        >
          ${this._renderView()}
        </div>
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

if (!customElements.get("ui-overlay-app")) {
  customElements.define("ui-overlay-app", UiOverlayApp);
}

export const UiOverlay = {
  render: (props) => html`<ui-overlay-app ...=${props}></ui-overlay-app>`,
};
