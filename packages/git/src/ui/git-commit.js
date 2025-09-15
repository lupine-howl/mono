import { LitElement, html, css } from "lit";
import { FileBrowserController } from "@loki/file-browser/util";
import { GitController } from "../shared/GitController.js";

export class GitCommit extends LitElement {
  static styles = css`
    :host { display: block; }
    .row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
    .field {
      flex: 1;
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
    .btn.icon { padding: 6px; min-width: 36px; }
    .commit { width: 100%; margin-top: 8px; }
    .hint { font-size: 12px; opacity: 0.7; }
  `;

  static properties = {
    _ws: { state: true },
    _subject: { state: true },
    _body: { state: true },
    _loading: { state: true },
    _msg: { state: true },
    _genLoading: { state: true },
    _userEdited: { state: true },
  };

  constructor() {
    super();
    this.fb = new FileBrowserController({ eventName: "files:change" });
    this.ctrl = new GitController(this);

    this._ws = this.fb.ws || "";
    this._subject = "";
    this._body = "";
    this._loading = false;
    this._msg = "";
    this._genLoading = false;
    this._userEdited = false;

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

  updated() {
    const draft = this.ctrl?.state?.commitDraft;
    if (draft && !this._userEdited) {
      if (draft.subject && this._subject !== draft.subject) this._subject = draft.subject;
      if (typeof draft.body === "string" && this._body !== draft.body) this._body = draft.body;
    }
  }

  render() {
    return html`
      <div class="row">
        <input
          class="field"
          placeholder="Commit subject"
          .value=${this._subject}
          @input=${(e) => { this._subject = e.target.value; this._userEdited = true; }}
        />
        <button
          class="btn icon"
          @click=${this._generate}
          ?disabled=${!this._ws || this._genLoading}
          title="Generate commit message"
          aria-label="Generate"
        >✨</button>
      </div>

      <textarea
        class="area"
        placeholder="Description (optional)"
        .value=${this._body}
        @input=${(e) => { this._body = e.target.value; this._userEdited = true; }}
      ></textarea>

      <button
        class="btn commit"
        @click=${this._doCommit}
        ?disabled=${!this._ws || !this._subject || this._loading}
        title="Create commit"
      >
        Commit
      </button>

      ${this._msg ? html`<div class="hint">${this._msg}</div>` : ""}
    `;
  }

  async _generate() {
    if (!this._ws) return;
    this._genLoading = true;
    try {
      const r = await this.ctrl.generateCommit(this._ws, {});
      if (r?.subject) {
        this._subject = r.subject;
        this._body = r.body || "";
        this._userEdited = false;
      }
    } catch (e) {
      this._msg = e?.message || String(e);
    } finally {
      this._genLoading = false;
    }
  }

  async _doCommit() {
    if (!this._ws) return;
    this._loading = true;
    this._msg = "";
    try {
      await this.ctrl.add(this._ws, { all: true });
      const output = await this.ctrl.commit(this._ws, {
        subject: this._subject,
        body: this._body,
      });
      this._msg = output && output.trim() ? output : "Commit created.";
      this._subject = "";
      this._body = "";
      this._userEdited = false;
      this.dispatchEvent(new CustomEvent("git-commit:done", { bubbles: true, composed: true }));
    } catch (e) {
      this._msg = e?.message || String(e);
    } finally {
      this._loading = false;
    }
  }
}

customElements.define("git-commit", GitCommit);
