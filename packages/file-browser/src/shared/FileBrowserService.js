// src/services/FileBrowserService.js
import {
  fsWorkspaces,
  fsList,
  fsRead,
  fsBundle,
  fsReadSnapshot,
  fsWrite,
  fsApply,
  fsMkdir,
  fsRename,
  fsMove,
  fsDelete,
  fsCopy,
  fsTouch,
} from "./fsClient.js";
import { getGlobalSingleton } from "@loki/utilities";
import { aiChatService } from "@loki/ai-chat/util";

/**
 * Emits:
 *  - "change" with detail { type, ws, cwd, selection, workspaces, ... }
 */
class FileBrowserService extends EventTarget {
  constructor() {
    super();
    this.workspaces = []; // [{id,name,path,readOnly}]
    this.ws = this._getStoredWs(); // active workspace id
    this.cwd = "."; // current directory
    this.selection = null; // { path, type: "file"|"dir" }
    this.chatService = aiChatService;
    this.fileData = null;
    this.sync();
  }

  // ---------- persistence ----------
  _getStoredSelection() {
    return localStorage.getItem("files:selection") || "";
  }
  _setStoredSelection(sel) {
    localStorage.setItem("files:selection", JSON.stringify(sel) || "");
  }
  _getStoredWs() {
    return localStorage.getItem("files:ws") || "";
  }
  _setStoredWs(id) {
    localStorage.setItem("files:ws", id || "");
  }

  // ---------- hydrate / refresh ----------
  async sync() {
    try {
      const j = await fsWorkspaces();
      this.workspaces = Array.isArray(j?.workspaces) ? j.workspaces : [];
      this.ws = this._getStoredWs() || this.workspaces[0]?.id || "";
      this.selection = JSON.parse(this._getStoredSelection());
      this._emit("init");
    } catch (e) {
      this._emit("error", { error: String(e?.message || e) });
    }
  }

  // ---------- mutations ----------
  setWorkspace(id) {
    if (!id || id === this.ws) return;
    this.ws = id;
    this._setStoredWs(this.ws);
    this.cwd = ".";
    this.selection = null;
    this._emit("workspace");
  }

  setCwd(path) {
    if (!path || path === this.cwd) return;
    this.cwd = path;
    this.selection = { path, type: "dir" };
    this._emit("cwd");
  }

  async select(path, type = "file") {
    this.selection = path ? { path, type } : null;
    this._setStoredSelection(this.selection);

    let newFileData = await this.read(path);
    const isDir = newFileData?.mime === "inode/directory";

    if (isDir) {
      newFileData = await this.snapshot({ path });
    }

    this.fileData = {
      workspace: this.ws,
      path,
      data: newFileData,
    };

    const isImage = newFileData?.mime?.startsWith("image/");
    const isText = newFileData?.encoding === "utf8";
    const isBinary = newFileData?.encoding === "base64";
    const label = `Workspace: ${this.ws}\nPath: ${path}`;

    // ---------- GPT context decision ----------
    let context;

    if (isDir) {
      // Directory snapshot — include file list
      context = [
        {
          type: "text",
          text: `${label}\n\nThis is a directory snapshot:\n${JSON.stringify(
            newFileData.files,
            null,
            2
          )}`,
        },
      ];
    } else if (isImage && isBinary) {
      // Image — send as image_url (for GPT-4o vision)
      const dataUri = `data:${newFileData.mime};base64,${newFileData.content}`;
      context = [
        { type: "text", text: `${label}\n\nHere is the selected image:` },
        { type: "image_url", image_url: { url: dataUri } },
      ];
    } else if (isText) {
      // Plain text file — send inline
      context = [{ type: "text", text: `${label}\n\n${newFileData.content}` }];
    } else {
      // Binary file (non-image) — show metadata only
      context = [
        {
          type: "text",
          text: `${label}\n\nFile is binary with mime: ${newFileData.mime}`,
        },
      ];
    }

    this.chatService.setContext(context);
    this._emit("select");
  }

  // ---------- RPCs ----------
  list(rel = this.cwd) {
    if (!this.ws) return Promise.resolve({ items: [] });
    return fsList({ ws: this.ws, rel });
  }
  read(path) {
    if (!this.ws || !path) return Promise.resolve(null);
    return fsRead({ ws: this.ws, path });
  }
  bundle(opts = {}) {
    if (!this.ws) return Promise.resolve(null);
    const path = opts.path ?? (this.selection?.path || this.cwd || ".");
    return fsBundle({ ws: this.ws, path, ...opts });
  }
  snapshot(opts = {}) {
    if (!this.ws) return Promise.resolve(null);
    const path = opts.path ?? (this.selection?.path || this.cwd || ".");
    return fsReadSnapshot({ ws: this.ws, path, ...opts });
  }
  write(path, content) {
    return fsWrite({ ws: this.ws, path, content });
  }
  apply(files) {
    return fsApply({ ws: this.ws, files });
  }
  mkdir(path, recursive = true) {
    return fsMkdir({ ws: this.ws, path, recursive });
  }
  rename(from, to) {
    return fsRename({ ws: this.ws, from, to });
  }
  move(from, to) {
    return fsMove({ ws: this.ws, from, to });
  }
  delete(paths, { recursive = true, force = true } = {}) {
    return fsDelete({ ws: this.ws, paths, recursive, force });
  }
  copy(from, to, { recursive = true, overwrite = true } = {}) {
    return fsCopy({ ws: this.ws, from, to, recursive, overwrite });
  }
  touch(path) {
    return fsTouch({ ws: this.ws, path });
  }

  // ---------- internals ----------
  _emit(type, extra = {}) {
    const detail = {
      type,
      ws: this.ws,
      cwd: this.cwd,
      selection: this.selection,
      workspaces: this.workspaces,
      ...extra,
    };
    this.dispatchEvent(new CustomEvent("change", { detail }));
  }
}

// Singleton (name it for file-browser, not "tasks")
export function getFileBrowserService(opts = {}) {
  const KEY = Symbol.for(`@loki/file-browser:service@1`);
  return getGlobalSingleton(KEY, () => new FileBrowserService(opts));
}
export const fileBrowserService = getFileBrowserService();
