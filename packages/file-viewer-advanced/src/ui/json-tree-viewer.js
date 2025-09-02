// components/json-tree-viewer.js
import { LitElement, html, css } from "lit";
import "@loki/file-browser/ui/file-bundle-bar.js";

// v3.x ESM import via CDN (standalone includes deps like Ajv)
import {
  createJSONEditor,
  toTextContent,
} from "https://cdn.jsdelivr.net/npm/vanilla-jsoneditor@3.8.0/standalone.js";

export class JsonTreeViewer extends LitElement {
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
      background: #0f0f12;
    }
    .host {
      height: 100%;
    }
    .hint {
      font-size: 12px;
      opacity: 0.7;
      padding: 12px;
    }
    .toolbar {
      display: flex;
      gap: 8px;
      padding: 8px 12px;
      border-bottom: 1px solid #1f1f22;
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
    .btn:disabled {
      opacity: 0.6;
      cursor: default;
    }
    .pill {
      margin-left: auto;
      font-size: 12px;
      opacity: 0.8;
    }
  `;

  static properties = {
    ws: { type: String },
    path: { type: String },
    readOnly: { type: Boolean, attribute: "read-only" },

    _loading: { state: true },
    _error: { state: true },
    _encoding: { state: true },
    _text: { state: true }, // canonical text content we save/copy
    _dirty: { state: true },
    _jsonError: { state: true }, // validation/parse error summary
  };

  constructor() {
    super();
    this.ws = "";
    this.path = null;
    this.readOnly = false;

    this._loading = false;
    this._error = null;
    this._encoding = null;
    this._text = null;
    this._dirty = false;
    this._jsonError = null;

    this._editor = null; // instance returned by createJSONEditor
  }

  disconnectedCallback() {
    this._dispose();
    super.disconnectedCallback();
  }
  firstUpdated() {
    this._load();
  }
  updated(ch) {
    if (ch.has("ws") || ch.has("path")) this._load(true);
    if (ch.has("readOnly") && this._editor) {
      // v3.x: update configuration via updateProps
      this._editor.updateProps({ readOnly: !!this.readOnly });
    }
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
    if (!this.path) return html`<div class="hint">Select a JSON file.</div>`;
    if (this._loading) return html`<div class="hint">Loading…</div>`;
    if (this._error) return html`<div class="hint">Error: ${this._error}</div>`;
    if (!hasText)
      return html`<div class="hint">
        This file isn’t UTF-8 text (encoding: ${this._encoding || "unknown"}).
      </div>`;

    return html`
      <div class="toolbar">
        <button class="btn" @click=${this._format} ?disabled=${!this._text}>
          Format
        </button>
        <button class="btn" @click=${this._minify} ?disabled=${!this._text}>
          Minify
        </button>
        <button
          class="btn"
          @click=${this._save}
          ?disabled=${this.readOnly || !this._dirty || !!this._jsonError}
        >
          Save
        </button>
        ${this._dirty ? html`<span class="pill">unsaved changes</span>` : ""}
        ${this._jsonError
          ? html`<span class="pill">JSON error: ${this._jsonError}</span>`
          : ""}
      </div>
      <div class="pane"><div id="host" class="host"></div></div>
    `;
  }

  // ------- data I/O -------
  async _load(force = false) {
    if (!this.ws || !this.path) {
      this._text = null;
      this._error = null;
      this._encoding = null;
      this._dirty = false;
      this._jsonError = null;
      this._dispose();
      return;
    }
    if (!force && this._text != null) return;

    this._loading = true;
    this._error = null;
    this._dirty = false;
    this._jsonError = null;
    this._dispose();

    try {
      const url = new URL("/rpc/fsRead", location.origin);
      url.searchParams.set("ws", this.ws);
      url.searchParams.set("path", this.path);
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const js = await r.json();

      this._encoding = js?.encoding ?? null;
      const content = js?.content ?? null;

      if (this._encoding !== "utf8") {
        this._text = null; // not editable here
      } else {
        this._text = typeof content === "string" ? content : "";
      }

      await this.updateComplete;
      this._mountEditor();
    } catch (e) {
      this._text = null;
      this._error = e?.message || String(e);
      this._dispose();
    } finally {
      this._loading = false;
    }
  }

  async _save() {
    if (this.readOnly || !this._text || this._jsonError) return;
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
      // Bubble up for external handling
      this.dispatchEvent(
        new CustomEvent("save-request", {
          detail: { ws: this.ws, path: this.path, content: this._text },
          bubbles: true,
          composed: true,
        })
      );
      console.warn("[json-tree-viewer] Save failed, emitted save-request:", e);
    }
  }

  // ------- editor lifecycle (v3.x) -------
  _mountEditor() {
    const host = this.renderRoot?.querySelector?.("#host");
    if (!host) return;

    // Build initial content for the editor
    let content;
    try {
      const parsed = this._text != null ? JSON.parse(this._text) : null;
      content = { json: parsed };
      this._jsonError = null;
    } catch {
      content = { text: this._text ?? "" }; // keep text if not valid JSON
      this._jsonError = "Invalid JSON (showing as text)";
    }

    // Create editor
    this._editor = createJSONEditor({
      target: host,
      props: {
        content,
        readOnly: !!this.readOnly,
        mainMenuBar: true,
        navigationBar: true,
        onChange: (updatedContent, _prev, { contentErrors }) => {
          // Keep canonical text and surface parse/validation errors
          const { text } = toTextContent(updatedContent);
          this._text = text ?? "";
          this._dirty = true;

          // Summarize errors, if any
          this._jsonError =
            contentErrors && contentErrors.length
              ? contentErrors[0]?.message || "Invalid JSON"
              : null;
        },
      },
    });
  }

  _dispose() {
    try {
      this._editor?.destroy?.();
    } catch {}
    this._editor = null;
  }

  // ------- toolbar actions -------
  _format() {
    if (!this._text) return;
    try {
      this._text = JSON.stringify(JSON.parse(this._text), null, 2);
      this._jsonError = null;
      this._dirty = true;
      // push into editor without full rebuild
      this._editor?.updateProps?.({ content: { text: this._text } });
    } catch {
      this._jsonError = "Invalid JSON";
      this._dirty = true;
    }
  }
  _minify() {
    if (!this._text) return;
    try {
      this._text = JSON.stringify(JSON.parse(this._text));
      this._jsonError = null;
      this._dirty = true;
      this._editor?.updateProps?.({ content: { text: this._text } });
    } catch {
      this._jsonError = "Invalid JSON";
      this._dirty = true;
    }
  }

  // ------- bar actions -------
  async _copy() {
    if (!this._text) return;
    try {
      await navigator.clipboard.writeText(this._text);
    } catch {}
  }
  _download() {
    if (!this._text) return;
    const name = (this.path || "data.json").replace(/[^\w.-]+/g, "_");
    const blob = new Blob([this._text], { type: "application/json" });
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

customElements.define("json-tree-viewer", JsonTreeViewer);
