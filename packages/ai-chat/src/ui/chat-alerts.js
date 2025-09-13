import { LitElement, html, css } from "lit";
import "@loki/layout/ui/shimmer-effect.js";
import { AIChatController } from "../shared/AIChatController.js";

/**
 * <chat-alerts>
 * - spinner -> ✓ when loading finishes
 * - auto-dismiss 5s after completion, with fade-out
 * - NEW: on first load, dismiss all existing alerts so only new ones show
 */
export class ChatAlerts extends LitElement {
  static properties = {
    alerts: { type: Array },
    loading: { type: Boolean },
    maxItems: { type: Number },
  };

  constructor() {
    super();
    this.alerts = undefined;
    this.loading = false;
    this.maxItems = 6;

    this._controller = new AIChatController();
    this._state = this._controller.get?.() ?? {};
    this._unsubscribe = this._controller.subscribe?.((st) => {
      this._state = st;
      if (this.alerts === undefined) this.requestUpdate();
    });

    // Dismissed + state trackers
    this._dismissed = new Set();

    this._wasLoading = new Map(); // id -> previous loading
    this._completed = new Set(); // ids that just completed (show ✓)
    this._fadeOut = new Set(); // ids currently fading
    this._timers = new Map(); // id -> {hideTimer, fadeTimer}

    // New: only run the "dismiss everything current" once
    this._baselineDone = false;
  }

  disconnectedCallback() {
    this._unsubscribe?.();
    for (const { hideTimer, fadeTimer } of this._timers.values()) {
      if (hideTimer) clearTimeout(hideTimer);
      if (fadeTimer) clearTimeout(fadeTimer);
    }
    this._timers.clear();
    super.disconnectedCallback();
  }

  static styles = css`
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
      background: rgba(100, 100, 100, 0.1);
      z-index: 1000;
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
      width: 100%;
      max-width: 100%;
      min-width: 0;
      overflow: hidden;
      opacity: 1;
      transform: translateY(0);
      transition: opacity 0.35s ease, transform 0.35s ease;
    }
    .alert.fade-out {
      opacity: 0;
      transform: translateY(4px);
    }

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
      min-width: 0;
    }
    .title {
      font-size: 12px;
      font-weight: 600;
      opacity: 0.9;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
      flex: 1 1 auto;
    }
    .body {
      font-size: 13px;
      opacity: 0.95;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
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

    .tick {
      width: 16px;
      height: 16px;
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .tick svg {
      width: 16px;
      height: 16px;
      stroke: #6be675;
      fill: none;
      stroke-width: 2.2;
      stroke-linecap: round;
      stroke-linejoin: round;
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
      flex: 0 0 auto;
    }

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

  // Dismiss all alerts currently present (runs once)
  _baselineDismiss() {
    if (this._baselineDone) return;
    const current = (this.alerts ?? this._deriveAlertsFromState()) || [];
    for (let i = 0; i < current.length; i++) {
      const id = this._idForAlert(current[i], i);
      if (id) this._dismissed.add(id);
    }
    this._baselineDone = true;
    this.requestUpdate();
  }

  // Build compact alerts from chat state, if no alerts prop is supplied
  _deriveAlertsFromState() {
    const msgs = Array.isArray(this._state?.messages)
      ? this._state.messages
      : [];
    if (!msgs.length) return [];

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
    alerts.reverse();
    return alerts.slice(0, this.maxItems);
  }

  _short(text, n) {
    if (!text) return "";
    const s = String(text).trim();
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }

  render() {
    // Ensure we baseline-dismiss once we can compute the current list
    if (!this._baselineDone) this._baselineDismiss();

    const alerts = (this.alerts ?? this._deriveAlertsFromState()).filter(
      (a, i) => !this._dismissed.has(this._idForAlert(a, i))
    );

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

  updated(changed) {
    // If alerts prop was undefined and becomes defined later, we still want baseline once.
    if (!this._baselineDone) this._baselineDismiss();

    // After each render, detect loading -> done transitions and schedule auto-dismiss
    const alerts = (this.alerts ?? this._deriveAlertsFromState()).filter(
      (a, i) => !this._dismissed.has(this._idForAlert(a, i))
    );

    for (let i = 0; i < alerts.length; i++) {
      const a = alerts[i] || {};
      const id = this._idForAlert(a, i);
      const isLoading = !!a.loading;
      const wasLoading = this._wasLoading.get(id) ?? false;

      this._wasLoading.set(id, isLoading);

      // loading -> done
      if (wasLoading && !isLoading && !this._completed.has(id)) {
        this._completed.add(id);
        this.requestUpdate(); // show ✓ immediately
        this._scheduleAutoDismiss(id, 5000);
      }
    }

    // Clean up trackers for alerts that disappeared
    const liveIds = new Set(alerts.map((a, i) => this._idForAlert(a, i)));
    for (const id of [...this._wasLoading.keys()]) {
      if (!liveIds.has(id)) {
        this._wasLoading.delete(id);
        this._completed.delete(id);
        this._fadeOut.delete(id);
        const timers = this._timers.get(id);
        if (timers?.hideTimer) clearTimeout(timers.hideTimer);
        if (timers?.fadeTimer) clearTimeout(timers.fadeTimer);
        this._timers.delete(id);
      }
    }
  }

  _scheduleAutoDismiss(id, ms = 5000) {
    if (this._timers.get(id)?.hideTimer) return;

    const hideTimer = setTimeout(() => {
      this._fadeOut.add(id);
      this.requestUpdate();

      const fadeTimer = setTimeout(() => {
        this._dismissAlert(id);
        const t = this._timers.get(id);
        if (t?.fadeTimer) clearTimeout(t.fadeTimer);
        this._timers.delete(id);
      }, 380);

      this._timers.set(id, { ...(this._timers.get(id) || {}), fadeTimer });
    }, ms);

    this._timers.set(id, { ...(this._timers.get(id) || {}), hideTimer });
  }

  _idForAlert(a, i) {
    return a?.id ?? `idx-${i}`;
  }

  _dismissAlert(id) {
    if (!id) return;
    const t = this._timers.get(id);
    if (t?.hideTimer) clearTimeout(t.hideTimer);
    if (t?.fadeTimer) clearTimeout(t.fadeTimer);
    this._timers.delete(id);

    this._dismissed.add(id);
    this._completed.delete(id);
    this._fadeOut.delete(id);
    this._wasLoading.delete(id);
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
    const shimmerBody = !!a.shimmer && !!body;

    const isLoading = !!a.loading;
    const showTick = !isLoading && this._completed.has(id);
    const fading = this._fadeOut.has(id);

    return html`
      <div
        class="alert ${level} ${fading ? "fade-out" : ""}"
        data-id=${id}
        aria-live="polite"
      >
        <div class="head">
          ${isLoading
            ? html`<div class="spinner" aria-label="Loading"></div>`
            : showTick
            ? html`<span class="tick" aria-label="Completed">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M20 6L9 17l-5-5"></path>
                </svg>
              </span>`
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
