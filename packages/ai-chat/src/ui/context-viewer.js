// src/ui/chat-context-viewer.js
import { LitElement, html, css } from "lit";
import { AIChatController } from "../shared/AIChatController.js";

export class ChatContextViewer extends LitElement {
  static styles = css`
    :host {
      display: block;
      font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      color: #e7e7ea;
    }
    .wrap {
      padding: 12px;
      background: #0b0b0c;
      border: 1px solid #1f1f22;
      border-radius: 12px;
    }
    .grid {
      display: grid;
      grid-template-columns: 180px 1fr;
      gap: 8px 12px;
      align-items: start;
    }
    .k {
      color: #9aa3b2;
    }
    .v {
      color: #e7e7ea;
      overflow: auto;
    }
    code,
    pre {
      background: #131317;
      border: 1px solid #1f1f22;
      border-radius: 8px;
      padding: 8px;
      display: block;
    }
    details {
      background: #0f0f12;
      border: 1px solid #1f1f22;
      border-radius: 8px;
      padding: 6px 8px;
    }
    details > summary {
      cursor: pointer;
      color: #c7d2fe;
    }
    .pill {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      background: #131317;
      border: 1px solid #1f1f22;
    }
    .row {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
      margin-bottom: 8px;
    }
    button {
      background: #0f0f12;
      border: 1px solid #2a2a30;
      color: #e7e7ea;
      padding: 6px 10px;
      border-radius: 8px;
      cursor: pointer;
    }
    button:hover {
      background: #131317;
    }
  `;

  static properties = {
    showRaw: { type: Boolean, reflect: true },
    _state: { state: true },
  };

  constructor() {
    super();
    this.controller = new AIChatController(); // singleton-backed
    this.showRaw = false;
    this._state = this.controller.get?.() ?? {};
    this.controller.subscribe((st) => {
      this._state = st;
      this.requestUpdate();
    });
  }

  render() {
    const s = this._state || {};
    const messages = Array.isArray(s.messages) ? s.messages : [];
    const toolArgs = s.toolArgs ?? null;
    const aiResult = s.aiResult ?? null;
    const attachments = Array.isArray(s.attachments) ? s.attachments : [];
    const context =
      typeof s.context === "string"
        ? s.context
        : JSON.stringify(s.context, null, 2);

    return html`
      <div class="wrap">
        <div class="row">
          <span class="pill">model: ${s.model ?? ""}</span>
          <span class="pill">mode: ${s.mode ?? ""}</span>
          <span class="pill">activeTab: ${s.activeTab ?? ""}</span>
          <span class="pill">loading: ${!!s.loading}</span>
          <span class="pill">callingTool: ${!!s.callingTool}</span>
          <span class="pill">attachments: ${attachments.length}</span>
        </div>

        <div class="grid">
          <div class="k">aiEndpoint</div>
          <div class="v">${s.aiEndpoint ?? ""}</div>

          <div class="k">rpcBase</div>
          <div class="v">${s.rpcBase ?? ""}</div>

          <div class="k">persona</div>
          <div class="v"><code>${(s.persona ?? "").trim() || "—"}</code></div>

          <div class="k">customInstructions</div>
          <div class="v">
            <code>${(s.customInstructions ?? "").trim() || "—"}</code>
          </div>

          <div class="k">context</div>
          <div class="v"><code>${context}</code></div>

          <div class="k">toolName</div>
          <div class="v">${s.toolName ?? ""}</div>

          <div class="k">autoExecute</div>
          <div class="v">${!!s.autoExecute}</div>

          <div class="k">toolArgs</div>
          <div class="v">
            <details>
              <summary>toolArgs ${toolArgs ? "" : "(empty)"}</summary>
              <pre>${pretty(toolArgs)}</pre>
            </details>
          </div>

          <div class="k">attachments</div>
          <div class="v">
            <details>
              <summary>${attachments.length} attached</summary>
              <pre>${pretty(attachments)}</pre>
            </details>
          </div>

          <div class="k">messages</div>
          <div class="v">
            <details>
              <summary>
                ${messages.length} message${messages.length === 1 ? "" : "s"}
              </summary>
              <div>
                ${messages.map(
                  (m, i) => html`
                    <details>
                      <summary>
                        #${i + 1} · ${m.role || m.kind || "unknown"}
                        ${m.name ? `· ${m.name}` : ""}
                      </summary>
                      <pre>${pretty(m)}</pre>
                    </details>
                  `
                )}
              </div>
            </details>
          </div>

          <div class="k">aiResult</div>
          <div class="v">
            <details>
              <summary>${aiResult ? "show" : "empty"}</summary>
              <pre>${pretty(aiResult)}</pre>
            </details>
          </div>
        </div>

        <div class="row" style="margin-top:12px;">
          <button @click=${this._copyState}>Copy state JSON</button>
          <button @click=${this._toggleRaw}>
            ${this.showRaw ? "Hide raw" : "Show raw"}
          </button>
        </div>

        ${this.showRaw
          ? html` <details open>
              <summary>Raw state JSON</summary>
              <pre>${pretty(s)}</pre>
            </details>`
          : null}
      </div>
    `;
  }

  _toggleRaw = () => {
    this.showRaw = !this.showRaw;
  };
  async _copyState() {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(this._state ?? {}, null, 2)
      );
    } catch {}
  }
}

function pretty(v) {
  try {
    return JSON.stringify(v, replacer, 2);
  } catch {
    return String(v);
  }
}
function replacer(_k, val) {
  if (typeof val === "function") return "[Function]";
  if (val instanceof EventTarget) return "[EventTarget]";
  return val;
}

if (!customElements.get("context-viewer")) {
  customElements.define("context-viewer", ChatContextViewer);
}
