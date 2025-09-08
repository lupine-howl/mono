import { LitElement, html, css } from "lit";
import { FileBrowserController } from "@loki/file-browser/util";
import { gitStatus, gitPush, gitPull } from "../shared/gitClient.js";

export class GitSync extends LitElement {
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
    .btn {
      border: 1px solid #2a2a30;
      background: #151519;
      color: inherit;
      font: inherit;
      padding: 6px 10px;
      border-radius: 8px;
      cursor: pointer;
    }
    .hint {
      font-size: 12px;
      opacity: 0.75;
    }
    .msg {
      font-size: 12px;
      opacity: 0.9;
      margin-top: 6px;
    }
  `;

  static properties = {
    _ws: { state: true },
    _branch: { state: true },
    _ahead: { state: true },
    _behind: { state: true },
    _loading: { state: true },
    _pushing: { state: true },
    _pulling: { state: true },
    _msg: { state: true },
    _err: { state: true },
  };

  constructor() {
    super();
    this.controller = new FileBrowserController({ eventName: "files:change" });
    this._ws = this.controller.ws || "";
    this._branch = "";
    this._ahead = 0;
    this._behind = 0;
    this._loading = false;
    this._pushing = false;
    this._pulling = false;
    this._msg = "";
    this._err = null;

    this._onChange = (e) => {
      const { ws } = e.detail || {};
      if (ws && ws !== this._ws) {
        this._ws = ws;
        this._refresh();
      }
    };
    this.controller.addEventListener("files:change", this._onChange);
  }

  connectedCallback() {
    super.connectedCallback();
    this._refresh();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.controller.removeEventListener?.("files:change", this._onChange);
  }

  render() {
    const canPush = this._ahead > 0;
    const canPull = this._behind > 0;
    return html`
      <div class="bar">
        <button class="btn" @click=${() => this._refresh()} ?disabled=${this._loading}>
          Refresh
        </button>
        <span class="hint">${this._branch ? `branch: ${this._branch}` : ""}</span>
      </div>
      <div class="bar">
        <button
          class="btn"
          @click=${() => this._doPull()}
          ?disabled=${!this._ws || this._pulling || this._loading || !canPull}
          title="Pull latest from remote"
        >
          ⬇️ Pull ${this._behind ? `(${this._behind})` : ""}
        </button>
        <button
          class="btn"
          @click=${() => this._doPush()}
          ?disabled=${!this._ws || this._pushing || this._loading || !canPush}
          title="Push local commits"
        >
          ⬆️ Push ${this._ahead ? `(${this._ahead})` : ""}
        </button>
      </div>
      ${this._err ? html`<div class="msg">${this._err}</div>` : ""}
      ${this._msg ? html`<div class="msg">${this._msg}</div>` : ""}
    `;
  }

  async _refresh() {
    if (!this._ws) return;
    this._loading = true;
    this._err = null;
    this._msg = "";
    try {
      const j = await gitStatus({ ws: this._ws });
      this._branch = j.branch || "";
      this._ahead = j.ahead || 0;
      this._behind = j.behind || 0;
    } catch (e) {
      this._err = e?.message || String(e);
    } finally {
      this._loading = false;
    }
  }

  async _doPush() {
    if (!this._ws) return;
    this._pushing = true;
    this._err = null;
    this._msg = "";
    try {
      const r = await gitPush({ ws: this._ws });
      if (r?.error) throw new Error(r.error);
      this._msg = r?.output || "Pushed successfully.";
    } catch (e) {
      this._err = e?.message || String(e);
    } finally {
      this._pushing = false;
      await this._refresh();
    }
  }

  async _doPull() {
    if (!this._ws) return;
    this._pulling = true;
    this._err = null;
    this._msg = "";
    try {
      const r = await gitPull({ ws: this._ws, rebase: true });
      if (r?.error) throw new Error(r.error);
      this._msg = r?.output || "Pulled successfully.";
    } catch (e) {
      this._err = e?.message || String(e);
    } finally {
      this._pulling = false;
      await this._refresh();
    }
  }
}

customElements.define("git-sync", GitSync);
