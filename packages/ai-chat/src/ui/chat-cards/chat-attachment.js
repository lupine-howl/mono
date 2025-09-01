// src/ui/chat-cards/chat-attachment.js
import { LitElement, html, css } from "lit";
import { parseMaybeJSON, fileMeta, trunc } from "./render-utils.js";

export class ChatAttachment extends LitElement {
  static styles = css`
    .card {
      border: 1px solid #1f1f22;
      background: #0f0f12;
      border-radius: 12px;
      padding: 10px 12px;
      width: fit-content;
      max-width: 600px;
      display: grid;
      gap: 6px;
      justify-self: end;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border-radius: 10px;
      background: #19191d;
    }
    .icon {
      display: inline-grid;
      place-items: center;
      width: 28px;
      height: 28px;
      border-radius: 8px;
      background: #ff6a3a22;
      color: #ff6a3a;
      font-weight: 700;
    }
    .title {
      font-weight: 600;
    }
    .muted {
      opacity: 0.75;
      font-size: 12px;
    }
    .spacer {
      flex: 1;
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
    pre {
      white-space: pre-wrap;
    }
  `;
  static properties = { message: { attribute: false } };

  _remove() {
    const m = this.message;
    this.dispatchEvent(
      new CustomEvent("attachment-remove", {
        detail: { id: m?.id, message: m },
        bubbles: true,
        composed: true,
      })
    );
  }

  render() {
    const m = this.message ?? {};
    const data = parseMaybeJSON(m.content) || {};
    const { file, lang, path } = fileMeta(data);
    const text = typeof data.content === "string" ? data.content : "";
    return html`
      <div class="card" data-id=${m.id ?? ""}>
        <div class="row pill">
          <span class="icon">⟨⟩</span>
          <div>
            <div class="title">${file}</div>
            <div class="muted">${lang || "Attachment"}</div>
          </div>
          <div class="spacer"></div>
          <button class="btn" @click=${this._remove}>×</button>
        </div>
        ${path ? html`<div class="muted">${path}</div>` : ""}
        ${text
          ? html`<pre>${text.length > 800 ? trunc(text, 800) : text}</pre>`
          : ""}
      </div>
    `;
  }
}
if (!customElements.get("chat-attachment"))
  customElements.define("chat-attachment", ChatAttachment);
