import { LitElement, html, css } from "lit";
import { FileBrowserController } from "@loki/file-browser/util";
import { gitStatus, gitAdd, gitRestore } from "../shared/gitClient.js";

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
    .cols {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .pane {
      border: 1px solid #1f1f22;
      border-radius: 10px;
      background: #0f0f12;
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
    _staged: { state: true },
    _unstaged: { state: true },
    _untracked: { state: true },
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
    this._staged = [];
    this._unstaged = [];
    this._untracked = [];
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

  render() {
    return html`
      <div class="bar">
        <button
          class="btn"
          @click=${() => this._addAll()}
          ?disabled=${!this._ws}
        >
          Stage all
        </button>
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
      </div>
      ${this._err ? html`<div class="hint">${this._err}</div>` : ""}
      <div class="cols">
        ${this._renderPane("Staged", this._staged, (p) => this._unstage(p))}
        ${this._renderPane("Unstaged", this._unstaged, (p) => this._stage(p))}
        ${this._renderPane("Untracked", this._untracked, (p) => this._stage(p))}
      </div>
    `;
  }

  _renderPane(title, list, onClick) {
    return html`<div class="pane">
      <h4>${title}</h4>
      <ul>
        ${list.length
          ? list.map(
              (p) =>
                html`<li>
                  <button class="btn" @click=${() => onClick(p)}>
                    ${title === "Staged" ? "Unstage" : "Stage"}</button
                  ><span>${p}</span>
                </li>`
            )
          : html`<li class="hint">(empty)</li>`}
      </ul>
    </div>`;
  }

  async _fetch() {
    if (!this._ws) return;
    this._loading = true;
    this._err = null;
    try {
      const j = await gitStatus({ ws: this._ws });
      this._staged = j.staged || [];
      this._unstaged = j.unstaged || [];
      this._untracked = j.untracked || [];
      this._branch = j.branch || "";
      this._ahead = j.ahead || 0;
      this._behind = j.behind || 0;
    } catch (e) {
      this._err = e?.message || String(e);
    } finally {
      this._loading = false;
    }
  }

  async _addAll() {
    if (!this._ws) return;
    await gitAdd({ ws: this._ws, all: true });
    await this._fetch();
  }

  async _stage(p) {
    await gitAdd({ ws: this._ws, paths: [p] });
    await this._fetch();
  }

  async _unstage(p) {
    await gitRestore({ ws: this._ws, paths: [p], stagedOnly: true });
    await this._fetch();
  }
}

customElements.define("git-staged", GitStaged);
