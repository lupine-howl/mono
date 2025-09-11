import { LitElement, html, css } from "lit";
import "@loki/layout/ui/shimmer-effect.js";
import { AIChatController } from "../shared/AIChatController.js";

/**
 * <chat-alerts>
 * Fixed right overlay panel that shows compact alerts.
 * - Width matches left sidebar via --sidebar-width, default 300px
 * - Sits above the composer via --composer-height (or --alerts-bottom)
 * - Accepts alerts=[], or derives compact alerts from the current chat state
 * - Supports a loading state with shimmer and an optional spinner
 */
export class ChatAlerts extends LitElement {
  static properties = {
    alerts: { type: Array },
    loading: { type: Boolean },
    maxItems: { type: Number },
  };

  constructor() {
    super();
    this.alerts = undefined; // If undefined, we derive from controller
    this.loading = false;
    this.maxItems = 6;

    this._controller = new AIChatController();
    this._state = this._controller.get?.() ?? {};
    this._unsubscribe = this._controller.subscribe?.((st) => {
      this._state = st;
      // only re-render if using derived alerts
      if (this.alerts === undefined) this.requestUpdate();
    });
  }

  disconnectedCallback() {
    this._unsubscribe?.();
    super.disconnectedCallback();
  }

  static styles = css`
    :host {
      display: grid;
      gap: 8px;
      align-content: end;
      overflow: auto;
      scrollbar-width: thin;
      scrollbar-color: #444 #0b0b0c;
    }

    :host::-webkit-scrollbar {
      width: 8px;
    }
    :host::-webkit-scrollbar-track {
      background: #0b0b0c;
    }
    :host::-webkit-scrollbar-thumb {
      background: #444;
      border-radius: 4px;
    }

    .alert {
      border-radius: 10px;
      padding: 8px 10px;
      border: 1px solid #1f1f22;
      background: #0f0f12;
      display: grid;
      gap: 6px;
      color: inherit;
    }

    /* Levels (typical alert look) */
    .info {
      border-color: #204060;
      background: #0e1a24;
    }
    .success {
      border-color: #1d4d2b;
      background: #0e1b14;
    }
    .warning {
      border-color: #5a4b16;
      background: #1b160b;
    }
    .error {
      border-color: #5a1a1a;
      background: #1b0e0e;
    }

    .title {
      font-size: 12px;
      opacity: 0.85;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .body {
      font-size: 13px;
      opacity: 0.95;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .spinner {
      width: 14px;
      height: 14px;
      border: 2px solid #8a8a8f;
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.9s linear infinite;
      flex: 0 0 auto;
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }

    .skeleton {
      position: relative;
      overflow: hidden;
    }
    .skeleton .shim {
      display: block;
      height: 42px;
      border-radius: 8px;
      overflow: hidden;
    }
    .skeleton .spinWrap {
      position: absolute;
      top: 6px;
      right: 8px;
    }
  `;

  // Build compact alerts from chat state, if no alerts prop is supplied
  _deriveAlertsFromState() {
    const msgs = Array.isArray(this._state?.messages)
      ? this._state.messages
      : [];
    if (!msgs.length) return [];

    // Index children by parentId
    const byParent = new Map();
    for (const m of msgs) {
      if (m.parentId) {
        if (!byParent.has(m.parentId)) byParent.set(m.parentId, []);
        byParent.get(m.parentId).push(m);
      }
    }

    const alerts = [];
    for (const m of msgs) {
      if (m.role === "user" && (m.parentId == null || m.parentId === "")) {
        const children = (byParent.get(m.id) || []).filter(Boolean);
        // Prefer the last assistant-like child for the body
        const resp = [...children]
          .reverse()
          .find(
            (c) =>
              c.role === "assistant" ||
              c.kind === "tool_result" ||
              c.kind === "tool_waiting"
          );
        const title = this._short(m.content, 80);
        const body = this._short(resp?.content ?? "", 160);
        alerts.push({ id: m.id, level: "info", title, body });
      }
    }

    // Most recent first
    alerts.reverse();
    return alerts.slice(0, this.maxItems);
  }

  _short(text, n) {
    if (!text) return "";
    const s = String(text).trim();
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }

  render() {
    const alerts = this.alerts ?? this._deriveAlertsFromState();

    // Loading state: shimmer blocks + optional spinners
    if (this.loading) {
      return html`
        <div class="alert skeleton info">
          <shimmer-effect class="shim"></shimmer-effect>
          <div class="spinWrap">
            <div class="spinner" aria-hidden="true"></div>
          </div>
        </div>
        <div class="alert skeleton info">
          <shimmer-effect class="shim"></shimmer-effect>
          <div class="spinWrap">
            <div class="spinner" aria-hidden="true"></div>
          </div>
        </div>
      `;
    }

    if (!alerts?.length) return html``;

    return html` ${alerts.map((a) => this._renderAlert(a))} `;
  }

  _renderAlert(a = {}) {
    const level = ["success", "warning", "error"].includes(a.level)
      ? a.level
      : "info";
    const title = this._short(a.title || "", 80);
    const body = this._short(a.body || "", 200);
    return html`
      <div class="alert ${level}">
        ${title ? html`<div class="title" title=${title}>${title}</div>` : null}
        ${body ? html`<div class="body">${body}</div>` : null}
      </div>
    `;
  }
}

if (!customElements.get("chat-alerts")) {
  customElements.define("chat-alerts", ChatAlerts);
}
