import { LitElement, html, css } from "lit";
import "./workspace-select.js";
import "./file-tree.js";

export class FileBrowser extends LitElement {
  static styles = css`
    .panel {
      padding: 10px;
    }
  `;

  static properties = {
    workspace: { type: String },
  };

  constructor() {
    super();
    this.workspace = localStorage.getItem("ws:selected") || "";
  }

  render() {
    return html`
      <div class="panel">
        <div class="field">
          <workspace-select
            @workspace-change=${(e) => {
              this.workspace = e.detail.id;
            }}
          ></workspace-select>
        </div>

        <div class="field">
          <file-tree .ws=${this.workspace || ""} rootPath="."></file-tree>
        </div>
        <div></div>
      </div>
    `;
  }
}

if (!customElements.get("file-browser"))
  customElements.define("file-browser", FileBrowser);
