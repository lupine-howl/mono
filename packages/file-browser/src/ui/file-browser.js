// src/ui/file-tree.js
import { LitElement, html, css } from "lit";
import { FileBrowserController } from "../shared/FileBrowserController.js"; // controller autowires the singleton service
import { TabController } from "@loki/layout/util";


// very small icon set (UTF)
const I = {
  chevron: (open) => (open ? "▾" : "▸"),
  dir: "📁",
  file: "📄",
  up: "...",
};

export class FileTree extends LitElement {
  static styles = css`
    :host {
      display: block;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 6px;
    }
    .cwd {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .cwd-path {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas,
        "Liberation Mono", monospace;
      font-size: 12px;
      opacity: 0.9;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 60ch;
    }
    .cwd-btn,
    .icon-btn {
      border: 1px solid #2a2a30;
      background: #151519;
      color: inherit;
      font: inherit;
      padding: 4px 8px;
      border-radius: 8px;
      cursor: pointer;
      line-height: 1;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .icon-btn:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .hint {
      font-size: 12px;
      opacity: 0.7;
    }
    .tree {
      font-size: 14px;
    }
    .node {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 2px 4px;
      border-radius: 6px;
      cursor: pointer;
      user-select: none;
    }
    .node:hover {
      background: #141418;
    }
    .node.selected {
      background: #1b1b21;
      outline: 1px solid #2a2a30;
    }
    .indent {
      display: inline-block;
      width: 14px;
    }
    .name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 12px;
      opacity: 0.7;
    }
    .muted {
      opacity: 0.7;
    }
    .caret {
      width: 14px;
      text-align: center;
      cursor: pointer;
    }
    .caret:hover {
      opacity: 0.9;
    }
    .spacer {
      width: 14px;
    }
  `;

  // internal state only
  static properties = {
    _ws: { state: true },
    _cwd: { state: true },
    _nodes: { state: true }, // Map<absPathKey, DirNode>
    _loadingRoot: { state: true },
    _error: { state: true },
    _selectedPath: { state: true },
    _selectedType: { state: true }, // 'file' | 'dir' | undefined
  };

  constructor() {
    super();

    // self-instantiate controller; it autowires the singleton service
    this.controller = new FileBrowserController({ eventName: "files:change" });
    this.tabController = new TabController();
    
    // derived/working state
    this._ws = "";
    this._cwd = ".";
    this._nodes = new Map();
    this._loadingRoot = false;
    this._error = null;
    this._selectedPath = null;
    this._selectedType = null;

    this._onCtrlChange = (e) => {
      const { ws, cwd, selection } = e.detail ?? {};
      const wsChanged = typeof ws === "string" && ws !== this._ws;
      const cwdChanged = typeof cwd === "string" && cwd !== this._cwd;

      if (wsChanged) {
        this._ws = ws;
        this._nodes = new Map();
        this._selectedPath = null;
        this._selectedType = null;
        this._cwd = typeof cwd === "string" ? cwd : ".";
        if (this._ws) this._loadDir(this._cwd, true);
      } else if (cwdChanged) {
        this._cwd = cwd;
        if (this._ws) this._loadDir(this._cwd, true);
      }

      if (selection && selection.path) {
        this._selectedPath = selection.path;
        this._selectedType = selection.type;
      }
    };

    // wire once; no lifecycle boilerplate
    this.controller.addEventListener("files:change", this._onCtrlChange);

    // hydrate immediately if possible, otherwise after ready()
    if (this.controller.ws) {
      this._ws = this.controller.ws;
      this._cwd = this.controller.cwd ?? ".";
      this._selectedPath = this.controller.selection?.path ?? null;
      this._selectedType = this.controller.selection?.type ?? null;
      if (this._ws) this._loadDir(this._cwd, true);
    } else {
      this.controller
        .ready?.()
        .then(() => {
          this._ws = this.controller.ws ?? "";
          this._cwd = this.controller.cwd ?? ".";
          this._selectedPath = this.controller.selection?.path ?? null;
          this._selectedType = this.controller.selection?.type ?? null;
          if (this._ws) this._loadDir(this._cwd, true);
          this.requestUpdate();
        })
        .catch(() => {});
    }
  }

  render() {
    const cwd = this._cwd;
    const rootKey = this._key(cwd);
    const root = this._nodes.get(rootKey);
    const parent = this._parentOf(cwd);
    const canGoUp = parent !== null && parent !== cwd;

    return html`
      <div class="header">
        <div class="cwd" title=${cwd}>
          ${canGoUp
            ? html` <button
                class="icon-btn"
                @click=${this._goUp}
                ?disabled=${!canGoUp}
                title="Up"
              >
                <span>${I.up}</span>
              </button>`
            : ""}
          <button
            class="cwd-btn"
            @click=${this._selectCwd}
            title="Select current directory"
          >
            <span class="cwd-path">${cwd}</span>
          </button>
        </div>
        <div>
          ${this._loadingRoot ? html`<span class="hint">Loading…</span>` : ""}
        </div>
      </div>

      ${this._error ? html`<div class="hint">Error: ${this._error}</div>` : ""}

      <div class="tree">
        ${root
          ? this._renderDir(root, 0)
          : html`<div class="hint">No data yet.</div>`}
      </div>
    `;
  }

