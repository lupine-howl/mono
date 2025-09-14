import { LitElement, html, css } from "lit";
import { FileBrowserController } from "@loki/file-browser/util";
import { GitController } from "../shared/GitController.js";

export class GitCommit extends LitElement {
  static styles = css`
    :host {
      display: block;
    }
    .row {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-bottom: 8px;
    }
    .field {
      width: 100%;
      padding: 6px 10px;
      border: 1px solid #2a2a30;
      background: #0b0b0c;
      color: inherit;
      border-radius: 8px;
      font: inherit;
    }
    .area {
      width: calc(100% - 20px);
      min-height: 120px;
      padding: 8px 10px;
      border: 1px solid #2a2a30;
      background: #0b0b0c;
      color: inherit;
      border-radius: 8px;
      font: inherit;
    }
    .btn {
      border: 1px solid #2a2a30;
      background: #151519;
      color: inherit;
      font: inherit;
      padding: 8px 12px;
      border-radius: 8px;
      cursor: pointer;
    }
    .hint {
      font-size: 12px;
      opacity: 0.7;
    }
  `;

  static properties = {
    _ws: { state: true },
    _subject: { state: true },
    _body: { state: true },
    _loading: { state: true },
    _msg: { state: true },
  };

  constructor() {
    super();
    // Use FB controller just to keep tracking current workspace
    this.fb = new FileBrowserController({ eventName: "files:change" });
    this.ctrl = new GitController(this);

    this._ws = this.fb.ws || "";
    this._subject = "";
    this._body = "";
    this._loading = false;
    this._msg = "";

    this._onChange = (e) => {
      const { ws } = e.detail || {};
      if (ws) this._ws = ws;
    };
    this.fb.addEventListener("files:change", this._onChange);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.fb.removeEventListener?.("files:change", this._onChange);
  }

  render() {
    return html`
      <div class="row">
        <input
          class="field"
          placeholder="Commit subject"
          .value=${this._subject}
          @input=${(e) => (this._subject = e.target.value)}
        />
        <button
          class="btn"
          @click=${this._doCommit}
          ?disabled=${!this._ws || !this._subject || this._loading}
        >
          Commit
        </button>
      </div>
      <textarea
        class="area"
        placeholder="Description (optional)"
        .value=${this._body}
        @input=${(e) => (this._body = e.target.value)}
      ></textarea>
      ${this._msg ? html`<div class="hint">${this._msg}</div>` : ""}
    `;
  }

  async _doCommit() {
    if (!this._ws) return;
    this._loading = true;
    this._msg = "";
    try {
      // Stage everything, then commit — through the Git UI service
      await this.ctrl.add(this._ws, { all: true });
      const output = await this.ctrl.commit(this._ws, {
        subject: this._subject,
        body: this._body,
      });
      this._msg = output && output.trim() ? output : "Commit created.";
      this._subject = "";
      this._body = "";
      this.dispatchEvent(
        new CustomEvent("git-commit:done", { bubbles: true, composed: true })
      );
    } catch (e) {
      this._msg = e?.message || String(e);
    } finally {
      this._loading = false;
    }
  }
}

customElements.define("git-commit", GitCommit);
