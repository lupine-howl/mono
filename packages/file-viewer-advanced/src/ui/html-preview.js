// components/html-preview.js
import { LitElement, html, css } from "lit";
import "@loki/file-browser/ui/file-bundle-bar.js";

export class HtmlPreview extends LitElement {
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
      border: 1px solid #1f1f22;
      border-radius: 10px;
      overflow: hidden;
    }
    iframe {
      width: 100%;
      height: 100%;
      border: 0;
      background: #fff;
    }
    .hint {
      font-size: 12px;
      opacity: 0.7;
      padding: 12px;
    }
  `;
  static properties = {
    ws: { type: String },
    path: { type: String },
    _loading: { state: true },
    _error: { state: true },
    _text: { state: true },
    _encoding: { state: true },
  };
  constructor() {
    super();
    this.ws = "";
    this.path = null;
    this._loading = false;
    this._error = null;
    this._text = null;
    this._encoding = null;
  }
  firstUpdated() {
    this._load();
  }
  updated(c) {
    if (c.has("ws") || c.has("path")) this._load(true);
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
      return html`<div class="hint">Select an HTML or CSS file.</div>`;
    if (this._loading) return html`<div class="hint">Loading…</div>`;
    if (this._error) return html`<div class="hint">Error: ${this._error}</div>`;
    if (this._encoding !== "utf8")
      return html`<div class="hint">
        This file isn’t UTF-8 text (encoding: ${this._encoding || "unknown"}).
      </div>`;

    // If it's a CSS file, wrap it in a tiny HTML shell
    const lower = (this.path || "").toLowerCase();
    const isCss = lower.endsWith(".css");
    const srcdoc = isCss
      ? `<!doctype html><meta charset="utf-8"><style>${this._text}</style><main><h3>CSS Preview</h3><p>Add HTML next to your CSS to see effects.</p></main>`
      : this._text;

    // sandbox for safety; allow-same-origin only if you need it
    return html`<div class="pane">
      <iframe
        sandbox="allow-forms allow-modals allow-popups allow-presentation allow-scripts"
        .srcdoc=${srcdoc}
      ></iframe>
    </div>`;
  }

  async _load(force = false) {
    if (!this.ws || !this.path) {
      this._text = null;
      this._error = null;
      this._encoding = null;
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
      if (this._encoding !== "utf8") this._text = null;
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
    const name = (this.path || "index.html").replace(/[^\w.-]+/g, "_");
    const mime = (this.path || "").toLowerCase().endsWith(".css")
      ? "text/css"
      : "text/html";
    const blob = new Blob([this._text], { type: mime });
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
customElements.define("html-preview", HtmlPreview);
