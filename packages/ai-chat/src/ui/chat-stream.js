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
import json from "highlight.js/lib/languages/json";

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
    .btn {
      border: 1px solid #2a2a30;
      background: #151519;
      color: inherit;
      font: inherit;
      padding: 6px 10px;
      border-radius: 8px;
      cursor: pointer;
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
    let attachments = [];
    try {
      attachments = JSON.parse(m.attachments || "[]");
    } catch {
      // Handle error
    }
    if (kind === "image") {
      return html`<chat-images .message=${m}></chat-images>`;
    } else if (kind === "tool_waiting") {
      return html`<shimmer-effect>
        ${this._state.mode==="off"?"Thinking...":html`<chat-tool-request class="msg thinking"         
        .message=${m}
        .controller=${this.controller}
></chat-tool-request>`}
      </shimmer-effect>`;
    } else if (kind === "tool_request") {
      return html`<chat-tool-request
        .message=${m}
        .controller=${this.controller}
      ></chat-tool-request>`;
    } else if (kind === "tool_rejected") {
      return html`<chat-tool-rejected .message=${m}></chat-tool-rejected>`;
    } else if (kind === "tool_result" || m.role === "tool") {
      return html`<chat-tool-result .message=${m}></chat-tool-result>`;
    }
    return html`<chat-message
      .truncate=${m.role === "user"}
      .role=${m.role}
      .plaintext=${m.role === "user"}
    >
      ${m.content}
      ${attachments?.map(
        (a) => html`<chat-attachment
          .message=${{ role: "system", kind: "attachment", content: a }}
        ></chat-attachment>`
      )}
    </chat-message>`;
  }

  render() {
    const msgs =
      (this.messages?.length ? this.messages : this._state.messages) ?? [];
    const busy =
      (this._state.loading !== undefined
        ? this._state.loading
        : this.loading) ?? false;

    return html`
      <div
        class="clear-row"
        style="position:fixed; right:100px; bottom:100px; z-index:10;"
      >
        <button
          class="btn"
          style="width:60px;height:60px;border-radius:999px"
          @click=${this._clearAll}
          title="Clear history"
        >
          Clear
        </button>
      </div>
      <div class="messages" id="messages">
        ${msgs.map((m) => this._renderCard(m))}
        <div id="bottom-sentinel" style="height:1px;"></div>
      </div>
    `;
  }

  async _clearAll() {
    const convoId =
      this._state?.conversationId ||
      this.controller?.get?.()?.conversationId ||
      null;

    const question = convoId
      ? `Clear all messages in conversation "${convoId}"?`
      : `Clear ALL messages?`;
    const ok = typeof window !== "undefined" ? window.confirm(question) : true;
    if (!ok) return;

    try {
      if (convoId && this.controller?.deleteByConversationId) {
        await this.controller.deleteByConversationId(convoId);
      } else if (this.controller?.deleteAllMessages) {
        await this.controller.deleteAllMessages();
      }

      // If this element was given a `messages` prop, make sure it doesn't override
      // the service state after deletion.
      this.messages = [];
      this.requestUpdate();

      this.dispatchEvent(
        new CustomEvent("stream-cleared", {
          detail: { streamId: this.streamId, conversationId: convoId },
          bubbles: true,
          composed: true,
        })
      );
    } catch (e) {
      console.error("Clear messages failed:", e);
      // Optional: surface a lightweight UI hint; you can replace alert with your toast.
      if (typeof window !== "undefined") alert("Failed to clear messages.");
    }
  }
}
if (!customElements.get("chat-stream")) {
  customElements.define("chat-stream", ChatStream);
}