  // DirNode: { path, name, type:'dir', open:boolean, childrenLoaded:boolean, children: Item[] }
  _renderDir(dirNode, depth) {
    const items = dirNode.children || [];
    return html`${items.map((item) => {
      const isDir = item.type === "dir";
      const abs = this._join(dirNode.path, item.name);
      const key = this._key(abs);
      const cached = this._nodes.get(key);
      const open = cached?.open || false;
      const selected = this._selectedPath === abs;

      return html`
        <div
          class=${`node ${selected ? "selected" : ""}`}
          @click=${(e) => this._onSelectItem(e, item, dirNode.path)}
          @dblclick=${isDir ? (e) => this._onDblClickDir(e, abs) : null}
          title=${item.name}
        >
          ${this._indent(depth)}
          ${isDir
            ? html`
                <span
                  class="caret muted"
                  @click=${(e) => this._onToggleCaret(e, abs, item)}
                  title=${open ? "Collapse" : "Expand"}
                  >${I.chevron(open)}</span
                >
                <span>${I.dir}</span>
              `
            : html`<span class="spacer"></span><span>${I.file}</span>`}
          <span class="name">${item.name}</span>
        </div>
        ${isDir && open && cached?.childrenLoaded
          ? this._renderDir(cached, depth + 1)
          : ""}
      `;
    })}`;
  }

  _indent(depth) {
    return html`${Array.from(
      { length: depth },
      () => html`<span class="indent"></span>`
    )}`;
  }

  // --- interactions (user-originated → update controller & emit legacy events) ---
  _selectCwd = () => {
    const cwd = this._cwd;
    this._selectedPath = cwd;
    this._selectedType = "dir";
    this.requestUpdate();
    this.controller.select(cwd, "dir");
  };

  _onSelectItem(e, item, parentPath) {
    e.stopPropagation();
    const abs = this._join(parentPath, item.name);
    this._selectedPath = abs;
    this._selectedType = item.type;
    this.requestUpdate();
    this.controller.select(abs, item.type);
    this.tabController.setActive("code");
  }

  async _onToggleCaret(e, abs, item) {
    e.stopPropagation();
    if (item.type !== "dir") return;
    const key = this._key(abs);
    const node = this._nodes.get(key) || {
      path: abs,
      name: item.name,
      type: "dir",
      open: false,
      childrenLoaded: false,
      children: [],
    };
    node.open = !node.open;
    this._nodes.set(key, node);
    this.requestUpdate();
    if (node.open && !node.childrenLoaded) await this._loadDir(abs);
  }

  _onDblClickDir(e, absPath) {
    e.stopPropagation();
    this.controller.setCwd(absPath);
  }

  _refresh = () => {
    this._loadDir(this._cwd, true);
  };

  _goUp = () => {
    const p = this._parentOf(this._cwd);
    if (p && p !== this._cwd) this._onDblClickDir(new Event("noop"), p);
  };

  // --- data loading ---
  async _loadDir(pathRel /* force = false */) {
    if (!this._ws) return;
    const key = this._key(pathRel);
    if (pathRel === this._cwd) this._loadingRoot = true;
    this._error = null;
    try {
      const j = await this.controller.list(pathRel);
      const items = Array.isArray(j?.items) ? j.items : [];
      const dirNode = this._nodes.get(key) || {
        path: pathRel,
        name: pathRel,
        type: "dir",
        open: true,
      };
      dirNode.children = items;
      dirNode.childrenLoaded = true;
      this._nodes.set(key, dirNode);
    } catch (e) {
      this._error = e?.message || String(e);
    } finally {
      if (pathRel === this._cwd) this._loadingRoot = false;
      this.requestUpdate();
    }
  }

  // --- path utils ---
  _key(p) {
    return `${this._ws}:${p}`;
  }
  _join(parent, name) {
    return !parent || parent === "."
      ? name
      : parent.endsWith("/")
      ? parent + name
      : `${parent}/${name}`;
  }
  _parentOf(p) {
    if (!p || p === "." || p === "/") return ".";
    const s = p.replace(/\/+$/, "");
    const idx = s.lastIndexOf("/");
    if (idx <= 0) return ".";
    return s.slice(0, idx);
  }
}

if (!customElements.get("file-browser")) {
  customElements.define("file-browser", FileTree);
}
