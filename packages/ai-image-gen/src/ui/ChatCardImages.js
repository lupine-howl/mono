// src/ui/chat-cards/chat-images.js
import { LitElement, html, css } from "lit";

export class ChatImagesComponent extends LitElement {
  static styles = css`
    .card {
      border: 1px solid #1f1f22;
      background: #0f0f12;
      border-radius: 12px;
      padding: 10px 12px;
      width: fit-content;
      max-width: 600px;
      display: grid;
      gap: 8px;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .spacer {
      flex: 1;
    }
    .badge {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 999px;
      border: 1px solid #2a2a30;
      background: #17171b;
      text-decoration: none;
      color: inherit;
      opacity: 0.9;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 10px;
      max-width: 560px;
    }
    .imgWrap {
      overflow: hidden;
      border-radius: 10px;
      border: 1px solid #2a2a30;
      background: #0b0b0c;
    }
    .imgWrap a {
      display: block;
      line-height: 0; /* remove gap under image */
    }
    img {
      display: block;
      width: 100%;
      height: auto;
    }
    .meta {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      margin-top: 4px;
      font-size: 12px;
      opacity: 0.75;
    }
    .muted {
      opacity: 0.75;
      font-size: 12px;
    }
  `;

  static properties = {
    // Prefer passing an array directly
    images: { attribute: false },
    // Back-compat: sometimes the whole message is passed
    message: { attribute: false },

    // internal: [{ dims:"123×456", err:"" }]
    _meta: { state: true },
  };

  constructor() {
    super();
    this.images = null;
    this.message = null;
    this._meta = [];
  }

  willUpdate(changed) {
    if (changed.has("images") || changed.has("message")) {
      const arr = this.#asArray(this.images, this.message);
      // resize meta array
      this._meta = arr.map((_, i) => this._meta[i] || { dims: "", err: "" });
    }
  }

  render() {
    let result;
    try {
      result = JSON.parse(this.message.result);
    } catch {
      result = this.message?.result;
    }
    const imgs = this.#asArray(this.images, result?.saved);
    if (!imgs.length) {
      return html`<div class="card"><div class="muted">No images.</div></div>`;
    }

    const firstSrc = this.#srcFor(imgs[0]) || "#";

    return html`
      <div class="card">
        <div class="row">
          <div>Images</div>
          <div class="spacer"></div>
          <span class="muted">${imgs.length}</span>
          <a
            class="badge"
            href=${firstSrc}
            target="_blank"
            rel="noopener noreferrer"
            >open first</a
          >
        </div>

        <div class="grid">${imgs.map((it, i) => this.#renderOne(it, i))}</div>
      </div>
    `;
  }

  #renderOne(it, i) {
    const src = this.#srcFor(it);
    const alt = it.alt || it.prompt || "image";
    const meta = this._meta[i] || { dims: "", err: "" };

    return html`
      <div>
        <div class="imgWrap">
          <a href=${src} target="_blank" rel="noopener noreferrer">
            <img
              src=${src}
              alt=${alt}
              @load=${(e) => this.#onLoad(i, e)}
              @error=${() => this.#onError(i)}
            />
          </a>
        </div>
        <div class="meta">
          <span>${meta.dims}</span>
          ${it.caption
            ? html`<span title=${it.caption}>${it.caption}</span>`
            : ""}
          ${meta.err ? html`<span>Load error</span>` : ""}
        </div>
      </div>
    `;
  }

  #srcFor(it = {}) {
    return it.publicPath || it.url || it.data_url || "";
  }

  #onLoad(i, e) {
    const img = e.currentTarget;
    const dims = `${img.naturalWidth}×${img.naturalHeight}`;
    this._meta = this._meta.map((m, idx) =>
      idx === i ? { ...m, dims, err: "" } : m
    );
  }

  #onError(i) {
    this._meta = this._meta.map((m, idx) =>
      idx === i ? { ...m, dims: "", err: "1" } : m
    );
  }

  #asArray(images, message) {
    if (Array.isArray(images)) return images;
    if (Array.isArray(message)) return message;
    if (message && Array.isArray(message.images)) return message.images;
    return [];
  }
}

if (!customElements.get("chat-images")) {
  customElements.define("chat-images", ChatImagesComponent);
}

export const ChatCardImages = {
  render: (props) => html`<chat-images ...=${props}></chat-images>`,
};
