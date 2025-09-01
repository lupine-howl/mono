// src/ui/workspace-select.js
import { LitElement, html, css } from "lit";
import "@loki/layout/ui/smart-select.js";
import { FileBrowserController } from "../shared/FileBrowserController.js";

export class WorkspaceSelect extends LitElement {
  static styles = css`
    :host {
      display: block;
    }
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    label {
      font-size: 12px;
      opacity: 0.8;
    }
    .hint {
      font-size: 12px;
      opacity: 0.7;
    }
  `;

  static properties = {
    _list: { state: true },
    _selectedId: { state: true },
    _loading: { state: true },
    _error: { state: true },
  };

  constructor() {
    super();

    this._list = [];
    this._selectedId = "";
    this._loading = false;
    this._error = null;

    // self-instantiate controller (autowires singleton service)
    this.controller = new FileBrowserController({ eventName: "files:change" });

    // react to file-browser changes
    this._onChange = (e) => {
      const { workspaces, ws } = e.detail ?? {};
      if (Array.isArray(workspaces)) this._list = workspaces;
      if (ws !== undefined) this._selectedId = ws;
      this.requestUpdate();
    };
    this.controller.addEventListener("files:change", this._onChange);

    // initial hydrate (before/after ready)
    const init = () => {
      this._list = this.controller.workspaces ?? [];
      this._selectedId = this.controller.ws ?? "";
      this.requestUpdate();
    };
    if (
      Array.isArray(this.controller.workspaces) &&
      this.controller.workspaces.length
    ) {
      init();
    } else {
      this._loading = true;
      this.controller
        .ready?.()
        .then(init)
        .catch((e) => {
          this._error = e?.message || String(e);
        })
        .finally(() => {
          this._loading = false;
        });
    }
  }

  render() {
    // ensure selectedId is present in the list
    const hasSelected = this._list.some((w) => w.id === this._selectedId);
    const selectedId = hasSelected ? this._selectedId : this._list[0]?.id ?? "";

    return html`
      ${this._list.length
        ? html`
            <smart-select @change=${this._onSelect} ?disabled=${this._loading}>
              ${this._list.map(
                (w) => html`
                  <option
                    value=${w.id}
                    title=${w.path}
                    ?selected=${w.id === selectedId}
                  >
                    ${w.name}
                  </option>
                `
              )}
            </smart-select>
            <div class="hint">
              ${(this._list.find((w) => w.id === selectedId) || {}).path || ""}
            </div>
          `
        : html`
            <div class="hint">
              ${this._error || "No workspaces configured."}
            </div>
          `}
    `;
  }

  _onSelect = (e) => {
    const id = e.target.value;
    this.controller.setWorkspace(id);
    // legacy event (harmless alongside controller events)
    this.dispatchEvent(
      new CustomEvent("workspace-change", {
        detail: { id },
        bubbles: true,
        composed: true,
      })
    );
  };
}

if (!customElements.get("workspace-select")) {
  customElements.define("workspace-select", WorkspaceSelect);
}
