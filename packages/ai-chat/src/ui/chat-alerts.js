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
 * - Individual alerts are dismissible (×) and show a spinner if their group is waiting
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

    // Track dismissed alerts by id
    this._dismissed = new Set();
  }

  disconnectedCallback() {
    this._unsubscribe?.();
    super.disconnectedCallback();
  }

  static styles = css`
    /* Ensure padding/border don't cause overflow */
    :host,
    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }

    :host {
      display: grid;
      gap: 8px;
      align-content: end;
      overflow: auto;
      padding: 8px;
      background: rgba(100, 100, 100, 0.1); /* testing visibility */
      z-index: 1000;

      /* Fluid width up to a cap (defaults to 300px) */
      width: 100%;
      max-width: var(--alerts-max-width, var(--sidebar-width, 300px));

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
      position: relative;
      border-radius: 10px;
      padding: 8px 10px;
      border: 1px solid #1f1f22;
      background: #0f0f12;
      display: grid;
      gap: 6px;
      color: inherit;

      /* Prevent any child from forcing overflow */
      width: 100%;
      max-width: 100%;
      min-width: 0;
      overflow: hidden;
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

    .head {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0; /* allow children to shrink */
    }

    .title {
      font-size: 12px;
      font-weight: 600;
      opacity: 0.9;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
      flex: 1 1 auto; /* take remaining space and allow shrinking */
    }
    .body {
      font-size: 13px;
      opacity: 0.95;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
      /* break long unbroken strings/URLs */
      overflow-wrap: anywhere;
      word-break: break-word;
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

    .close {
      margin-left: auto;
      border: 1px solid #2a2a30;
      background: #151519;
      color: inherit;
      font: inherit;
      width: 22px;
      height: 22px;
      border-radius: 6px;
      cursor: pointer;
      line-height: 1;
      flex: 0 0 auto; /* don't shrink below its size */
    }

    /* Shimmer should respect container width */
    shimmer-effect {
      display: block;
      width: 100%;
      max-width: 100%;
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
      width: 100%;
      max-width: 100%;
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
        const waiting = children.some((c) => c?.kind === "tool_waiting");
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
        const shimmer = resp?.kind === "tool_waiting";
        alerts.push({
          id: m.id,
          level: "info",
          title,
          body,
          loading: waiting,
          shimmer,
        });
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
    const alerts = (this.alerts ?? this._deriveAlertsFromState()).filter(
      (a) => !this._dismissed.has(a?.id)
    );

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

    return html`${alerts.map((a, i) => this._renderAlert(a, i))}`;
  }

  _idForAlert(a, i) {
    return a?.id ?? `idx-${i}`;
  }

  _dismissAlert(id) {
    if (!id) return;
    this._dismissed.add(id);
    this.requestUpdate();
    this.dispatchEvent(
      new CustomEvent("alert-dismissed", {
        detail: { id },
        bubbles: true,
        composed: true,
      })
    );
  }

  _renderAlert(a = {}, i = 0) {
    const level = ["success", "warning", "error"].includes(a.level)
      ? a.level
      : "info";
    const id = this._idForAlert(a, i);
    const title = this._short(a.title || "", 80);
    const body = this._short(a.body || "", 200);
    const showSpinner = !!a.loading;
    const shimmerBody = !!a.shimmer && !!body;

    return html`
      <div class="alert ${level}" data-id=${id} aria-live="polite">
        <div class="head">
          ${showSpinner
            ? html`<div class="spinner" aria-label="Loading"></div>`
            : null}
          ${title
            ? html`<div class="title" title=${title}>${title}</div>`
            : null}
          <button
            class="close"
            title="Dismiss"
            @click=${() => this._dismissAlert(id)}
          >
            ×
          </button>
        </div>
        ${body
          ? shimmerBody
            ? html`<shimmer-effect
                ><div class="body">${body}</div></shimmer-effect
              >`
            : html`<div class="body">${body}</div>`
          : null}
      </div>
    `;
  }
}

if (!customElements.get("chat-alerts")) {
  customElements.define("chat-alerts", ChatAlerts);
}
