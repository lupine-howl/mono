// components/csv-viewer.js
import { LitElement, html, css } from "lit";
import "https://cdn.jsdelivr.net/npm/papaparse/papaparse.min.js";
import "./file-bundle-bar.js";

export class CsvViewer extends LitElement {
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
    table {
      border-collapse: collapse;
      width: 100%;
      color: #e7e7ea;
      font-size: 13px;
    }
    th,
    td {
      border: 1px solid #2a2a30;
      padding: 6px 8px;
      white-space: nowrap;
    }
    thead {
      position: sticky;
      top: 0;
      background: #121217;
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
    _rows: { state: true },
  };
  constructor() {
    super();
    this.ws = "";
    this.path = null;
    this._loading = false;
    this._error = null;
    this._text = null;
    this._encoding = null;
    this._rows = [];
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
    if (!this.path) return html`<div class="hint">Select a CSV file.</div>`;
    if (this._loading) return html`<div class="hint">Loading…</div>`;
    if (this._error) return html`<div class="hint">Error: ${this._error}</div>`;
    if (this._encoding !== "utf8")
      return html`<div class="hint">
        This file isn’t UTF-8 text (encoding: ${this._encoding || "unknown"}).
      </div>`;
    const rows = this._rows || [];
    if (!rows.length) return html`<div class="hint">No rows.</div>`;
    const header = rows[0] || [];
    const body = rows.slice(1);
    return html`
      <div class="pane">
        <table>
          <thead>
            <tr>
              ${header.map((h) => html`<th>${h}</th>`)}
            </tr>
          </thead>
          <tbody>
            ${body.map(
              (r) =>
                html`<tr>
                  ${(r || []).map((c) => html`<td>${c}</td>`)}
                </tr>`
            )}
          </tbody>
        </table>
      </div>
    `;
  }

  async _load(force = false) {
    if (!this.ws || !this.path) {
      this._text = null;
      this._rows = [];
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
      if (this._encoding === "utf8") {
        const parsed = window.Papa.parse(this._text, { dynamicTyping: false });
        this._rows = parsed?.data || [];
      } else {
        this._rows = [];
      }
    } catch (e) {
      this._text = null;
      this._rows = [];
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
    const name = (this.path || "data.csv").replace(/[^\w.-]+/g, "_");
    const blob = new Blob([this._text], { type: "text/csv" });
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
customElements.define("csv-viewer", CsvViewer);
