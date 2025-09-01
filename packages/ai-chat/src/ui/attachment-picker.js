// src/ui/attachment-picker.js
import { LitElement, html, css } from "lit";
import { AIChatController } from "../shared/AIChatController.js";

// utils (local)
const isTextLike = (file) =>
  file.type?.startsWith?.("text/") ||
  [
    "js",
    "ts",
    "tsx",
    "jsx",
    "json",
    "md",
    "txt",
    "csv",
    "yml",
    "yaml",
    "toml",
    "ini",
    "css",
    "html",
  ].includes((file.name.split(".").pop() || "").toLowerCase());

const guessLangFromName = (name) =>
  ({
    js: "javascript",
    ts: "typescript",
    tsx: "tsx",
    jsx: "jsx",
    json: "json",
    md: "markdown",
    yml: "yaml",
    yaml: "yaml",
    css: "css",
    html: "html",
    csv: "csv",
    txt: "text",
  }[(name.split(".").pop() || "").toLowerCase()] || "text");

export class AttachmentPicker extends LitElement {
  static styles = css`
    .labelRow {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .paperclip,
    .chip button {
      border: 1px solid #2a2a30;
      background: #151519;
      color: inherit;
      font: inherit;
      padding: 4px 8px;
      border-radius: 8px;
      cursor: pointer;
    }
    .attachments {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 6px;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: 1px solid #2a2a30;
      background: #151519;
      border-radius: 999px;
      padding: 4px 8px;
      font-size: 12px;
      max-width: 100%;
    }
    .chip img {
      width: 20px;
      height: 20px;
      border-radius: 4px;
      object-fit: cover;
    }
    .hint {
      font-size: 12px;
      opacity: 0.7;
    }
  `;

  static properties = {
    controller: { attribute: false },
  };

  constructor() {
    super();
    // Host-bound controller → no manual subscribe/unsubscribe needed
    this.controller = new AIChatController(this);
  }

  render() {
    const attachments = this.controller.get()?.attachments || [];

    return html`
      <div class="labelRow">
        <label>Context</label>
        <button
          class="paperclip"
          @click=${this._openFilePicker}
          title="Attach files"
        >
          📎
        </button>
        <input id="file" type="file" multiple hidden @change=${this._onPick} />
      </div>

      <slot name="context-input"></slot>

      ${attachments.length
        ? html`<div class="attachments">
            ${attachments.map(
              (a, i) => html`
                <span class="chip" title="${a.name || a.mime || a.type}">
                  ${a.type === "image" && a.preview
                    ? html`<img alt="preview" src="${a.preview}" />`
                    : ""}
                  <span
                    style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px;"
                  >
                    ${a.name || a.mime || a.type}
                  </span>
                  <button @click=${() => this._remove(i)} aria-label="Remove">
                    ×
                  </button>
                </span>
              `
            )}
          </div>`
        : html`<div class="hint">No attachments</div>`}
    `;
  }

  _openFilePicker = () => this.renderRoot?.getElementById("file")?.click();

  _apply(next, { bubble = true } = {}) {
    this.controller.setAttachments(next);
    // Optional back-compat event
    this.dispatchEvent(
      new CustomEvent("attachments-change", {
        detail: { value: next },
        bubbles: bubble,
        composed: true,
      })
    );
  }

  async _onPick(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const converted = await Promise.all(
      files.map((f) => this._fileToAttachment(f))
    );
    const current = this.controller.get()?.attachments || [];
    const next = [...current, ...converted];

    try {
      e.target.value = "";
    } catch {}
    this._apply(next);
  }

  _remove(i) {
    const current = this.controller.get()?.attachments || [];
    if (i < 0 || i >= current.length) return;
    const next = current.slice();
    next.splice(i, 1);
    this._apply(next);
  }

  _fileToAttachment(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;

      if (file.type?.startsWith?.("image/")) {
        reader.onload = () => {
          const dataUrl = reader.result;
          resolve({
            type: "image",
            name: file.name,
            mime: file.type || "image/*",
            data: dataUrl,
            preview: dataUrl,
            url: null,
          });
        };
        reader.readAsDataURL(file);
        return;
      }

      if (isTextLike(file)) {
        reader.onload = () => {
          resolve({
            type: "text",
            name: file.name,
            mime: file.type || "text/plain",
            data: String(reader.result ?? ""),
            lang: guessLangFromName(file.name),
            url: null,
          });
        };
        reader.readAsText(file);
        return;
      }

      resolve({
        type: "file",
        name: file.name,
        mime: file.type || "application/octet-stream",
        data: null,
        url: null,
      });
    });
  }
}

if (!customElements.get("attachment-picker")) {
  customElements.define("attachment-picker", AttachmentPicker);
}
