import { LitElement, html, css } from "lit";
import { FileBrowserController } from "@loki/file-browser/util";
import { termShExec } from "@loki/terminal/util";

export class TerminalViewer extends LitElement {
  static styles = css`
    :host {
      display: block;
    }
    .wrap {
      display: flex;
      flex-direction: column;
      gap: 8px;
      height: 100%;
    }
    .bar {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      border-bottom: 1px solid #1f1f22;
      padding-bottom: 8px;
    }
    .mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas,
        "Liberation Mono", monospace;
    }
    .cwd {
      font-size: 12px;
      opacity: 0.9;
    }
    .btn,
    .input {
      border: 1px solid #2a2a30;
      background: #151519;
      color: inherit;
      font: inherit;
      border-radius: 8px;
    }
    .btn {
      padding: 6px 10px;
      cursor: pointer;
    }
    .input {
      padding: 8px 10px;
      min-width: 280px;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .term {
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
      background: #0f0f12;
      border: 1px solid #1f1f22;
      border-radius: 10px;
      padding: 10px;
      white-space: pre-wrap;
    }
    .line {
      display: block;
    }
    .prefix {
      color: #a0a0aa;
    }
    .stderr {
      color: #ff9aa2;
    }
    .hint {
      font-size: 12px;
      opacity: 0.7;
    }
    textarea {
      min-height: 80px;
      resize: vertical;
      background: #0f0f12;
      border: 1px solid #1f1f22;
      color: #e7e7ea;
      border-radius: 8px;
      padding: 8px;
      box-sizing:border-box;
      width:100%;
    }
    .pill {
      border: 1px solid #2a2a30;
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 12px;
      opacity: 0.9;
    }
  `;

  static properties = {
    _ws: { state: true },
    _cwd: { state: true },
    _history: { state: true }, // [{cmd, ok, code, stdout, stderr, ms, t, timedOut}]
    _busy: { state: true },
    _command: { state: true },
    _timeout: { state: true },
    _stdin: { state: true },
  };

  constructor() {
    super();
    this.controller = new FileBrowserController({ eventName: "files:change" });
    this._ws = this.controller.ws || "";
    this._cwd = this.controller.cwd || ".";
    this._history = [];
    this._busy = false;
    this._command = "pwd && ls -la";
    this._timeout = 120000;
    this._stdin = "";

    this._onChange = (e) => {
      const { ws, cwd } = e.detail ?? {};
      if (typeof ws === "string") this._ws = ws;
      if (typeof cwd === "string") this._cwd = cwd;
    };
    this.controller.addEventListener("files:change", this._onChange);
  }

  render() {
    return html`
      <div class="wrap">
        <div class="bar">
          <div class="row mono">
            <span class="pill">ws</span>
            <span class="cwd" title=${this._ws}>${this._ws || "(none)"}</span>
            <span class="pill">cwd</span>
            <span class="cwd" title=${this._cwd}>${this._cwd}</span>
          </div>
          <div class="row">
            <button class="btn" @click=${this._useSelection}>
              Use selection as cwd
            </button>
            <button class="btn" @click=${this._clear}>Clear</button>
            <button class="btn" ?disabled=${this._busy} @click=${this._run}>
              Run
            </button>
          </div>
        </div>

        <div class="row">
          <input
            class="input mono"
            placeholder="Command (shell)"
            .value=${this._command}
            @input=${(e) => (this._command = e.target.value)}
          />
          <input
            class="input mono"
            type="number"
            min="1000"
            step="500"
            title="timeout (ms)"
            .value=${String(this._timeout)}
            @input=${(e) => (this._timeout = Number(e.target.value) || 120000)}
          />
        </div>

        <div>
          <label class="hint mono">stdin (optional)</label>
          <textarea
            class="mono"
            .value=${this._stdin}
            @input=${(e) => (this._stdin = e.target.value)}
          ></textarea>
        </div>

        <div class="term mono" id="term">
          ${this._history.length === 0
            ? html`<span class="hint"
                >No output yet. Type a command and press Run.</span
              >`
            : this._history.map(
                (h) => html`
                  <span class="line prefix">$ ${h.cmd}</span>
                  ${h.stdout ? html`<span class="line">${h.stdout}</span>` : ""}
                  ${h.stderr
                    ? html`<span class="line stderr">${h.stderr}</span>`
                    : ""}
                  <span class="line hint"
                    >[exit ${h.code}${h.timedOut ? " (timeout)" : ""} ·
                    ${h.ms}ms]</span
                  >
                  <span class="line">&nbsp;</span>
                `
              )}
        </div>
      </div>
    `;
  }

  _useSelection = () => {
    const path = this.controller.selection?.path;
    const type = this.controller.selection?.type;
    if (!path) return;
    this._cwd =
      type === "dir"
        ? path
        : path.includes("/")
        ? path.slice(0, path.lastIndexOf("/"))
        : ".";
    this.requestUpdate();
  };

  _clear = () => {
    this._history = [];
  };

  _append(entry) {
    this._history = [...this._history, entry];
    // auto-scroll to bottom
    this.updateComplete.then(() => {
      const el = this.renderRoot?.getElementById?.("term");
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  _run = async () => {
    if (!this._ws || !this._command) return;
    this._busy = true;
    const cmd = this._command;
    try {
      const res = await termShExec({
        ws: this._ws,
        command: cmd,
        cwd: this._cwd,
        timeoutMs: this._timeout,
        stdin: this._stdin,
      });
      this._append({
        t: Date.now(),
        cmd,
        ok: !!res?.ok,
        code: res?.exitCode ?? -1,
        stdout: res?.stdout || "",
        stderr: res?.stderr || "",
        ms: res?.durationMs ?? 0,
        timedOut: !!res?.timedOut,
      });
    } catch (e) {
      this._append({
        t: Date.now(),
        cmd,
        ok: false,
        code: null,
        stdout: "",
        stderr: String(e?.message || e),
        ms: 0,
      });
    } finally {
      this._busy = false;
    }
  };
}

if (!customElements.get("terminal-viewer")) {
  customElements.define("terminal-viewer", TerminalViewer);
}
