// src/ui/chat-cards/chat-tool-rejected.js
import { LitElement, html, css } from "lit";
import { parseMaybeJSON } from "./render-utils.js";

export class ChatToolRejected extends LitElement {
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
    }
    .row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .spacer {
      flex: 1;
    }
    .badge {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 999px;
      border: 1px solid #2a2a30;
      background: #17171b;
    }
    .badge.rej {
      color: #c8c8cc;
    }
    .muted {
      opacity: 0.75;
      font-size: 12px;
    }
    pre {
      white-space: pre-wrap;
    }
  `;
  static properties = { message: { attribute: false } };
  render() {
    const m = this.message ?? {};
    const name = m.name || parseMaybeJSON(m.content)?.called || "tool";
    const args = m.args ?? parseMaybeJSON(m.content)?.args ?? {};
    const reason = m.rejectReason || "Rejected by user";
    return html`
      <div class="card" data-id=${m.id ?? ""}>
        <div class="row">
          <div>Call to <code>${name}</code></div>
          <div class="spacer"></div>
          <span class="badge rej">rejected</span>
        </div>
        <div class="muted">${reason}</div>
        <details>
          <summary class="muted">Args</summary>
          <pre>${JSON.stringify(args, null, 2)}</pre>
        </details>
      </div>
    `;
  }
}
if (!customElements.get("chat-tool-rejected"))
  customElements.define("chat-tool-rejected", ChatToolRejected);
