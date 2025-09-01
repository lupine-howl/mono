// components/file-viewer.js
import { LitElement, html, css } from "lit";
import "./file-bundle-viewer.js";
import "./file-viewer-cm.js";
import "./md-viewer.js";
//import "./csv-viewer.js";
import "./html-preview.js";
import "./json-tree-viewer.js";

export class FileViewer extends LitElement {
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
    .hint {
      font-size: 12px;
      opacity: 0.7;
      padding: 12px;
    }
  `;
  static properties = {
    ws: { type: String },
    path: { type: String },
    readOnly: { type: Boolean, attribute: "read-only" },
    /** "auto" (default) | "bundle" | "md" | "csv" | "html" | "cm" */
    type: { type: String },
    _loading: { state: true },
    _error: { state: true },
    _resolved: { state: true }, // one of above (minus "auto")
    _mime: { state: true },
    _encoding: { state: true },
  };
  constructor() {
    super();
    this.ws = "";
    this.path = null;
    this.readOnly = false;
    this.type = "auto";
    this._loading = false;
    this._error = null;
    this._resolved = null;
    this._mime = null;
    this._encoding = null;
  }
  firstUpdated() {
    this._resolve();
  }
  updated(ch) {
    if (ch.has("ws") || ch.has("path") || ch.has("type")) this._resolve();
  }

  render() {
    if (!this.path)
      return html`<div class="hint">Select a file or folder.</div>`;
    if (this._loading) return html`<div class="hint">Loading…</div>`;
    if (this._error) return html`<div class="hint">Error: ${this._error}</div>`;

    switch (this._resolved) {
      case "bundle":
        return html`<div class="wrap">
          <file-bundle-viewer
            .ws=${this.ws}
            .path=${this.path}
          ></file-bundle-viewer>
        </div>`;
      case "md":
        return html`<div class="wrap">
          <md-viewer .ws=${this.ws} .path=${this.path}></md-viewer>
        </div>`;
      //case "csv":
      //return html`<div class="wrap">
      //<csv-viewer .ws=${this.ws} .path=${this.path}></csv-viewer>
      //</div>`;
      case "html":
        return html`<div class="wrap">
          <html-preview .ws=${this.ws} .path=${this.path}></html-preview>
        </div>`;
      //case "json":
      //return html`<div class="wrap">
      //<json-tree-viewer
      //.ws=${this.ws}
      //.path=${this.path}
      //.readOnly=${this.readOnly}
      //></json-tree-viewer>
      //</div>`;
      case "cm":
      default:
        return html`<div class="wrap">
          <file-viewer-cm
            .ws=${this.ws}
            .path=${this.path}
            .readOnly=${this.readOnly}
          ></file-viewer-cm>
        </div>`;
    }
  }

  async _resolve() {
    this._error = null;
    this._mime = null;
    this._encoding = null;
    this._resolved = null;
    if (!this.ws || !this.path) return;

    // manual override
    if (this.type && this.type !== "auto") {
      this._resolved = this.type;
      return;
    }

    this._loading = true;
    try {
      const url = new URL("/rpc/fsRead", location.origin);
      url.searchParams.set("ws", this.ws);
      url.searchParams.set("path", this.path);
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const js = await r.json();
      this._mime = js?.mime || null;
      this._encoding = js?.encoding || null;

      if (
        js?.error === "EISDIR" ||
        js?.mime === "inode/directory" ||
        js?.encoding === "none"
      ) {
        this._resolved = "bundle";
      } else {
        const ext = (this.path.split(".").pop() || "").toLowerCase();
        if (["md", "markdown", "mdx"].includes(ext)) this._resolved = "md";
        else if (ext === "csv") this._resolved = "csv";
        else if (["html", "htm", "css"].includes(ext)) this._resolved = "html";
        else if (
          ext === "json" ||
          (this._mime || "").includes("application/json")
        )
          this._resolved = "json";
        else this._resolved = "cm";
      }
    } catch (e) {
      this._error = e?.message || String(e);
    } finally {
      this._loading = false;
    }
  }
}
customElements.define("file-viewer", FileViewer);
