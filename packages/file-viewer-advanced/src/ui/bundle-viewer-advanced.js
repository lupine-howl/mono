// components/bundle-viewer-advanced.js
import { LitElement, html, css } from "lit";
import "@loki/file-browser/ui/file-bundle-bar.js";

/**
 * Visual, pleasant bundle viewer for a directory ("bundle").
 * Expects an RPC endpoint /rpc/fsBundle?ws=&path= that returns:
 * { workspace, path, files: [{ path, name, content }] }
 */
export class BundleViewerAdvanced extends LitElement {
  static styles = css`
    :host { display:block; height:100%; min-height:0; }
    .wrap { display:flex; flex-direction:column; height:100%; min-height:0; gap:8px; }

    .toolbar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
    .pill { border:1px solid #2a2a30; border-radius:999px; padding:2px 8px; font-size:12px; opacity:.9; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; }
    .input, .sel, .btn { border:1px solid #2a2a30; background:#151519; color:inherit; font:inherit; border-radius:8px; }
    .input { padding:6px 10px; min-width:200px; }
    .sel { padding:6px 10px; }
    .btn { padding:6px 10px; cursor:pointer; }

    .list { display:flex; flex-direction:column; gap:8px; overflow:auto; }

    .row { display:grid; grid-template-columns: auto 1fr auto; gap:10px; align-items:center;
           border:1px solid #1f1f22; background:#0f0f12; border-radius:10px; padding:10px; }
    .icon { width:28px; height:28px; display:grid; place-items:center; border:1px solid #2a2a30; border-radius:8px; font-size:16px; background:#121217; }
    .meta { display:flex; gap:8px; flex-wrap:wrap; justify-self:end; }
    .chip { border:1px solid #2a2a30; border-radius:999px; padding:2px 8px; font-size:11px; opacity:.9; }

    .main { display:flex; flex-direction:column; gap:4px; min-width:0; }
    .name { font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .path { opacity:.8; font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    pre.snip { margin:0; padding:8px; background:#0b0b0e; border:1px solid #1f1f22; border-radius:8px; color:#e7e7ea; font-size:12px; max-height:140px; overflow:auto; }
    .hint { font-size:12px; opacity:.7; padding:12px; }

    .row:hover { border-color:#2a2a30; background:#111116; }
    .click { cursor:pointer; }
  `;

  static properties = {
    ws: { type: String },
    path: { type: String },

    // state
    _loading: { state: true },
    _error: { state: true },
    _bundle: { state: true },
    _filter: { state: true },
    _sort: { state: true }, // name|size|lines
  };

  constructor() {
    super();
    this.ws = "";
    this.path = null;

    this._loading = false;
    this._error = null;
    this._bundle = null;
    this._filter = "";
    this._sort = "name";
  }

  firstUpdated() { this._load(); }
  updated(ch) {
    if (ch.has("ws") || ch.has("path")) this._load(true);
  }

  render() {
    const title = this.ws
      ? this.path
        ? `${this.ws} : ${this.path}`
        : "(no selection)"
      : "(no workspace)";

    const hasBundle = !!(this._bundle?.files?.length);
    const canRefresh = !!(this.ws && this.path && !this._loading);

    return html`
      <div class="wrap">
        <file-bundle-bar
          .title=${title}
          .canRefresh=${canRefresh}
          .hasText=${hasBundle}
          .hasBundle=${hasBundle}
          .showOptions=${false}
          .refreshLabel=${"Reload"}
          @refresh=${() => this._load(true)}
          @download=${this._download}
          @copy=${this._copy}
        ></file-bundle-bar>

        ${this._renderBody()}
      </div>
    `;
  }

