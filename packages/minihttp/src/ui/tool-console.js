// src/ui/tool-console.js
import { LitElement, html, css } from "lit";
// Adjust this import to wherever your singleton lives:
// e.g. "@/tools/client", "../shared/tools-client.js", etc.
import { tools } from "../shared/toolClient.js";

export class ToolConsole extends LitElement {
  static styles = css`
    :host {
      display: block;
      color: #e7e7ea;
      font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .wrap {
      padding: 12px;
      background: #0b0b0c;
      border: 1px solid #1f1f22;
      border-radius: 12px;
    }
    .head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 10px;
      flex-wrap: wrap;
      align-items: center;
    }
    .title {
      font-weight: 600;
    }
    .note {
      color: #9aa3b2;
    }
    .row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin: 10px 0;
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
    button[disabled] {
      opacity: 0.6;
      cursor: default;
    }
    textarea,
    input {
      padding: 8px 10px;
      border-radius: 8px;
      border: 1px solid #1f1f22;
      background: #131317;
      color: #e7e7ea;
      width: 100%;
      box-sizing: border-box;
      font: inherit;
    }
    .bubble {
      background: #131317;
      border: 1px solid #1f1f22;
      border-radius: 8px;
      padding: 8px;
      margin: 6px 0;
      white-space: pre-wrap;
    }
    .bubble.assistant {
      border-color: #3a3a40;
    }
    .err {
      color: #fecaca;
    }
    .spinner {
      width: 14px;
      height: 14px;
      border: 2px solid #2a2a30;
      border-top-color: #e7e7ea;
      border-radius: 50%;
      animation: spin 0.9s linear infinite;
      display: inline-block;
    }
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
  `;

  static properties = {
    tool: { type: String, reflect: true }, // tool name, e.g. "flowStoryLab" or "db.update"
    showArgs: { type: Boolean, attribute: "show-args" }, // toggle args editor
    _argsText: { state: true },
    _running: { state: true },
    _result: { state: true },
    _error: { state: true },
  };

  constructor() {
    super();
    this.tool = "flowStoryLab";
    this.showArgs = false;
    this._argsText = "{}";
    this._running = false;
    this._result = null;
    this._error = null;
  }

  // ---- minimal caller using your proxy client -------------------------------
  async _run() {
    this._error = null;
    this._result = null;
    let args = {};
    try {
      args = this._argsText ? JSON.parse(this._argsText) : {};
    } catch (e) {
      this._error = `Invalid JSON args: ${e?.message || e}`;
      this.requestUpdate();
      return;
    }

    this._running = true;
    this.requestUpdate();

    try {
      const result = await this._callToolByName(this.tool, args);
      this._result = result;
    } catch (e) {
      this._error = e?.message || String(e);
    } finally {
      this._running = false;
      this.requestUpdate();
    }
  }

  _getToolInvoker(name) {
    // Traverse the proxy by property chain: tools.a.b.c -> function
    const parts = String(name || "")
      .split(".")
      .filter(Boolean);
    let fn = tools;
    for (const p of parts) fn = fn[p];
    return fn; // proxy function
  }

  async _callToolByName(name, params) {
    const fn = this._getToolInvoker(name);
    if (typeof fn !== "function") {
      throw new Error(`Unknown tool: "${name}"`);
    }
    return await fn(params || {});
  }

  // ---- tiny render helpers ---------------------------------------------------
  _renderHead(extraRight = null) {
    return html`
      <div class="head">
        <div>
          <div class="title">${this.tool || "Console"}</div>
          <div class="note">
            Runs the tool via the global <code>tools</code> client. Interactive
            steps render in the overlay.
          </div>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          ${this._running
            ? html`<span class="spinner" title="Running…"></span>`
            : null}
          ${extraRight}
        </div>
      </div>
    `;
  }

  _renderArgs() {
    if (!this.showArgs) return null;
    return html`
      <label class="note" style="display:block; margin:8px 0 4px;"
        >Args (JSON)</label
      >
      <textarea
        rows="8"
        .value=${this._argsText}
        @input=${(e) => (this._argsText = e.target.value)}
      ></textarea>
    `;
  }

  _renderResult() {
    if (this._error) {
      return html`<div class="err">Error: ${this._error}</div>`;
    }
    if (!this._result) return html`<div class="note">No result yet.</div>`;

    // If the tool returns chat messages, render them pleasantly; else JSON dump.
    const msgs = this._result?.data?.messages;
    if (Array.isArray(msgs)) {
      return html`
        <div class="note">Final messages</div>
        ${msgs.map(
          (m) => html`<div class="bubble ${m.role}">${m.content || ""}</div>`
        )}
      `;
    }
    return html`
      <div class="note">Result JSON</div>
      <pre>${JSON.stringify(this._result, null, 2)}</pre>
    `;
  }

  render() {
    const runBtn = html`
      <button
        @click=${() => this._run()}
        ?disabled=${!this.tool || this._running}
      >
        ${this._running ? "Running…" : `Run ${this.tool || ""}`}
      </button>
    `;

    return html`
      <div class="wrap">
        ${this._renderHead(runBtn)}

        <div class="row">
          <input
            placeholder="tool name (e.g. flowStoryLab or db.update)"
            .value=${this.tool}
            @input=${(e) => (this.tool = e.target.value)}
            style="min-width:260px;"
          />
          <button @click=${() => (this.showArgs = !this.showArgs)}>
            ${this.showArgs ? "Hide args" : "Show args"}
          </button>
        </div>

        ${this._renderArgs()}

        <div style="margin-top:12px;">${this._renderResult()}</div>
      </div>
    `;
  }
}

if (!customElements.get("tool-console")) {
  customElements.define("tool-console", ToolConsole);
}
