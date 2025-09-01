// components/file-viewer.js
import { LitElement, html, css } from "lit";
import { fsRead } from "../shared/fsClient.js";

class FileViewer extends LitElement {
  static styles = css`
    :host {
      display: block;
      height: 100%;
    }
    pre {
      margin: 0;
      padding: 12px;
      height: 100%;
      overflow: auto;
      background: #0f0f12;
      color: #e7e7ea;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas,
        "Liberation Mono", monospace;
      font-size: 13px;
      border-radius: 8px;
    }
  `;

  static properties = {
    ws: { type: String },
    path: { type: String },
    _text: { state: true },
  };

  constructor() {
    super();
    this.ws = "";
    this.path = null;
    this._text = "";
  }

  firstUpdated() {
    this._load();
  }
  updated(changed) {
    if (changed.has("ws") || changed.has("path")) this._load();
  }

  render() {
    if (!this.path) return html`<pre>// Select a file to view</pre>`;
    return html`<pre><code>${this._text}</code></pre>`;
  }

  async _load() {
    if (!this.ws || !this.path) {
      this._text = "";
      return;
    }
    try {
      const json = await fsRead({ ws: this.ws, path: this.path });
      this._text = json?.content ?? "";
    } catch (e) {
      this._text = `// Error: ${e.message}`;
    }
  }
}

customElements.define("file-code-viewer", FileViewer);