  _renderBody() {
    if (!this.path) return html`<div class="hint">Select a folder to view its bundle.</div>`;
    if (this._loading) return html`<div class="hint">Loading…</div>`;
    if (this._error) return html`<div class="hint">Error: ${this._error}</div>`;

    const files = Array.isArray(this._bundle?.files) ? this._bundle.files : [];
    if (!files.length) return html`<div class="hint">Empty folder.</div>`;

    const enriched = files.map((f) => this._summarizeFile(f));
    const filtered = this._filter
      ? enriched.filter((e) =>
          (e.name + " " + e.path + " " + e.highlight + " " + e.snippet)
            .toLowerCase()
            .includes(this._filter.toLowerCase())
        )
      : enriched;
    const sorted = filtered.sort((a, b) => {
      switch (this._sort) {
        case "size": return (b.bytes || 0) - (a.bytes || 0);
        case "lines": return (b.lines || 0) - (a.lines || 0);
        default: return a.name.localeCompare(b.name);
      }
    });

    return html`
      <div class="toolbar">
        <span class="pill">${files.length} files</span>
        ${this._totals(files)}
        <input class="input mono" placeholder="Filter (name, path, snippet)" .value=${this._filter}
               @input=${(e)=> this._filter = e.target.value} />
        <select class="sel mono" .value=${this._sort} @change=${(e)=> this._sort = e.target.value}>
          <option value="name">Sort: name</option>
          <option value="size">Sort: size</option>
          <option value="lines">Sort: lines</option>
        </select>
      </div>

      <div class="list">
        ${sorted.map((f) => html`
          <div class="row click" @click=${() => this._open(f.path)} title="Open ${f.path}">
            <div class="icon" aria-hidden="true">${f.icon}</div>
            <div class="main">
              <div class="name mono">${f.name}${f.highlight ? html` · <span class="pill">${f.highlight}</span>` : ""}</div>
              <div class="path mono">${f.path}</div>
              ${f.snippet ? html`<pre class="snip mono">${f.snippet}</pre>` : ""}
            </div>
            <div class="meta">
              ${Number.isFinite(f.lines) ? html`<span class="chip mono">${f.lines} lines</span>` : ""}
              ${Number.isFinite(f.bytes) ? html`<span class="chip mono">${this._fmtBytes(f.bytes)}</span>` : ""}
              ${f.ext ? html`<span class="chip mono">.${f.ext}</span>` : ""}
            </div>
          </div>
        `)}
      </div>
    `;
  }

  _totals(files) {
    try {
      let bytes = 0, lines = 0;
      for (const f of files) {
        if (typeof f.content === "string") {
          bytes += new Blob([f.content]).size;
          lines += (f.content.match(/\n/g) || []).length + 1;
        }
      }
      return html`<span class="pill mono">${files.length ? this._fmtBytes(bytes) : "0 B"}</span>
                  <span class="pill mono">${lines} total lines</span>`;
    } catch {
      return "";
    }
  }

  _iconFor(ext) {
    switch ((ext || "").toLowerCase()) {
      case "js": case "mjs": case "cjs": case "jsx": return "🟨";
      case "ts": case "tsx": return "🔷";
      case "json": return "🧩";
      case "md": case "markdown": return "📝";
      case "css": case "scss": case "less": return "🎨";
      case "html": case "htm": return "🌐";
      case "svg": return "🖼";
      default: return "📄";
    }
  }

  _summarizeFile(f) {
    const name = f?.name || (f?.path?.split("/").pop() ?? "file");
    const path = f?.path || name;
    const content = typeof f?.content === "string" ? f.content : "";
    const ext = (name.split(".").pop() || "").toLowerCase();
    const bytes = content ? new Blob([content]).size : 0;
    const lines = content ? (content.match(/\n/g) || []).length + 1 : 0;

    const meaningful = content
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const sig = meaningful.find((s) => /(export\s+(class|function|const|let|var)\s+\w+|class\s+\w+|function\s+\w+\s*\(|interface\s+\w+)/.test(s));
    const highlight = sig || "";

    const snippet = meaningful.slice(0, 4).join("\n").slice(0, 300);

    return { name, path, ext, bytes, lines, highlight, snippet, icon: this._iconFor(ext) };
  }

  async _load(force = false) {
    if (!this.ws || !this.path) {
      this._bundle = null;
      this._error = null;
      return;
    }
    if (!force && this._bundle) return;

    this._loading = true;
    this._error = null;
    try {
      const url = new URL("/rpc/fsBundle", location.origin);
      url.searchParams.set("ws", this.ws);
      url.searchParams.set("path", this.path);
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const js = await r.json();
      if (!js || !Array.isArray(js.files)) throw new Error("Invalid bundle");
      this._bundle = js;
    } catch (e) {
      this._bundle = null;
      this._error = e?.message || String(e);
    } finally {
      this._loading = false;
    }
  }

  _open(path) {
    // Bubble an intent; host/file-browser can react and change selection
    this.dispatchEvent(new CustomEvent("open-file", {
      detail: { ws: this.ws, path }, bubbles: true, composed: true
    }));
  }

  _fmtBytes(n) {
    try {
      const kb = 1024, mb = kb * 1024;
      if (n >= mb) return `${(n / mb).toFixed(1)} MB`;
      if (n >= kb) return `${(n / kb).toFixed(1)} KB`;
      return `${n} B`;
    } catch { return String(n); }
  }

  _download = () => {
    if (!this._bundle) return;
    const name = (this.path || "bundle").split("/").pop().replace(/[^\w.-]+/g, "_");
    const blob = new Blob([JSON.stringify(this._bundle, null, 2)], { type: "application/json" });
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

  _copy = async () => {
    if (!this._bundle) return;
    const text = JSON.stringify(this._bundle, null, 2);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for non-secure contexts or denied clipboard permission
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } finally {
        document.body.removeChild(ta);
      }
    }
  }
}

if (!customElements.get("bundle-viewer-advanced")) {
  customElements.define("bundle-viewer-advanced", BundleViewerAdvanced);
}
