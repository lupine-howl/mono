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

    /* Grouped turn */
    .group {
      position: relative;
      border: 1px solid #1f1f22;
      background: #0f0f12;
      border-radius: 12px;
      padding: 10px 12px;
      display: grid;
      gap: 8px;
      max-width: 860px;
    }
    .groupHeader {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
    }
    .groupHeader .spacer {
      flex: 1;
    }
    .close {
      position: relative;
      top: 0;
      right: 0;
      border: 1px solid #2a2a30;
      background: #151519;
      color: inherit;
      font: inherit;
      width: 26px;
      height: 26px;
      border-radius: 6px;
      cursor: pointer;
      line-height: 1;
    }
    .questionPreview {
      font-size: 12px;
      opacity: 0.75;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 600px;
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

    // Local hidden groups (parentId set)
    this._dismissed = new Set();

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

    const { groups, others } = this._groupMessages(msgs);
    const visibleGroups = groups.filter(
      (g) => !this._dismissed.has(g.parent.id)
    );
    const renderedCount = visibleGroups.length + others.length + (busy ? 1 : 0);

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
      return html`<shimmer-effect>Thinking...</shimmer-effect>`;
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

  // Build turn groups: each user message (parent) + its children by parentId
  _groupMessages(all = []) {
    const msgs = Array.isArray(all) ? all : [];
    const groups = [];
    const used = new Set();

    // Index children by parentId
    const byParent = new Map();
    for (const m of msgs) {
      const pid = m.parentId || null;
      if (pid) {
        if (!byParent.has(pid)) byParent.set(pid, []);
        byParent.get(pid).push(m);
      }
    }

    // Keep chronological order by original appearance
    for (const m of msgs) {
      if (m.role === "user" && (m.parentId == null || m.parentId === "")) {
        used.add(m.id);
        const children = (byParent.get(m.id) || []).slice();
        for (const c of children) used.add(c.id);
        groups.push({ parent: m, children });
      }
    }

    // Others = messages not part of any group (e.g., system/orphans)
    const others = msgs.filter((m) => !used.has(m.id));

    return { groups, others };
  }

  _dismissGroup = (parentId) => {
    if (!parentId) return;
    this._dismissed.add(parentId);
    this.requestUpdate();
    this.dispatchEvent(
      new CustomEvent("group-dismissed", {
        detail: { parentId },
        bubbles: true,
        composed: true,
      })
    );
  };

  _renderGroup(g) {
    const user = g.parent;
    const children = g.children || [];
    const preview = String(user?.content || "")
      .trim()
      .slice(0, 140);
    return html`
      <div class="group" data-parent=${user.id}>
        <div class="groupHeader">
          <div class="questionPreview" title=${user.content || ""}>
            ${preview}
          </div>
          <div class="spacer"></div>
          <button
            class="close"
            title="Dismiss"
            @click=${() => this._dismissGroup(user.id)}
          >
            ×
          </button>
        </div>
        ${this._renderCard(user)} ${children.map((m) => this._renderCard(m))}
      </div>
    `;
  }

  render() {
    const msgs =
      (this.messages?.length ? this.messages : this._state.messages) ?? [];
    const busy =
      (this._state.loading !== undefined
        ? this._state.loading
        : this.loading) ?? false;

    const { groups, others } = this._groupMessages(msgs);
    const visibleGroups = groups.filter(
      (g) => !this._dismissed.has(g.parent.id)
    );

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
        ${visibleGroups.map((g) => this._renderGroup(g))}
        ${others.map((m) => this._renderCard(m))}
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
      this._dismissed = new Set();
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
