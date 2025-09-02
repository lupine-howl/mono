// components/file-viewer.js
import { LitElement, html, css } from "lit";
import "@loki/file-browser/ui/file-bundle-bar.js";

// CodeMirror via CDN
import {
  EditorView,
  keymap,
  highlightActiveLine,
  highlightActiveLineGutter,
  lineNumbers,
} from "https://esm.sh/@codemirror/view";
import { EditorState } from "https://esm.sh/@codemirror/state";
import {
  defaultKeymap,
  history,
  historyKeymap,
} from "https://esm.sh/@codemirror/commands";
import {
  indentOnInput,
  syntaxHighlighting,
  defaultHighlightStyle,
} from "https://esm.sh/@codemirror/language";
import { oneDark } from "https://esm.sh/@codemirror/theme-one-dark";
import { javascript } from "https://esm.sh/@codemirror/lang-javascript";
import { json } from "https://esm.sh/@codemirror/lang-json";
import { markdown } from "https://esm.sh/@codemirror/lang-markdown";
import { html as htmlLang } from "https://esm.sh/@codemirror/lang-html";
import { css as cssLang } from "https://esm.sh/@codemirror/lang-css";

export class FileViewerCM extends LitElement {
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
      height: 100%;
      min-height: 0;
    }
    .hint {
      font-size: 12px;
      opacity: 0.7;
      padding: 12px;
    }
    .pane {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-height: 0;
      border: 1px solid #1f1f22;
      border-radius: 10px;
      overflow: hidden;
      background: #0f0f12;
    }
    .host {
      flex: 1 1 auto;
      min-height: 0;
    }
    .cm-editor {
      height: 100%;
      background: #0f0f12;
      color: #e7e7ea;
    }
    .cm-scroller {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas,
        "Liberation Mono", monospace;
      font-size: 13px;
    }
    .actions {
      display: flex;
      gap: 8px;
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
    pre.viewer {
      margin: 0;
      padding: 12px;
      white-space: pre;
      overflow: auto;
      flex: 1 1 auto;
    }
  `;

  static properties = {
    ws: { type: String },
    path: { type: String },
    readOnly: { type: Boolean, attribute: "read-only" }, // editable by default
    _loading: { state: true },
    _error: { state: true },
    _text: { state: true },
    _encoding: { state: true }, // "utf8" | "base64"
    _mime: { state: true },
    _cmFailed: { state: true },
  };

  constructor() {
    super();
    this.ws = "";
    this.path = null;
    this.readOnly = false;

    this._loading = false;
    this._error = null;
    this._text = null;
    this._encoding = undefined;
    this._mime = undefined;
    this._cmFailed = false;

    this._view = null;
  }

  disconnectedCallback() {
    this._dispose();
    super.disconnectedCallback();
  }
  firstUpdated() {
    this._load();
  }
  updated(changed) {
    if (changed.has("ws") || changed.has("path")) this._load(true);
    if (changed.has("readOnly") && this._view) {
      // simplest: rebuild to apply readOnly consistently
      this._rebuild();
    }
  }

  render() {
    const title = this.ws
      ? this.path
        ? `${this.ws} : ${this.path}`
        : "(no selection)"
      : "(no workspace)";
    const canRefresh = !!(this.ws && this.path && !this._loading);
    const hasText = !!this._text && this._encoding !== "base64";

    return html`
      <div class="wrap">
        <file-bundle-bar
          .title=${title}
          .canRefresh=${canRefresh}
          .hasText=${hasText}
          .hasBundle=${hasText}
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
    if (!this.path) return html`<div class="hint">Select a file to view.</div>`;
    if (this._loading) return html`<div class="hint">Loading…</div>`;
    if (this._error) return html`<div class="hint">Error: ${this._error}</div>`;

    if (this._encoding === "base64") {
      return html`
        <div class="pane">
          <div class="actions">
            <div class="hint">
              This file looks binary
              (${this._mime || "application/octet-stream"}). Preview not
              supported.
            </div>
            <button class="btn" @click=${this._download}>Download</button>
          </div>
        </div>
      `;
    }

    if (this._cmFailed) {
      return html`<div class="pane">
        <pre class="viewer">${this._text ?? ""}</pre>
      </div>`;
    }

    return html`<div class="pane"><div id="host" class="host"></div></div>`;
  }

  // ------- data loading -------
  async _load(force = false) {
    if (!this.ws || !this.path) {
      this._text = null;
      this._error = null;
      this._encoding = undefined;
      this._mime = undefined;
      this._dispose();
      return;
    }
    if (!force && this._text != null) return;

    this._loading = true;
    this._error = null;
    this._cmFailed = false;

    try {
      const url = new URL("/rpc/fsRead", location.origin);
      url.searchParams.set("ws", this.ws);
      url.searchParams.set("path", this.path);

      const r = await fetch(url);
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);

      const ct = (r.headers.get("content-type") || "").toLowerCase();
      let text = "",
        mime = "";

      if (ct.includes("application/json")) {
        const json = await r.json();
        if (json?.encoding === "base64") {
          this._text = null;
          this._encoding = "base64";
          this._mime = json?.mime || "";
          this._loading = false; // <-- flip BEFORE render/mount
          await this.updateComplete;
          this._dispose(); // remove editor, render binary hint
          return;
        }
        text = json?.content ?? "";
        mime = json?.mime ?? "";
      } else {
        text = await r.text();
        mime = ct || "text/plain";
      }

      this._text = text;
      this._encoding = "utf8";
      this._mime = mime;

      this._loading = false; // <-- flip BEFORE mounting
      await this.updateComplete; // ensure #host is in DOM
      await new Promise(requestAnimationFrame);

      this._rebuild(); // recreate editor for this file
    } catch (e) {
      this._text = null;
      this._error = e?.message || String(e);
      this._dispose();
      this._loading = false;
    }
  }

  // ------- CodeMirror -------
  _languageExt() {
    const ext = (this.path?.split(".").pop() || "").toLowerCase();
    if (["js", "mjs", "cjs", "jsx"].includes(ext))
      return javascript({ jsx: true });
    if (["ts", "tsx"].includes(ext))
      return javascript({ typescript: true, jsx: ext === "tsx" });
    if (["json", "jsonc"].includes(ext)) return json();
    if (["md", "markdown", "mdx"].includes(ext)) return markdown();
    if (["html", "htm"].includes(ext)) return htmlLang();
    if (["css", "scss", "less"].includes(ext)) return cssLang();
    return []; // plaintext
  }
  /*
  _theme() {
    return EditorView.theme(
      {
        "&": { color: "#e7e7ea", backgroundColor: "#0f0f12" },
        ".cm-content": { caretColor: "#ffffff" },
        "&.cm-editor.cm-focused": { outline: "none" },
        ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#ffffff" },
        ".cm-selectionBackground, .cm-content ::selection": {
          backgroundColor: "#264f78",
        },
        ".cm-activeLine": { backgroundColor: "#14141a" },
      },
      { dark: true }
    );
  }
    */
  _theme() {
    // oneDark brings proper dark token colors.
    // Put your overrides AFTER to keep your app’s darker bg.
    const overrides = EditorView.theme(
      {
        "&": { backgroundColor: "#0f0f12", color: "#e7e7ea" },
        ".cm-gutters": {
          backgroundColor: "#0f0f12",
          border: "none",
          color: "#9a9aa2",
        },
        "&.cm-editor.cm-focused": { outline: "none" },
      },
      { dark: true }
    );

    return [oneDark, overrides];
  }

  async _rebuild() {
    const host = this.renderRoot?.querySelector?.("#host");
    if (!host) return;

    try {
      this._dispose(); // always rebuild on new file/readonly change

      const extensions = [
        this._theme(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        indentOnInput(),
        lineNumbers(),
        //syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        this._languageExt(),
      ];
      if (this.readOnly) extensions.push(EditorView.editable.of(false));

      this._view = new EditorView({
        state: EditorState.create({ doc: this._text ?? "", extensions }),
        parent: host,
      });
    } catch (err) {
      console.warn("[file-viewer] mount failed; falling back to <pre>:", err);
      this._dispose();
      this._cmFailed = true;
      this.requestUpdate();
    }
  }

  _dispose() {
    try {
      this._view?.destroy();
    } catch {}
    this._view = null;
  }

  // ------- actions -------
  async _copy() {
    if (!this._text || this._encoding === "base64") return;
    try {
      await navigator.clipboard.writeText(this._text);
    } catch {}
  }

  _download() {
    const name = (this.path || "file").replace(/[^\w.-]+/g, "_");
    if (this._encoding === "base64") {
      const a = Object.assign(document.createElement("a"), {
        href: this._buildUrl().toString(),
        download: `${name}`,
      });
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }
    if (!this._text) return;
    const blob = new Blob([this._text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: `${name}`,
    });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  _buildUrl() {
    const url = new URL("/rpc/fsRead", location.origin);
    url.searchParams.set("ws", this.ws);
    url.searchParams.set("path", this.path);
    return url;
  }
}

customElements.define("file-viewer-cm", FileViewerCM);
