import { LitElement, html, css } from "lit";
import { FileBrowserController } from "@loki/file-browser/util";
import { GitController } from "../shared/GitController.js";

export class GitHistory extends LitElement {
  static styles = css`
    :host {
      display: block;
    }
    .wrap {
      display: flex;
      gap: 12px;
    }
    .list {
      width: 45%;
      border: 1px solid #1f1f22;
      border-radius: 10px;
      overflow: auto;
      max-height: 60vh;
    }
    .list ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .list li {
      padding: 8px 10px;
      border-bottom: 1px solid #1f1f22;
      cursor: pointer;
    }
    .list li:hover {
      background: #141418;
    }
    .list .meta {
      font-size: 11px;
      opacity: 0.7;
    }
    .diff {
      flex: 1;
      border: 1px solid #1f1f22;
      border-radius: 10px;
      padding: 8px;
      background: #0f0f12;
      overflow: auto;
    }
    pre {
      margin: 0;
      white-space: pre-wrap;
      font-size: 12px;
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
  `;

  static properties = {
    _ws: { state: true },
    _list: { state: true },
    _sel: { state: true },
    _diff: { state: true },
    _loading: { state: true },
    _err: { state: true },
  };

  constructor() {
    super();
    this.fb = new FileBrowserController({ eventName: "files:change" });
    this.ctrl = new GitController(this);

    this._ws = this.fb.ws || "";
    this._list = [];
    this._sel = null;
    this._diff = "";
    this._loading = false;
    this._err = null;

    this._onChange = (e) => {
      const { ws } = e.detail || {};
      if (ws) {
        this._ws = ws;
        this._fetch();
      }
    };
    this.fb.addEventListener("files:change", this._onChange);
  }

  connectedCallback() {
    super.connectedCallback();
    this._fetch();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.fb.removeEventListener?.("files:change", this._onChange);
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
      </div>
      <div class="wrap">
        <div class="list">
          <ul>
            ${this._list.map(
              (c) => html`<li @click=${() => this._select(c)}>
                <div><strong>${c.subject}</strong></div>
                <div class="meta">
                  ${c.short} • ${c.author} •
                  ${new Date(c.date).toLocaleString()}
                </div>
              </li>`
            )}
          </ul>
        </div>
        <div class="diff">
          ${this._err
            ? html`<div class="meta">${this._err}</div>`
            : html`<pre>${this._diff}</pre>`}
        </div>
      </div>
    `;
  }

  async _fetch() {
    if (!this._ws) return;
    this._loading = true;
    this._err = null;
    try {
      const items = await this.ctrl.log(this._ws, { max: 100 });
      this._list = items || [];
      if (this._list.length) this._select(this._list[0]);
    } catch (e) {
      this._err = e?.message || String(e);
    } finally {
      this._loading = false;
    }
  }

  async _select(c) {
    this._sel = c;
    this._diff = "";
    this._err = null;
    try {
      const diffText = await this.ctrl.diff(this._ws, { commit: c.hash });
      this._diff = diffText || "";
    } catch (e) {
      this._err = e?.message || String(e);
    }
  }
}

customElements.define("git-history", GitHistory);
