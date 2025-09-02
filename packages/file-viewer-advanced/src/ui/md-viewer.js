// components/md-viewer.js
import { LitElement, html, css } from "lit";
import "https://cdn.jsdelivr.net/npm/marked/marked.min.js";
import "https://cdn.jsdelivr.net/npm/dompurify/dist/purify.min.js";
import "@loki/file-browser/ui/file-bundle-bar.js";

export class MdViewer extends LitElement {
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
      line-height: 1.6;
    }
    .hint {
      font-size: 12px;
      opacity: 0.7;
      padding: 12px;
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
  `;
  static properties = {
    ws: { type: String },
    path: { type: String },
    _loading: { state: true },
    _error: { state: true },
    _text: { state: true },
    _encoding: { state: true }, // "utf8" | "base64" | "none"
    _mime: { state: true },
  };
  constructor() {
    super();
    this.ws = "";
    this.path = null;
    this._loading = false;
    this._error = null;
    this._text = null;
    this._encoding = null;
    this._mime = null;
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

        ${this._renderBody()}
      </div>
    `;
  }
  _renderBody() {
    if (!this.path)
      return html`<div class="hint">Select a Markdown file.</div>`;
    if (this._loading) return html`<div class="hint">Loading…</div>`;
    if (this._error) return html`<div class="hint">Error: ${this._error}</div>`;
    if (this._encoding !== "utf8")
      return html`<div class="hint">
        This file isn’t UTF-8 text (encoding: ${this._encoding || "unknown"}).
      </div>`;

    const raw = window.marked?.parse?.(this._text || "") ?? "";
    const safe = window.DOMPurify?.sanitize?.(raw) ?? raw;
    return html`<div class="pane">
      <div class="content" .innerHTML=${safe}></div>
    </div>`;
  }

  async _load(force = false) {
    if (!this.ws || !this.path) {
      this._text = null;
      this._error = null;
      this._encoding = null;
      this._mime = null;
      return;
    }
    if (!force && this._text != null) return;
    this._loading = true;
    this._error = null;
    try {
      const url = new URL("/rpc/fsRead", location.origin);
      url.searchParams.set("ws", this.ws);
      url.searchParams.set("path", this.path);
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const js = await r.json();
      this._text = js?.content ?? null;
      this._encoding = js?.encoding ?? null;
      this._mime = js?.mime ?? "";
      if (this._encoding === "base64") {
        // don’t try to decode; just show hint
        this._text = null;
      }
    } catch (e) {
      this._text = null;
      this._error = e?.message || String(e);
    } finally {
      this._loading = false;
    }
  }

  async _copy() {
    if (!this._text || this._encoding !== "utf8") return;
    try {
      await navigator.clipboard.writeText(this._text);
    } catch {}
  }
  _download() {
    if (!this._text || this._encoding !== "utf8") return;
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
customElements.define("md-viewer", MdViewer);
