// src/ui/chat-stream.js
import { LitElement, html, css } from "lit";
import "@loki/layout/ui/shimmer-effect.js";
import { AIChatController } from "../shared/AIChatController.js";

import "./chat-cards/chat-message.js";
import "./chat-cards/chat-attachment.js";
import "./chat-cards/chat-tool-request.js";
import "./chat-cards/chat-tool-result.js";
import "./chat-cards/chat-tool-rejected.js";
import "./chat-cards/chat-images.js";

const isScrollable = (el) => {
  if (!el || el === document) return false;
  const s = getComputedStyle(el);
  const oy = s.overflowY;
  return (
    (oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight
  );
};

// Walk up across shadow roots/slots to find the nearest scroll container.
// Falls back to document.scrollingElement.
function findScrollParent(start) {
  let node = start;
  while (node) {
    if (node instanceof Element && isScrollable(node)) return node;

    // Cross shadow/dom boundaries safely
    const root = node.getRootNode?.();
    if (root && root instanceof ShadowRoot) {
      node = root.host; // jump to shadow host
    } else {
      node = node.assignedSlot || node.parentNode || (node.host ?? null);
    }
  }
  return document.scrollingElement || document.documentElement;
}

export class ChatStream extends LitElement {
  static styles = css`
    :host {
      display: block;
      height: 100%;
      min-height: 0;
    }
    .messages {
      /* If the PAGE should scroll, remove the two lines below. */
      height: 100%;
      overflow-y: auto;

      display: grid;
      gap: 12px;
      align-content: start;
      grid-auto-rows: max-content;
      min-height: 0;
      scrollbar-width: thin;
      scrollbar-color: #444 #0b0b0c;
    }
    .messages::-webkit-scrollbar {
      width: 8px;
    }
    .messages::-webkit-scrollbar-track {
      background: #0b0b0c;
    }
    .messages::-webkit-scrollbar-thumb {
      background: #444;
      border-radius: 4px;
    }
    .thinking {
      padding: 10px;
    }
  `;

  static properties = {
    messages: { type: Array },
    loading: { type: Boolean },
    _state: { state: true },
  };

  constructor() {
    super();
    this.controller = new AIChatController();

    this.messages = [];
    this.loading = false;
    this._state = this.controller.get?.() ?? {};

    this._lastRenderedCount = 0;
    this._scrollQueued = false;
    this._ro = null;

    this.controller.subscribe((st) => {
      this._state = st;
      this.requestUpdate();
    });
  }

  async firstUpdated() {
    const container = this.renderRoot?.getElementById("messages");
    if (container && "ResizeObserver" in window) {
      this._ro = new ResizeObserver(() => this._queueScrollToBottom());
      this._ro.observe(container);
    }
    await this.updateComplete;
    this._queueScrollToBottom();
  }

  disconnectedCallback() {
    this._ro?.disconnect?.();
    this._ro = null;
    super.disconnectedCallback();
  }

  updated() {
    const msgs =
      (this.messages?.length ? this.messages : this._state.messages) ?? [];
    const busy =
      (this._state.loading !== undefined
        ? this._state.loading
        : this.loading) ?? false;

    const renderedCount = msgs.length + (busy ? 1 : 0);

    // Only force-scroll when something new is appended
    if (renderedCount > this._lastRenderedCount) {
      this._queueScrollToBottom();
    }
    this._lastRenderedCount = renderedCount;
  }

  _queueScrollToBottom() {
    if (this._scrollQueued) return;
    this._scrollQueued = true;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this._scrollQueued = false;
        const bottom = this.renderRoot?.getElementById("bottom-sentinel");
        if (!bottom) return;

        // 1) Ask browser to reveal the sentinel in the nearest scrollable ancestor
        bottom.scrollIntoView({
          block: "end",
          inline: "nearest",
          behavior: "auto",
        });

        // 2) Explicit fallback for cases where the scroller is the page/another container
        const scroller = findScrollParent(bottom);
        if (scroller) scroller.scrollTop = scroller.scrollHeight;
      });
    });
  }

  _renderCard(m) {
    let kind = m.kind;
    if (kind === "image") {
      return html`<chat-images .message=${m}></chat-images>`;
    }
    if (kind === "attachment") {
      return html`<chat-attachment .message=${m}></chat-attachment>`;
    }
    if (kind === "tool_request") {
      return html`<chat-tool-request
        .message=${m}
        .controller=${this.controller}
      ></chat-tool-request>`;
    }
    if (kind === "tool_rejected") {
      return html`<chat-tool-rejected .message=${m}></chat-tool-rejected>`;
    }
    if (kind === "tool_result" || m.role === "tool") {
      return html`<chat-tool-result .message=${m}></chat-tool-result>`;
    }
    return html`<chat-message truncate .role=${m.role} .plaintext=${m.role==="user"}>${m.content}</chat-message>`;
  }

  render() {
    const msgs =
      (this.messages?.length ? this.messages : this._state.messages) ?? [];
    const busy =
      (this._state.loading !== undefined
        ? this._state.loading
        : this.loading) ?? false;

    return html`
      <div class="messages" id="messages">
        ${msgs.map((m) => this._renderCard(m))}
        ${busy
          ? html`<div class="msg thinking">
              <shimmer-effect>Thinking…</shimmer-effect>
            </div>`
          : ""}
        <div id="bottom-sentinel" style="height:1px;"></div>
      </div>
    `;
  }
}

if (!customElements.get("chat-stream")) {
  customElements.define("chat-stream", ChatStream);
}
