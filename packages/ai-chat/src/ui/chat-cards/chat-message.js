// src/ui/chat-cards/chat-message.js
import { LitElement, html, css } from "lit";
import { unsafeHTML } from "https://unpkg.com/lit-html@3/directives/unsafe-html.js?module";
import "https://cdn.jsdelivr.net/npm/marked/marked.min.js";

export class ChatMessage extends LitElement {
  static styles = css`
    .msg {
      padding: 4px 14px;
      line-height: 1.5em;
      border-radius: 28px;
      background: #303030;
      color: inherit;
      width: fit-content;
      max-width: min(70ch, 75%);
      text-align: left;
      white-space: normal;
      justify-self: start;
    }
    .msg.user {
      justify-self: end;
      background: #2f4f99;
    }
    .msg.assistant {
      justify-self: start;
      background: transparent;
    }
    .msg.system {
      justify-self: start;
      background: #131317;
      opacity: 0.9;
    }
    .msg p {
      max-width: 700px;
      overflow-wrap: break-word;
      white-space: pre-wrap;
      margin: 0.4em 0;
    }
    .msg code {
      background: #222;
      padding: 0 4px;
      border-radius: 4px;
    }
    .msg pre {
      background: #222;
      padding: 8px;
      border-radius: 6px;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-word;
      max-width: 100%;
    }
  `;
  static properties = { message: { attribute: false } };
  render() {
    const m = this.message ?? {};
    return html`
      <div class="msg ${m.role}">
        <div>
          ${unsafeHTML((window.marked?.parse ?? ((s) => s))(m.content || ""))}
        </div>
      </div>
    `;
  }
}
if (!customElements.get("chat-message"))
  customElements.define("chat-message", ChatMessage);
