import { LitElement, html, css } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { marked } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js/lib/core";
import DOMPurify from "dompurify";

// Register only the langs you care about (keeps bundle small)
import js from "highlight.js/lib/languages/javascript";
import ts from "highlight.js/lib/languages/typescript";
import json from "highlight.js/lib/languages/json";
import bash from "highlight.js/lib/languages/bash";
import shell from "highlight.js/lib/languages/shell";
import cssLang from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml"; // html/svg/xml
import md from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";

hljs.registerLanguage("javascript", js);
hljs.registerLanguage("js", js);
hljs.registerLanguage("typescript", ts);
hljs.registerLanguage("ts", ts);
hljs.registerLanguage("json", json);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("sh", shell);
hljs.registerLanguage("shell", shell);
hljs.registerLanguage("css", cssLang);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("markdown", md);
hljs.registerLanguage("md", md);
hljs.registerLanguage("python", python);

marked.use(
  markedHighlight({
    langPrefix: "hljs language-",
    highlight(code, lang) {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value;
      }
      return hljs.highlightAuto(code).value;
    },
  })
);

export class ChatMessage extends LitElement {
  static styles = css`
    :host {
      display: block;
      overflow: hidden;
    }
    .msg {
      padding: 8px 14px;
      line-height: 1.5em;
      background: #303030;
      color: inherit;
      width: fit-content;
      text-align: left;
      white-space: normal;
      justify-self: start;
    }
    .msg.user {
      background: #2f4f99;
    }
    .msg.assistant {
      justify-self: start;
      background: transparent;
    }
    .msg.system {
      justify-self: start;
      background: #131317;
      opacity: 0.9;
    }
    .msg p {
      max-width: 700px;
      overflow-wrap: break-word;
      white-space: pre-wrap;
      margin: 0.4em 0;
    }
    .msg code {
      background: #222;
      padding: 0 4px;
      border-radius: 4px;
    }
    .msg pre {
      background: #1c1c20;
      border: 1px solid #2a2a30;
      padding: 10px 12px;
      border-radius: 10px;
      overflow-x: auto;
      white-space: pre;
      word-break: normal;
      max-width: 100%;
      position: relative;
      margin: 10px 0;
    }
    /* copy button */
    .codebox {
      position: relative;
    }
    .copy-btn {
      position: absolute;
      top: 8px;
      right: 8px;
      font: inherit;
      padding: 4px 8px;
      border-radius: 8px;
      border: 1px solid #2a2a30;
      background: #0f0f12;
      color: #e7e7ea;
      cursor: pointer;
      opacity: 0.85;
    }
    .copy-btn:hover {
      background: #131317;
      opacity: 1;
    }

    /* Minimal highlight.js dark theme (self-contained) */
    .hljs {
      color: #e7e7ea;
      background: transparent;
    }
    .hljs-comment,
    .hljs-quote {
      color: #8a8f98;
      font-style: italic;
    }
    .hljs-keyword,
    .hljs-selector-tag,
    .hljs-subst {
      color: #c792ea;
    }
    .hljs-number,
    .hljs-literal,
    .hljs-variable,
    .hljs-template-variable,
    .hljs-attr {
      color: #f78c6c;
    }
    .hljs-string,
    .hljs-doctag {
      color: #c3e88d;
    }
    .hljs-title,
    .hljs-section,
    .hljs-selector-id {
      color: #82aaff;
    }
    .hljs-subst,
    .hljs-type,
    .hljs-class {
      color: #ffcb6b;
    }
    .hljs-symbol,
    .hljs-bullet,
    .hljs-link {
      color: #89ddff;
    }
    .hljs-meta {
      color: #89ddff;
    }
    .hljs-emphasis {
      font-style: italic;
    }
    .hljs-strong {
      font-weight: 600;
    }

    /* hide the raw slot; we re-render its text as markdown */
    slot[hidden] {
      display: none !important;
    }
  `;

  static properties = {
    // Existing API:
    message: { attribute: false },
    enableCopy: { type: Boolean, reflect: true },
    enableHighlight: { type: Boolean, reflect: true },
    markdown: { type: Boolean, reflect: true },
    plaintext: { type: Boolean, reflect: true },

    // New: allow styling via attribute e.g. <chat-message role="user">
    role: { type: String, reflect: true },

    // Optional direct content override (string). If not set, we read from slot.
    content: { type: String },
  };

