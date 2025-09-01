// components/md-stackedit.js
import { LitElement, html, css } from "lit";
import "https://cdn.jsdelivr.net/npm/marked/marked.min.js";
import "https://cdn.jsdelivr.net/npm/dompurify/dist/purify.min.js";
// StackEdit overlay editor (CDN):
import "https://unpkg.com/stackedit-js@1.0.7/docs/stackedit.min.js";
import "./file-bundle-bar.js";

export class MdStackedit extends LitElement {
  static styles = css`
    :host {
      display: block;
      height: 100%;
      min-height: 0;
    }
    .wrap {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }
    .pane {
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
      background: #0f0f12;
      border: 1px solid #1f1f22;
      border-radius: 10px;
    }
    .content {
      padding: 16px;
      color: #e7e7ea;
      line-height: 1.65;
    }
    .content h1,
    h2,
    h3 {
      margin-top: 1.2em;
    }
    .content pre,
    .content code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas,
        "Liberation Mono", monospace;
    }
    .hint {
      font-size: 12px;
      opacity: 0.7;
      padding: 12px;
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
    .toolbar {
      display: flex;
      gap: 8px;
      padding: 8px 12px;
      border-bottom: 1px solid #1f1f22;
    }
  `;

  static properties = {
    ws: { type: String },
    path: { type: String },

    // state
    _loading: { state: true },
    _error: { state: true },
    _text: { state: true },
    _encoding: { state: true },
    _dirty: { state: true }, // edited but not saved
  };

  constructor() {
    super();
    this.ws = "";
    this.path = null;

    this._loading = false;
    this._error = null;
    this._text = null;
    this._encoding = null;
    this._dirty = false;

    this._stack = null;
  }

  firstUpdated() {
    this._load();
  }
  updated(ch) {
    if (ch.has("ws") || ch.has("path")) this._load(true);
  }

  render() {
    const title = this.ws
      ? this.path
        ? `${this.ws} : ${this.path}`
        : "(no selection)"
      : "(no workspace)";
    const canRefresh = !!(this.ws && this.path && !this._loading);
    const hasText = !!(this._text && this._encoding === "utf8");

    return html`
      <div class="wrap">
        <file-bundle-bar
          .title=${title}
          .canRefresh=${canRefresh}
          .hasText=${hasText}
          .hasBundle=${false}
          .showOptions=${false}
          .refreshLabel=${"Reload"}
          @refresh=${() => this._load(true)}
          @copy=${this._copy}
          @download=${this._download}
        ></file-bundle-bar>

        ${this._renderBody(hasText)}
      </div>
    `;
  }

  _renderBody(hasText) {
    if (!this.path)
      return html`<div class="hint">Select a Markdown file.</div>`;
    if (this._loading) return html`<div class="hint">Loading…</div>`;
    if (this._error) return html`<div class="hint">Error: ${this._error}</div>`;
    if (!hasText)
      return html`<div class="hint">
        This file isn’t UTF-8 text (encoding: ${this._encoding || "unknown"}).
      </div>`;

    const raw = window.marked?.parse?.(this._text || "") ?? "";
    const safe = window.DOMPurify?.sanitize?.(raw) ?? raw;

    return html`
      <div class="toolbar">
        <button class="btn" @click=${this._openEditor}>
          ${this._dirty ? "Edit (unsaved…)" : "Edit"}
        </button>
        <button class="btn" @click=${this._save} ?disabled=${!this._dirty}>
          Save
        </button>
      </div>
      <div class="pane">
        <div class="content" .innerHTML=${safe}></div>
      </div>
    `;
  }

  // ---- data I/O ----
  async _load(force = false) {
    if (!this.ws || !this.path) {
      this._text = null;
      this._error = null;
      this._encoding = null;
      this._dirty = false;
      return;
    }
    if (!force && this._text != null) return;

    this._loading = true;
    this._error = null;
    this._dirty = false;
    try {
      const url = new URL("/rpc/fsRead", location.origin);
      url.searchParams.set("ws", this.ws);
      url.searchParams.set("path", this.path);
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const js = await r.json();
      this._text = js?.encoding === "utf8" ? js?.content ?? "" : null;
      this._encoding = js?.encoding ?? null;
    } catch (e) {
      this._text = null;
      this._error = e?.message || String(e);
    } finally {
      this._loading = false;
    }
  }

  async _save() {
    // If you don’t have /rpc/fsWrite yet, we’ll emit an event the host app can catch.
    try {
      const body = { ws: this.ws, path: this.path, content: this._text };
      const url = new URL("/rpc/fsWrite", location.origin);
      const r = await fetch(url.toString(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      this._dirty = false;
      this.dispatchEvent(
        new CustomEvent("saved", { bubbles: true, composed: true })
      );
    } catch (e) {
      // Fallback: surface content for custom save handler
      this.dispatchEvent(
        new CustomEvent("save-request", {
          detail: { ws: this.ws, path: this.path, content: this._text },
          bubbles: true,
          composed: true,
        })
      );
      // You can toast/log the error, but don’t block UX.
      console.warn("[md-stackedit] Save failed, emitted save-request:", e);
    }
  }

  // ---- StackEdit overlay ----
  _ensureStack() {
    if (this._stack) return this._stack;
    // global Stackedit from CDN script
    this._stack = new window.Stackedit();
    // When content changes in StackEdit:
    this._stack.on("fileChange", (file) => {
      const md = file?.content?.text ?? "";
      if (typeof md === "string") {
        this._text = md;
        this._dirty = true;
      }
    });
    return this._stack;
  }

  _openEditor() {
    if (!this._text) return;
    const stack = this._ensureStack();
    // You can pass name + text; StackEdit shows name in header
    stack.openFile({
      name: (this.path || "document.md").split("/").pop(),
      content: { text: this._text },
    });
  }

  // ---- bar actions ----
  async _copy() {
    if (!this._text) return;
    try {
      await navigator.clipboard.writeText(this._text);
    } catch {}
  }

  _download() {
    if (!this._text) return;
    const name = (this.path || "README.md").replace(/[^\w.-]+/g, "_");
    const blob = new Blob([this._text], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: name,
    });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
}

customElements.define("md-stackedit", MdStackedit);
