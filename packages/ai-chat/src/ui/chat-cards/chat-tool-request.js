// src/ui/chat-cards/chat-tool-request.js
import { LitElement, html, css } from "lit";
import { parseMaybeJSON } from "./render-utils.js";
import "@loki/minihttp/ui/tool-viewer.js";

export class ChatToolRequest extends LitElement {
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
    .btn {
      border: 1px solid #2a2a30;
      background: #151519;
      color: inherit;
      font: inherit;
      padding: 6px 10px;
      border-radius: 8px;
      cursor: pointer;
    }
    .btn.primary {
      background: #2f4f99;
      border-color: #2f4f99;
    }
    pre {
      white-space: pre-wrap;
    }
    .tool-name code {
      background: #1a1a1f;
      padding: 2px 6px;
      border-radius: 6px;
    }
  `;
  static properties = {
    message: { attribute: false },
    controller: { attribute: false },
  };

  _run() {
    const m = this.message;
    this.controller?.confirmToolRequest?.(m?.id);
    this.dispatchEvent(
      new CustomEvent("tool-confirm", {
        detail: { id: m?.id, name: m?.name, args: m?.args },
        bubbles: true,
        composed: true,
      })
    );
  }
  _cancel() {
    const m = this.message;
    this.controller?.rejectToolRequest?.(m?.id, "User cancelled");
    this.dispatchEvent(
      new CustomEvent("tool-cancel", {
        detail: { id: m?.id, name: m?.name, args: m?.args },
        bubbles: true,
        composed: true,
      })
    );
  }

  render() {
    const m = this.message ?? {};
    const obj = parseMaybeJSON(m.content) || {};
    const name = obj.called || m.name || "tool";
    const args = obj.args ?? m.args ?? {};
    return html`
      <div class="card" data-id=${m.id ?? ""}>
        <div class="row">
          <div>
            Call <span class="tool-name"><code>${name}</code></span> with these
            args?
          </div>
          <div class="spacer"></div>
          <button class="btn primary" @click=${this._run}>Run</button>
          <button class="btn" @click=${this._cancel}>Cancel</button>
        </div>
        <tool-viewer static tool=${name} .args=${args}></tool-viewer>
        <!--<pre>${JSON.stringify(args, null, 2)}</pre>-->
      </div>
    `;
  }
}
if (!customElements.get("chat-tool-request"))
  customElements.define("chat-tool-request", ChatToolRequest);
