import { LitElement, html, css } from "lit";
import { FileBrowserController } from "@loki/file-browser/util";
import { GitController } from "../shared/GitController.js";

export class GitSync extends LitElement {
  static styles = css`
    :host { display: block; }
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
    .hint { font-size: 12px; opacity: 0.75; }
    .msg { font-size: 12px; opacity: 0.9; margin-top: 6px; }
  `;

  static properties = {
    _ws: { state: true },
    _loading: { state: true },
    _pushing: { state: true },
    _pulling: { state: true },
    _msg: { state: true },
    _err: { state: true },
  };

  constructor() {
    super();
    this.fb = new FileBrowserController({ eventName: "files:change" });
    this.ctrl = new GitController(this);

    this._ws = this.fb.ws || "";
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
    this.fb.addEventListener("files:change", this._onChange);
  }

  connectedCallback() {
    super.connectedCallback();
    this._refresh();
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this.fb.removeEventListener?.("files:change", this._onChange);
  }

  render() {
    const st = this.ctrl?.state?.status || {};
    const branch = st.branch || "";
    const ahead = Number(st.ahead || 0);
    const behind = Number(st.behind || 0);

    const canPush = ahead > 0;
    const canPull = behind > 0;

    return html`
      <div class="bar">
        <button class="btn" @click=${() => this._refresh()} ?disabled=${this._loading}>
          Refresh
        </button>
        <span class="hint">${branch ? `branch: ${branch}` : ""}</span>
      </div>
      <div class="bar">
        <button
          class="btn"
          @click=${() => this._doPull()}
          ?disabled=${!this._ws || this._pulling || this._loading || !canPull}
          title="Pull latest from remote"
        >
          ⬇️ Pull ${behind ? `(${behind})` : ""}
        </button>
        <button
          class="btn"
          @click=${() => this._doPush()}
          ?disabled=${!this._ws || this._pushing || this._loading || !canPush}
          title="Push local commits"
        >
          ⬆️ Push ${ahead ? `(${ahead})` : ""}
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
      await this.ctrl.status(this._ws);
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
      const out = await this.ctrl.push(this._ws, {});
      this._msg = out || "Pushed successfully.";
    } catch (e) {
      this._err = e?.message || String(e);
    } finally {
      this._pushing = false;
      // GitUIService.push() already refreshes status; UI will update reactively.
    }
  }

  async _doPull() {
    if (!this._ws) return;
    this._pulling = true;
    this._err = null;
    this._msg = "";
    try {
      const out = await this.ctrl.pull(this._ws, { rebase: true });
      this._msg = out || "Pulled successfully.";
    } catch (e) {
      this._err = e?.message || String(e);
    } finally {
      this._pulling = false;
      // GitUIService.pull() refreshes status; UI will update reactively.
    }
  }
}

customElements.define("git-sync", GitSync);
