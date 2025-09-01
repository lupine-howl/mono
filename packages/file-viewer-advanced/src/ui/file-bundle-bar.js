import { LitElement, html, css } from "lit";

export class FileBundleBar extends LitElement {
  static styles = css`
    .bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      border-bottom: 1px solid #1f1f22;
      padding-bottom: 8px;
      flex-wrap: wrap;
    }
    .path {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas,
        "Liberation Mono", monospace;
      font-size: 12px;
      opacity: 0.9;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 60ch;
    }
    .controls {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .group {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .num {
      width: 110px;
      padding: 6px 8px;
      border-radius: 8px;
      border: 1px solid #2a2a30;
      background: #0b0b0c;
      color: inherit;
      font: inherit;
    }
    .chk {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      opacity: 0.9;
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
  `;

  static properties = {
    title: { type: String },

    // bundle options (used only when showOptions=true)
    recursive: { type: Boolean },
    includeHidden: { type: Boolean },
    includeBinary: { type: Boolean },
    maxFiles: { type: Number },
    maxBytesTotal: { type: Number },
    maxBytesPerFile: { type: Number },

    // controls / state
    canRefresh: { type: Boolean },
    hasText: { type: Boolean },
    hasBundle: { type: Boolean },

    // NEW
    showOptions: { type: Boolean }, // hide bundle controls for raw viewer
    refreshLabel: { type: String }, // "Refresh" | "Reload" etc.
  };

  constructor() {
    super();
    this.showOptions = true;
    this.refreshLabel = "Refresh";
  }

  _emit(name, detail) {
    this.dispatchEvent(
      new CustomEvent(name, { detail, bubbles: true, composed: true })
    );
  }

  render() {
    return html`
      <div class="bar">
        <div class="path" title=${this.title}>${this.title}</div>
        <div class="controls">
          ${this.showOptions
            ? html`
                <label class="chk"
                  ><input
                    type="checkbox"
                    .checked=${this.recursive}
                    @change=${(e) =>
                      this._emit("opt-change", {
                        key: "_recursive",
                        value: e.target.checked,
                      })}
                  />recursive</label
                >
                <label class="chk"
                  ><input
                    type="checkbox"
                    .checked=${this.includeHidden}
                    @change=${(e) =>
                      this._emit("opt-change", {
                        key: "_includeHidden",
                        value: e.target.checked,
                      })}
                  />hidden</label
                >
                <label class="chk"
                  ><input
                    type="checkbox"
                    .checked=${this.includeBinary}
                    @change=${(e) =>
                      this._emit("opt-change", {
                        key: "_includeBinary",
                        value: e.target.checked,
                      })}
                  />binary</label
                >
                <div class="group">
                  <input
                    class="num"
                    type="number"
                    min="1"
                    step="1"
                    .value=${String(this.maxFiles ?? "")}
                    @change=${(e) =>
                      this._emit("opt-change", {
                        key: "_maxFiles",
                        value: Number(e.target.value) || 1,
                      })}
                    title="max_files"
                  />
                  <input
                    class="num"
                    type="number"
                    min="1"
                    step="1"
                    .value=${String(this.maxBytesTotal ?? "")}
                    @change=${(e) =>
                      this._emit("opt-change", {
                        key: "_maxBytesTotal",
                        value: Number(e.target.value) || 1,
                      })}
                    title="max_bytes_total"
                  />
                  <input
                    class="num"
                    type="number"
                    min="1"
                    step="1"
                    .value=${String(this.maxBytesPerFile ?? "")}
                    @change=${(e) =>
                      this._emit("opt-change", {
                        key: "_maxBytesPerFile",
                        value: Number(e.target.value) || 1,
                      })}
                    title="max_bytes_per_file"
                  />
                </div>
              `
            : null}

          <button
            class="btn"
            @click=${() => this._emit("refresh")}
            ?disabled=${!this.canRefresh}
          >
            ${this.refreshLabel}
          </button>
          <button
            class="btn"
            @click=${() => this._emit("copy")}
            ?disabled=${!this.hasText}
          >
            Copy
          </button>
          <button
            class="btn"
            @click=${() => this._emit("download")}
            ?disabled=${!(this.hasBundle ?? this.hasText)}
          >
            Download
          </button>
        </div>
      </div>
    `;
  }
}

customElements.define("file-bundle-bar", FileBundleBar);
