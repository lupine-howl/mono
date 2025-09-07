// components/image-viewer.js
import { LitElement, html, css } from "lit";
import "@loki/file-browser/ui/file-bundle-bar.js";

export class ImageViewer extends LitElement {
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
      position: relative;
      flex: 1 1 auto;
      min-height: 0;
      border: 1px solid #1f1f22;
      border-radius: 10px;
      overflow: hidden;
      background: #0b0b0e;
      display: grid;
      place-items: center;
    }
    .hint {
      font-size: 12px;
      opacity: 0.7;
      padding: 12px;
    }
    img.viewer {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      image-rendering: auto;
      background: #0b0b0e;
    }
    .meta {
      position: absolute;
      left: 8px;
      bottom: 8px;
      padding: 4px 8px;
      background: rgba(0,0,0,.45);
      border: 1px solid #2a2a30;
      border-radius: 999px;
      font-size: 11px;
      color: #ddd;
      pointer-events: none;
    }
  `;

  static properties = {
    ws: { type: String },
    path: { type: String },

    _loading: { state: true },
    _error: { state: true },
    _src: { state: true },
    _mime: { state: true },
    _bytes: { state: true },
    _urlKind: { state: true }, // "public" | "data" | "blob"
  };

  constructor() {
    super();
    this.ws = "";
    this.path = null;

    this._loading = false;
    this._error = null;
    this._src = null;
    this._mime = null;
    this._bytes = null;
    this._urlKind = null;

    this._blobUrl = null;
  }

  disconnectedCallback() {
    this._revoke();
    super.disconnectedCallback();
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
    const hasImage = !!this._src;

    return html`
      <div class="wrap">
        <file-bundle-bar
          .title=${title}
          .canRefresh=${canRefresh}
          .hasText=${false}
          .hasBundle=${hasImage}
          .showOptions=${false}
          .refreshLabel=${"Reload"}
          @refresh=${() => this._load(true)}
          @download=${this._download}
        ></file-bundle-bar>

        ${this._renderBody()}
      </div>
    `;
  }

  _renderBody() {
    if (!this.path) return html`<div class="hint">Select an image file.</div>`;
    if (this._loading) return html`<div class="hint">Loading…</div>`;
    if (this._error) return html`<div class="hint">Error: ${this._error}</div>`;
    if (!this._src) return html`<div class="hint">No preview available.</div>`;

    return html`
      <div class="pane">
        <img class="viewer" src=${this._src} alt=${this.path} />
        <div class="meta">${this._mime || "image"}${this._bytes ? ` · ${this._fmtBytes(this._bytes)}` : ""}${this._urlKind ? ` · ${this._urlKind}` : ""}</div>
      </div>
    `;
  }

  _fmtBytes(n) {
    try {
      const kb = 1024, mb = kb * 1024;
      if (n >= mb) return `${(n / mb).toFixed(1)} MB`;
      if (n >= kb) return `${(n / kb).toFixed(1)} KB`;
      return `${n} B`;
    } catch { return String(n); }
  }

  _revoke() {
    try { if (this._blobUrl) URL.revokeObjectURL(this._blobUrl); } catch {}
    this._blobUrl = null;
  }

  async _findPublicUrl(path) {
    // Try common public URL candidates
    const base = path || "";
    const clean = base.replace(/^\/+/, "");
    const name = clean.split("/").pop();
    const candidates = [];
    if (clean.startsWith("images/")) candidates.push(`/${clean}`);
    candidates.push(`/images/${clean}`);
    if (name) candidates.push(`/images/${name}`);

    for (const url of candidates) {
      try {
        const r = await fetch(url, { method: "HEAD" });
        if (r.ok && (r.headers.get("content-type") || "").startsWith("image/")) {
          const len = parseInt(r.headers.get("content-length") || "", 10);
          return { url, mime: r.headers.get("content-type") || "image/*", bytes: Number.isFinite(len) ? len : null };
        }
      } catch {}
    }
    return null;
  }

  async _load(force = false) {
    if (!this.ws || !this.path) {
      this._revoke();
      this._src = null;
      this._mime = null;
      this._bytes = null;
      this._error = null;
      return;
    }
    if (!force && this._src != null) return;

    this._loading = true;
    this._error = null;
    this._revoke();

    try {
      // 1) Prefer a public /images URL if available
      const found = await this._findPublicUrl(this.path);
      if (found) {
        this._src = found.url;
        this._mime = found.mime;
        this._bytes = found.bytes;
        this._urlKind = "public";
        return;
      }

      // 2) Otherwise, fetch file contents via RPC and build a data/blob URL
      const url = new URL("/rpc/fsRead", location.origin);
      url.searchParams.set("ws", this.ws);
      url.searchParams.set("path", this.path);
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const js = await r.json();

      const encoding = js?.encoding || null;
      const content = js?.content || null;
      const mime = js?.mime || "";
      const size = js?.size || null;

      if (!content) throw new Error("No content returned");

      if (encoding === "base64") {
        this._src = `data:${mime || "application/octet-stream"};base64,${content}`;
        this._mime = mime || "image/*";
        this._bytes = size || null;
        this._urlKind = "data";
      } else if (encoding === "utf8") {
        // Handle texty images like SVG specially
        const lower = (this.path || "").toLowerCase();
        if (lower.endsWith(".svg") || (mime || "").includes("svg")) {
          const encoded = encodeURIComponent(content);
          this._src = `data:image/svg+xml;charset=utf-8,${encoded}`;
          this._mime = mime || "image/svg+xml";
          this._bytes = size || new Blob([content]).size;
          this._urlKind = "data";
        } else {
          // Fallback: create a blob URL
          const blob = new Blob([content], { type: mime || "application/octet-stream" });
          this._blobUrl = URL.createObjectURL(blob);
          this._src = this._blobUrl;
          this._mime = mime || "image/*";
          this._bytes = blob.size;
          this._urlKind = "blob";
        }
      } else {
        throw new Error(`Unsupported encoding: ${encoding}`);
      }
    } catch (e) {
      this._src = null;
      this._mime = null;
      this._bytes = null;
      this._urlKind = null;
      this._error = e?.message || String(e);
    } finally {
      this._loading = false;
    }
  }

  _download = () => {
    if (!this._src) return;
    const name = (this.path || "image").split("/").pop().replace(/[^\w.-]+/g, "_");
    const a = Object.assign(document.createElement("a"), {
      href: this._src,
      download: name,
    });
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
}

if (!customElements.get("image-viewer")) {
  customElements.define("image-viewer", ImageViewer);
}
