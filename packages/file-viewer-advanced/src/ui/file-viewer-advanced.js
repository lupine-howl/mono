// components/file-viewer.js
import { LitElement, html, css } from "lit";
import { FileBrowserController } from "@loki/file-browser/util";
import "@loki/file-browser/ui/file-bundle-bar.js";
import "./file-viewer-cm.js";
import "./md-viewer.js";
//import "./csv-viewer.js";
import "./html-preview.js";
import "./json-tree-viewer.js";
import "./package-viewer.js";

export class FileViewerAdvanced extends LitElement {
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
    readOnly: { type: Boolean, attribute: "read-only" },
    /** "auto" (default) | "bundle" | "md" | "csv" | "html" | "json" | "code" */
    type: { type: String },

    // internal state
    _ws: { state: true },
    _path: { state: true },
    _selType: { state: true },
    _loading: { state: true },
    _error: { state: true },
    _resolved: { state: true },
    _mime: { state: true },
    _encoding: { state: true },
  };

  constructor() {
    super();
    this.readOnly = false;
    this.type = "auto";

    // internal state
    this._ws = "";
    this._path = null;
    this._selType = null;
    this._loading = false;
    this._error = null;
    this._resolved = null;
    this._mime = null;
    this._encoding = null;

    // self-instantiate controller (autowires singleton service)
    this.controller = new FileBrowserController({ eventName: "files:change" });

    // react to file-browser changes
    this._onChange = (e) => {
      const { ws, selection } = e.detail ?? {};
      if (ws !== undefined) {
        this._ws = ws;
        this._path = null;
        this._selType = null;
      }
      if (selection) {
        this._path = selection.path ?? null;
        this._selType = selection.type ?? null;
      }
      this._resolve();
    };
    this.controller.addEventListener("files:change", this._onChange);

    // hydrate right away (before/after ready)
    if (this.controller.ws || this.controller.selection) {
      this._ws = this.controller.ws ?? "";
      this._path = this.controller.selection?.path ?? null;
      this._selType = this.controller.selection?.type ?? null;
      this._resolve();
    } else {
      this.controller
        .ready?.()
        .then(() => {
          this._ws = this.controller.ws ?? "";
          this._path = this.controller.selection?.path ?? null;
          this._selType = this.controller.selection?.type ?? null;
          this._resolve();
          this.requestUpdate();
        })
        .catch(() => {});
    }
  }

  updated(changed) {
    if (changed.has("type")) this._resolve();
  }

  render() {
    if (!this._path)
      return html`<div class="hint">Select a file or folder.</div>`;
    if (this._loading) return html`<div class="hint">Loading…</div>`;
    if (this._error) return html`<div class="hint">Error: ${this._error}</div>`;

    if (this._path.endsWith("package.json")) {
      return html`<div class="wrap">
        <package-viewer
          .ws=${this._ws}
          .path=${this._path}
          .readOnly=${this.readOnly}
        ></package-viewer>
      </div>`;
    }

    switch (this._resolved) {
      case "bundle":
        return html`<div class="wrap">
          <file-bundle-viewer
            .ws=${this._ws}
            .path=${this._path}
          ></file-bundle-viewer>
        </div>`;
      case "md":
        return html`<div class="wrap">
          <md-viewer .ws=${this._ws} .path=${this._path}></md-viewer>
        </div>`;
      //case "csv":
      //return html`<div class="wrap">
      //<csv-viewer .ws=${this._ws} .path=${this._path}></csv-viewer>
      //</div>`;
      case "html":
        return html`<div class="wrap">
          <html-preview .ws=${this._ws} .path=${this._path}></html-preview>
        </div>`;
      //case "json":
      //return html`<div class="wrap">
      //<json-tree-viewer
      //.ws=${this._ws}
      //.path=${this._path}
      //.readOnly=${this.readOnly}
      //></json-tree-viewer>
      //</div>`;
      case "cm":
      default:
        return html`<div class="wrap">
          <file-viewer-cm
            .ws=${this._ws}
            .path=${this._path}
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
    if (!this._ws || !this._path) return;

    if (this._selType === "dir") {
      this._resolved = "bundle";
      return;
    }

    // manual override
    if (this.type && this.type !== "auto") {
      this._resolved = this.type;
      return;
    }

    this._loading = true;
    try {
      const url = new URL("/rpc/fsRead", location.origin);
      url.searchParams.set("ws", this._ws);
      url.searchParams.set("path", this._path);
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
        const ext = (this._path.split(".").pop() || "").toLowerCase();
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
if (!customElements.get("file-viewer-advanced"))
  customElements.define("file-viewer-advanced", FileViewerAdvanced);
