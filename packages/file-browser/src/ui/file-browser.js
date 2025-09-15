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

    /* context menu */
    .ctx {
      position: fixed;
      z-index: 99999;
      min-width: 160px;
      background: #0f0f12;
      border: 1px solid #2a2a30;
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      overflow: hidden;
    }
    .ctx button {
      display: block;
      width: 100%;
      text-align: left;
      background: transparent;
      border: 0;
      color: inherit;
      font: inherit;
      padding: 8px 10px;
      cursor: pointer;
    }
    .ctx button:hover { background: #16161b; }
    .ctx .danger { color: #ff6b6b; }
    .ctx hr {
      border: 0;
      border-top: 1px solid #23232a;
      margin: 4px 0;
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

    // context menu state
    _menuOpen: { state: true },
    _menuX: { state: true },
    _menuY: { state: true },
    _menuTargetPath: { state: true },
    _menuTargetType: { state: true },

    // public configurable list of names to ignore (files or directories).
    // By default we skip node_modules, dist, and package lock (common noise).
    // Accepts an array of strings. Patterns starting with '/' apply to directories by name.
    ignores: { type: Array },
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

    // context menu
    this._menuOpen = false;
    this._menuX = 0;
    this._menuY = 0;
    this._menuTargetPath = null;
    this._menuTargetType = null;

    // default ignores
    this.ignores = ["/node_modules", "package.lock", "/dist"];

    // persisted open-state per workspace (Map<pathRel, boolean>)
    this._openState = new Map();

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
        this._loadOpenStateForWS();
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
      this._loadOpenStateForWS();
      if (this._ws) this._loadDir(this._cwd, true);
    } else {
      this.controller
        .ready?.()
        .then(() => {
          this._ws = this.controller.ws ?? "";
          this._cwd = this.controller.cwd ?? ".";
          this._selectedPath = this.controller.selection?.path ?? null;
          this._selectedType = this.controller.selection?.type ?? null;
          this._loadOpenStateForWS();
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

      ${this._menuOpen ? this._renderMenu() : ""}
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
      const persistedOpen = this._getOpen(abs);
      const open = cached?.open ?? persistedOpen ?? false;
      const selected = this._selectedPath === abs;

      // If this directory should be open from persisted state but not loaded yet, load it.
      if (isDir && open && (!cached || !cached.childrenLoaded)) {
        // fire-and-forget; safe to call during render since it schedules async work
        this._loadDir(abs);
      }

      return html`
        <div
          class=${`node ${selected ? "selected" : ""}`}
          @click=${(e) => this._onSelectItem(e, item, dirNode.path)}
          @dblclick=${isDir ? (e) => this._onDblClickDir(e, item, dirNode.path) : null}
          @contextmenu=${(e) => this._onContextMenu(e, item, dirNode.path)}
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
    // persist open-state per directory
    this._setOpen(abs, node.open);
    this.requestUpdate();
    if (node.open && !node.childrenLoaded) await this._loadDir(abs);
  }

  _onDblClickDir(e, item, parentPath) {
    e.stopPropagation();
    const abs = this._join(parentPath, item.name);
    this._selectedPath = abs;
    this._selectedType = item.type;
    this.requestUpdate();
    this.controller.select(abs, item.type);
    this.tabController.setActive("code");
  }

  _refresh = () => {
    this._loadDir(this._cwd, true);
  };

  _goUp = () => {
    const p = this._parentOf(this._cwd);
    if (p && p !== this._cwd) this._onDblClickDir(new Event("noop"), p);
  };

  // --- context menu ---
  _onContextMenu(e, item, parentPath) {
    e.preventDefault();
    e.stopPropagation();
    const abs = typeof item === "string" ? item : this._join(parentPath, item.name);
    const type = typeof item === "string" ? "dir" : item.type;
    this._menuTargetPath = abs;
    this._menuTargetType = type;
    this._menuX = e.clientX;
    this._menuY = e.clientY;
    this._menuOpen = true;
    // close handlers
    this._onGlobalKey = (ev) => {
      if (ev.key === "Escape") this._closeMenu();
    };
    this._onGlobalDown = (ev) => {
      // clicks outside the menu close it
      const path = ev.composedPath?.() || [];
      const inMenu = path.some((n) => n?.classList?.contains?.("ctx"));
      if (!inMenu) this._closeMenu();
    };
    window.addEventListener("keydown", this._onGlobalKey, { capture: true });
    window.addEventListener("mousedown", this._onGlobalDown, { capture: true });
  }

  _renderMenu() {
    const style = `left:${this._menuX}px; top:${this._menuY}px;`;
    return html`
      <div class="ctx" style=${style} @mousedown=${(e) => e.stopPropagation()} @contextmenu=${(e)=>{e.preventDefault();e.stopPropagation();}}>
        <button @click=${this._actionNewFile}>New file</button>
        <button @click=${this._actionNewFolder}>New folder</button>
        <hr />
        <button @click=${this._actionRename}>Rename</button>
        <button class="danger" @click=${this._actionDelete}>Delete</button>
      </div>
    `;
  }

  _closeMenu() {
    this._menuOpen = false;
    try { window.removeEventListener("keydown", this._onGlobalKey, { capture: true }); } catch {}
    try { window.removeEventListener("mousedown", this._onGlobalDown, { capture: true }); } catch {}
  }

  _getCreateBaseDir() {
    const t = this._menuTargetType;
    const p = this._menuTargetPath;
    return t === "dir" ? p : this._parentOf(p);
  }

  _basename(p) {
    if (!p) return "";
    const s = p.replace(/\/+$/, "");
    const i = s.lastIndexOf("/");
    return i >= 0 ? s.slice(i + 1) : s;
  }

  _actionNewFile = async () => {
    const base = this._getCreateBaseDir();
    const name = prompt("New file name", "new-file.txt");
    this._closeMenu();
    if (!name) return;
    const newPath = this._join(base, name);
    await this.controller.touch(newPath);
    await this._loadDir(base, true);
    this._setOpen(base, true);
    this.controller.select(newPath, "file");
  };

  _actionNewFolder = async () => {
    const base = this._getCreateBaseDir();
    const name = prompt("New folder name", "new-folder");
    this._closeMenu();
    if (!name) return;
    const newPath = this._join(base, name);
    await this.controller.mkdir(newPath, true);
    await this._loadDir(base, true);
    this._setOpen(base, true);
    this.controller.select(newPath, "dir");
  };

  _actionRename = async () => {
    const src = this._menuTargetPath;
    const parent = this._parentOf(src);
    const cur = this._basename(src);
    const next = prompt("Rename to", cur);
    this._closeMenu();
    if (!next || next === cur) return;
    const dest = this._join(parent, next);
    await this.controller.rename(src, dest);
    await this._loadDir(parent, true);
    if (this._selectedPath === src) {
      this._selectedPath = dest;
      this._selectedType = this._menuTargetType;
      this.requestUpdate();
      this.controller.select(dest, this._menuTargetType);
    }
  };

  _actionDelete = async () => {
    const src = this._menuTargetPath;
    const parent = this._parentOf(src);
    const ok = confirm(`Delete ${src}?`);
    this._closeMenu();
    if (!ok) return;
    await this.controller.delete([src], { recursive: true, force: true });
    await this._loadDir(parent, true);
    if (this._selectedPath === src) {
      this._selectedPath = parent;
      this._selectedType = "dir";
      this.requestUpdate();
      this.controller.select(parent, "dir");
    }
  };

  // --- data loading ---
  async _loadDir(pathRel /* force = false */) {
    if (!this._ws) return;
    const key = this._key(pathRel);
    if (pathRel === this._cwd) this._loadingRoot = true;
    this._error = null;
    try {
      const j = await this.controller.list(pathRel);
      const itemsRaw = Array.isArray(j?.items) ? j.items : [];
      // Apply ignore filters
      const items = itemsRaw.filter((it) => !this._shouldIgnoreItem(it));
      const dirNode = this._nodes.get(key) || {
        path: pathRel,
        name: pathRel,
        type: "dir",
        open: true,
      };
      // Respect persisted open state (fallback to opening the current working dir)
      const persisted = this._getOpen(pathRel);
      dirNode.open = typeof persisted === "boolean" ? persisted : pathRel === this._cwd;
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

  // --- ignore helpers ---
  _shouldIgnoreItem(item) {
    try {
      const patterns = Array.isArray(this.ignores) ? this.ignores : [];
      const name = item?.name ?? "";
      const isDir = item?.type === "dir";
      for (let pat of patterns) {
        if (!pat) continue;
        pat = String(pat).trim();
        if (!pat) continue;
        const startsSlash = pat.startsWith("/");
        const token = startsSlash ? pat.slice(1) : pat;
        if (!token) continue;
        // '/foo' matches directories named 'foo'
        if (startsSlash) {
          if (isDir && name === token) return true;
        } else {
          if (name === token) return true;
          // Be forgiving for common typo: 'package.lock' should also ignore 'package-lock.json'
          if (token === "package.lock" && name === "package-lock.json") return true;
        }
      }
    } catch (_) {}
    return false;
  }

  // --- localStorage (persist open/closed state) ---
  _openStateKey() {
    return `file-browser:open:${this._ws || "__no_ws__"}`;
  }

  _loadOpenStateForWS() {
    this._openState = new Map();
    try {
      const raw = localStorage.getItem(this._openStateKey());
      if (!raw) return;
      const obj = JSON.parse(raw);
      if (obj && typeof obj === "object") {
        for (const [p, v] of Object.entries(obj)) {
          this._openState.set(p, !!v);
        }
      }
    } catch (_) {
      // ignore
    }
  }

  _persistOpenState() {
    try {
      const obj = {};
      for (const [p, v] of this._openState.entries()) obj[p] = !!v;
      localStorage.setItem(this._openStateKey(), JSON.stringify(obj));
    } catch (_) {
      // ignore quota / serialization errors
    }
  }

  _getOpen(pathRel) {
    if (!this._openState) return undefined;
    return this._openState.has(pathRel) ? this._openState.get(pathRel) : undefined;
  }

  _setOpen(pathRel, open) {
    try {
      this._openState.set(pathRel, !!open);
      this._persistOpenState();
    } catch (_) {
      // ignore
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