  constructor() {
    super();
    this.message = null;
    this.enableCopy = true;
    this.enableHighlight = true;
    this.markdown = true;
    this.plaintext = false;
    this.role = ""; // user|assistant|system
    this.content = undefined;

    this._slotText = "";
  }

  // Read light-DOM text on slot changes
  _onSlotChange(e) {
    const slot = e.target;
    const text = (slot.assignedNodes({ flatten: true }) || [])
      .map(
        (n) =>
          (n.nodeType === Node.TEXT_NODE ? n.nodeValue : n.textContent) || ""
      )
      .join("");
    this._slotText = String(text).trim();
    this.requestUpdate();
  }

  _currentRole() {
    // Prefer message.role, then attribute/property role, else 'assistant'
    const m = this.message ?? {};
    return m.role || this.role || "assistant";
  }

  _currentContent() {
    // Priority: explicit prop `content` → message.content → slot text
    if (this.content != null) return String(this.content).trim();
    const m = this.message ?? {};
    if (m.content != null) return String(this.content).trim();
    return this._slotText || "";
  }

  render() {
    const role = this._currentRole();
    const displayRaw = this._currentContent();
    const useMarkdown = this.markdown && !this.plaintext;

    if (useMarkdown) {
      const htmlStr = marked.parse(displayRaw);
      const safe = DOMPurify.sanitize(htmlStr, {
        USE_PROFILES: { html: true },
        ADD_ATTR: ["class"],
      });
      return html`
        <div class="msg ${role}">
          <slot hidden @slotchange=${this._onSlotChange}></slot>
          <div class="md" @click=${this._onClickCopy}>${unsafeHTML(safe)}</div>
        </div>
      `;
    }

    // Plaintext rendering
    return html`
      <div class="msg ${role}">
        <slot @slotchange=${this._onSlotChange}></slot>
      </div>
    `;
  }

  firstUpdated() {
    this._enhanceCodeBlocks();
  }

  updated(changed) {
    if (
      changed.has("message") ||
      changed.has("content") ||
      changed.has("markdown") ||
      changed.has("plaintext") ||
      changed.has("enableCopy") ||
      changed.has("enableHighlight") ||
      changed.has("role")
    ) {
      this._enhanceCodeBlocks();
    }
  }

  _enhanceCodeBlocks() {
    if (!this.markdown || this.plaintext) return;
    if (!this.enableCopy && !this.enableHighlight) return;

    const root = this.renderRoot.querySelector(".md");
    if (!root) return;

    root.querySelectorAll("pre > code").forEach((codeEl) => {
      const pre = codeEl.parentElement;
      if (!pre) return;

      if (!pre.parentElement.classList.contains("codebox")) {
        const wrap = document.createElement("div");
        wrap.className = "codebox";
        pre.replaceWith(wrap);
        wrap.appendChild(pre);

        if (this.enableCopy) {
          const btn = document.createElement("button");
          btn.className = "copy-btn";
          btn.type = "button";
          btn.textContent = "Copy";
          btn.dataset.for = "code";
          wrap.appendChild(btn);
        }
      }
      if (this.enableHighlight && !codeEl.classList.contains("hljs")) {
        codeEl.classList.add("hljs");
      }
    });
  }

  async _onClickCopy(e) {
    const btn = e.target;
    if (!(btn instanceof HTMLElement)) return;
    if (!btn.classList.contains("copy-btn")) return;

    const wrap = btn.closest(".codebox");
    const code = wrap?.querySelector("pre > code");
    if (!code) return;

    const text = code.textContent ?? "";
    try {
      await navigator.clipboard.writeText(text);
      const old = btn.textContent;
      btn.textContent = "Copied!";
      setTimeout(() => (btn.textContent = old || "Copy"), 900);
    } catch {
      const range = document.createRange();
      range.selectNodeContents(code);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }
}

if (!customElements.get("chat-message")) {
  customElements.define("chat-message", ChatMessage);
}
