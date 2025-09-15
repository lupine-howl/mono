import { LitElement, html, css } from "lit";
import { FileBrowserController } from "@loki/file-browser/util";
import { GitController } from "../shared/GitController.js";

// Changes viewer backed by GitStore. Reacts to status updates across the app.
export class GitStaged extends LitElement {
  static styles = css`
    :host { display: block; }
    .bar { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
    .hint { font-size: 12px; opacity: 0.7; }
    .pane { border: 1px solid #1f1f22; border-radius: 10px; background: #0f0f12; overflow: hidden; overflow-x: auto; }
    .pane h4 { margin: 0; padding: 6px 10px; font-size: 12px; opacity: 0.9; border-bottom: 1px solid #1f1f22; }
    ul { margin: 0; padding: 6px 10px; list-style: none; }
    li { display: flex; align-items: center; gap: 6px; font-size: 12px; padding: 2px 0; }
    .btn { border: 1px solid #2a2a30; background: #151519; color: inherit; font: inherit; padding: 6px 10px; border-radius: 8px; cursor: pointer; }
  `;

  static properties = {
    _ws: { state: true },
    _loading: { state: true },
    _err: { state: true },
  };

  constructor() {
    super();
    this.fb = new FileBrowserController({ eventName: "files:change" });
    this.ctrl = new GitController(this);

    this._ws = this.fb.ws || "";
    this._loading = false;
    this._err = null;

    this._onChange = (e) => {
      const { ws } = e.detail ?? {};
      if (ws && ws !== this._ws) {
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
    const st = this.ctrl?.state?.status || {};
    const branch = st.branch || "";
    const ahead = Number(st.ahead || 0);
    const behind = Number(st.behind || 0);
    const staged = Array.isArray(st.staged) ? st.staged : [];
    const unstaged = Array.isArray(st.unstaged) ? st.unstaged : [];
    const set = new Set([...unstaged, ...staged]);
    const changes = Array.from(set);

    return html`
      <div class="bar">
        <button class="btn" @click=${() => this._fetch()} ?disabled=${this._loading}>
          Refresh
        </button>
        <span class="hint">
          ${branch ? `branch: ${branch} (+${ahead}/-${behind})` : ""}
        </span>
        <span class="hint" style="margin-left:auto;">Shows tracked changes only</span>
      </div>
      ${this._err ? html`<div class="hint">${this._err}</div>` : ""}
      <div class="pane">
        <h4>Changes</h4>
        <ul>
          ${changes.length
            ? changes.map((p) => html`<li><span>${p}</span></li>`)
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
      await this.ctrl.status(this._ws);
    } catch (e) {
      this._err = e?.message || String(e);
    } finally {
      this._loading = false;
    }
  }
}

customElements.define("git-staged", GitStaged);
