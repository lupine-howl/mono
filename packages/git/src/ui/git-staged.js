import { LitElement, html, css } from "lit";
import { FileBrowserController } from "@loki/file-browser/util";
import { gitStatus } from "../shared/gitClient.js";

// Simplified changes viewer (no staging). Untracked files are hidden.
export class GitStaged extends LitElement {
  static styles = css`
    :host {
      display: block;
    }
    .bar {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-bottom: 8px;
    }
    .hint {
      font-size: 12px;
      opacity: 0.7;
    }
    .pane {
      border: 1px solid #1f1f22;
      border-radius: 10px;
      background: #0f0f12;
      overflow: hidden;
      overflow-x: auto;
    }
    .pane h4 {
      margin: 0;
      padding: 6px 10px;
      font-size: 12px;
      opacity: 0.9;
      border-bottom: 1px solid #1f1f22;
    }
    ul {
      margin: 0;
      padding: 6px 10px;
      list-style: none;
    }
    li {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      padding: 2px 0;
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
    _ws: { state: true },
    _loading: { state: true },
    _err: { state: true },
    _changes: { state: true },
    _branch: { state: true },
    _ahead: { state: true },
    _behind: { state: true },
  };

  constructor() {
    super();
    this.controller = new FileBrowserController({ eventName: "files:change" });
    this._ws = this.controller.ws || "";
    this._loading = false;
    this._err = null;
    this._changes = [];
    this._branch = "";
    this._ahead = 0;
    this._behind = 0;

    this._onChange = (e) => {
      const { ws } = e.detail ?? {};
      if (ws && ws !== this._ws) {
        this._ws = ws;
        this._fetch();
      }
    };
    this.controller.addEventListener("files:change", this._onChange);
  }

  connectedCallback() {
    super.connectedCallback();
    this._fetch();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.controller.removeEventListener?.("files:change", this._onChange);
  }

  render() {
    return html`
      <div class="bar">
        <button
          class="btn"
          @click=${() => this._fetch()}
          ?disabled=${this._loading}
        >
          Refresh
        </button>
        <span class="hint"
          >${this._branch
            ? `branch: ${this._branch} (+${this._ahead}/-${this._behind})`
            : ""}</span
        >
        <span class="hint" style="margin-left:auto;"
          >Shows tracked changes only</span
        >
      </div>
      ${this._err ? html`<div class="hint">${this._err}</div>` : ""}
      <div class="pane">
        <h4>Changes</h4>
        <ul>
          ${this._changes.length
            ? this._changes.map((p) => html`<li><span>${p}</span></li>`)
            : html`<li class="hint">(no tracked changes)</li>`}
        </ul>
      </div>
    `;
  }

  async _fetch() {
    if (!this._ws) return;
    this._loading = true;
    this._err = null;
    try {
      const j = await gitStatus({ ws: this._ws });
      // Combine staged + unstaged so users still see pending changes even if staged externally.
      const staged = Array.isArray(j?.staged) ? j.staged : [];
      const unstaged = Array.isArray(j?.unstaged) ? j.unstaged : [];
      const set = new Set([...unstaged, ...staged]);
      this._changes = Array.from(set);
      this._branch = j.branch || "";
      this._ahead = j.ahead || 0;
      this._behind = j.behind || 0;
    } catch (e) {
      this._err = e?.message || String(e);
    } finally {
      this._loading = false;
    }
  }
}

customElements.define("git-staged", GitStaged);
