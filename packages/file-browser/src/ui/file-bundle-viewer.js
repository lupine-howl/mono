import { LitElement, html, css } from "lit";
import "./file-bundle-bar.js";
import { fsSnapshot } from "../shared/fsClient.js";

export class FileBundleViewer extends LitElement {
  static styles = css`
    :host {
      display: block;
      height: 100%;
      min-height: 0;
    }
    .wrap {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px;
      min-height: 0;
      height: 100%;
    }
    .hint {
      font-size: 12px;
      opacity: 0.7;
    }
    .pane {
      min-height: 0;
      border: 1px solid #1f1f22;
      border-radius: 10px;
      background: #0f0f12;
      position: relative;
      padding: 12px;
    }
    pre {
      margin: 0;
      white-space: pre-wrap;
      overflow-y: visible;
      overflow-x: hidden;
      min-width: 100%;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas,
        "Liberation Mono", monospace;
      font-size: 13px;
      line-height: 1.5;
    }
    .empty {
      padding: 12px;
    }
    .summary {
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
    }
    .pill {
      border: 1px solid #2a2a30;
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 12px;
      opacity: 0.9;
    }
  `;

  static properties = {
    ws: { type: String },
    path: { type: String },
    type: { type: String },
    _loading: { state: true },
    _error: { state: true },
    _bundle: { state: true },
    _text: { state: true },
    _loadedKey: { state: true },
    _recursive: { state: true },
    _includeHidden: { state: true },
    _includeBinary: { state: true },
    _maxFiles: { state: true },
    _maxBytesTotal: { state: true },
    _maxBytesPerFile: { state: true },
  };

  constructor() {
    super();
    this.ws = "";
    this.path = null;
    this.type = null;
    this._loading = false;
    this._error = null;
    this._bundle = null;
    this._text = null;
    this._loadedKey = null;
    this._recursive = true;
    this._includeHidden = true;
    this._includeBinary = true;
    this._maxFiles = 500;
    this._maxBytesTotal = 2_000_000;
    this._maxBytesPerFile = 200_000;
  }

  updated(changed) {
    if (changed.has("ws") || changed.has("path") || changed.has("type")) {
      this._maybeLoad();
    }
  }

  render() {
    const title = this.ws
      ? this.path
        ? `${this.ws} : ${this.path}`
        : "(no selection)"
      : "(no workspace)";
    const canRefresh = !!(this.ws && this.path && !this._loading);

    return html`
      <div class="wrap">
        <file-bundle-bar
          .title=${title}
          .recursive=${this._recursive}
          .includeHidden=${this._includeHidden}
          .includeBinary=${this._includeBinary}
          .maxFiles=${this._maxFiles}
          .maxBytesTotal=${this._maxBytesTotal}
          .maxBytesPerFile=${this._maxBytesPerFile}
          .canRefresh=${canRefresh}
          .hasText=${!!this._text}
          .hasBundle=${!!this._bundle}
          @opt-change=${(e) => this._setOpt(e.detail.key, e.detail.value)}
          @refresh=${this._refresh}
          @copy=${this._copy}
          @download=${this._download}
        ></file-bundle-bar>

        ${this._renderBody()}
      </div>
    `;
  }

  _renderBody() {
    if (!this.path)
      return html`<div class="empty hint">
        Select a file or directory to bundle.
      </div>`;
    if (this._loading) return html`<div class="empty hint">Bundling…</div>`;
    if (this._error)
      return html`<div class="empty hint">Error: ${this._error}</div>`;
    if (!this._bundle)
      return html`<div class="empty hint">No bundle available.</div>`;

    const { totals, files = [], truncated } = this._bundle || {};
    return html`
      <div class="summary">
        <span class="pill">files: ${files.length}</span>
        <span class="pill">bytes: ${totals?.bytesContent ?? 0}</span>
        ${truncated ? html`<span class="pill">truncated</span>` : ""}
      </div>
      <div class="pane">
        <pre>${this._text}</pre>
      </div>
    `;
  }

  _setOpt(key, val) {
    this[key] = val;
    this._loadedKey = null;
  }

  _optsKey() {
    return [
      this._recursive ? 1 : 0,
      this._includeHidden ? 1 : 0,
      this._includeBinary ? 1 : 0,
      this._maxFiles,
      this._maxBytesTotal,
      this._maxBytesPerFile,
    ].join(":");
  }

  _canFetch() {
    return !!(this.ws && this.path);
  }

  _refresh = () => this._maybeLoad(true);

  async _maybeLoad(force = false) {
    if (!this._canFetch()) {
      this._bundle = null;
      this._text = null;
      this._error = null;
      this._loading = false;
      this._loadedKey = null;
      return;
    }
    const key = `${this.ws}:${this.path}:${this._optsKey()}`;
    if (!force && key === this._loadedKey && this._bundle && !this._error)
      return;

    this._loading = true;
    this._error = null;
    this._bundle = null;
    this._text = null;
    try {
      const json = await fsSnapshot({
        ws: this.ws,
        path: this.path,
        recursive: this._recursive ? "1" : "0",
        includeHidden: this._includeHidden ? "1" : "0",
        includeBinary: this._includeBinary ? "1" : "0",
        maxFiles: String(this._maxFiles),
        maxBytesTotal: String(this._maxBytesTotal),
        maxBytesPerFile: String(this._maxBytesPerFile),
      });
      const text = JSON.stringify(json, null, 2);
      this._bundle = json;
      this._text = text;
      this._loadedKey = key;
    } catch (e) {
      this._bundle = null;
      this._text = null;
      this._error = e?.message || String(e);
      this._loadedKey = null;
    } finally {
      this._loading = false;
    }
  }

  async _copy() {
    if (!this._text) return;
    try {
      await navigator.clipboard.writeText(this._text);
    } catch {}
  }

  _download() {
    if (!this._bundle) return;
    const name = (this.path || "bundle").replace(/[^\w.-]+/g, "_");
    const blob = new Blob([JSON.stringify(this._bundle, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: `${name}.bundle.json`,
    });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
}

customElements.define("file-bundle-viewer", FileBundleViewer);
